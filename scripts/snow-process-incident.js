#!/usr/bin/env node
/**
 * Processa um incidente ServiceNow pelo número (fluxo completo do agente N2).
 *
 * Uso: node scripts/snow-process-incident.js INC3285752
 */

import 'dotenv/config';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../src/utils/config.js';
import { snowRequest } from '../src/snow/client.js';
import { normalizeIncident } from '../src/snow/incidents.js';
import { loadQuery } from '../src/snow/queries.js';
import { processIncident } from '../src/orchestrator.js';
import { loadSOPs } from '../src/sop/runner.js';

const incidentNumber = process.argv[2];
if (!incidentNumber) {
  console.error('Uso: node scripts/snow-process-incident.js INC3285752');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = getConfig();
const queryConfig = await loadQuery('n2-poll');

const authProfile = config.snow.read?.username || config.snow.read?.clientId ? 'read' : 'write';

const response = await snowRequest('GET', '/api/now/table/incident', config.snow, {
  authProfile,
  params: {
    sysparm_query: `number=${incidentNumber}`,
    sysparm_display_value: 'all',
    sysparm_exclude_reference_link: 'true',
    sysparm_fields: queryConfig.fields.join(','),
    sysparm_limit: '1',
  },
});

const raw = response?.result?.[0];
if (!raw) {
  console.error(`Incidente ${incidentNumber} não encontrado.`);
  process.exit(1);
}

const incident = normalizeIncident(raw);
const sops = await loadSOPs(join(__dirname, '..', 'sops'));

console.log('--- Incidente ---');
console.log(`Número: ${incident.number}`);
console.log(`sys_id: ${incident.sys_id}`);
console.log(`Estado: ${incident.incident_state || incident.state}`);
console.log(`Descrição: ${incident.short_description || '(vazia)'}`);
console.log('');

const result = await processIncident(incident, sops, config);

console.log('--- Resultado ---');
console.log(JSON.stringify(result, null, 2));
console.log('');
console.log(
  `Link: https://ibmlocaliza.service-now.com/nav_to.do?uri=incident.do?sys_id=${incident.sys_id}`
);
