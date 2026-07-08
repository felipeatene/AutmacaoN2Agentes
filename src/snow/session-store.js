/**
 * Persistência de sessão browser ServiceNow (cookies SSO).
 * Usado pelo perfil WRITE em modo session e pela tool snow-human-login.
 */

import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** TTL padrão da sessão em disco (8 horas). */
export const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** Cookies mínimos esperados após login SSO. */
export const REQUIRED_SESSION_COOKIES = ['JSESSIONID'];

/**
 * Expande ~ no caminho do cache.
 *
 * @param {string} [cachePath]
 * @returns {string}
 */
export function resolveSessionCachePath(cachePath) {
  const raw =
    cachePath ||
    process.env.SNOW_SESSION_CACHE_PATH ||
    join(homedir(), '.snow_n2', 'session.json');

  if (raw.startsWith('~/')) {
    return join(homedir(), raw.slice(2));
  }
  if (raw === '~') {
    return homedir();
  }
  return raw;
}

/**
 * Monta header Cookie a partir do objeto de cookies.
 *
 * @param {Record<string, string>} cookies
 * @returns {string}
 */
export function buildCookieHeader(cookies) {
  return Object.entries(cookies)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/**
 * Verifica se a sessão possui cookies obrigatórios e não expirou.
 *
 * @param {object|null|undefined} session
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function isSessionValid(session, now = Date.now()) {
  if (!session || !session.cookies) {
    return false;
  }

  for (const name of REQUIRED_SESSION_COOKIES) {
    if (!session.cookies[name]) {
      return false;
    }
  }

  if (session.expiresAt && now >= session.expiresAt) {
    return false;
  }

  return true;
}

/**
 * Carrega sessão do disco.
 *
 * @param {string} [cachePath]
 * @returns {Promise<object|null>}
 */
export async function loadSession(cachePath) {
  const path = resolveSessionCachePath(cachePath);

  try {
    const raw = await readFile(path, 'utf-8');
    const session = JSON.parse(raw);
    return isSessionValid(session) ? session : null;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Persiste sessão no disco.
 *
 * @param {object} session
 * @param {string} [cachePath]
 * @returns {Promise<string>} Caminho do arquivo gravado.
 */
export async function saveSession(session, cachePath) {
  const path = resolveSessionCachePath(cachePath);
  await mkdir(dirname(path), { recursive: true });

  const now = Date.now();
  const ttlMs = parseInt(process.env.SNOW_SESSION_TTL_MS || String(DEFAULT_SESSION_TTL_MS), 10);
  const payload = {
    ...session,
    createdAt: session.createdAt || now,
    expiresAt: session.expiresAt || now + ttlMs,
  };

  await writeFile(path, JSON.stringify(payload, null, 2), 'utf-8');
  return path;
}

/**
 * Remove cache de sessão.
 *
 * @param {string} [cachePath]
 * @returns {Promise<boolean>} true se arquivo existia e foi removido.
 */
export async function clearSession(cachePath) {
  const path = resolveSessionCachePath(cachePath);

  try {
    await unlink(path);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Carrega sessão mesmo expirada (para status).
 *
 * @param {string} [cachePath]
 * @returns {Promise<object|null>}
 */
export async function loadSessionRaw(cachePath) {
  const path = resolveSessionCachePath(cachePath);

  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
