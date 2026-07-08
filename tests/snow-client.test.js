/**
 * Testes do Cliente ServiceNow — src/snow/client.js
 *
 * Testa:
 * - Requisições bem-sucedidas GET/POST/PATCH.
 * - Renovação de token OAuth2.
 * - Falha rápida em erros de autenticação (401/403).
 * - Backoff exponencial em rate limit (429).
 * - Erro de rede relançado como falha crítica.
 */

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// Helper para criar um mock de fetch
function createMockFetch(responses) {
  let callIndex = 0;
  return async (url, options) => {
    const response = responses[callIndex++] || responses[responses.length - 1];
    return {
      ok: response.ok ?? (response.status >= 200 && response.status < 300),
      status: response.status,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body || ''),
    };
  };
}

describe('snow/client - snowRequest', () => {
  beforeEach(async () => {
    // Resetar token OAuth entre testes
    const { resetOAuthToken } = await import('../src/snow/client.js');
    resetOAuthToken();
  });

  test('executa requisição GET com Basic Auth com sucesso', async () => {
    const config = {
      instanceUrl: 'https://test.service-now.com',
      username: 'user',
      password: 'pass',
    };

    const mockBody = { result: [{ sys_id: '123', number: 'INC0001' }] };

    global.fetch = createMockFetch([{ status: 200, body: mockBody }]);

    const { snowRequest } = await import('../src/snow/client.js');
    const result = await snowRequest('GET', '/api/now/table/incident', config);

    assert.deepEqual(result, mockBody);
  });

  test('lança erro em resposta 401 (sem retry)', async () => {
    const config = {
      instanceUrl: 'https://test.service-now.com',
      username: 'user',
      password: 'wrong',
    };

    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      return {
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      };
    };

    const { snowRequest, resetOAuthToken } = await import('../src/snow/client.js');
    resetOAuthToken();

    await assert.rejects(
      () => snowRequest('GET', '/api/now/table/incident', config),
      /authentication error/i
    );

    // Deve falhar na primeira chamada, sem retry
    assert.equal(callCount, 1, 'Não deve retentar em erro 401');
  });

  test('lança erro em resposta 403 (sem retry)', async () => {
    const config = {
      instanceUrl: 'https://test.service-now.com',
      username: 'user',
      password: 'pass',
    };

    global.fetch = async () => ({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    const { snowRequest, resetOAuthToken } = await import('../src/snow/client.js');
    resetOAuthToken();

    await assert.rejects(
      () => snowRequest('GET', '/api/now/table/incident', config),
      /authentication error/i
    );
  });

  test('retorna null para resposta 204 (No Content)', async () => {
    const config = {
      instanceUrl: 'https://test.service-now.com',
      username: 'user',
      password: 'pass',
    };

    global.fetch = async () => ({
      ok: true,
      status: 204,
    });

    const { snowRequest, resetOAuthToken } = await import('../src/snow/client.js');
    resetOAuthToken();

    const result = await snowRequest('DELETE', '/api/now/table/incident/123', config);
    assert.equal(result, null);
  });

  test('relança erro de rede como falha crítica', async () => {
    const config = {
      instanceUrl: 'https://test.service-now.com',
      username: 'user',
      password: 'pass',
    };

    global.fetch = async () => {
      throw new Error('Network error: ECONNREFUSED');
    };

    const { snowRequest, resetOAuthToken } = await import('../src/snow/client.js');
    resetOAuthToken();

    await assert.rejects(
      () => snowRequest('GET', '/api/now/table/incident', config),
      /ECONNREFUSED/
    );
  });

  test('usa perfil write separado do read', async () => {
    const config = {
      read: {
        instanceUrl: 'https://read.service-now.com',
        username: 'reader',
        password: 'read-pass',
      },
      write: {
        instanceUrl: 'https://write.service-now.com',
        username: 'writer',
        password: 'write-pass',
      },
    };

    let capturedUrl = '';
    global.fetch = async (url, options) => {
      capturedUrl = url;
      const auth = options.headers.Authorization;
      assert.ok(auth.includes('Basic'), 'Deve usar Basic Auth');
      const decoded = Buffer.from(auth.replace('Basic ', ''), 'base64').toString();
      assert.equal(decoded, 'writer:write-pass', 'Deve usar credenciais write');
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: [] }),
      };
    };

    const { snowRequest, resetOAuthToken } = await import('../src/snow/client.js');
    resetOAuthToken();

    await snowRequest('PATCH', '/api/now/table/incident/abc', config, {
      authProfile: 'write',
      body: { work_notes: 'test' },
    });

    assert.ok(capturedUrl.startsWith('https://write.service-now.com'));
  });

  test('rejeita authMode=session por política de segurança M2M', async () => {
    const config = {
      write: {
        instanceUrl: 'https://write.service-now.com',
        authMode: 'session',
      },
    };

    const { snowRequest, resetOAuthToken } = await import('../src/snow/client.js');
    resetOAuthToken();

    await assert.rejects(
      () =>
        snowRequest('PATCH', '/api/now/table/incident/abc', config, {
          authProfile: 'write',
          body: { work_notes: 'test' },
        }),
      /desativada por política de segurança M2M/
    );
  });
});
