/**
 * Testes do importador Postman — scripts/import-postman-collection.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIXTURE = join(__dirname, 'fixtures', 'minimal-postman-collection.json');

describe('import-postman-collection', () => {
  let tempOutput;

  before(async () => {
    tempOutput = await mkdtemp(join(tmpdir(), 'snow-import-'));
    await mkdir(join(ROOT, 'tests', 'fixtures'), { recursive: true });
    const fixture = {
      info: { name: 'Test Collection' },
      item: [
        {
          name: 'incident — Incident',
          description: 'Tabela incident',
          item: [
            {
              name: 'Guepardo: Abertos',
              request: {
                method: 'GET',
                url: {
                  raw: '{{base_url}}/api/now/table/incident?sysparm_query=state%3D1%5Eassignment_group%3Dabc123',
                  query: [
                    {
                      key: 'sysparm_query',
                      value: 'state=1^assignment_group=abc123',
                    },
                  ],
                },
              },
            },
            {
              name: 'Table API: Sample 1',
              request: {
                method: 'GET',
                url: {
                  raw: '{{base_url}}/api/now/table/incident?sysparm_limit=1',
                  query: [{ key: 'sysparm_limit', value: '1' }],
                },
              },
            },
          ],
        },
      ],
      variable: [
        { key: 'base_url', value: 'https://testinstance.service-now.com' },
        { key: 'username', value: 'testuser' },
        { key: 'password', value: 'super-secret-password' },
      ],
    };
    await writeFile(FIXTURE, JSON.stringify(fixture, null, 2));
  });

  after(async () => {
    if (tempOutput) {
      await rm(tempOutput, { recursive: true, force: true });
    }
  });

  test('gera manifests e sanitiza senhas', async () => {
    execSync(`node scripts/import-postman-collection.js "${FIXTURE}"`, {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, SNOW_IMPORT_OUTPUT_DIR: tempOutput },
    });

    const instance = JSON.parse(await readFile(join(tempOutput, 'config', 'snow', 'instance.json'), 'utf-8'));
    assert.equal(instance.name, 'testinstance');
    assert.equal(instance.baseUrl, 'https://testinstance.service-now.com');

    const manifest = JSON.parse(
      await readFile(join(tempOutput, 'config', 'snow', 'tables.manifest.json'), 'utf-8')
    );
    assert.ok(manifest.tables.some((t) => t.name === 'incident'));

    const guepardo = JSON.parse(
      await readFile(join(tempOutput, 'config', 'snow', 'queries', 'guepardo-abertos.json'), 'utf-8')
    );
    assert.ok(guepardo.sysparm_query.includes('assignment_group=abc123'));

    const n2Poll = JSON.parse(
      await readFile(join(tempOutput, 'config', 'snow', 'queries', 'n2-poll.json'), 'utf-8')
    );
    assert.ok(n2Poll.dynamicFilters.some((f) => f.includes('assigned_to=EMPTY')));
    assert.equal(n2Poll.params.sysparm_display_value, 'all');

    const sanitized = JSON.parse(
      await readFile(join(tempOutput, 'postman', 'ServiceNow-Schema-Mapper.sanitized.json'), 'utf-8')
    );
    const passwordVar = sanitized.variable.find((v) => v.key === 'password');
    assert.equal(passwordVar.value, '', 'Senha deve ser removida na versão sanitizada');

    const incidentEndpoints = JSON.parse(
      await readFile(join(tempOutput, 'config', 'snow', 'endpoints', 'incident.json'), 'utf-8')
    );
    assert.equal(incidentEndpoints.table, 'incident');
    assert.ok(incidentEndpoints.requests.length >= 2);
  });
});
