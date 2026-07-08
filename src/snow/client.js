/**
 * Cliente HTTP ServiceNow — Lino
 *
 * Conforme constitution.md:
 * - Pilar 1: Falha Rápida — erros de autenticação e rede suspendem o ciclo.
 * - Pilar 2: Idempotência — consultas de leitura sempre precedem escritas.
 *
 * Suporta perfis de autenticação separados (read/write) com OAuth2 ou Basic Auth (M2M).
 */

import { logger } from '../utils/logger.js';

/** @type {Map<string, { token: string|null, expiresAt: number }>} */
const oauthTokens = new Map();

/**
 * Resolve configuração de autenticação para o perfil solicitado.
 *
 * @param {object} config - Configuração snow (flat ou com read/write).
 * @param {'read'|'write'} [authProfile='read']
 * @returns {object} Configuração resolvida para o perfil.
 */
export function resolveAuthConfig(config, authProfile = 'read') {
  if (config.read || config.write) {
    const profile = authProfile === 'write' ? config.write : config.read;
    return profile || config.read || config.write || config;
  }
  return config;
}

/**
 * Obtém um token OAuth2 do ServiceNow usando Client Credentials flow.
 *
 * @param {object} config - Configuração ServiceNow do perfil.
 * @param {string} profileKey - Chave do perfil para cache de token.
 * @returns {Promise<string>} Access token.
 */
async function getOAuthToken(config, profileKey) {
  const now = Date.now();
  const cached = oauthTokens.get(profileKey) || { token: null, expiresAt: 0 };

  if (cached.token && now < cached.expiresAt - 30000) {
    return cached.token;
  }

  logger.debug('Renovando token OAuth2 ServiceNow.', { skill: 'snow-client', profile: profileKey });

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
      profile: profileKey,
      http_status: response.status,
    });
    throw new Error(`ServiceNow OAuth2 authentication failed: HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`ServiceNow OAuth2 token request failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const entry = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 1800) * 1000,
  };
  oauthTokens.set(profileKey, entry);

  logger.debug('Token OAuth2 ServiceNow renovado com sucesso.', { skill: 'snow-client', profile: profileKey });
  return entry.token;
}

/**
 * Resolve modo de autenticação efetivo do perfil.
 *
 * @param {object} config
 * @param {'read'|'write'} authProfile
 * @returns {'oauth'|'basic'|'session'}
 */
function resolveAuthMode(config, authProfile) {
  if (config.authMode) {
    return config.authMode;
  }
  if (config.clientId && config.clientSecret) {
    return 'oauth';
  }
  if (config.username && config.password) {
    return 'basic';
  }
  return 'oauth';
}

/**
 * Constrói headers de autenticação para a requisição.
 *
 * @param {object} config - Configuração ServiceNow do perfil.
 * @param {string} profileKey - Chave do perfil.
 * @param {'read'|'write'} authProfile
 * @returns {Promise<{ authorization?: string, cookie?: string, authMode: string }>}
 */
async function buildRequestAuth(config, profileKey, authProfile) {
  const authMode = resolveAuthMode(config, authProfile);

  if (authMode === 'session') {
    throw new Error(
      'Sessão ServiceNow via browser (authMode=session) desativada por política de segurança M2M. ' +
      'Configure SNOW_USERNAME/PASSWORD no arquivo .env.'
    );
  }

  if (config.clientId && config.clientSecret) {
    const token = await getOAuthToken(config, profileKey);
    return { authMode: 'oauth', authorization: ['Bearer', token].join(' ') };
  }

  const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return { authMode: 'basic', authorization: `Basic ${credentials}` };
}

/**
 * Executa uma requisição HTTP para a API ServiceNow com retry para rate limit.
 *
 * @param {string} method - Método HTTP (GET, POST, PATCH).
 * @param {string} path - Caminho da API (ex: /api/now/table/incident).
 * @param {object} config - Configuração ServiceNow (com ou sem perfis read/write).
 * @param {object} [options={}] - Opções adicionais (params, body, authProfile).
 * @param {number} [retryCount=0] - Contador de retentativas atual.
 * @returns {Promise<object>} Resposta JSON parseada.
 */
export async function snowRequest(method, path, config, options = {}, retryCount = 0) {
  const maxRetries = parseInt(process.env.MAX_RETRIES || '3', 10);
  const baseDelay = parseInt(process.env.RETRY_BASE_DELAY_MS || '1000', 10);
  const authProfile = options.authProfile || 'read';
  const profileConfig = resolveAuthConfig(config, authProfile);
  const profileKey = `${profileConfig.instanceUrl}:${authProfile}`;

  const requestAuth = await buildRequestAuth(profileConfig, profileKey, authProfile);

  const url = new URL(`${profileConfig.instanceUrl}${path}`);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  const fetchOptions = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  if (requestAuth.authorization) {
    fetchOptions.headers.Authorization = requestAuth.authorization;
  }

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
      profile: authProfile,
      error: networkError.message,
    });
    throw networkError;
  }

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

  if (response.status === 401 || response.status === 403) {
    logger.error('Erro de autenticação ServiceNow. Suspendendo ciclo.', {
      skill: 'snow-client',
      method,
      path,
      profile: authProfile,
      auth_mode: requestAuth.authMode,
      http_status: response.status,
    });
    throw new Error(
      `ServiceNow authentication error: HTTP ${response.status}. ` +
        'Verifique as credenciais M2M (OAuth/Basic) no .env; acione o responsável para rotação.'
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    logger.error('Requisição ServiceNow falhou.', {
      skill: 'snow-client',
      method,
      path,
      profile: authProfile,
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

/** Reseta tokens OAuth em memória (útil para testes). */
export function resetOAuthToken() {
  oauthTokens.clear();
}
