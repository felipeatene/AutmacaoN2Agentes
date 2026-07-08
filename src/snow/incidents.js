/**
 * Operações de Incidentes ServiceNow — Lino
 *
 * Conforme constitution.md:
 * - Pilar 2: Verifica estado atual antes de qualquer escrita (idempotência).
 * - Query cirúrgica via n2-poll.json para evitar processamento redundante.
 */

import { snowRequest } from './client.js';
import { loadQuery, buildPollParams } from './queries.js';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'node:crypto';

/**
 * Extrai valor de campo ServiceNow (suporta display_value=all).
 *
 * @param {unknown} field
 * @returns {string|null}
 */
export function extractFieldValue(field) {
  if (field == null || field === '') return null;
  if (typeof field === 'object' && field.value !== undefined) {
    return field.value || null;
  }
  return String(field);
}

/**
 * Extrai AAD object ID do caller a partir de display values.
 *
 * @param {object} incident
 * @returns {string|null}
 */
export function extractCallerAadObjectId(incident) {
  const direct = extractFieldValue(incident.u_aad_object_id);
  if (direct) return direct;

  const caller = incident.caller_id;
  if (!caller) return null;

  if (typeof caller === 'object') {
    const fromCaller = extractFieldValue(caller.u_aad_object_id);
    if (fromCaller) return fromCaller;
  }

  return null;
}

/**
 * Normaliza incidente com display_value=all para formato interno.
 *
 * @param {object} raw
 * @returns {object}
 */
export function normalizeIncident(raw) {
  return {
    ...raw,
    sys_id: extractFieldValue(raw.sys_id) || raw.sys_id,
    number: extractFieldValue(raw.number) || raw.number,
    state: extractFieldValue(raw.state) || raw.state,
    incident_state: extractFieldValue(raw.incident_state) || raw.incident_state,
    assigned_to: extractFieldValue(raw.assigned_to),
    assignment_group: extractFieldValue(raw.assignment_group),
    caller_id: {
      sys_id: extractFieldValue(raw.caller_id) || (typeof raw.caller_id === 'object' ? raw.caller_id?.value : raw.caller_id),
      display_value:
        typeof raw.caller_id === 'object' ? raw.caller_id?.display_value : null,
      u_aad_object_id: extractCallerAadObjectId(raw),
    },
    u_aad_object_id: extractCallerAadObjectId(raw),
  };
}

/**
 * Busca incidentes para polling N2 usando query de config/snow/queries/n2-poll.json.
 *
 * @param {object} config - Configuração ServiceNow (com perfis read/write).
 * @param {number} [minutesAgo=2] - Janela de tempo em minutos.
 * @param {number} [limit=50] - Máximo de tickets retornados.
 * @param {string[]} [assignmentGroupSysIds=[]] - sys_ids para filtro assignment_groupIN.
 * @returns {Promise<object[]>} Lista de incidentes normalizados.
 */
export async function pollIncidents(config, minutesAgo = 2, limit = 50, assignmentGroupSysIds = []) {
  logger.info('Iniciando polling de incidentes ServiceNow.', {
    skill: 'snow-poll-incidents',
    minutes_ago: minutesAgo,
    limit,
    assignment_groups: assignmentGroupSysIds.length,
  });

  const queryConfig = await loadQuery('n2-poll');
  const params = buildPollParams(queryConfig, { minutesAgo, assignmentGroupSysIds, limit });

  const response = await snowRequest('GET', '/api/now/table/incident', config, {
    authProfile: 'read',
    params,
  });

  const incidents = (response?.result || []).map(normalizeIncident);

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
  const queryConfig = await loadQuery('n2-poll');
  const fields = queryConfig.fields?.join(',') || 'sys_id,number,state,incident_state';

  const response = await snowRequest('GET', `/api/now/table/incident/${sysId}`, config, {
    authProfile: 'read',
    params: {
      sysparm_fields: fields,
      sysparm_display_value: 'all',
    },
  });
  return normalizeIncident(response?.result || {});
}

/**
 * Adiciona uma work note ao incidente.
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
    authProfile: 'write',
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
 * @param {string} sysId - sys_id do incidente.
 * @param {string} resolutionNotes - Notas de resolução.
 * @param {string} closeCode - Código de fechamento ServiceNow.
 * @param {string} executionId - ID único de execução.
 * @param {object} config - Configuração ServiceNow.
 * @returns {Promise<boolean>} True se fechado com sucesso, false se já estava fechado.
 */
export async function resolveIncident(sysId, resolutionNotes, closeCode, executionId, config) {
  const current = await getIncident(sysId, config);

  if (!current?.sys_id) {
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
    authProfile: 'write',
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
    authProfile: 'write',
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
