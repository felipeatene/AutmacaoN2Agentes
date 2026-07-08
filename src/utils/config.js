/**
 * Validador de Configuração — Lino
 *
 * Conforme constitution.md Pilar 1 (Falha Rápida e Ruidosa):
 * - Aborta a inicialização imediatamente se qualquer variável obrigatória estiver ausente.
 * - NUNCA logar os valores das credenciais, apenas os nomes das variáveis ausentes.
 */

import { logger } from './logger.js';
import { resolveSessionCachePath } from '../snow/session-store.js';

/** Variáveis obrigatórias para operação do agente (conforme constitution.md). */
const REQUIRED_ENV_VARS = [
  'SNOW_INSTANCE_URL',
  'TEAMS_APP_ID',
  'TEAMS_APP_PASSWORD',
  'TEAMS_TENANT_ID',
  'TEAMS_SERVICE_URL',
];

/** Grupos de autenticação ServiceNow — read e write (com fallback legado). */
const SNOW_READ_AUTH_GROUPS = [
  ['SNOW_READ_CLIENT_ID', 'SNOW_READ_CLIENT_SECRET'],
  ['SNOW_READ_USERNAME', 'SNOW_READ_PASSWORD'],
  ['SNOW_CLIENT_ID', 'SNOW_CLIENT_SECRET'],
  ['SNOW_USERNAME', 'SNOW_PASSWORD'],
];

const SNOW_WRITE_AUTH_GROUPS = [
  ['SNOW_WRITE_CLIENT_ID', 'SNOW_WRITE_CLIENT_SECRET'],
  ['SNOW_WRITE_USERNAME', 'SNOW_WRITE_PASSWORD'],
  ['SNOW_CLIENT_ID', 'SNOW_CLIENT_SECRET'],
  ['SNOW_USERNAME', 'SNOW_PASSWORD'],
];

/**
 * Verifica se um grupo de variáveis está completo no ambiente.
 *
 * @param {string[][]} groups
 * @returns {boolean}
 */
function hasAnyCompleteAuthGroup(groups) {
  return groups.some((group) => group.every((v) => process.env[v]));
}

/**
 * Monta perfil de autenticação ServiceNow a partir de prefixo de env.
 *
 * @param {'READ'|'WRITE'} prefix
 * @returns {object}
 */
function buildSnowProfile(prefix) {
  const instanceUrl =
    process.env[`SNOW_${prefix}_INSTANCE_URL`] || process.env.SNOW_INSTANCE_URL;

  return {
    instanceUrl,
    clientId: process.env[`SNOW_${prefix}_CLIENT_ID`] || process.env.SNOW_CLIENT_ID,
    clientSecret:
      process.env[`SNOW_${prefix}_CLIENT_SECRET`] || process.env.SNOW_CLIENT_SECRET,
    username: process.env[`SNOW_${prefix}_USERNAME`] || process.env.SNOW_USERNAME,
    password: process.env[`SNOW_${prefix}_PASSWORD`] || process.env.SNOW_PASSWORD,
  };
}

/**
 * Resolve modo de autenticação WRITE (oauth, basic ou session).
 *
 * @returns {'oauth'|'basic'|'session'}
 */
export function resolveWriteAuthMode() {
  const explicit = process.env.SNOW_WRITE_AUTH_MODE;
  if (explicit === 'session' || explicit === 'oauth' || explicit === 'basic') {
    return explicit;
  }

  const write = buildSnowProfile('WRITE');
  if (write.clientId && write.clientSecret) {
    return 'oauth';
  }
  if (write.username && write.password) {
    return 'basic';
  }
  return 'session';
}

/**
 * Valida a presença de todas as variáveis de ambiente obrigatórias.
 *
 * @throws {Error} Se alguma variável obrigatória estiver ausente.
 */
export function validateConfig() {
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    logger.error('Variáveis de ambiente obrigatórias ausentes. Abortando inicialização.', {
      skill: 'config-validator',
      missing_vars: missing,
    });
    process.exit(1);
  }

  const hasReadAuth = hasAnyCompleteAuthGroup(SNOW_READ_AUTH_GROUPS);
  const writeAuthMode = resolveWriteAuthMode();
  const hasWriteAuth =
    writeAuthMode === 'session' || hasAnyCompleteAuthGroup(SNOW_WRITE_AUTH_GROUPS);

  if (!hasReadAuth) {
    logger.error(
      'Nenhum método de autenticação ServiceNow READ configurado. ' +
        'Configure SNOW_READ_* ou SNOW_CLIENT_ID + SNOW_CLIENT_SECRET ou SNOW_USERNAME + SNOW_PASSWORD.',
      { skill: 'config-validator' }
    );
    process.exit(1);
  }

  if (!hasWriteAuth) {
    logger.error(
      'Nenhum método de autenticação ServiceNow WRITE configurado. ' +
        'Configure SNOW_WRITE_* , SNOW_WRITE_AUTH_MODE=session ou credenciais legadas SNOW_*.',
      { skill: 'config-validator' }
    );
    process.exit(1);
  }

  logger.info('Configuração validada com sucesso.', { skill: 'config-validator' });
}

/**
 * Retorna a configuração do agente com valores padrão para variáveis opcionais.
 *
 * @returns {object} Configuração do agente.
 */
export function getConfig() {
  const snowRead = buildSnowProfile('READ');
  const snowWrite = {
    ...buildSnowProfile('WRITE'),
    authMode: resolveWriteAuthMode(),
    sessionCachePath: resolveSessionCachePath(),
  };

  const extraGroups = (process.env.SNOW_EXTRA_ASSIGNMENT_GROUPS || '')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);

  return {
    snow: {
      read: snowRead,
      write: snowWrite,
      instanceUrl: snowRead.instanceUrl,
      clientId: snowRead.clientId,
      clientSecret: snowRead.clientSecret,
      username: snowRead.username,
      password: snowRead.password,
      queues: {
        monitorUser: process.env.SNOW_MONITOR_USER || '',
        filterMode: process.env.SNOW_QUEUE_FILTER_MODE || 'both',
        extraAssignmentGroups: extraGroups,
      },
    },
    teams: {
      appId: process.env.TEAMS_APP_ID,
      appPassword: process.env.TEAMS_APP_PASSWORD,
      tenantId: process.env.TEAMS_TENANT_ID,
      serviceUrl: process.env.TEAMS_SERVICE_URL,
    },
    agent: {
      pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '120000', 10),
      maxTicketsPerCycle: parseInt(process.env.MAX_TICKETS_PER_CYCLE || '50', 10),
      maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
      retryBaseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS || '1000', 10),
    },
  };
}
