/**
 * Ponto de Entrada Principal — Lino (Filtro N1 Inteligente)
 *
 * Ciclo principal de execução conforme spec.md RF-01:
 * - Inicializa configuração e valida variáveis de ambiente.
 * - Carrega skills e SOPs.
 * - Executa ciclo de polling a cada POLL_INTERVAL_MS (padrão: 2 minutos).
 *
 * Conforme constitution.md:
 * - Pilar 1: Falha rápida em erros críticos (autenticação, configuração).
 * - Pilar 2: Idempotência garantida nos módulos de operação.
 * - Pilar 3: Isolamento de execução via SOP e Human-in-the-Loop.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Carrega variáveis de ambiente antes de qualquer importação de config
const require = createRequire(import.meta.url);
try {
  const { config: dotenvConfig } = await import('dotenv');
  dotenvConfig();
} catch {
  // dotenv opcional em produção (variáveis já definidas no ambiente)
}

import { validateConfig, getConfig } from './utils/config.js';
import { logger } from './utils/logger.js';
import { loadSkillsFromDirs } from './skillLoader.js';
import { loadSOPs } from './sop/runner.js';
import { pollIncidents } from './snow/incidents.js';
import {
  buildQueueFilter,
  resolveUserAssignmentGroups,
  resolveExplicitGroups,
} from './snow/groups.js';
import { initTeamsAdapter } from './teams/client.js';
import { processCycle } from './orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

/** Flag de controle do ciclo principal. */
let running = false;
let cycleTimer = null;

/** Cache do filtro de filas (reconstruído a cada ciclo). */
let queueFilterCache = { sysIds: [], builtAt: 0 };

/**
 * Resolve filtro de filas de atribuição para polling.
 *
 * @param {object} config
 * @returns {Promise<string[]>}
 */
async function resolveQueueSysIds(config) {
  const { queues } = config.snow;
  const snowRead = config.snow.read || config.snow;

  if (queues.filterMode === 'none') {
    return [];
  }

  const userGroups =
    queues.monitorUser && ['user', 'both'].includes(queues.filterMode)
      ? await resolveUserAssignmentGroups(queues.monitorUser, snowRead)
      : [];

  const explicitGroups =
    queues.extraAssignmentGroups.length > 0 && ['explicit', 'both'].includes(queues.filterMode)
      ? await resolveExplicitGroups(queues.extraAssignmentGroups, snowRead)
      : [];

  const filter = buildQueueFilter(queues.filterMode, userGroups, explicitGroups);
  queueFilterCache = { sysIds: filter.sysIds, builtAt: Date.now() };
  return filter.sysIds;
}

/**
 * Executa um ciclo completo de polling e processamento.
 *
 * @param {object} config - Configuração do agente.
 * @param {Map} sops - SOPs carregados.
 * @returns {Promise<void>}
 */
async function runCycle(config, sops) {
  if (running) {
    logger.warn('Ciclo anterior ainda em execução. Pulando este ciclo.', {
      skill: 'main-loop',
    });
    return;
  }

  running = true;
  const cycleStart = Date.now();

  try {
    logger.info('Iniciando ciclo de polling.', { skill: 'main-loop' });

    const assignmentGroupSysIds = await resolveQueueSysIds(config);

    const incidents = await pollIncidents(
      config.snow,
      2,
      config.agent.maxTicketsPerCycle,
      assignmentGroupSysIds
    );

    if (incidents.length === 0) {
      logger.info('Nenhum incidente novo encontrado neste ciclo.', { skill: 'main-loop' });
      return;
    }

    await processCycle(incidents, sops, config);
  } catch (err) {
    // Conforme constitution.md Pilar 1: suspender ciclo em falhas críticas
    if (err.message?.includes('authentication') || err.message?.includes('network')) {
      logger.error('Falha crítica no ciclo de polling. Suspendendo agente.', {
        skill: 'main-loop',
        error: err.message,
      });
      shutdown(1);
      return;
    }

    logger.error('Erro no ciclo de polling. Continuando próximo ciclo.', {
      skill: 'main-loop',
      error: err.message,
    });
  } finally {
    running = false;
    const duration = Date.now() - cycleStart;
    logger.debug('Ciclo concluído.', { skill: 'main-loop', duration_ms: duration });
  }
}

/**
 * Encerra o agente de forma controlada.
 *
 * @param {number} [exitCode=0] - Código de saída.
 */
function shutdown(exitCode = 0) {
  logger.info('Encerrando agente N2.', { skill: 'main-loop', exit_code: exitCode });
  if (cycleTimer) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
  process.exit(exitCode);
}

/**
 * Inicializa e inicia o agente.
 */
async function main() {
  logger.info('=== Lino (Filtro N1) Iniciando ===', { skill: 'main-loop' });

  // Passo 1: Validar configuração (falha rápida se variáveis ausentes)
  validateConfig();
  const config = getConfig();

  logger.info('Configuração carregada.', {
    skill: 'main-loop',
    poll_interval_ms: config.agent.pollIntervalMs,
    max_tickets: config.agent.maxTicketsPerCycle,
  });

  // Passo 2: Carregar skills
  const skillsDirs = [join(ROOT_DIR, 'skills'), join(ROOT_DIR, '.cursor', 'skills')];
  try {
    const skills = await loadSkillsFromDirs(skillsDirs);
    logger.info('Skills disponíveis.', {
      skill: 'main-loop',
      count: skills.size,
    });
  } catch (err) {
    logger.warn('Falha ao carregar skills. Continuando sem skills externas.', {
      skill: 'main-loop',
      error: err.message,
    });
  }

  // Passo 3: Carregar SOPs
  const sopsDir = join(ROOT_DIR, 'sops');
  const sops = await loadSOPs(sopsDir);

  // Passo 4: Inicializar Teams adapter
  try {
    initTeamsAdapter(config.teams);
  } catch (err) {
    logger.error('Falha ao inicializar Teams adapter. Verifique as credenciais.', {
      skill: 'main-loop',
      error: err.message,
    });
    process.exit(1);
  }

  // Passo 5: Registrar handlers de encerramento
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.on('uncaughtException', (err) => {
    logger.error('Exceção não capturada. Suspendendo agente.', {
      skill: 'main-loop',
      error: err.message,
      stack: err.stack?.substring(0, 500),
    });
    shutdown(1);
  });

  // Passo 6: Executar primeiro ciclo imediatamente
  await runCycle(config, sops);

  // Passo 7: Iniciar ciclo periódico
  cycleTimer = setInterval(() => runCycle(config, sops), config.agent.pollIntervalMs);

  logger.info('Lino ativo. Polling a cada ' + config.agent.pollIntervalMs / 1000 + ' segundos.', {
    skill: 'main-loop',
  });
}

main().catch((err) => {
  logger.error('Falha fatal na inicialização do agente.', {
    skill: 'main-loop',
    error: err.message,
    stack: err.stack?.substring(0, 500),
  });
  process.exit(1);
});
