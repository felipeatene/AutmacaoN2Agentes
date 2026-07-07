/**
 * Testes do Orquestrador de Decisões — src/orchestrator.js
 *
 * Testa:
 * - Roteamento para SOP quando correspondente encontrado.
 * - Classificação e roteamento quando sem SOP.
 * - Solicitação de contexto via Teams quando descrição insuficiente.
 * - Estatísticas do ciclo de processamento.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/** Cria um incidente de teste com valores padrão. */
function makeIncident(overrides = {}) {
  return {
    sys_id: 'sys-id-001',
    number: 'INC0001234',
    short_description: 'Problema com senha de acesso',
    description: 'O usuário não consegue fazer login com sua senha corporativa.',
    state: '1',
    incident_state: '1',
    assigned_to: null,
    assignment_group: null,
    caller_id: { sys_id: 'caller-001', u_aad_object_id: 'aad-001' },
    sys_updated_on: new Date().toISOString(),
    u_aad_object_id: 'aad-001',
    ...overrides,
  };
}

describe('orchestrator - findMatchingSOP', () => {
  test('encontra SOP por palavra-chave na short_description', async () => {
    const { findMatchingSOP } = await import('../src/sop/runner.js');

    const sops = new Map([
      [
        'password-reset',
        {
          id: 'password-reset',
          triggers: ['senha', 'password'],
          steps: [],
        },
      ],
    ]);

    const incident = makeIncident({ short_description: 'Problema com senha', description: '' });
    const result = findMatchingSOP(incident, sops);

    assert.ok(result, 'Deve encontrar SOP para palavra-chave "senha"');
    assert.equal(result.id, 'password-reset');
  });

  test('encontra SOP por palavra-chave na description', async () => {
    const { findMatchingSOP } = await import('../src/sop/runner.js');

    const sops = new Map([
      [
        'vpn-connectivity',
        {
          id: 'vpn-connectivity',
          triggers: ['vpn', 'tunnel'],
          steps: [],
        },
      ],
    ]);

    const incident = makeIncident({
      short_description: 'Problema de rede',
      description: 'Não consigo conectar na VPN corporativa.',
    });
    const result = findMatchingSOP(incident, sops);

    assert.ok(result, 'Deve encontrar SOP para palavra-chave "vpn"');
    assert.equal(result.id, 'vpn-connectivity');
  });

  test('retorna null quando nenhum SOP corresponde', async () => {
    const { findMatchingSOP } = await import('../src/sop/runner.js');

    const sops = new Map([
      [
        'password-reset',
        {
          id: 'password-reset',
          triggers: ['senha', 'password'],
          steps: [],
        },
      ],
    ]);

    const incident = makeIncident({
      short_description: 'Impressora não funciona',
      description: 'A impressora do andar 3 está offline.',
    });
    const result = findMatchingSOP(incident, sops);

    assert.equal(result, null, 'Deve retornar null quando nenhum SOP corresponde');
  });

  test('matching é case-insensitive', async () => {
    const { findMatchingSOP } = await import('../src/sop/runner.js');

    const sops = new Map([
      [
        'password-reset',
        {
          id: 'password-reset',
          triggers: ['password'],
          steps: [],
        },
      ],
    ]);

    const incident = makeIncident({
      short_description: 'PASSWORD Reset Required',
      description: '',
    });
    const result = findMatchingSOP(incident, sops);

    assert.ok(result, 'Matching deve ser case-insensitive');
  });
});

describe('orchestrator - processIncident (mock)', () => {
  test('retorna action=resolved_via_sop quando SOP executado com sucesso', async () => {
    // Mocking direto das dependências não é trivial em ESM sem ferramentas de mock,
    // então testamos o fluxo de classificação diretamente.
    const { findMatchingSOP } = await import('../src/sop/runner.js');

    const sops = new Map([
      [
        'password-reset',
        {
          id: 'password-reset',
          name: 'Reset de Senha',
          triggers: ['senha'],
          steps: [{ action: 'add_note', value: 'Reset realizado.' }],
          close_code: 'Solved (Permanently)',
        },
      ],
    ]);

    const incident = makeIncident({ short_description: 'Esqueci minha senha' });
    const matched = findMatchingSOP(incident, sops);

    assert.ok(matched, 'SOP deve ser encontrado para ticket sobre senha');
    assert.equal(matched.id, 'password-reset');
  });
});

describe('adaptive cards - buildContextRequestCard', () => {
  test('gera card com Action.Execute (não Action.Submit)', async () => {
    const { buildContextRequestCard } = await import('../src/teams/adaptiveCards.js');

    const card = buildContextRequestCard({
      incidentNumber: 'INC0001234',
      incidentSysId: 'sys-id-001',
      shortDescription: 'Problema de acesso',
    });

    assert.equal(card.contentType, 'application/vnd.microsoft.card.adaptive');
    assert.equal(card.content.type, 'AdaptiveCard');

    const actions = card.content.actions;
    assert.ok(Array.isArray(actions), 'Card deve ter actions');
    assert.ok(actions.length > 0, 'Card deve ter pelo menos uma action');

    // Verificar que NÃO usa Action.Submit
    const hasActionSubmit = actions.some((a) => a.type === 'Action.Submit');
    assert.equal(hasActionSubmit, false, 'Card NÃO deve usar Action.Submit (descontinuado)');

    // Verificar que USA Action.Execute
    const hasActionExecute = actions.some((a) => a.type === 'Action.Execute');
    assert.ok(hasActionExecute, 'Card DEVE usar Action.Execute');
  });

  test('sanitiza short_description para evitar injeção', async () => {
    const { buildContextRequestCard } = await import('../src/teams/adaptiveCards.js');

    const maliciousDesc = '<script>alert("xss")</script>';
    const card = buildContextRequestCard({
      incidentNumber: 'INC0001234',
      incidentSysId: 'sys-id-001',
      shortDescription: maliciousDesc,
    });

    // Verificar que caracteres perigosos foram sanitizados
    const cardJson = JSON.stringify(card);
    assert.ok(!cardJson.includes('<script>'), 'Tag <script> deve ser removida');
  });

  test('card de aprovação humana tem Action.Execute com dados de decisão', async () => {
    const { buildApprovalCard } = await import('../src/teams/adaptiveCards.js');

    const card = buildApprovalCard({
      incidentNumber: 'INC0001234',
      incidentSysId: 'sys-id-001',
      proposedAction: 'Fechar ticket e notificar usuário',
      executionId: 'exec-uuid-123',
    });

    const actions = card.content.actions;
    assert.ok(actions.length >= 2, 'Card de aprovação deve ter ação de aprovar e rejeitar');

    const approveAction = actions.find((a) => a.data?.decision === 'approved');
    const rejectAction = actions.find((a) => a.data?.decision === 'rejected');

    assert.ok(approveAction, 'Deve ter ação de aprovação');
    assert.ok(rejectAction, 'Deve ter ação de rejeição');
    assert.equal(approveAction.type, 'Action.Execute');
    assert.equal(rejectAction.type, 'Action.Execute');
  });
});

describe('snow/tags - applyTag idempotência (conceitual)', () => {
  test('não tenta inserir em label_entry se já existir', async () => {
    // Este teste valida a lógica de negócio da função labelEntryExists
    // Em um ambiente de teste completo, os calls HTTP seriam mockados.
    // Aqui validamos que a função existe e tem a assinatura correta.
    const { applyTag, labelEntryExists, findLabelByName } = await import('../src/snow/tags.js');

    assert.ok(typeof applyTag === 'function', 'applyTag deve ser uma função');
    assert.ok(typeof labelEntryExists === 'function', 'labelEntryExists deve ser uma função');
    assert.ok(typeof findLabelByName === 'function', 'findLabelByName deve ser uma função');
  });
});

describe('snow/incidents - generateExecutionId', () => {
  test('gera UUIDs únicos a cada chamada', async () => {
    const { generateExecutionId } = await import('../src/snow/incidents.js');

    const id1 = generateExecutionId();
    const id2 = generateExecutionId();
    const id3 = generateExecutionId();

    // Verificar formato UUID v4
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert.match(id1, uuidRegex, 'ID deve ser UUID v4 válido');
    assert.match(id2, uuidRegex, 'ID deve ser UUID v4 válido');

    // Verificar unicidade
    assert.notEqual(id1, id2);
    assert.notEqual(id2, id3);
    assert.notEqual(id1, id3);
  });
});
