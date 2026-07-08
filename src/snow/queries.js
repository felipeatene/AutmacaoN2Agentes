/**
 * Carregador e construtor de queries ServiceNow — Lino
 *
 * Carrega definições de config/snow/queries/ e monta sysparm_query dinâmico.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUERIES_DIR = join(__dirname, '..', '..', 'config', 'snow', 'queries');

/** @type {Map<string, object>} */
const queryCache = new Map();

/**
 * Carrega uma query por ID (ex: n2-poll, guepardo-abertos).
 *
 * @param {string} queryId - Identificador do arquivo JSON (sem extensão).
 * @returns {Promise<object>} Definição da query.
 */
export async function loadQuery(queryId) {
  if (queryCache.has(queryId)) {
    return queryCache.get(queryId);
  }

  const filePath = join(QUERIES_DIR, `${queryId}.json`);
  const content = await readFile(filePath, 'utf-8');
  const query = JSON.parse(content);
  queryCache.set(queryId, query);
  return query;
}

/**
 * Constrói sysparm_query para polling N2 com filtro de assignment_group IN.
 *
 * @param {object} queryConfig - Definição carregada de n2-poll.json.
 * @param {object} [options={}]
 * @param {number} [options.minutesAgo=2] - Janela de tempo em minutos.
 * @param {string[]} [options.assignmentGroupSysIds=[]] - sys_ids dos grupos.
 * @returns {string} Query encoded para sysparm_query.
 */
export function buildPollQuery(queryConfig, options = {}) {
  const { minutesAgo = 2, assignmentGroupSysIds = [] } = options;

  const parts = [...(queryConfig.baseFilters || [])];

  for (const template of queryConfig.dynamicFilters || []) {
    parts.push(template.replace('{minutesAgo}', String(minutesAgo)));
  }

  if (assignmentGroupSysIds.length > 0) {
    const baseGroupFilter = parts.find((p) => p.startsWith('assignment_group='));
    if (baseGroupFilter) {
      const idx = parts.indexOf(baseGroupFilter);
      parts.splice(idx, 1);
    }
    parts.push(`assignment_groupIN${assignmentGroupSysIds.join(',')}`);
  }

  return parts.join('^');
}

/**
 * Monta parâmetros completos para requisição de polling.
 *
 * @param {object} queryConfig - Definição da query.
 * @param {object} [options={}]
 * @returns {object} Parâmetros para sysparm_*.
 */
export function buildPollParams(queryConfig, options = {}) {
  const { minutesAgo = 2, assignmentGroupSysIds = [], limit = 50 } = options;

  const params = { ...(queryConfig.params || {}) };
  params.sysparm_query = buildPollQuery(queryConfig, { minutesAgo, assignmentGroupSysIds });

  if (queryConfig.fields?.length) {
    params.sysparm_fields = queryConfig.fields.join(',');
  }

  if (params.sysparm_limit) {
    params.sysparm_limit = String(limit);
  }

  return params;
}

/** Limpa cache de queries (útil para testes). */
export function clearQueryCache() {
  queryCache.clear();
}
