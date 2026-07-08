/**
 * Carregador e Validador de Skills — Lino
 *
 * Conforme constitution.md Pilar 3 (Isolamento de Execução):
 * - Valida YAML frontmatter antes de qualquer execução.
 * - Carrega de skills/ (runtime) e .cursor/skills/{name}/SKILL.md (Cursor).
 * - Verifica presença de variáveis de ambiente e binários antes de aprovar execução.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import { logger } from './utils/logger.js';

/** Campos obrigatórios no YAML frontmatter de cada skill. */
const REQUIRED_FRONTMATTER_FIELDS = ['name', 'description', 'version', 'requires', 'actions'];

/**
 * Verifica se um binário está disponível no PATH (Windows e Unix).
 *
 * @param {string} bin - Nome do binário.
 * @returns {boolean}
 */
function isBinAvailable(bin) {
  try {
    if (process.platform === 'win32') {
      execSync(`where ${bin}`, { stdio: 'ignore' });
    } else {
      execSync(`command -v ${bin}`, { stdio: 'ignore', shell: '/bin/sh' });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Analisa o YAML frontmatter de um arquivo SKILL.md.
 *
 * @param {string} content - Conteúdo completo do arquivo SKILL.md.
 * @param {string} filePath - Caminho do arquivo (para logs de erro).
 * @returns {{ frontmatter: object, body: string } | null}
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
 * @param {object} frontmatter
 * @param {string} filePath
 * @returns {boolean}
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
 * @param {object} frontmatter
 * @returns {{ valid: boolean, missing: string[] }}
 */
function checkEnvRequirements(frontmatter) {
  const requiredEnv = frontmatter.requires?.env || [];
  const missing = requiredEnv.filter((v) => !process.env[v]);
  return { valid: missing.length === 0, missing };
}

/**
 * @param {object} frontmatter
 * @returns {{ valid: boolean, missing: string[] }}
 */
function checkBinRequirements(frontmatter) {
  const requiredBins = frontmatter.requires?.bins || [];
  const missing = requiredBins.filter((bin) => !isBinAvailable(bin));
  return { valid: missing.length === 0, missing };
}

/**
 * Processa um arquivo de skill e adiciona ao mapa se válido.
 *
 * @param {string} filePath
 * @param {Map<string, object>} skills
 * @returns {Promise<void>}
 */
async function loadSkillFile(filePath, skills) {
  let content;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    logger.warn('Não foi possível ler o arquivo de skill.', {
      skill: 'skill-loader',
      file: filePath,
      error: err.message,
    });
    return;
  }

  const parsed = parseFrontmatter(content, filePath);
  if (!parsed) return;

  const { frontmatter, body } = parsed;
  if (!validateFrontmatter(frontmatter, filePath)) return;

  const envCheck = checkEnvRequirements(frontmatter);
  if (!envCheck.valid) {
    logger.warn('Skill desativada: variáveis de ambiente ausentes.', {
      skill: 'skill-loader',
      name: frontmatter.name,
      missing_env: envCheck.missing,
    });
    return;
  }

  const binCheck = checkBinRequirements(frontmatter);
  if (!binCheck.valid) {
    logger.warn('Skill desativada: binários ausentes no PATH.', {
      skill: 'skill-loader',
      name: frontmatter.name,
      missing_bins: binCheck.missing,
    });
    return;
  }

  skills.set(frontmatter.name, { ...frontmatter, body, filePath });
  logger.debug('Skill carregada com sucesso.', {
    skill: 'skill-loader',
    name: frontmatter.name,
    actions: frontmatter.actions,
  });
}

/**
 * Descobre arquivos de skill em um diretório (flat .md ou subpastas com SKILL.md).
 *
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function discoverSkillFiles(dir) {
  const files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    } else if (entry.isDirectory()) {
      const skillMd = join(fullPath, 'SKILL.md');
      try {
        const s = await stat(skillMd);
        if (s.isFile()) files.push(skillMd);
      } catch {
        // subpasta sem SKILL.md — ignorar
      }
    }
  }
  return files;
}

/**
 * Carrega todas as skills de um diretório.
 *
 * @param {string} skillsDir
 * @returns {Promise<Map<string, object>>}
 */
export async function loadSkills(skillsDir) {
  const skills = new Map();
  const files = await discoverSkillFiles(skillsDir);

  for (const filePath of files) {
    await loadSkillFile(filePath, skills);
  }

  logger.info(`${skills.size} skill(s) carregada(s) de ${skillsDir}.`, {
    skill: 'skill-loader',
    loaded: [...skills.keys()],
  });

  return skills;
}

/**
 * Carrega skills de múltiplos diretórios (skills/ + .cursor/skills/).
 * Skills com mesmo nome: último diretório prevalece.
 *
 * @param {string[]} skillDirs
 * @returns {Promise<Map<string, object>>}
 */
export async function loadSkillsFromDirs(skillDirs) {
  const skills = new Map();

  for (const dir of skillDirs) {
    try {
      const dirSkills = await loadSkills(dir);
      for (const [name, meta] of dirSkills) {
        skills.set(name, meta);
      }
    } catch (err) {
      logger.warn('Falha ao carregar skills do diretório.', {
        skill: 'skill-loader',
        dir,
        error: err.message,
      });
    }
  }

  logger.info(`${skills.size} skill(s) carregada(s) no total.`, {
    skill: 'skill-loader',
    loaded: [...skills.keys()],
  });

  return skills;
}
