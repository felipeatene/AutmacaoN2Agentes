/**
 * Resolução de grupos de atribuição ServiceNow — Lino
 */

import { snowRequest } from './client.js';
import { logger } from '../utils/logger.js';

/**
 * Resolve grupos de atribuição de um usuário pelo user_name.
 *
 * @param {string} userName - user_name do sys_user.
 * @param {object} config - Configuração ServiceNow (perfil read).
 * @returns {Promise<Array<{sys_id: string, name: string}>>}
 */
export async function resolveUserAssignmentGroups(userName, config) {
  const userResponse = await snowRequest('GET', '/api/now/table/sys_user', config, {
    authProfile: 'read',
    params: {
      sysparm_query: `user_name=${userName}`,
      sysparm_fields: 'sys_id,user_name',
      sysparm_limit: '1',
    },
  });

  const users = userResponse?.result || [];
  if (users.length === 0) {
    logger.warn('Usuário monitor não encontrado no ServiceNow.', {
      skill: 'snow-groups',
      user_name: userName,
    });
    return [];
  }

  const userSysId = users[0].sys_id;

  const memberResponse = await snowRequest('GET', '/api/now/table/sys_user_grmember', config, {
    authProfile: 'read',
    params: {
      sysparm_query: `user=${userSysId}`,
      sysparm_fields: 'group',
      sysparm_display_value: 'all',
      sysparm_limit: '100',
    },
  });

  const members = memberResponse?.result || [];
  const groups = [];

  for (const member of members) {
    const groupField = member.group;
    const sysId = typeof groupField === 'object' ? groupField.value : groupField;
    const name = typeof groupField === 'object' ? groupField.display_value : sysId;
    if (sysId) {
      groups.push({ sys_id: sysId, name: name || sysId });
    }
  }

  logger.debug('Grupos do usuário resolvidos.', {
    skill: 'snow-groups',
    user_name: userName,
    count: groups.length,
  });

  return groups;
}

/**
 * Resolve grupos explícitos por nome ou sys_id.
 *
 * @param {string[]} groupIdentifiers - Nomes ou sys_ids de grupos.
 * @param {object} config - Configuração ServiceNow (perfil read).
 * @returns {Promise<Array<{sys_id: string, name: string}>>}
 */
export async function resolveExplicitGroups(groupIdentifiers, config) {
  const groups = [];

  for (const identifier of groupIdentifiers) {
    const resolved = await resolveGroupSysId(identifier, config);
    if (resolved) {
      groups.push(resolved);
    }
  }

  return groups;
}

/**
 * Resolve nome ou sys_id de grupo para { sys_id, name }.
 *
 * @param {string} groupNameOrId - Nome display ou sys_id do grupo.
 * @param {object} config - Configuração ServiceNow.
 * @returns {Promise<{sys_id: string, name: string}|null>}
 */
export async function resolveGroupSysId(groupNameOrId, config) {
  if (!groupNameOrId) return null;

  const isSysId = /^[a-f0-9]{32}$/i.test(groupNameOrId);
  const query = isSysId
    ? `sys_id=${groupNameOrId}`
    : `name=${groupNameOrId}^ORsys_id=${groupNameOrId}`;

  const response = await snowRequest('GET', '/api/now/table/sys_user_group', config, {
    authProfile: 'read',
    params: {
      sysparm_query: query,
      sysparm_fields: 'sys_id,name',
      sysparm_limit: '1',
    },
  });

  const results = response?.result || [];
  if (results.length === 0) {
    logger.warn('Grupo de atribuição não encontrado.', {
      skill: 'snow-groups',
      group: groupNameOrId,
    });
    return null;
  }

  return { sys_id: results[0].sys_id, name: results[0].name };
}

/**
 * Monta filtro de filas para polling com base no modo configurado.
 *
 * @param {'user'|'explicit'|'both'|'none'} mode - Modo de filtro.
 * @param {Array<{sys_id: string, name: string}>} userGroups - Grupos do usuário monitor.
 * @param {Array<{sys_id: string, name: string}>} explicitGroups - Grupos explícitos.
 * @returns {{ sysIds: string[], assignmentGroupClause: string|null }}
 */
export function buildQueueFilter(mode, userGroups = [], explicitGroups = []) {
  let combined = [];

  if (mode === 'user' || mode === 'both') {
    combined = combined.concat(userGroups);
  }
  if (mode === 'explicit' || mode === 'both') {
    combined = combined.concat(explicitGroups);
  }

  const seen = new Set();
  const sysIds = [];
  for (const g of combined) {
    if (g?.sys_id && !seen.has(g.sys_id)) {
      seen.add(g.sys_id);
      sysIds.push(g.sys_id);
    }
  }

  const assignmentGroupClause =
    sysIds.length > 0 ? `assignment_groupIN${sysIds.join(',')}` : null;

  return { sysIds, assignmentGroupClause };
}
