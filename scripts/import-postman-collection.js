#!/usr/bin/env node
/**
 * Importa collection Postman ServiceNow Schema Mapper e gera manifests de configuração.
 *
 * Uso: node scripts/import-postman-collection.js [caminho-da-collection.json]
 *
 * Gera:
 * - config/snow/instance.json
 * - config/snow/tables.manifest.json
 * - config/snow/queries/guepardo-abertos.json
 * - config/snow/queries/n2-poll.json
 * - config/snow/endpoints/{table}.json
 * - postman/ServiceNow-Schema-Mapper.sanitized.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_ROOT = process.env.SNOW_IMPORT_OUTPUT_DIR
  ? resolve(process.env.SNOW_IMPORT_OUTPUT_DIR)
  : ROOT;

const SENSITIVE_KEYS = new Set(['password', 'bearer_token', 'client_secret']);
const SENSITIVE_VAR_KEYS = new Set(['password', 'bearer_token']);

/** @param {string} filePath */
async function main(filePath) {
  const collectionPath = resolve(filePath || join(ROOT, 'postman', 'ServiceNow Schema Mapper.postman_collection.json'));
  const raw = await readFile(collectionPath, 'utf-8');
  const collection = JSON.parse(raw);

  const outputDirs = [
    join(OUTPUT_ROOT, 'config', 'snow'),
    join(OUTPUT_ROOT, 'config', 'snow', 'queries'),
    join(OUTPUT_ROOT, 'config', 'snow', 'endpoints'),
    join(OUTPUT_ROOT, 'postman'),
  ];
  for (const dir of outputDirs) {
    await mkdir(dir, { recursive: true });
  }

  const baseUrl = getCollectionVariable(collection, 'base_url') || 'https://ibmlocaliza.service-now.com';
  const instanceName = extractInstanceName(baseUrl);

  const instance = {
    name: instanceName,
    baseUrl,
    importedAt: new Date().toISOString(),
    source: 'ServiceNow Schema Mapper.postman_collection.json',
  };
  await writeJson(join(OUTPUT_ROOT, 'config', 'snow', 'instance.json'), instance);

  const tables = extractTables(collection);
  const manifest = {
    instance: instanceName,
    baseUrl,
    importedAt: instance.importedAt,
    tables: tables.map((t) => ({
      name: t.tableName,
      label: t.label,
      endpointCount: t.requests.length,
    })),
  };
  await writeJson(join(OUTPUT_ROOT, 'config', 'snow', 'tables.manifest.json'), manifest);

  for (const table of tables) {
    const endpointFile = {
      table: table.tableName,
      label: table.label,
      description: table.description,
      requests: table.requests,
    };
    await writeJson(join(OUTPUT_ROOT, 'config', 'snow', 'endpoints', `${table.tableName}.json`), endpointFile);
  }

  const guepardoQuery = findGuepardoQuery(collection);
  const guepardo = {
    id: 'guepardo-abertos',
    name: 'Guepardo: Abertos',
    table: 'incident',
    method: 'GET',
    path: '/api/now/table/incident',
    sysparm_query: guepardoQuery,
    params: {
      sysparm_count: 'true',
    },
    description:
      'Incidentes abertos do Guepardo — stateNOT IN 15,6,7,503, tipo Incident, grupo e sistema de falha específicos.',
  };
  await writeJson(join(OUTPUT_ROOT, 'config', 'snow', 'queries', 'guepardo-abertos.json'), guepardo);

  const n2Poll = {
    id: 'n2-poll',
    name: 'N2 Agent Poll Query',
    table: 'incident',
    method: 'GET',
    path: '/api/now/table/incident',
    baseFilters: dedupeFilters(parseEncodedQuery(guepardoQuery)),
    dynamicFilters: [
      'assigned_to=EMPTY',
      'sys_updated_on>javascript:gs.minutesAgo({minutesAgo})',
    ],
    assignmentGroupMode: 'IN',
    params: {
      sysparm_display_value: 'all',
      sysparm_exclude_reference_link: 'true',
      sysparm_limit: '{limit}',
    },
    fields: [
      'sys_id',
      'number',
      'short_description',
      'description',
      'state',
      'incident_state',
      'assigned_to',
      'assignment_group',
      'caller_id',
      'sys_updated_on',
      'close_code',
      'work_notes',
      'u_aad_object_id',
    ],
    description:
      'Query de polling do agente N2 — base Guepardo + sem atribuição + atualizados nos últimos N minutos.',
  };
  await writeJson(join(OUTPUT_ROOT, 'config', 'snow', 'queries', 'n2-poll.json'), n2Poll);

  const sanitized = sanitizeCollection(collection);
  await writeJson(join(OUTPUT_ROOT, 'postman', 'ServiceNow-Schema-Mapper.sanitized.json'), sanitized);

  console.log(`Import concluído a partir de: ${collectionPath}`);
  console.log(`  Instância: ${instanceName} (${baseUrl})`);
  console.log(`  Tabelas: ${tables.length}`);
  console.log(`  Query Guepardo: ${guepardoQuery.substring(0, 80)}...`);
  console.log(`  Arquivos em config/snow/ e postman/`);
}

/** @param {object} collection */
function getCollectionVariable(collection, key) {
  const vars = collection.variable || [];
  const found = vars.find((v) => v.key === key);
  return found?.value || '';
}

/** @param {string} baseUrl */
function extractInstanceName(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname;
    return host.replace('.service-now.com', '');
  } catch {
    return 'unknown';
  }
}

/** @param {object} collection */
function extractTables(collection) {
  const tables = [];
  for (const item of collection.item || []) {
    const match = item.name?.match(/^(.+?)\s+—\s+(.+)$/);
    if (!match) continue;

    const tableName = match[1].trim();
    const label = match[2].trim();
    const requests = [];

    for (const sub of item.item || []) {
      const req = sub.request;
      if (!req) continue;

      const url = req.url;
      const rawUrl = typeof url === 'string' ? url : url?.raw || '';
      const path = typeof url === 'string' ? url : (url?.path || []).join('/');
      const query = {};

      if (url && typeof url === 'object' && Array.isArray(url.query)) {
        for (const q of url.query) {
          if (q.key && !q.disabled) {
            query[q.key] = q.value;
          }
        }
      }

      requests.push({
        name: sub.name,
        method: req.method,
        path: rawUrl.includes('{{base_url}}') ? rawUrl.replace('{{base_url}}', '') : `/${path}`,
        query,
        description: sub.description || req.description || '',
      });
    }

    tables.push({
      tableName,
      label,
      description: item.description || '',
      requests,
    });
  }
  return tables;
}

/** @param {object} collection */
function findGuepardoQuery(collection) {
  for (const item of collection.item || []) {
    for (const sub of item.item || []) {
      if (sub.name === 'Guepardo: Abertos' && sub.request?.url) {
        const url = sub.request.url;
        if (typeof url === 'object' && Array.isArray(url.query)) {
          const q = url.query.find((p) => p.key === 'sysparm_query');
          if (q?.value) {
            return decodeURIComponent(q.value.replace(/\+/g, ' '));
          }
        }
        const raw = url.raw || '';
        const match = raw.match(/sysparm_query=([^&]+)/);
        if (match) {
          return decodeURIComponent(match[1].replace(/\+/g, ' '));
        }
      }
    }
  }

  return [
    'stateNOT IN15,6,7,503',
    'u_qs_type=Incident',
    'assignment_group=25f28e6a87363a98ed9e85930cbb3518',
    'u_report_systems_failure=2b6769c087b63e506de663930cbb3594',
  ].join('^');
}

/** @param {string} encodedQuery */
function parseEncodedQuery(encodedQuery) {
  return encodedQuery.split('^').filter(Boolean);
}

/** @param {string[]} filters */
function dedupeFilters(filters) {
  const seen = new Set();
  const result = [];
  for (const f of filters) {
    const key = f.split('=')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(f);
  }
  return result;
}

/** @param {object} collection */
function sanitizeCollection(collection) {
  const clone = JSON.parse(JSON.stringify(collection));

  if (Array.isArray(clone.variable)) {
    for (const v of clone.variable) {
      if (SENSITIVE_VAR_KEYS.has(v.key)) {
        v.value = '';
      }
    }
  }

  sanitizeObject(clone);
  clone.info = {
    ...clone.info,
    description: `${clone.info?.description || ''} [SANITIZED — passwords removed]`.trim(),
  };

  return clone;
}

/** @param {unknown} obj */
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) sanitizeObject(item);
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key) && typeof value === 'string' && value.length > 0) {
      obj[key] = '';
    } else if (typeof value === 'object') {
      sanitizeObject(value);
    }
  }
}

/** @param {string} filePath @param {unknown} data */
async function writeJson(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

const inputPath = process.argv[2];
main(inputPath).catch((err) => {
  console.error('Erro ao importar collection Postman:', err.message);
  process.exit(1);
});
