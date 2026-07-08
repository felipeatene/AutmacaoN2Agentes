#!/usr/bin/env node
/**
 * Resolve grupos de atribuição para filtro de polling N2.
 *
 * Uso: node scripts/snow-resolve-queues.js
 * Requer variáveis de ambiente ServiceNow (SNOW_READ_* ou SNOW_*).
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const { config: dotenvConfig } = await import('dotenv');
  dotenvConfig({ path: join(__dirname, '..', '.env') });
} catch {
  // dotenv opcional
}

const { getConfig } = await import('../src/utils/config.js');
const { buildQueueFilter, resolveUserAssignmentGroups, resolveExplicitGroups } = await import(
  '../src/snow/groups.js'
);

async function main() {
  const config = getConfig();
  const snowRead = config.snow.read;
  const queues = config.snow.queues;

  console.log('Resolvendo filas de atribuição N2...');
  console.log(`  Modo: ${queues.filterMode}`);
  console.log(`  Usuário monitor: ${queues.monitorUser || '(não definido)'}`);
  console.log(`  Grupos extras: ${queues.extraAssignmentGroups.join(', ') || '(nenhum)'}`);

  const userGroups =
    queues.monitorUser && ['user', 'both'].includes(queues.filterMode)
      ? await resolveUserAssignmentGroups(queues.monitorUser, snowRead)
      : [];

  const explicitGroups =
    queues.extraAssignmentGroups.length > 0 && ['explicit', 'both'].includes(queues.filterMode)
      ? await resolveExplicitGroups(queues.extraAssignmentGroups, snowRead)
      : [];

  const filter = buildQueueFilter(queues.filterMode, userGroups, explicitGroups);

  console.log('\nGrupos do usuário:');
  for (const g of userGroups) {
    console.log(`  - ${g.name} (${g.sys_id})`);
  }

  console.log('\nGrupos explícitos:');
  for (const g of explicitGroups) {
    console.log(`  - ${g.name} (${g.sys_id})`);
  }

  console.log('\nFiltro sysparm_query (assignment_group):');
  console.log(`  ${filter.assignmentGroupClause || '(vazio — sem filtro de grupo)'}`);
  console.log(`\nSys IDs (${filter.sysIds.length}): ${filter.sysIds.join(', ') || '(nenhum)'}`);
}

main().catch((err) => {
  console.error('Erro ao resolver filas:', err.message);
  process.exit(1);
});
