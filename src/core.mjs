export function createCore() {
  const INTERVAL = 300000;
  const ZONE = 'Asia/Seoul';
  const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  function dateKey(time = Date.now()) {
    const parts = Object.fromEntries(dateFormat.formatToParts(new Date(time)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function nextDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }
  function untilMidnight(time) {
    const day = 86400000;
    return day - ((time + 32400000) % day);
  }
  function error(code) {
    const messages = {
      AUTH: 'EP 로그인 또는 조회 권한을 확인한 뒤 다시 시도해 주세요. 자동 갱신을 멈췄습니다.',
      NETWORK: '연결을 확인하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
      TIMEOUT: '응답이 늦어 조회를 멈췄습니다. 잠시 후 다시 시도해 주세요.',
      FORMAT: '원본 응답 형식이 변경되었거나 일부 데이터가 올바르지 않습니다.',
      HTTP: '원본 서비스에서 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      ROLLOVER: '날짜가 바뀌어 조회 결과를 사용할 수 없습니다. 다시 조회해 주세요.'
    };
    return Object.assign(new Error(messages[code] || messages.NETWORK), { code });
  }
  const text = (v, fallback) => typeof v === 'string' && v.trim() ? v.trim() : fallback;
  function normalizeRecords(rows) {
    if (!Array.isArray(rows) || rows.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw error('FORMAT');
    const seen = new Set();
    return rows.flatMap((r, index) => {
      const id = typeof r.lid === 'string' && r.lid.trim() ? r.lid.trim() : typeof r.lid === 'number' && Number.isFinite(r.lid) ? String(r.lid) : null;
      const record = { id, name: text(r.nm, '이름 미제공'), title: text(r.jt, '직급 미제공'), type: text(r.offName, '유형 미제공') };
      const key = id ? JSON.stringify([id, record.name, record.title, record.type]) : `unknown:${index}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [record];
    });
  }
  function normalizePayload(payload, fetchedAt, day = dateKey(fetchedAt)) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.today) || !Array.isArray(payload.tomorrow)) throw error('FORMAT');
    return {
      today: { date: day, records: normalizeRecords(payload.today) },
      tomorrow: { date: nextDate(day), records: normalizeRecords(payload.tomorrow) },
      fetchedAt
    };
  }
  function summarize(records) {
    const ids = new Set(records.filter(r => r.id !== null).map(r => r.id));
    const types = new Map();
    for (const row of records) types.set(row.type, (types.get(row.type) || 0) + 1);
    return { people: ids.size, unknown: records.filter(r => r.id === null).length, records: records.length, types: [...types].sort((a, b) => a[0].localeCompare(b[0], 'ko')) };
  }
  function filterRecords(records, query = '', type = '') {
    const search = query.trim().toLocaleLowerCase('ko');
    return records.filter(r => (!search || r.name.toLocaleLowerCase('ko').includes(search)) && (!type || r.type === type));
  }
  function makeLoader({ fetchImpl, url, now = Date.now, timeoutMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout, AbortControllerImpl = AbortController }) {
    return async function loadAbsences({ signal } = {}) {
      // Retry once if midnight falls during the request. Never relabel yesterday's data.
      for (let attempt = 0; attempt < 2; attempt++) {
        const startedDay = dateKey(now());
        const abort = new AbortControllerImpl();
        let timedOut = false;
        let rejectInterrupted;
        const interrupted = new Promise((_, reject) => { rejectInterrupted = reject; });
        const onAbort = () => { abort.abort(); rejectInterrupted(Object.assign(new Error('취소됨'), { name: 'AbortError' })); };
        if (signal?.aborted) onAbort();
        else signal?.addEventListener('abort', onAbort, { once: true });
        const timer = setTimer(() => { timedOut = true; abort.abort(); rejectInterrupted(error('TIMEOUT')); }, timeoutMs);
        try {
          const work = async () => {
            const response = await fetchImpl(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: abort.signal });
            if (response.status === 401 || response.status === 403) throw error('AUTH');
            if (!response.ok) throw error('HTTP');
            const contentType = response.headers.get('content-type') || '';
            if (/text\/html/i.test(contentType)) throw error('AUTH');
            if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType)) throw error('FORMAT');
            try { return await response.json(); } catch { throw error('FORMAT'); }
          };
          const payload = await Promise.race([work(), interrupted]);
          const fetchedAt = now();
          if (dateKey(fetchedAt) !== startedDay) {
            if (attempt === 0) continue;
            throw error('ROLLOVER');
          }
          return normalizePayload(payload, fetchedAt, startedDay);
        } catch (e) {
          if (timedOut) throw error('TIMEOUT');
          if (signal?.aborted) throw Object.assign(new Error('취소됨'), { name: 'AbortError' });
          if (e?.code) throw e;
          throw error('NETWORK');
        } finally {
          clearTimer(timer);
          signal?.removeEventListener('abort', onAbort);
        }
      }
    };
  }
  function createController({ loadAbsences, onChange = () => {}, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, visible = true, interval = INTERVAL }) {
    let state = { status: 'idle', snapshot: null, error: null, inFlight: false, authStopped: false, lastAttemptAt: null };
    let timer, currentAbort, pending, generation = 0, disposed = false;
    const emit = () => onChange({ ...state });
    const clear = () => { if (timer !== undefined) clearTimer(timer); timer = undefined; };
    function schedule() {
      clear();
      if (disposed || !visible || state.inFlight || state.authStopped) return;
      const remaining = Math.max(0, (state.lastAttemptAt ?? now()) + interval - now());
      timer = setTimer(() => refresh(), Math.min(remaining, untilMidnight(now())));
    }
    function refresh({ force = false } = {}) {
      if (disposed) return Promise.resolve();
      if (state.inFlight && !force) return pending;
      clear();
      currentAbort?.abort();
      const token = ++generation;
      const requestAbort = new AbortController();
      currentAbort = requestAbort;
      state = { ...state, status: 'loading', error: null, inFlight: true, authStopped: false, lastAttemptAt: now() };
      emit();
      pending = Promise.resolve().then(() => loadAbsences({ signal: requestAbort.signal })).then(snapshot => {
        if (disposed || token !== generation) return;
        state = { ...state, status: 'ready', snapshot, error: null };
      }).catch(e => {
        if (disposed || token !== generation) return;
        state = { ...state, status: 'error', error: e?.code ? e : error('NETWORK'), authStopped: e?.code === 'AUTH' };
      }).finally(() => {
        if (disposed || token !== generation) return;
        state = { ...state, inFlight: false };
        emit();
        schedule();
      });
      return pending;
    }
    function setVisible(value) {
      visible = value;
      clear();
      if (!visible || disposed || state.authStopped || state.inFlight) return;
      const outdated = !state.snapshot || dateKey(now()) !== state.snapshot.today.date || now() - state.snapshot.fetchedAt >= interval;
      if (outdated && (!state.error || now() - state.lastAttemptAt >= 5000)) refresh();
      else schedule();
    }
    function dispose() { disposed = true; generation++; clear(); currentAbort?.abort(); }
    return { start: () => refresh(), refresh, setVisible, dispose, getState: () => ({ ...state }) };
  }
  return { INTERVAL, ZONE, dateKey, nextDate, untilMidnight, error, normalizePayload, normalizeRecords, summarize, filterRecords, makeLoader, createController };
}
