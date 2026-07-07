/**
 * Gerenciamento de Tags ServiceNow via label_entry — Agente N2
 *
 * Conforme constitution.md Pilar 2 (Idempotência Absoluta) e plan.md seção 5.3:
 * - Tags NÃO devem ser aplicadas via sys_tags (campo M:N derivado — falha silenciosa).
 * - Usar tabela de intersecção label_entry.
 * - Verificar existência antes de inserir para evitar duplicatas.
 */

import { snowRequest } from './client.js';
import { logger } from '../utils/logger.js';

/**
 * Busca o sys_id de uma label pelo nome.
 *
 * @param {string} labelName - Nome da label/tag.
 * @param {object} config - Configuração ServiceNow.
 * @returns {Promise<string|null>} sys_id da label, ou null se não encontrada.
 */
export async function findLabelByName(labelName, config) {
  const response = await snowRequest('GET', '/api/now/table/label', config, {
    params: {
      sysparm_query: `name=${encodeURIComponent(labelName)}`,
      sysparm_fields: 'sys_id,name',
      sysparm_limit: '1',
    },
  });

  const results = response?.result || [];
  if (results.length === 0) {
    logger.warn('Label não encontrada no ServiceNow.', {
      skill: 'snow-apply-tag',
      label_name: labelName,
    });
    return null;
  }

  return results[0].sys_id;
}

/**
 * Verifica se uma entrada label_entry já existe para evitar duplicatas.
 *
 * Conforme constitution.md Pilar 2: sempre consultar antes de modificar.
 *
 * @param {string} incidentSysId - sys_id do incidente.
 * @param {string} labelSysId - sys_id da label.
 * @param {object} config - Configuração ServiceNow.
 * @returns {Promise<boolean>} True se a entrada já existe.
 */
export async function labelEntryExists(incidentSysId, labelSysId, config) {
  const query = [
    'table=incident',
    `table_key=${incidentSysId}`,
    `label=${labelSysId}`,
  ].join('^');

  const response = await snowRequest('GET', '/api/now/table/label_entry', config, {
    params: {
      sysparm_query: query,
      sysparm_fields: 'sys_id',
      sysparm_limit: '1',
    },
  });

  const results = response?.result || [];
  return results.length > 0;
}

/**
 * Aplica uma tag a um incidente via tabela label_entry.
 *
 * Conforme plan.md seção 5.3:
 * 1. Busca sys_id da label pelo nome.
 * 2. Verifica se já existe em label_entry (idempotência).
 * 3. Se não existir, cria nova entrada.
 *
 * @param {string} incidentSysId - sys_id do incidente.
 * @param {string} labelName - Nome da tag/label.
 * @param {object} config - Configuração ServiceNow.
 * @returns {Promise<boolean>} True se aplicada, false se já existia ou label não encontrada.
 */
export async function applyTag(incidentSysId, labelName, config) {
  logger.debug('Iniciando aplicação de tag via label_entry.', {
    skill: 'snow-apply-tag',
    incident_sys_id: incidentSysId,
    label_name: labelName,
  });

  // Passo 1: Buscar sys_id da label
  const labelSysId = await findLabelByName(labelName, config);
  if (!labelSysId) {
    logger.warn('Não foi possível aplicar tag: label não encontrada.', {
      skill: 'snow-apply-tag',
      label_name: labelName,
      incident_sys_id: incidentSysId,
    });
    return false;
  }

  // Passo 2: Verificar idempotência
  const exists = await labelEntryExists(incidentSysId, labelSysId, config);
  if (exists) {
    logger.info('Tag já aplicada ao incidente. Operação ignorada (idempotência).', {
      skill: 'snow-apply-tag',
      label_name: labelName,
      incident_sys_id: incidentSysId,
    });
    return false;
  }

  // Passo 3: Inserir nova entrada
  await snowRequest('POST', '/api/now/table/label_entry', config, {
    body: {
      table: 'incident',
      table_key: incidentSysId,
      label: labelSysId,
    },
  });

  logger.info('Tag aplicada com sucesso via label_entry.', {
    skill: 'snow-apply-tag',
    label_name: labelName,
    label_sys_id: labelSysId,
    incident_sys_id: incidentSysId,
  });

  return true;
}

/**
 * Aplica múltiplas tags a um incidente.
 *
 * @param {string} incidentSysId - sys_id do incidente.
 * @param {string[]} labelNames - Lista de nomes de tags.
 * @param {object} config - Configuração ServiceNow.
 * @returns {Promise<{applied: string[], skipped: string[], failed: string[]}>}
 */
export async function applyTags(incidentSysId, labelNames, config) {
  const result = { applied: [], skipped: [], failed: [] };

  for (const labelName of labelNames) {
    try {
      const applied = await applyTag(incidentSysId, labelName, config);
      if (applied) {
        result.applied.push(labelName);
      } else {
        result.skipped.push(labelName);
      }
    } catch (err) {
      logger.error('Falha ao aplicar tag.', {
        skill: 'snow-apply-tag',
        label_name: labelName,
        incident_sys_id: incidentSysId,
        error: err.message,
      });
      result.failed.push(labelName);
    }
  }

  return result;
}
