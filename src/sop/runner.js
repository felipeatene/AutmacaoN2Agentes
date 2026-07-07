/**
 * Executor de SOPs (Standard Operating Procedures) — Agente N2
 *
 * Conforme constitution.md Pilar 3 (Isolamento de Execução):
 * - Toda alteração em produção deve corresponder a um SOP registrado.
 * - Nunca improvisar resolução sem SOP.
 * - Execução idempotente: verifica estado antes de aplicar cada passo.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';

/** Cache de SOPs carregados em memória. */
let sopCache = null;

/**
 * Carrega todos os SOPs do diretório especificado.
 *
 * @param {string} sopsDir - Caminho do diretório de SOPs.
 * @returns {Promise<Map<string, object>>} Mapa de SOPs (id → definição).
 */
export async function loadSOPs(sopsDir) {
  if (sopCache) return sopCache;

  const sops = new Map();

  let files;
  try {
    files = await readdir(sopsDir);
  } catch (err) {
    logger.warn('Diretório de SOPs não encontrado ou inacessível.', {
      skill: 'sop-runner',
      dir: sopsDir,
      error: err.message,
    });
    sopCache = sops;
    return sops;
  }

  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const filePath = join(sopsDir, file);
    try {
      const content = await readFile(filePath, 'utf-8');
      const sop = JSON.parse(content);

      if (!sop.id || !sop.triggers || !sop.steps) {
        logger.warn('SOP com estrutura inválida ignorado.', {
          skill: 'sop-runner',
          file: filePath,
        });
        continue;
      }

      sops.set(sop.id, sop);
      logger.debug('SOP carregado.', { skill: 'sop-runner', id: sop.id, name: sop.name });
    } catch (err) {
      logger.warn('Falha ao carregar SOP.', {
        skill: 'sop-runner',
        file: filePath,
        error: err.message,
      });
    }
  }

  logger.info(`${sops.size} SOP(s) carregado(s).`, { skill: 'sop-runner' });
  sopCache = sops;
  return sops;
}

/** Invalida o cache de SOPs (útil para testes). */
export function clearSopCache() {
  sopCache = null;
}

/**
 * Encontra um SOP correspondente ao ticket com base nos gatilhos.
 *
 * @param {object} incident - Objeto do incidente ServiceNow.
 * @param {Map<string, object>} sops - SOPs disponíveis.
 * @returns {object|null} SOP correspondente, ou null se nenhum encontrado.
 */
export function findMatchingSOP(incident, sops) {
  const text = [
    incident.short_description || '',
    incident.description || '',
  ].join(' ').toLowerCase();

  for (const sop of sops.values()) {
    const triggers = (sop.triggers || []).map((t) => t.toLowerCase());
    const matched = triggers.some((trigger) => text.includes(trigger));

    if (matched) {
      logger.debug('SOP correspondente encontrado.', {
        skill: 'sop-runner',
        incident_number: incident.number,
        sop_id: sop.id,
        sop_name: sop.name,
      });
      return sop;
    }
  }

  return null;
}

/**
 * Executa um SOP em um incidente.
 *
 * Conforme constitution.md Pilar 3: executa apenas passos definidos no SOP.
 * Conforme constitution.md Pilar 2: verifica idempotência antes de cada passo.
 *
 * @param {object} sop - Definição do SOP.
 * @param {object} incident - Incidente alvo.
 * @param {string} executionId - ID de execução para auditoria.
 * @param {object} snowConfig - Configuração ServiceNow.
 * @param {object} snowOps - Objeto com funções de operação ServiceNow.
 * @returns {Promise<{success: boolean, steps_executed: number}>}
 */
export async function executeSOPSteps(sop, incident, executionId, snowConfig, snowOps) {
  logger.info('Iniciando execução de SOP.', {
    skill: 'sop-runner',
    sop_id: sop.id,
    incident_number: incident.number,
    execution_id: executionId,
  });

  let stepsExecuted = 0;

  for (const step of sop.steps) {
    try {
      switch (step.action) {
        case 'add_note': {
          await snowOps.addWorkNote(
            incident.sys_id,
            step.value || 'Passo de SOP executado.',
            executionId,
            snowConfig
          );
          stepsExecuted++;
          break;
        }

        case 'set_field': {
          // Apenas campos permitidos — sem execução de código dinâmico
          const allowedFields = ['category', 'subcategory', 'assignment_group', 'priority'];
          if (!allowedFields.includes(step.field)) {
            logger.warn('Campo não permitido em SOP ignorado.', {
              skill: 'sop-runner',
              field: step.field,
            });
            break;
          }
          await snowOps.patchIncident(incident.sys_id, { [step.field]: step.value }, snowConfig);
          stepsExecuted++;
          break;
        }

        case 'close': {
          const closed = await snowOps.resolveIncident(
            incident.sys_id,
            sop.resolution_notes || `Resolvido automaticamente pelo SOP: ${sop.name}`,
            sop.close_code || 'Solved (Permanently)',
            executionId,
            snowConfig
          );
          if (closed) stepsExecuted++;
          break;
        }

        default:
          logger.warn('Passo de SOP com ação desconhecida ignorado.', {
            skill: 'sop-runner',
            action: step.action,
          });
      }
    } catch (err) {
      logger.error('Falha ao executar passo de SOP.', {
        skill: 'sop-runner',
        sop_id: sop.id,
        step_action: step.action,
        error: err.message,
      });
      return { success: false, steps_executed: stepsExecuted };
    }
  }

  logger.info('SOP executado com sucesso.', {
    skill: 'sop-runner',
    sop_id: sop.id,
    incident_number: incident.number,
    steps_executed: stepsExecuted,
    execution_id: executionId,
  });

  return { success: true, steps_executed: stepsExecuted };
}
