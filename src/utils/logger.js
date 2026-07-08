/**
 * Logger estruturado JSON — Utilitário do Lino
 *
 * Conforme constitution.md Pilar 1 (Falha Rápida e Ruidosa):
 * - Todos os logs incluem timestamp ISO-8601, nível, skill e mensagem.
 * - NUNCA logar valores de variáveis de ambiente ou credenciais.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const configuredLevelValue = LEVELS[configuredLevel] ?? LEVELS.info;

/**
 * Emite uma linha de log estruturado no formato JSON para stdout/stderr.
 *
 * @param {'debug'|'info'|'warn'|'error'} level - Nível do log.
 * @param {string} message - Mensagem descritiva.
 * @param {object} [meta={}] - Metadados adicionais (sem credenciais).
 */
function log(level, message, meta = {}) {
  if ((LEVELS[level] ?? 0) < configuredLevelValue) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const output = JSON.stringify(entry);

  if (level === 'error' || level === 'warn') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

export const logger = {
  debug: (message, meta) => log('debug', message, meta),
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};
