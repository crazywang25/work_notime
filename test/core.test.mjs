import test from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/core.mjs';
const core = createCore();
const now = Date.parse('2026-11-13T12:00:00+09:00');
const row = (id, name = '가상 인물', type = '교육') => ({ lid: id, nm: name, jt: '연구원', offName: type });
const payload = { today: [row('a')], tomorrow: [row('b')] };
const snapshot = (at = now, p = payload) => core.normalizePayload(p, at);
const jsonResponse = (body = payload, init = {}) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json; charset=utf-8' }, ...init });
function fakeClock(at = now) {
  let current = at, serial = 0;
  const timers = new Map();
  return {
    now: () => current,
    setTimer: (fn, delay) => { const id = ++serial; timers.set(id, { fn, due: current + delay }); return id; },
    clearTimer: id => timers.delete(id),
    get timerCount() { return timers.size; },
    get nextDelay() { return Math.min(...[...timers.values()].map(t => t.due - current)); },
    advance: async ms => {
      const target = current + ms;
      for (let count = 0; count < 100; count++) {
        const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > target) break;
        current = next[1].due;
        timers.delete(next[0]);
        next[1].fn();
        for (let i = 0; i < 12; i++) await Promise.resolve();
      }
      current = target;
    }
  };
}
test('Korea dates, month/year rollover, midnight delay', () => {
  assert.equal(core.dateKey(Date.parse('2026-11-13T15:00:00Z')), '2026-11-14');
  assert.equal(core.nextDate('2026-12-31'), '2027-01-01');
  assert.equal(core.nextDate('2028-02-28'), '2028-02-29');
  assert.equal(core.untilMidnight(Date.parse('2026-11-13T23:59:59+09:00')), 1000);
});
test('normalization preserves types, deduplicates exact rows, counts distinct people', () => {
  const rows = core.normalizeRecords([row('a'), row('a'), row('a', '가상 인물', '국내출장'), row('b')]);
  assert.equal(rows.length, 3);
  assert.deepEqual(core.summarize(rows), { people: 2, unknown: 0, records: 3, types: [['교육', 2], ['국내출장', 1]] });
});
test('missing fields are explicit and unknown identities are never merged', () => {
  const rows = core.normalizeRecords([{}, {}, { lid: 0, nm: '테스트', offname: '교육' }]);
  assert.deepEqual(rows[0], { id: null, name: '이름 미제공', title: '직급 미제공', type: '유형 미제공' });
  assert.equal(core.summarize(rows).unknown, 2);
  assert.equal(core.summarize(rows).people, 1);
});
test('the live offName field is read with its exact casing', () => {
  const rows = core.normalizeRecords([
    { lid: 'synthetic-a', nm: '가상 인물', jt: '연구원', offName: '해외연수', description: '해외연수', tone: 'positive' },
    { lid: 'synthetic-b', nm: '테스트 인물', jt: '연구원', offName: '국내출장', offname: '과거 값' },
    { lid: 'synthetic-c', offname: '교육' }
  ]);
  assert.deepEqual(rows.map(r => r.type), ['해외연수', '국내출장', '유형 미제공']);
});
test('empty data and malformed data have different outcomes', () => {
  assert.equal(core.normalizePayload({ today: [], tomorrow: [] }, now).today.records.length, 0);
  for (const p of [null, {}, { today: [], tomorrow: null }, { today: [null], tomorrow: [] }]) {
    assert.throws(() => core.normalizePayload(p, now), { code: 'FORMAT' });
  }
});
test('name and type filters combine without altering the source', () => {
  const rows = core.normalizeRecords([row('a', '김가상'), row('b', '김테스트', '출장'), row('c', '이가상')]);
  assert.equal(core.filterRecords(rows, ' 김 ', '교육').length, 1);
  assert.equal(core.filterRecords(rows, '없음').length, 0);
  assert.equal(rows.length, 3);
});
test('loader sends only same-origin credentials and reads date-anchored JSON', async () => {
  let options;
  const load = core.makeLoader({ fetchImpl: async (_url, init) => { options = init; return jsonResponse(); }, url: 'https://portal.posco.net/api/attend/briefing', now: () => now });
  const value = await load();
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(value.today.date, '2026-11-13');
  assert.equal(value.tomorrow.date, '2026-11-14');
});
test('loader detects authentication, HTML login redirects, invalid JSON and network failures', async () => {
  for (const [fetchImpl, code] of [
    [async () => jsonResponse({}, { status: 401 }), 'AUTH'],
    [async () => jsonResponse({}, { status: 403 }), 'AUTH'],
    [async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }), 'AUTH'],
    [async () => new Response('no', { headers: { 'content-type': 'application/json' } }), 'FORMAT'],
    [async () => new Response('error', { status: 500 }), 'HTTP'],
    [async () => { throw new TypeError('offline'); }, 'NETWORK']
  ]) {
    const load = core.makeLoader({ fetchImpl, url: '/test', now: () => now });
    await assert.rejects(load(), { code });
  }
});
test('timeouts settle even when fetch ignores abort and abort cancels the loader', async () => {
  const clock = fakeClock();
  const load = core.makeLoader({ fetchImpl: () => new Promise(() => {}), url: '/test', now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, timeoutMs: 20 });
  const pending = load();
  const outcome = assert.rejects(pending, { code: 'TIMEOUT' });
  await clock.advance(20);
  await outcome;
  assert.equal(clock.timerCount, 0);
  const abort = new AbortController();
  const cancelled = load({ signal: abort.signal });
  abort.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.equal(clock.timerCount, 0);
});
test('a request crossing midnight retries rather than relabeling yesterday', async () => {
  let time = Date.parse('2026-11-13T23:59:59+09:00'), calls = 0;
  const load = core.makeLoader({ fetchImpl: async () => { calls++; time += 2000; return jsonResponse(); }, url: '/test', now: () => time });
  const value = await load();
  assert.equal(calls, 2);
  assert.equal(value.today.date, '2026-11-14');
});
test('visible controller refreshes after five minutes, never concurrently', async () => {
  const clock = fakeClock();
  let calls = 0;
  const c = core.createController({ ...clock, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, loadAbsences: async () => { calls++; return snapshot(clock.now()); } });
  await c.start();
  assert.equal(calls, 1);
  assert.equal(clock.timerCount, 1);
  await clock.advance(299999);
  assert.equal(calls, 1);
  await clock.advance(1);
  assert.equal(calls, 2);
  assert.equal(c.getState().status, 'ready');
  c.dispose();
  assert.equal(clock.timerCount, 0);
});
test('hidden tabs stop timers and returning after expiry refreshes immediately', async () => {
  const clock = fakeClock();
  let calls = 0;
  const c = core.createController({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, loadAbsences: async () => { calls++; return snapshot(clock.now()); } });
  await c.start();
  c.setVisible(false);
  assert.equal(clock.timerCount, 0);
  await clock.advance(600000);
  assert.equal(calls, 1);
  c.setVisible(true);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(calls, 2);
  c.dispose();
});
test('authentication failures stop automatic requests until explicit retry', async () => {
  const clock = fakeClock();
  let calls = 0, auth = true;
  const c = core.createController({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, loadAbsences: async () => { calls++; if (auth) throw core.error('AUTH'); return snapshot(clock.now()); } });
  await c.start();
  assert.equal(c.getState().authStopped, true);
  assert.equal(clock.timerCount, 0);
  c.setVisible(false); c.setVisible(true);
  await clock.advance(600000);
  assert.equal(calls, 1);
  auth = false;
  await c.refresh();
  assert.equal(c.getState().authStopped, false);
  assert.equal(c.getState().status, 'ready');
  c.dispose();
});
test('network failure retains the successful snapshot and schedules a bounded retry', async () => {
  const clock = fakeClock();
  let fail = false;
  const c = core.createController({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, loadAbsences: async () => { if (fail) throw core.error('NETWORK'); return snapshot(clock.now()); } });
  await c.start();
  const saved = c.getState().snapshot;
  fail = true;
  await c.refresh();
  assert.equal(c.getState().snapshot, saved);
  assert.equal(c.getState().status, 'error');
  assert.equal(clock.nextDelay, 300000);
  c.dispose();
});
test('late responses cannot overwrite a newer forced request or a disposed screen', async () => {
  const clock = fakeClock();
  const pending = [];
  const signals = [];
  const c = core.createController({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, loadAbsences: ({ signal }) => { signals.push(signal); return new Promise(resolve => pending.push(resolve)); } });
  const first = c.start();
  await Promise.resolve();
  const second = c.refresh({ force: true });
  await Promise.resolve();
  assert.equal(signals[0].aborted, true);
  assert.notEqual(signals[0], signals[1]);
  const latest = snapshot(now + 10);
  pending[1](latest); await second;
  pending[0](snapshot()); await first;
  assert.equal(c.getState().snapshot, latest);
  const third = c.refresh(); await Promise.resolve();
  c.dispose(); pending[2](snapshot(now + 20)); await third;
  assert.equal(c.getState().snapshot, latest);
  assert.equal(clock.timerCount, 0);
});
test('midnight triggers refresh even when the five minute interval has not passed', async () => {
  const clock = fakeClock(Date.parse('2026-11-13T23:59:59+09:00'));
  let calls = 0;
  const c = core.createController({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, loadAbsences: async () => { calls++; return snapshot(clock.now()); } });
  await c.start();
  assert.equal(clock.nextDelay, 1000);
  await clock.advance(1000);
  assert.equal(calls, 2);
  assert.equal(c.getState().snapshot.today.date, '2026-11-14');
  c.dispose();
});
