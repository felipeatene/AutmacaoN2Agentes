/**
 * Testes do Carregador de Skills — src/skillLoader.js
 *
 * Testa:
 * - Carregamento bem-sucedido de skills válidas.
 * - Rejeição de skills com frontmatter inválido.
 * - Rejeição de skills com variáveis de ambiente ausentes.
 * - Validação de campo description (max 1024 chars).
 * - Validação de actions permitidas.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Helpers para criar arquivos de skill temporários
async function createSkillFile(dir, filename, content) {
  await writeFile(join(dir, filename), content, 'utf-8');
}

function makeValidFrontmatter(overrides = {}) {
  const base = {
    name: 'test-skill',
    description: 'Uma skill de teste válida para uso em testes automatizados.',
    version: '1.0.0',
    requires: { env: [], bins: [] },
    actions: ['read'],
  };
  const merged = { ...base, ...overrides };
  const yaml = Object.entries(merged)
    .map(([k, v]) => {
      if (typeof v === 'object' && !Array.isArray(v)) {
        const sub = Object.entries(v)
          .map(([sk, sv]) => `  ${sk}:\n${sv.map ? sv.map((i) => `    - ${i}`).join('\n') : '    ' + sv}`)
          .join('\n');
        return `${k}:\n${sub}`;
      }
      if (Array.isArray(v)) {
        if (v.length === 0) return `${k}: []`;
        return `${k}:\n${v.map((i) => `  - ${i}`).join('\n')}`;
      }
      return `${k}: ${v}`;
    })
    .join('\n');
  return `---\n${yaml}\n---\n\n# Test Skill Body\n`;
}

describe('skillLoader', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'skill-test-'));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('carrega skill válida sem env requirements', async () => {
    const { loadSkills } = await import('../src/skillLoader.js');
    const content = makeValidFrontmatter();
    await createSkillFile(tmpDir, 'valid-skill.md', content);

    const skills = await loadSkills(tmpDir);
    assert.ok(skills.has('test-skill'), 'Skill válida deve ser carregada');
    assert.equal(skills.get('test-skill').name, 'test-skill');
    assert.deepEqual(skills.get('test-skill').actions, ['read']);
  });

  test('rejeita skill sem frontmatter YAML', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skill-no-fm-'));
    try {
      const { loadSkills } = await import('../src/skillLoader.js');
      await createSkillFile(dir, 'no-frontmatter.md', '# Skill sem frontmatter\n\nApenas corpo.');

      const skills = await loadSkills(dir);
      assert.equal(skills.size, 0, 'Skill sem frontmatter não deve ser carregada');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('rejeita skill com campo obrigatório ausente (sem name)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skill-missing-'));
    try {
      const { loadSkills } = await import('../src/skillLoader.js');
      const content = `---\ndescription: skill sem name\nversion: 1.0.0\nrequires:\n  env: []\n  bins: []\nactions:\n  - read\n---\n# Corpo\n`;
      await createSkillFile(dir, 'missing-name.md', content);

      const skills = await loadSkills(dir);
      assert.equal(skills.size, 0, 'Skill sem campo name não deve ser carregada');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('rejeita skill com description maior que 1024 caracteres', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skill-longdesc-'));
    try {
      const { loadSkills } = await import('../src/skillLoader.js');
      const longDesc = 'a'.repeat(1025);
      const content = `---\nname: long-desc-skill\ndescription: ${longDesc}\nversion: 1.0.0\nrequires:\n  env: []\n  bins: []\nactions:\n  - read\n---\n`;
      await createSkillFile(dir, 'long-desc.md', content);

      const skills = await loadSkills(dir);
      assert.equal(skills.size, 0, 'Skill com description > 1024 chars não deve ser carregada');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('rejeita skill com action inválida', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skill-badaction-'));
    try {
      const { loadSkills } = await import('../src/skillLoader.js');
      const content = `---\nname: bad-action-skill\ndescription: skill com action inválida\nversion: 1.0.0\nrequires:\n  env: []\n  bins: []\nactions:\n  - execute\n---\n`;
      await createSkillFile(dir, 'bad-action.md', content);

      const skills = await loadSkills(dir);
      assert.equal(skills.size, 0, 'Skill com action inválida não deve ser carregada');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('rejeita skill com variável de ambiente ausente', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skill-missingenv-'));
    try {
      const { loadSkills } = await import('../src/skillLoader.js');
      const content = `---\nname: env-required-skill\ndescription: skill que requer env var ausente\nversion: 1.0.0\nrequires:\n  env:\n    - VAR_QUE_NAO_EXISTE_JAMAIS_12345\n  bins: []\nactions:\n  - read\n---\n`;
      await createSkillFile(dir, 'env-required.md', content);

      const skills = await loadSkills(dir);
      assert.equal(skills.size, 0, 'Skill com env var ausente não deve ser carregada');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('carrega skill com env var presente', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skill-withenv-'));
    try {
      const { loadSkills } = await import('../src/skillLoader.js');
      // Define a variável de ambiente para o teste
      process.env.TEST_SKILL_VAR_XYZ = 'test-value';
      const content = `---\nname: env-present-skill\ndescription: skill com env var presente no ambiente\nversion: 1.0.0\nrequires:\n  env:\n    - TEST_SKILL_VAR_XYZ\n  bins: []\nactions:\n  - read\n---\n`;
      await createSkillFile(dir, 'env-present.md', content);

      const skills = await loadSkills(dir);
      assert.ok(skills.has('env-present-skill'), 'Skill com env var presente deve ser carregada');

      delete process.env.TEST_SKILL_VAR_XYZ;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('aceita actions válidas: read, write, notify', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skill-multiaction-'));
    try {
      const { loadSkills } = await import('../src/skillLoader.js');
      const content = `---\nname: multi-action-skill\ndescription: skill com múltiplas actions válidas\nversion: 1.0.0\nrequires:\n  env: []\n  bins: []\nactions:\n  - read\n  - write\n  - notify\n---\n`;
      await createSkillFile(dir, 'multi-action.md', content);

      const skills = await loadSkills(dir);
      assert.ok(skills.has('multi-action-skill'), 'Skill com actions válidas deve ser carregada');
      assert.deepEqual(skills.get('multi-action-skill').actions, ['read', 'write', 'notify']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('ignora arquivos não-.md no diretório de skills', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skill-nonmd-'));
    try {
      const { loadSkills } = await import('../src/skillLoader.js');
      await writeFile(join(dir, 'config.json'), '{"not": "a skill"}', 'utf-8');
      await writeFile(join(dir, 'readme.txt'), 'apenas texto', 'utf-8');
      const content = makeValidFrontmatter({ name: 'only-md-skill' });
      await createSkillFile(dir, 'valid.md', content);

      const skills = await loadSkills(dir);
      assert.equal(skills.size, 1, 'Apenas arquivos .md devem ser processados');
      assert.ok(skills.has('only-md-skill'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
