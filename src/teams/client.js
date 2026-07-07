/**
 * Cliente Bot Framework — Microsoft Teams
 *
 * Conforme plan.md seção 6.1:
 * - Inicializa o adapter com credenciais Azure AD.
 * - Cria conversas 1:1 proativas via aadObjectId.
 */

import { BotFrameworkAdapter } from 'botbuilder';
import { logger } from '../utils/logger.js';

let adapter = null;

/**
 * Inicializa o Bot Framework Adapter com as credenciais configuradas.
 *
 * @param {object} teamsConfig - Configuração Teams (appId, appPassword).
 * @returns {BotFrameworkAdapter} Adapter inicializado.
 */
export function initTeamsAdapter(teamsConfig) {
  adapter = new BotFrameworkAdapter({
    appId: teamsConfig.appId,
    appPassword: teamsConfig.appPassword,
  });

  // Conforme constitution.md Pilar 1: falha rápida em erros de autenticação
  adapter.onTurnError = async (context, error) => {
    logger.error('Erro não tratado no adapter do Teams.', {
      skill: 'teams-client',
      error: error.message,
      stack: error.stack?.substring(0, 500),
    });
    throw error;
  };

  logger.info('Bot Framework Adapter inicializado.', { skill: 'teams-client' });
  return adapter;
}

/**
 * Retorna o adapter inicializado, ou lança erro se não inicializado.
 *
 * @returns {BotFrameworkAdapter}
 * @throws {Error} Se o adapter não foi inicializado.
 */
export function getAdapter() {
  if (!adapter) {
    throw new Error('Teams adapter não inicializado. Chame initTeamsAdapter() primeiro.');
  }
  return adapter;
}
