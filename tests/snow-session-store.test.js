/**
 * Testes do session-store — src/snow/session-store.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('snow/session-store', () => {
  let tempDir;
  let cachePath;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'snow-session-'));
    cachePath = join(tempDir, 'session.json');
  });

  after(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('buildCookieHeader monta string de cookies', async () => {
    const { buildCookieHeader } = await import('../src/snow/session-store.js');
    const header = buildCookieHeader({
      JSESSIONID: 'abc123',
      glide_session_store: 'xyz789',
    });
    assert.equal(header, 'JSESSIONID=abc123; glide_session_store=xyz789');
  });

  test('isSessionValid exige JSESSIONID e respeita expiresAt', async () => {
    const { isSessionValid } = await import('../src/snow/session-store.js');
    const now = Date.now();

    assert.equal(isSessionValid(null), false);
    assert.equal(isSessionValid({ cookies: {} }), false);
    assert.equal(
      isSessionValid({ cookies: { JSESSIONID: 'x' }, expiresAt: now - 1 }),
      false
    );
    assert.equal(
      isSessionValid({ cookies: { JSESSIONID: 'x' }, expiresAt: now + 60000 }),
      true
    );
  });

  test('saveSession e loadSession persistem e recuperam sessão válida', async () => {
    const { saveSession, loadSession } = await import('../src/snow/session-store.js');
    const session = {
      instanceUrl: 'https://test.service-now.com',
      cookies: { JSESSIONID: 'sess-1', glide_session_store: 'store-1' },
      userName: 'test.user',
      expiresAt: Date.now() + 3600000,
    };

    const savedPath = await saveSession(session, cachePath);
    assert.equal(savedPath, cachePath);

    const loaded = await loadSession(cachePath);
    assert.ok(loaded);
    assert.equal(loaded.instanceUrl, session.instanceUrl);
    assert.equal(loaded.cookies.JSESSIONID, 'sess-1');
    assert.equal(loaded.userName, 'test.user');
  });

  test('loadSession retorna null para sessão expirada', async () => {
    const { saveSession, loadSession } = await import('../src/snow/session-store.js');
    await saveSession(
      {
        instanceUrl: 'https://test.service-now.com',
        cookies: { JSESSIONID: 'expired' },
        expiresAt: Date.now() - 1000,
      },
      cachePath
    );

    const loaded = await loadSession(cachePath);
    assert.equal(loaded, null);
  });

  test('clearSession remove arquivo de cache', async () => {
    const { saveSession, clearSession, loadSessionRaw } = await import(
      '../src/snow/session-store.js'
    );

    await saveSession(
      {
        instanceUrl: 'https://test.service-now.com',
        cookies: { JSESSIONID: 'to-clear' },
        expiresAt: Date.now() + 3600000,
      },
      cachePath
    );

    const removed = await clearSession(cachePath);
    assert.equal(removed, true);

    const raw = await loadSessionRaw(cachePath);
    assert.equal(raw, null);
  });

  test('resolveSessionCachePath expande til', async () => {
    const { resolveSessionCachePath } = await import('../src/snow/session-store.js');
    const { homedir } = await import('node:os');
    const { join } = await import('node:path');

    const resolved = resolveSessionCachePath('~/.snow_n2/session.json');
    assert.equal(resolved, join(homedir(), '.snow_n2', 'session.json'));
  });
});
