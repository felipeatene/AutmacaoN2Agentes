#!/usr/bin/env node
/**
 * Importa sequência de curls de login (Azure AD / DaGente) e gera manifest sanitizado.
 *
 * Uso: node scripts/import-login-sequence.js [caminho-do-arquivo.txt]
 *
 * Gera:
 * - config/snow/login-sequence.json
 * - postman/sequencia-login-servicenow.sanitized.txt
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_ROOT = process.env.SNOW_IMPORT_OUTPUT_DIR
  ? resolve(process.env.SNOW_IMPORT_OUTPUT_DIR)
  : ROOT;

const NOISE_HOSTS = [
  'rum.browser-intake-datadoghq.com',
  'script.crazyegg.com',
  'www.google-analytics.com',
  'cdn-design-system-h.localiza.com',
];

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'authorization_app',
  'cookie',
]);

const SENSITIVE_BODY_KEYS = new Set([
  'code',
  'code_verifier',
  'client_secret',
  'refresh_token',
  'access_token',
  'password',
]);

/**
 * @param {string} block
 * @returns {{ method: string, url: string, headers: Record<string, string>, body: string|null }}
 */
function parseCurlBlock(block) {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const first = lines[0] || '';
  const urlMatch = first.match(/curl\s+'([^']+)'/);
  const url = urlMatch ? urlMatch[1] : '';

  let method = 'GET';
  const headers = {};
  let body = null;

  for (const line of lines.slice(1)) {
    const trimmed = line.replace(/\s*;\s*$/, '').trim();
    const methodMatch = trimmed.match(/^-X\s+'([^']+)'/);
    if (methodMatch) {
      method = methodMatch[1].toUpperCase();
      continue;
    }

    const headerMatch = trimmed.match(/^-H\s+'([^:]+):\s*(.*)'$/);
    if (headerMatch) {
      headers[headerMatch[1].toLowerCase()] = headerMatch[2];
      continue;
    }

    const dataMatch =
      trimmed.match(/^--data-raw\s+'(.*)'$/s) || trimmed.match(/^--data-raw\s+\$(.*)$/s);
    if (dataMatch) {
      body = dataMatch[1];
    }
  }

  return { method, url, headers, body };
}

/**
 * @param {string} url
 * @returns {string}
 */
function classifyPhase(url) {
  if (!url) return 'noise';

  if (url.includes('login.microsoftonline.com/common/discovery/instance')) {
    return 'azure_discovery';
  }
  if (url.includes('login.microsoftonline.com') && url.includes('/.well-known/openid-configuration')) {
    return 'azure_oidc_config';
  }
  if (url.includes('login.microsoftonline.com') && url.includes('/oauth2/v2.0/token')) {
    return 'azure_token';
  }
  if (url.includes('api-hub.localiza.com/oauth/token/accesstoken')) {
    return 'apigee_token';
  }
  if (url.includes('api-hub.localiza.com/')) {
    return 'dagente_api';
  }
  if (url.includes('dagente.localiza.com')) {
    return 'dagente_static';
  }

  try {
    const host = new URL(url).hostname;
    if (NOISE_HOSTS.some((h) => host.includes(h))) {
      return 'noise';
    }
  } catch {
    return 'noise';
  }

  return 'noise';
}

/**
 * @param {string} url
 * @returns {string}
 */
function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_BODY_KEYS.has(key)) {
        parsed.searchParams.set(key, 'REDACTED');
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * @param {Record<string, string>} headers
 * @returns {Record<string, string>}
 */
function sanitizeHeaders(headers) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_NAMES.has(name)) {
      out[name] = 'REDACTED';
    } else {
      out[name] = value;
    }
  }
  return out;
}

/**
 * @param {string|null} body
 * @returns {string|null}
 */
function sanitizeBody(body) {
  if (!body) return null;

  let sanitized = body;
  for (const key of SENSITIVE_BODY_KEYS) {
    const regex = new RegExp(`(${key}=)[^&\\s'"]+`, 'gi');
    sanitized = sanitized.replace(regex, `$1REDACTED`);
  }

  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer REDACTED');
  sanitized = sanitized.replace(/Basic\s+[A-Za-z0-9+/=]+/g, 'Basic REDACTED');
  sanitized = sanitized.replace(/eyJ[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+/g, 'JWT_REDACTED');

  return sanitized;
}

/**
 * @param {string} content
 * @returns {string[]}
 */
function splitCurlBlocks(content) {
  const blocks = [];
  let current = '';

  for (const line of content.split('\n')) {
    if (line.startsWith('curl ') && current) {
      blocks.push(current.trim());
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }

  if (current.trim()) {
    blocks.push(current.trim());
  }

  return blocks;
}

/**
 * @param {string} content
 * @returns {object}
 */
export function parseLoginSequence(content) {
  const blocks = splitCurlBlocks(content);
  const phases = [];
  const seen = new Set();

  for (const block of blocks) {
    const parsed = parseCurlBlock(block);
    if (!parsed.url) continue;

    const phase = classifyPhase(parsed.url);
    if (phase === 'noise' || phase === 'dagente_static') continue;

    const key = `${parsed.method}:${sanitizeUrl(parsed.url)}:${phase}`;
    if (seen.has(key)) continue;
    seen.add(key);

    phases.push({
      phase,
      method: parsed.method,
      url: sanitizeUrl(parsed.url),
      headers: Object.keys(sanitizeHeaders(parsed.headers)),
      bodyTemplate: sanitizeBody(parsed.body),
    });
  }

  const tenantMatch = content.match(
    /login\.microsoftonline\.com\/([0-9a-f-]{36})\//i
  );

  return {
    azureTenantId: tenantMatch ? tenantMatch[1] : null,
    phases,
    humanStep: {
      description:
        'Login interativo com MFA no browser entre discovery OIDC e troca do authorization_code por token.',
      required: true,
    },
    note:
      'Sequência original capturada no fluxo DaGente/Azure AD. Login ServiceNow usa SSO browser direto em serviceNowEntry.',
  };
}

/**
 * @param {string} filePath
 */
async function main(filePath) {
  const inputPath = resolve(
    filePath || join(ROOT, 'postman', 'sequencia-login-servicenow.sanitized.txt')
  );
  const raw = await readFile(inputPath, 'utf-8');

  let serviceNowEntry = 'https://ibmlocaliza.service-now.com';
  try {
    const instanceRaw = await readFile(join(ROOT, 'config', 'snow', 'instance.json'), 'utf-8');
    const instance = JSON.parse(instanceRaw);
    serviceNowEntry = instance.baseUrl || serviceNowEntry;
  } catch {
    // usa default
  }

  const parsed = parseLoginSequence(raw);
  const manifest = {
    importedAt: new Date().toISOString(),
    source: inputPath.split(/[/\\]/).pop(),
    azureTenantId: parsed.azureTenantId || '3737367d-87d3-46ca-b00f-21b50c428b5e',
    serviceNowEntry,
    humanStep: parsed.humanStep,
    note: parsed.note,
    phases: parsed.phases,
  };

  const outputDirs = [
    join(OUTPUT_ROOT, 'config', 'snow'),
    join(OUTPUT_ROOT, 'postman'),
  ];
  for (const dir of outputDirs) {
    await mkdir(dir, { recursive: true });
  }

  await writeJson(join(OUTPUT_ROOT, 'config', 'snow', 'login-sequence.json'), manifest);

  const sanitizedTxt = buildSanitizedTxt(raw);
  await writeFile(
    join(OUTPUT_ROOT, 'postman', 'sequencia-login-servicenow.sanitized.txt'),
    sanitizedTxt,
    'utf-8'
  );

  console.log(`Importado: ${parsed.phases.length} fases → config/snow/login-sequence.json`);
}

/**
 * @param {string} raw
 * @returns {string}
 */
function buildSanitizedTxt(raw) {
  return splitCurlBlocks(raw)
    .map((block) => {
      const parsed = parseCurlBlock(block);
      if (!parsed.url || classifyPhase(parsed.url) === 'noise') {
        return null;
      }

      const lines = [`curl '${sanitizeUrl(parsed.url)}' \\`];
      if (parsed.method !== 'GET') {
        lines.push(`  -X '${parsed.method}' \\`);
      }
      for (const name of Object.keys(parsed.headers)) {
        const value = SENSITIVE_HEADER_NAMES.has(name) ? 'REDACTED' : parsed.headers[name];
        lines.push(`  -H '${name}: ${value}' \\`);
      }
      if (parsed.body) {
        lines.push(`  --data-raw '${sanitizeBody(parsed.body)}' \\`);
      }
      return lines.join('\n').replace(/ \\$/, ';');
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {string} path
 * @param {object} data
 */
async function writeJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main(process.argv[2]).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
