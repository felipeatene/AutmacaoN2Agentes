/**
 * Orquestrador de Decisões — Agente N2
 *
 * Implementa o fluxo de decisão conforme plan.md seção 4:
 *
 * POLL → Para cada ticket:
 *   ├── SOP encontrado? → Executar SOP (RF-02)
 *   └── Sem SOP → Classificar + Rotear (RF-03)
 *              └── Informações insuficientes? → Adaptive Card Teams (RF-04)
 *                       └── Falha Teams → Fallback work_notes (RF-05)
 *
 * Conforme constitution.md:
 * - Pilar 1: Falha rápida em erros críticos.
 * - Pilar 2: Idempotência em todas as operações de escrita.
 * - Pilar 3: Human-in-the-Loop para ações sem SOP.
 */

import { addWorkNote, resolveIncident, routeIncident, generateExecutionId } from './snow/incidents.js';
import { applyTags } from './snow/tags.js';
import { findMatchingSOP, executeSOPSteps } from './sop/runner.js';
import { sendProactiveWithFallback } from './teams/proactive.js';
import { buildContextRequestCard } from './teams/adaptiveCards.js';
import { logger } from './utils/logger.js';

/**
 * Mapa de categorias para grupos de suporte.
 * Em produção, este mapa viria de uma tabela de configuração no ServiceNow.
 */
const CATEGORY_ROUTING = {
  password: { group: 'Identity Management', tags: ['password', 'access'] },
  vpn: { group: 'Network Operations', tags: ['vpn', 'connectivity'] },
  software: { group: 'End User Computing', tags: ['software', 'installation'] },
  hardware: { group: 'End User Computing', tags: ['hardware'] },
  email: { group: 'Messaging & Collaboration', tags: ['email', 'outlook'] },
  default: { group: 'Service Desk', tags: ['unclassified'] },
};

/**
 * Determina a categoria de um incidente com base em palavras-chave.
 *
 * Conforme constitution.md Pilar 3: nunca executa conteúdo de texto livre como código.
 *
 * @param {object} incident - Objeto do incidente.
 * @returns {{ category: string, routing: object }} Categoria e informações de roteamento.
 */
function classifyIncident(incident) {
  const text = [
    incident.short_description || '',
    incident.description || '',
  ].join(' ').toLowerCase();

  for (const [category, routing] of Object.entries(CATEGORY_ROUTING)) {
    if (category === 'default') continue;
    if (text.includes(category)) {
      return { category, routing };
    }
  }

  return { category: 'default', routing: CATEGORY_ROUTING.default };
}

/**
 * Verifica se o incidente tem contexto suficiente para roteamento automático.
 *
 * @param {object} incident - Objeto do incidente.
 * @returns {boolean} True se o contexto é suficiente.
 */
function hassufficientContext(incident) {
  const desc = incident.description || '';
  const shortDesc = incident.short_description || '';
  return desc.length >= 20 || shortDesc.length >= 10;
}

/**
 * Processa um único incidente seguindo o fluxo de decisão do agente.
 *
 * @param {object} incident - Incidente a processar.
 * @param {Map<string, object>} sops - SOPs disponíveis.
 * @param {object} config - Configuração completa do agente.
 * @returns {Promise<{action: string, success: boolean}>} Resultado do processamento.
 */
export async function processIncident(incident, sops, config) {
  const executionId = generateExecutionId();
  const snowConfig = config.snow;
  const teamsConfig = config.teams;

  logger.info('Processando incidente.', {
    skill: 'orchestrator',
    incident_number: incident.number,
    sys_id: incident.sys_id,
    execution_id: executionId,
  });

  // Funções de operação ServiceNow passadas ao SOP runner
  const snowOps = {
    addWorkNote,
    resolveIncident,
    patchIncident: async (sysId, fields, cfg) => {
      const { snowRequest } = await import('./snow/client.js');
      return snowRequest('PATCH', `/api/now/table/incident/${sysId}`, cfg, { body: fields });
    },
  };

  // --- Tentativa de resolução via SOP ---
  const matchedSop = findMatchingSOP(incident, sops);

  if (matchedSop) {
    logger.info('SOP correspondente encontrado. Iniciando resolução automática.', {
      skill: 'orchestrator',
      incident_number: incident.number,
      sop_id: matchedSop.id,
    });

    const result = await executeSOPSteps(
      matchedSop,
      incident,
      executionId,
      snowConfig,
      snowOps
    );

    return { action: 'resolved_via_sop', success: result.success };
  }

  // --- Sem SOP: Classificação e Roteamento ---
  const { category, routing } = classifyIncident(incident);

  // Verificar se há contexto suficiente para roteamento
  if (!hassufficientContext(incident)) {
    // Solicitar contexto adicional via Teams
    logger.info('Contexto insuficiente. Solicitando informações adicionais via Teams.', {
      skill: 'orchestrator',
      incident_number: incident.number,
      execution_id: executionId,
    });

    const userAadObjectId = incident.caller_id?.u_aad_object_id || incident.u_aad_object_id;

    if (userAadObjectId) {
      const card = buildContextRequestCard({
        incidentNumber: incident.number,
        incidentSysId: incident.sys_id,
        shortDescription: incident.short_description,
      });

      const { sent, fallback } = await sendProactiveWithFallback(
        {
          userAadObjectId,
          serviceUrl: teamsConfig.serviceUrl,
          tenantId: teamsConfig.tenantId,
          botAppId: teamsConfig.appId,
          attachment: card,
        },
        {
          incidentSysId: incident.sys_id,
          executionId,
          addWorkNoteFn: (sysId, note, execId) => addWorkNote(sysId, note, execId, snowConfig),
        }
      );

      return {
        action: sent ? 'teams_card_sent' : (fallback ? 'fallback_work_note' : 'teams_failed'),
        success: sent || fallback,
      };
    } else {
      // Sem aadObjectId: adicionar work note pedindo mais informações
      await addWorkNote(
        incident.sys_id,
        'Contexto insuficiente para processamento automático. Por favor, forneça mais detalhes sobre o problema.',
        executionId,
        snowConfig
      );
      return { action: 'insufficient_context_noted', success: true };
    }
  }

  // Aplicar tags e rotear para grupo correto
  if (routing.tags && routing.tags.length > 0) {
    await applyTags(incident.sys_id, routing.tags, snowConfig);
  }

  await routeIncident(
    incident.sys_id,
    routing.group,
    category,
    executionId,
    snowConfig
  );

  return { action: 'classified_and_routed', success: true };
}

/**
 * Processa todos os incidentes de um ciclo de polling.
 *
 * @param {object[]} incidents - Lista de incidentes do polling.
 * @param {Map<string, object>} sops - SOPs disponíveis.
 * @param {object} config - Configuração completa do agente.
 * @returns {Promise<object>} Estatísticas do ciclo.
 */
export async function processCycle(incidents, sops, config) {
  const stats = {
    total: incidents.length,
    resolved: 0,
    routed: 0,
    teams_sent: 0,
    fallback: 0,
    failed: 0,
  };

  for (const incident of incidents) {
    try {
      const result = await processIncident(incident, sops, config);

      if (result.action === 'resolved_via_sop') stats.resolved++;
      else if (result.action === 'classified_and_routed') stats.routed++;
      else if (result.action === 'teams_card_sent') stats.teams_sent++;
      else if (result.action === 'fallback_work_note') stats.fallback++;
      else if (!result.success) stats.failed++;
    } catch (err) {
      stats.failed++;
      logger.error('Falha ao processar incidente.', {
        skill: 'orchestrator',
        incident_number: incident.number,
        error: err.message,
      });
    }
  }

  logger.info('Ciclo de processamento concluído.', {
    skill: 'orchestrator',
    stats,
  });

  return stats;
}
