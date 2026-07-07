/**
 * Carregador e Validador de Skills — Agente N2
 *
 * Conforme constitution.md Pilar 3 (Isolamento de Execução):
 * - Valida YAML frontmatter antes de qualquer execução.
 * - Rejeita skills sem `requires.env` ou `requires.bins` definidos.
 * - Verifica presença de variáveis de ambiente e binários antes de aprovar execução.
 * - Separa skills de leitura (read) de skills de escrita (write).
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import { logger } from './utils/logger.js';

/** Campos obrigatórios no YAML frontmatter de cada skill. */
const REQUIRED_FRONTMATTER_FIELDS = ['name', 'description', 'version', 'requires', 'actions'];

/**
 * Analisa o YAML frontmatter de um arquivo SKILL.md.
 *
 * @param {string} content - Conteúdo completo do arquivo SKILL.md.
 * @param {string} filePath - Caminho do arquivo (para logs de erro).
 * @returns {{ frontmatter: object, body: string } | null} Frontmatter parseado e corpo, ou null se inválido.
 */
function parseFrontmatter(content, filePath) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    logger.warn('SKILL.md sem frontmatter YAML válido. Skill rejeitada.', {
      skill: 'skill-loader',
      file: filePath,
    });
    return null;
  }

  try {
    const frontmatter = yaml.load(match[1]);
    const body = match[2];
    return { frontmatter, body };
  } catch (err) {
    logger.warn('Falha ao parsear YAML frontmatter da skill.', {
      skill: 'skill-loader',
      file: filePath,
      error: err.message,
    });
    return null;
  }
}

/**
 * Valida se o frontmatter de uma skill contém todos os campos obrigatórios.
 *
 * @param {object} frontmatter - Objeto YAML parseado.
 * @param {string} filePath - Caminho do arquivo (para logs).
 * @returns {boolean} True se válido.
 */
function validateFrontmatter(frontmatter, filePath) {
  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    if (frontmatter[field] === undefined || frontmatter[field] === null) {
      logger.warn(`Campo obrigatório '${field}' ausente no frontmatter da skill.`, {
        skill: 'skill-loader',
        file: filePath,
      });
      return false;
    }
  }

  if (!Array.isArray(frontmatter.actions) || frontmatter.actions.length === 0) {
    logger.warn('Campo actions deve ser um array não vazio.', {
      skill: 'skill-loader',
      file: filePath,
    });
    return false;
  }

  const validActions = ['read', 'write', 'notify'];
  const invalidActions = frontmatter.actions.filter((a) => !validActions.includes(a));
  if (invalidActions.length > 0) {
    logger.warn(`Ações inválidas na skill: ${invalidActions.join(', ')}`, {
      skill: 'skill-loader',
      file: filePath,
    });
    return false;
  }

  if (frontmatter.description && frontmatter.description.length > 1024) {
    logger.warn('Campo description excede 1024 caracteres.', {
      skill: 'skill-loader',
      file: filePath,
    });
    return false;
  }

  return true;
}

/**
 * Verifica se todas as variáveis de ambiente necessárias para uma skill estão presentes.
 *
 * @param {object} frontmatter - Frontmatter da skill com `requires.env`.
 * @returns {{ valid: boolean, missing: string[] }} Resultado da verificação.
 */
function checkEnvRequirements(frontmatter) {
  const requiredEnv = frontmatter.requires?.env || [];
  const missing = requiredEnv.filter((v) => !process.env[v]);
  return { valid: missing.length === 0, missing };
}

/**
 * Verifica se todos os binários necessários para uma skill estão disponíveis no PATH.
 *
 * @param {object} frontmatter - Frontmatter da skill com `requires.bins`.
 * @returns {{ valid: boolean, missing: string[] }} Resultado da verificação.
 */
function checkBinRequirements(frontmatter) {
  const requiredBins = frontmatter.requires?.bins || [];
  const missing = requiredBins.filter((bin) => {
    try {
      execSync(`command -v ${bin}`, { stdio: 'ignore' });
      return false;
    } catch {
      return true;
    }
  });
  return { valid: missing.length === 0, missing };
}

/**
 * Carrega todas as skills do diretório especificado.
 *
 * @param {string} skillsDir - Caminho absoluto do diretório de skills.
 * @returns {Promise<Map<string, object>>} Mapa de skills válidas (nome → metadados).
 */
export async function loadSkills(skillsDir) {
  const skills = new Map();

  let files;
  try {
    files = await readdir(skillsDir);
  } catch (err) {
    logger.error('Falha ao ler diretório de skills.', {
      skill: 'skill-loader',
      dir: skillsDir,
      error: err.message,
    });
    throw err;
  }

  const skillFiles = files.filter((f) => f.endsWith('.md'));

  for (const file of skillFiles) {
    const filePath = join(skillsDir, file);

    let content;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (err) {
      logger.warn('Não foi possível ler o arquivo de skill.', {
        skill: 'skill-loader',
        file: filePath,
        error: err.message,
      });
      continue;
    }

    const parsed = parseFrontmatter(content, filePath);
    if (!parsed) continue;

    const { frontmatter, body } = parsed;
    if (!validateFrontmatter(frontmatter, filePath)) continue;

    const envCheck = checkEnvRequirements(frontmatter);
    if (!envCheck.valid) {
      logger.warn('Skill desativada: variáveis de ambiente ausentes.', {
        skill: 'skill-loader',
        name: frontmatter.name,
        missing_env: envCheck.missing,
      });
      continue;
    }

    const binCheck = checkBinRequirements(frontmatter);
    if (!binCheck.valid) {
      logger.warn('Skill desativada: binários ausentes no PATH.', {
        skill: 'skill-loader',
        name: frontmatter.name,
        missing_bins: binCheck.missing,
      });
      continue;
    }

    skills.set(frontmatter.name, { ...frontmatter, body, filePath });
    logger.debug('Skill carregada com sucesso.', {
      skill: 'skill-loader',
      name: frontmatter.name,
      actions: frontmatter.actions,
    });
  }

  logger.info(`${skills.size} skill(s) carregada(s) com sucesso.`, {
    skill: 'skill-loader',
    loaded: [...skills.keys()],
  });

  return skills;
}
