/**
 * Testes do importador de sequência de login — scripts/import-login-sequence.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIXTURE = join(__dirname, 'fixtures', 'minimal-login-sequence.txt');

describe('import-login-sequence', () => {
  let tempOutput;

  before(async () => {
    tempOutput = await mkdtemp(join(tmpdir(), 'snow-login-import-'));
  });

  after(async () => {
    if (tempOutput) {
      await rm(tempOutput, { recursive: true, force: true });
    }
  });

  test('parseLoginSequence classifica fases e sanitiza tokens', async () => {
    const { parseLoginSequence } = await import('../scripts/import-login-sequence.js');
    const raw = await readFile(FIXTURE, 'utf-8');
    const result = parseLoginSequence(raw);

    assert.equal(result.azureTenantId, '3737367d-87d3-46ca-b00f-21b50c428b5e');

    const phaseTypes = result.phases.map((p) => p.phase);
    assert.ok(phaseTypes.includes('azure_discovery'));
    assert.ok(phaseTypes.includes('azure_oidc_config'));
    assert.ok(phaseTypes.includes('azure_token'));
    assert.ok(phaseTypes.includes('apigee_token'));
    assert.ok(phaseTypes.includes('dagente_api'));
    assert.equal(phaseTypes.includes('noise'), false);

    const tokenPhase = result.phases.find((p) => p.phase === 'azure_token');
    assert.ok(tokenPhase);
    assert.match(tokenPhase.bodyTemplate || '', /REDACTED/);
    assert.doesNotMatch(tokenPhase.bodyTemplate || '', /SECRET_AUTH_CODE/);
  });

  test('gera login-sequence.json e txt sanitizado', async () => {
    execSync(`node scripts/import-login-sequence.js "${FIXTURE}"`, {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, SNOW_IMPORT_OUTPUT_DIR: tempOutput },
    });

    const manifest = JSON.parse(
      await readFile(join(tempOutput, 'config', 'snow', 'login-sequence.json'), 'utf-8')
    );

    assert.ok(manifest.phases.length >= 4);
    assert.ok(manifest.serviceNowEntry.includes('service-now.com'));
    assert.ok(manifest.humanStep.required);

    const sanitized = await readFile(
      join(tempOutput, 'postman', 'sequencia-login-servicenow.sanitized.txt'),
      'utf-8'
    );
    assert.doesNotMatch(sanitized, /SECRET_AUTH_CODE/);
    assert.doesNotMatch(sanitized, /SECRET_JWT/);
    assert.doesNotMatch(sanitized, /datadoghq/);
  });
});
