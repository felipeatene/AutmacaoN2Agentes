/**
 * Envio Proativo de Mensagens — Microsoft Teams
 *
 * Conforme plan.md seção 6.1 e constitution.md:
 * - Inicia conversa 1:1 via aadObjectId do usuário.
 * - RF-04: Adaptive Card com Action.Execute.
 * - RF-05: Fallback para work_notes no ServiceNow em caso de falha.
 */

import { getAdapter } from './client.js';
import { logger } from '../utils/logger.js';

/**
 * Envia uma mensagem proativa 1:1 para um usuário no Microsoft Teams.
 *
 * @param {object} params - Parâmetros de envio.
 * @param {string} params.userAadObjectId - AAD Object ID do usuário destinatário.
 * @param {string} params.serviceUrl - Service URL do Bot Framework (ex: https://smba.trafficmanager.net/br/).
 * @param {string} params.tenantId - Tenant ID do Azure AD.
 * @param {string} params.botAppId - App ID do bot.
 * @param {object} params.attachment - Adaptive Card attachment (contentType + content).
 * @returns {Promise<boolean>} True se enviado com sucesso.
 * @throws {Error} Erros de autenticação (401/403) são relançados para tratamento externo.
 */
export async function sendProactiveMessage({ userAadObjectId, serviceUrl, tenantId, botAppId, attachment }) {
  const adapter = getAdapter();

  logger.info('Iniciando envio proativo de mensagem no Teams.', {
    skill: 'teams-proactive-message',
    user_aad_id: userAadObjectId,
  });

  // Referência de conversa 1:1 conforme plan.md seção 6.1
  const conversationParameters = {
    isGroup: false,
    channelData: {
      tenant: { id: tenantId },
    },
    bot: { id: botAppId, name: 'N2 Agent' },
    members: [
      {
        id: userAadObjectId,
        aadObjectId: userAadObjectId,
      },
    ],
  };

  let sent = false;

  await adapter.createConversation(
    { serviceUrl, channelId: 'msteams' },
    conversationParameters,
    async (context) => {
      await context.sendActivity({ attachments: [attachment] });
      sent = true;
      logger.info('Adaptive Card enviado com sucesso via Teams.', {
        skill: 'teams-proactive-message',
        user_aad_id: userAadObjectId,
      });
    }
  );

  return sent;
}

/**
 * Tenta enviar Adaptive Card proativo; em caso de falha, registra fallback no ServiceNow.
 *
 * Implementa RF-04 e RF-05 conforme spec.md.
 *
 * @param {object} sendParams - Parâmetros para sendProactiveMessage.
 * @param {object} fallbackParams - Parâmetros de fallback.
 * @param {string} fallbackParams.incidentSysId - sys_id do incidente.
 * @param {string} fallbackParams.executionId - ID de execução para auditoria.
 * @param {Function} fallbackParams.addWorkNoteFn - Função para adicionar work note no ServiceNow.
 * @returns {Promise<{sent: boolean, fallback: boolean}>}
 */
export async function sendProactiveWithFallback(sendParams, fallbackParams) {
  const { incidentSysId, executionId, addWorkNoteFn } = fallbackParams;

  try {
    const sent = await sendProactiveMessage(sendParams);
    return { sent, fallback: false };
  } catch (err) {
    logger.warn('Falha ao enviar mensagem proativa no Teams. Executando fallback para work_notes.', {
      skill: 'teams-fallback-worknotes',
      incident_sys_id: incidentSysId,
      error_code: err.statusCode || 'UNKNOWN',
      error_message: err.message,
    });

    // RF-05: Fallback — registrar no ServiceNow e continuar ciclo
    try {
      const fallbackNote =
        `[AGENTE N2] Não foi possível enviar notificação via Microsoft Teams. ` +
        `Erro: ${err.message}. ` +
        `Por favor, um analista deve contatar o usuário diretamente.`;

      await addWorkNoteFn(incidentSysId, fallbackNote, executionId);

      logger.info('Fallback registrado em work_notes do ServiceNow.', {
        skill: 'teams-fallback-worknotes',
        incident_sys_id: incidentSysId,
        execution_id: executionId,
      });

      return { sent: false, fallback: true };
    } catch (fallbackErr) {
      logger.error('Falha também no fallback de work_notes.', {
        skill: 'teams-fallback-worknotes',
        incident_sys_id: incidentSysId,
        error: fallbackErr.message,
      });
      // Não relançar — o ciclo deve continuar para outros tickets (RF-05)
      return { sent: false, fallback: false };
    }
  }
}
