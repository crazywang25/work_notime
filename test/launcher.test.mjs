import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { launchNextep } from '../src/launcher.mjs';

const key = '__personalNextepV1__';
function setup(origin = 'https://portal.posco.net') {
  let opens = 0, mounts = 0, refreshes = 0, focuses = 0;
  const alerts = [];
  const app = { version: 1, refresh: () => refreshes++ };
  const target = { location: { href: 'about:blank' }, fetch() {}, setTimeout, clearTimeout, AbortController, focus: () => focuses++ };
  const source = { location: { origin }, open: () => { opens++; return target; }, alert: message => alerts.push(message) };
  const factory = () => ({ makeLoader: options => { assert.equal(options.url, 'https://portal.posco.net/api/attend/briefing'); return async () => {}; } });
  const mount = (win, core, options) => { mounts++; assert.equal(win, target); assert.equal(typeof options.loadAbsences, 'function'); return app; };
  return { source, target, alerts, run: () => { globalThis.window = source; launchNextep(factory, mount, 'css'); delete globalThis.window; }, counts: () => ({ opens, mounts, refreshes, focuses }) };
}
test('launcher requires the known logged-in origin', () => {
  const s = setup('https://example.invalid'); s.run();
  assert.equal(s.counts().opens, 0);
  assert.equal(s.alerts.length, 1);
});
test('launcher creates one named tab and reuses it on repeated activation', () => {
  const s = setup(); s.run(); s.run();
  assert.deepEqual(s.counts(), { opens: 1, mounts: 1, refreshes: 1, focuses: 2 });
  assert.equal(s.target[key].version, 1);
});
test('a named app tab is reused across source EP tabs', () => {
  const s = setup(); s.run(); delete s.source[key]; s.run();
  assert.equal(s.counts().opens, 2);
  assert.equal(s.counts().mounts, 1);
  assert.equal(s.counts().refreshes, 1);
});
test('popup blocking and navigated named tabs never overwrite a user page', () => {
  const blocked = setup(); blocked.source.open = () => null; blocked.run();
  assert.equal(blocked.alerts.length, 1);
  const navigated = setup(); navigated.target.location.href = 'https://portal.posco.net/other'; navigated.run();
  assert.equal(navigated.counts().mounts, 0);
  assert.equal(navigated.alerts.length, 1);
});
test('browser policy errors surface an explanation instead of a connected state', () => {
  const s = setup();
  Object.defineProperty(s.target, 'location', { get() { throw Error('SecurityError'); } });
  s.run();
  assert.equal(s.counts().mounts, 0);
  assert.equal(s.alerts.length, 1);
});
test('packaged bookmark decodes exactly, parses, and fits a 64 KiB text field', async () => {
  const script = await readFile(new URL('../dist/nextep-launcher.js', import.meta.url), 'utf8');
  const url = await readFile(new URL('../dist/nextep-bookmarklet.txt', import.meta.url), 'utf8');
  assert.ok(url.startsWith('javascript:void '));
  assert.equal(decodeURIComponent(url.slice('javascript:void '.length)), script);
  assert.ok(url.length < 65536, `즐겨찾기 코드 길이 ${url.length}`);
  new vm.Script(script);
  assert.ok(!/\beval\s*\(|new Function\s*\(|localStorage|sessionStorage|document\.cookie|Authorization:/.test(script));
});
