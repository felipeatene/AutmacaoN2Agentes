/**
 * Templates de Adaptive Cards — Microsoft Teams
 *
 * Conforme constitution.md Pilar 1 e plan.md seção 6.2:
 * - Usa Action.Execute (Universal Actions) — NÃO usar Action.Submit (descontinuado).
 * - Cards são declarativos JSON; sem execução de conteúdo dinâmico de tickets.
 */

/**
 * Gera um Adaptive Card para coleta de contexto adicional do usuário.
 *
 * @param {object} params - Parâmetros do card.
 * @param {string} params.incidentNumber - Número do incidente (ex: INC0001234).
 * @param {string} params.incidentSysId - sys_id do incidente.
 * @param {string} params.shortDescription - Descrição curta do incidente (sanitizada).
 * @returns {object} Objeto Adaptive Card para uso no Bot Framework.
 */
export function buildContextRequestCard({ incidentNumber, incidentSysId, shortDescription }) {
  // Sanitização: remover caracteres de controle para evitar injeção no card
  const safeDescription = String(shortDescription || '').replace(/[<>"'&]/g, '');

  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: `Solicitação de Suporte — ${incidentNumber}`,
          weight: 'Bolder',
          size: 'Medium',
        },
        {
          type: 'TextBlock',
          text: safeDescription,
          wrap: true,
        },
        {
          type: 'TextBlock',
          text: 'Por favor, forneça informações adicionais para agilizar o atendimento:',
          wrap: true,
          spacing: 'Medium',
        },
        {
          type: 'Input.Text',
          id: 'additionalContext',
          placeholder: 'Descreva o problema com mais detalhes...',
          isMultiline: true,
          maxLength: 1000,
        },
        {
          type: 'Input.ChoiceSet',
          id: 'urgency',
          label: 'Qual a urgência do problema?',
          choices: [
            { title: 'Crítico — Sistema completamente parado', value: '1' },
            { title: 'Alto — Funcionalidade principal afetada', value: '2' },
            { title: 'Médio — Funcionalidade parcial', value: '3' },
            { title: 'Baixo — Inconveniência menor', value: '4' },
          ],
          value: '3',
        },
      ],
      actions: [
        {
          type: 'Action.Execute',
          title: 'Enviar Informações',
          verb: 'submitContext',
          data: {
            incidentSysId,
            incidentNumber,
            action: 'provideContext',
          },
          style: 'positive',
        },
      ],
    },
  };
}

/**
 * Gera um Adaptive Card para aprovação humana de ação irreversível (Human-in-the-Loop).
 *
 * @param {object} params - Parâmetros do card.
 * @param {string} params.incidentNumber - Número do incidente.
 * @param {string} params.incidentSysId - sys_id do incidente.
 * @param {string} params.proposedAction - Ação proposta pelo agente (sanitizada).
 * @param {string} params.executionId - ID de execução para rastreabilidade.
 * @returns {object} Objeto Adaptive Card de aprovação.
 */
export function buildApprovalCard({ incidentNumber, incidentSysId, proposedAction, executionId }) {
  const safeAction = String(proposedAction || '').replace(/[<>"'&]/g, '');

  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: `Aprovação Necessária — ${incidentNumber}`,
          weight: 'Bolder',
          size: 'Medium',
          color: 'Warning',
        },
        {
          type: 'TextBlock',
          text: 'O agente autônomo identificou uma ação que requer aprovação humana:',
          wrap: true,
        },
        {
          type: 'TextBlock',
          text: safeAction,
          wrap: true,
          weight: 'Bolder',
          spacing: 'Small',
        },
        {
          type: 'TextBlock',
          text: `ID de Execução: ${executionId}`,
          size: 'Small',
          color: 'Default',
          isSubtle: true,
        },
      ],
      actions: [
        {
          type: 'Action.Execute',
          title: 'Aprovar',
          verb: 'approveAction',
          data: {
            incidentSysId,
            incidentNumber,
            executionId,
            decision: 'approved',
            action: 'humanApproval',
          },
          style: 'positive',
        },
        {
          type: 'Action.Execute',
          title: 'Rejeitar',
          verb: 'rejectAction',
          data: {
            incidentSysId,
            incidentNumber,
            executionId,
            decision: 'rejected',
            action: 'humanApproval',
          },
          style: 'destructive',
        },
      ],
    },
  };
}

/**
 * Gera um Adaptive Card de confirmação após recebimento de resposta.
 *
 * @param {string} incidentNumber - Número do incidente.
 * @returns {object} Objeto Adaptive Card de confirmação.
 */
export function buildConfirmationCard(incidentNumber) {
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: `Informações recebidas — ${incidentNumber}`,
          weight: 'Bolder',
          color: 'Good',
        },
        {
          type: 'TextBlock',
          text: 'Obrigado! Suas informações foram registradas no ticket e um analista dará continuidade ao atendimento em breve.',
          wrap: true,
        },
      ],
    },
  };
}
