/**
 * Cliente HTTP ServiceNow — Agente N2
 *
 * Conforme constitution.md:
 * - Pilar 1: Falha Rápida — erros de autenticação e rede suspendem o ciclo.
 * - Pilar 2: Idempotência — consultas de leitura sempre precedem escritas.
 *
 * Suporta OAuth2 (recomendado) com fallback automático para Basic Auth.
 */

import { logger } from '../utils/logger.js';

/** Token OAuth em memória (nunca persistido em disco). */
let oauthToken = null;
let tokenExpiresAt = 0;

/**
 * Obtém um token OAuth2 do ServiceNow usando Client Credentials flow.
 *
 * @param {object} config - Configuração ServiceNow (instanceUrl, clientId, clientSecret).
 * @returns {Promise<string>} Access token.
 * @throws {Error} Em caso de falha de autenticação (erro 4xx).
 */
async function getOAuthToken(config) {
  const now = Date.now();
  if (oauthToken && now < tokenExpiresAt - 30000) {
    return oauthToken;
  }

  logger.debug('Renovando token OAuth2 ServiceNow.', { skill: 'snow-client' });

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(`${config.instanceUrl}/oauth_token.do`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (response.status === 401 || response.status === 403) {
    logger.error('Falha de autenticação OAuth2 ServiceNow. Suspendendo ciclo.', {
      skill: 'snow-client',
      http_status: response.status,
    });
    throw new Error(`ServiceNow OAuth2 authentication failed: HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`ServiceNow OAuth2 token request failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  oauthToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 1800) * 1000;

  logger.debug('Token OAuth2 ServiceNow renovado com sucesso.', { skill: 'snow-client' });
  return oauthToken;
}

/**
 * Constrói o header de autorização, preferindo OAuth2 sobre Basic Auth.
 *
 * @param {object} config - Configuração ServiceNow.
 * @returns {Promise<string>} Valor do header Authorization.
 */
async function buildAuthHeader(config) {
  if (config.clientId && config.clientSecret) {
    const token = await getOAuthToken(config);
    return ['Bearer', token].join(' ');
  }
  // Fallback Basic Auth
  const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Executa uma requisição HTTP para a API ServiceNow com retry para rate limit.
 *
 * @param {string} method - Método HTTP (GET, POST, PATCH).
 * @param {string} path - Caminho da API (ex: /api/now/table/incident).
 * @param {object} config - Configuração ServiceNow.
 * @param {object} [options={}] - Opções adicionais (params, body).
 * @param {number} [retryCount=0] - Contador de retentativas atual.
 * @returns {Promise<object>} Resposta JSON parseada.
 * @throws {Error} Em erros irrecuperáveis (4xx exceto 429, falhas de rede).
 */
export async function snowRequest(method, path, config, options = {}, retryCount = 0) {
  const maxRetries = parseInt(process.env.MAX_RETRIES || '3', 10);
  const baseDelay = parseInt(process.env.RETRY_BASE_DELAY_MS || '1000', 10);

  const authHeader = await buildAuthHeader(config);

  const url = new URL(`${config.instanceUrl}${path}`);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  const fetchOptions = {
    method,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(url.toString(), fetchOptions);
  } catch (networkError) {
    logger.error('Erro de rede ao conectar com ServiceNow. Suspendendo ciclo.', {
      skill: 'snow-client',
      method,
      path,
      error: networkError.message,
    });
    throw networkError;
  }

  // Rate limit — backoff exponencial
  if (response.status === 429 && retryCount < maxRetries) {
    const delay = baseDelay * Math.pow(2, retryCount);
    logger.warn('Rate limit atingido no ServiceNow. Aguardando para retentar.', {
      skill: 'snow-client',
      retry: retryCount + 1,
      delay_ms: delay,
    });
    await new Promise((resolve) => setTimeout(resolve, delay));
    return snowRequest(method, path, config, options, retryCount + 1);
  }

  // Erros de autenticação — falha rápida, sem retry
  if (response.status === 401 || response.status === 403) {
    logger.error('Erro de autenticação ServiceNow. Suspendendo ciclo.', {
      skill: 'snow-client',
      method,
      path,
      http_status: response.status,
    });
    throw new Error(`ServiceNow authentication error: HTTP ${response.status}`);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    logger.error('Requisição ServiceNow falhou.', {
      skill: 'snow-client',
      method,
      path,
      http_status: response.status,
      error_body: errorBody.substring(0, 500),
    });
    throw new Error(`ServiceNow request failed: HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

/** Reseta o token OAuth em memória (útil para testes). */
export function resetOAuthToken() {
  oauthToken = null;
  tokenExpiresAt = 0;
}
