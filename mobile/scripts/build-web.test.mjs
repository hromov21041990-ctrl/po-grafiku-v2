import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildWeb, PUBLIC_ASSETS, rewriteMobileAuth, WEBSITE_RETURN_URL } from './build-web.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = fileURLToPath(new URL('../www/', import.meta.url));

test('web asset allowlist contains no backend or secret files', () => {
  for (const asset of PUBLIC_ASSETS) {
    assert.match(asset, /^[a-z0-9.-]+$/i);
    assert.ok(!asset.includes('supabase') && !asset.includes('.env'));
  }
  assert.ok(PUBLIC_ASSETS.includes('index.html'));
});

test('native sign-up and recovery links use approved public website', () => {
  const example = 'emailRedirectTo:location.origin+location.pathname;redirectTo:location.origin+location.pathname;new URL(location.origin+location.pathname)';
  const result = rewriteMobileAuth(example, 'test.html');
  assert.ok(result.includes(WEBSITE_RETURN_URL));
  assert.ok(!result.includes('location.origin+location.pathname'));
  assert.ok(result.includes("new URL('" + WEBSITE_RETURN_URL + "')"));
  assert.throws(() => rewriteMobileAuth('changed auth code', 'test.html'));
});

test('build copies public assets without changing website sources', async () => {
  const source = await readFile(path.join(root, 'index.html'), 'utf8');
  await buildWeb();
  for (const name of PUBLIC_ASSETS) assert.ok((await stat(path.join(bundle, name))).isFile(), name);
  const mobile = await readFile(path.join(bundle, 'index.html'), 'utf8');
  assert.ok(mobile.includes(WEBSITE_RETURN_URL));
  assert.ok(!(await readFile(path.join(root, 'index.html'), 'utf8')).localeCompare(source));
  assert.ok(!mobile.includes('emailRedirectTo:location.origin+location.pathname'));
  assert.ok(!mobile.includes('redirectTo:location.origin+location.pathname'));
  assert.ok(!mobile.includes('new URL(location.origin+location.pathname)'));
});
