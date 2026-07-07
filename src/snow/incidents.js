/**
 * Operações de Incidentes ServiceNow — Agente N2
 *
 * Conforme constitution.md:
 * - Pilar 2: Verifica estado atual antes de qualquer escrita (idempotência).
 * - Query cirúrgica para evitar processamento redundante.
 */

import { snowRequest } from './client.js';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'node:crypto';

/** Campos retornados nas queries de incidente (minimiza payload). */
const INCIDENT_FIELDS = [
  'sys_id',
  'number',
  'short_description',
  'description',
  'state',
  'incident_state',
  'assigned_to',
  'assignment_group',
  'caller_id',
  'sys_updated_on',
  'close_code',
  'work_notes',
  'u_aad_object_id',
].join(',');

/**
 * Busca incidentes ativos, sem atribuição, atualizados nos últimos N minutos.
 *
 * Query conforme plan.md seção 5.2:
 * active=true^assigned_to=EMPTY^sys_updated_on>javascript:gs.minutesAgo(2)
 *
 * @param {object} config - Configuração ServiceNow.
 * @param {number} [minutesAgo=2] - Janela de tempo em minutos.
 * @param {number} [limit=50] - Máximo de tickets retornados.
 * @returns {Promise<object[]>} Lista de incidentes.
 */
export async function pollIncidents(config, minutesAgo = 2, limit = 50) {
  logger.info('Iniciando polling de incidentes ServiceNow.', {
    skill: 'snow-poll-incidents',
    minutes_ago: minutesAgo,
    limit,
  });

  const query = [
    'active=true',
    'assigned_to=EMPTY',
    `sys_updated_on>javascript:gs.minutesAgo(${minutesAgo})`,
  ].join('^');

  const response = await snowRequest('GET', '/api/now/table/incident', config, {
    params: {
      sysparm_query: query,
      sysparm_fields: INCIDENT_FIELDS,
      sysparm_limit: String(limit),
      sysparm_display_value: 'false',
      sysparm_exclude_reference_link: 'true',
    },
  });

  const incidents = response?.result || [];

  logger.info('Polling concluído.', {
    skill: 'snow-poll-incidents',
    count: incidents.length,
  });

  return incidents;
}

/**
 * Busca o estado atual de um incidente específico (para idempotência).
 *
 * @param {string} sysId - sys_id do incidente.
 * @param {object} config - Configuração ServiceNow.
 * @returns {Promise<object>} Incidente atual.
 */
export async function getIncident(sysId, config) {
  const response = await snowRequest('GET', `/api/now/table/incident/${sysId}`, config, {
    params: {
      sysparm_fields: INCIDENT_FIELDS,
      sysparm_display_value: 'false',
    },
  });
  return response?.result;
}

/**
 * Adiciona uma work note ao incidente.
 * Conforme constitution.md Pilar 2: inclui execution_id para auditoria.
 *
 * @param {string} sysId - sys_id do incidente.
 * @param {string} note - Conteúdo da work note.
 * @param {string} executionId - ID único de execução para auditoria.
 * @param {object} config - Configuração ServiceNow.
 * @returns {Promise<void>}
 */
export async function addWorkNote(sysId, note, executionId, config) {
  const noteWithAudit = `[execution_id:${executionId}] ${note}`;

  await snowRequest('PATCH', `/api/now/table/incident/${sysId}`, config, {
    body: { work_notes: noteWithAudit },
  });

  logger.debug('Work note adicionada ao incidente.', {
    skill: 'snow-incidents',
    sys_id: sysId,
    execution_id: executionId,
  });
}

/**
 * Resolve um incidente (fecha com código de resolução).
 *
 * Conforme constitution.md Pilar 2: verifica estado atual antes de fechar.
 *
 * @param {string} sysId - sys_id do incidente.
 * @param {string} resolutionNotes - Notas de resolução.
 * @param {string} closeCode - Código de fechamento ServiceNow.
 * @param {string} executionId - ID único de execução.
 * @param {object} config - Configuração ServiceNow.
 * @returns {Promise<boolean>} True se fechado com sucesso, false se já estava fechado.
 */
export async function resolveIncident(sysId, resolutionNotes, closeCode, executionId, config) {
  // Verificação de idempotência: não fechar ticket já fechado
  const current = await getIncident(sysId, config);

  if (!current) {
    logger.warn('Incidente não encontrado para resolução.', {
      skill: 'snow-resolve-incident',
      sys_id: sysId,
    });
    return false;
  }

  if (current.incident_state === '6' || current.state === '6') {
    logger.info('Incidente já está fechado. Operação de resolução ignorada (idempotência).', {
      skill: 'snow-resolve-incident',
      sys_id: sysId,
      number: current.number,
    });
    return false;
  }

  const noteWithAudit = `[execution_id:${executionId}] Resolvido automaticamente via SOP.\n${resolutionNotes}`;

  await snowRequest('PATCH', `/api/now/table/incident/${sysId}`, config, {
    body: {
      incident_state: '6',
      state: '6',
      close_code: closeCode,
      close_notes: resolutionNotes,
      work_notes: noteWithAudit,
    },
  });

  logger.info('Incidente resolvido com sucesso.', {
    skill: 'snow-resolve-incident',
    sys_id: sysId,
    number: current.number,
    execution_id: executionId,
  });

  return true;
}

/**
 * Atualiza o grupo de atribuição de um incidente (roteamento).
 *
 * @param {string} sysId - sys_id do incidente.
 * @param {string} assignmentGroupSysId - sys_id do grupo de atribuição.
 * @param {string} category - Categoria determinada pelo agente.
 * @param {string} executionId - ID único de execução.
 * @param {object} config - Configuração ServiceNow.
 * @returns {Promise<void>}
 */
export async function routeIncident(sysId, assignmentGroupSysId, category, executionId, config) {
  const noteWithAudit =
    `[execution_id:${executionId}] Ticket roteado automaticamente pelo agente N2. ` +
    `Categoria: ${category}.`;

  await snowRequest('PATCH', `/api/now/table/incident/${sysId}`, config, {
    body: {
      assignment_group: assignmentGroupSysId,
      category,
      work_notes: noteWithAudit,
    },
  });

  logger.info('Incidente roteado com sucesso.', {
    skill: 'snow-classify-route',
    sys_id: sysId,
    assignment_group: assignmentGroupSysId,
    category,
    execution_id: executionId,
  });
}

/**
 * Gera um ID único de execução para auditoria.
 *
 * @returns {string} UUID v4.
 */
export function generateExecutionId() {
  return randomUUID();
}
