/**
 * Validador de Configuração — Agente N2
 *
 * Conforme constitution.md Pilar 1 (Falha Rápida e Ruidosa):
 * - Aborta a inicialização imediatamente se qualquer variável obrigatória estiver ausente.
 * - NUNCA logar os valores das credenciais, apenas os nomes das variáveis ausentes.
 */

import { logger } from './logger.js';

/** Variáveis obrigatórias para operação do agente (conforme constitution.md). */
const REQUIRED_ENV_VARS = [
  'SNOW_INSTANCE_URL',
  'TEAMS_APP_ID',
  'TEAMS_APP_PASSWORD',
  'TEAMS_TENANT_ID',
  'TEAMS_SERVICE_URL',
];

/** Variáveis que requerem ao menos um dos grupos de autenticação ServiceNow. */
const SNOW_AUTH_GROUPS = [
  ['SNOW_CLIENT_ID', 'SNOW_CLIENT_SECRET'],
  ['SNOW_USERNAME', 'SNOW_PASSWORD'],
];

/**
 * Valida a presença de todas as variáveis de ambiente obrigatórias.
 * Lança um erro e aborta o processo se alguma variável estiver ausente.
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

  // Verifica se ao menos um grupo de autenticação ServiceNow está completo.
  const hasValidAuth = SNOW_AUTH_GROUPS.some((group) =>
    group.every((v) => process.env[v])
  );

  if (!hasValidAuth) {
    logger.error(
      'Nenhum método de autenticação ServiceNow configurado. ' +
        'Configure (SNOW_CLIENT_ID + SNOW_CLIENT_SECRET) ou (SNOW_USERNAME + SNOW_PASSWORD).',
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
  return {
    snow: {
      instanceUrl: process.env.SNOW_INSTANCE_URL,
      clientId: process.env.SNOW_CLIENT_ID,
      clientSecret: process.env.SNOW_CLIENT_SECRET,
      username: process.env.SNOW_USERNAME,
      password: process.env.SNOW_PASSWORD,
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
