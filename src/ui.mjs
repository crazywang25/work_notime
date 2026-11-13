export function mountNextep(win, core, options) {
  const d = win.document;
  const demo = Boolean(options.demo);
  d.documentElement.lang = 'ko';
  d.title = `${demo ? '[가상 데이터] ' : ''}개인 NEXTEP · 부서원 비근무 현황`;
  const oldStyle = d.getElementById('personal-nextep-style');
  oldStyle?.remove();
  const style = d.createElement('style');
  style.id = 'personal-nextep-style';
  style.textContent = options.css;
  d.head.append(style);
  if (!win.getComputedStyle(d.documentElement).getPropertyValue('--violet').trim()) {
    throw new Error('브라우저 정책 때문에 개인화 화면의 스타일을 적용하지 못했습니다.');
  }
  let controller;
  let selected = 'today';
  let query = '';
  let filter = '';
  let lastState;
  let toastTimer;
  const paths = {
    focus: 'M4 4h6v16H4z M14 4h6v16h-6',
    people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2 M7 14h2 M13 14h2 M7 18h2',
    mail: 'M3 5h18v14H3z M3 5l9 8 9-8',
    check: 'M5 12l4 4L19 6',
    refresh: 'M20 7v5h-5 M4 17v-5h5 M6.1 7a7 7 0 0 1 11.55-1.7L20 8 M4 16l2.35 2.7A7 7 0 0 0 17.9 17',
    search: 'M21 21l-5-5 M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14',
    arrow: 'M7 17L17 7 M7 7h10v10',
    clock: 'M12 8v5l3 2 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
    info: 'M12 11v6 M12 7h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'
  };
  function icon(name, className = '') {
    const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: `icon ${className}` })) svg.setAttribute(key, value);
    const path = d.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', paths[name] || paths.info);
    svg.append(path);
    return svg;
  }
  function el(tag, props = {}, children = []) {
    const node = d.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
  }
  const button = (text, className, action, children = []) => el('button', { type: 'button', class: className, onclick: action }, [...children, el('span', { text })]);
  const toast = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  function notify(message) {
    toast.textContent = message;
    toast.classList.add('shown');
    win.clearTimeout(toastTimer);
    toastTimer = win.setTimeout(() => toast.classList.remove('shown'), 3500);
  }
  function navButton(name, label, action, active = false) {
    const b = el('button', { type: 'button', class: `nav-button${active ? ' selected' : ''}`, title: label, 'aria-label': label, onclick: action }, [icon(name)]);
    if (active) b.setAttribute('aria-current', 'page');
    return b;
  }
  const goAbsences = () => { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); heading.focus({ preventScroll: true }); };
  const prepare = () => notify('이 기능은 준비 중입니다. 현재는 부서원 비근무 조회를 사용할 수 있어요.');
  const nav = el('nav', { class: 'rail', 'aria-label': '주 메뉴' }, [
    el('div', { class: 'brand', text: 'p', title: '개인 NEXTEP' }),
    navButton('focus', 'Smart Focus', () => win.scrollTo({ top: 0, behavior: 'smooth' })),
    navButton('people', '부서원 비근무 현황', goAbsences, true),
    navButton('calendar', '일정 · 준비 중', prepare),
    navButton('mail', '메일 · 준비 중', prepare),
    el('div', { class: 'rail-line' }),
    navButton('grid', '추가 기능 · 준비 중', prepare),
    el('span', { class: 'rail-bottom', text: 'MY', title: '개인용 화면' })
  ]);
  const side = el('aside', { class: 'todo-panel', 'aria-label': 'To-Do List 준비 화면' }, [
    el('div', { class: 'todo-heading' }, [el('h2', { text: 'To-Do List' }), el('span', { class: 'plus', text: '+' })]),
    el('div', { class: 'todo-tabs' }, [el('span', { class: 'active', text: '전체' }), el('span', { text: 'My' }), el('span', { text: '공유' })]),
    el('div', { class: 'todo-empty' }, [el('div', { class: 'todo-graphic' }, [icon('check')]), el('h3', { text: '나에게 맞는 업무 공간' }), el('p', { text: '필요한 기능을 하나씩 담아보세요.\nTo-Do 연동은 준비 중입니다.' })]),
    el('div', { class: 'side-note' }, [el('span', { class: 'eyebrow', text: 'FIRST CONNECTION' }), el('strong', { text: '부서원 비근무 현황' }), el('p', { text: '오늘과 내일의 현황부터\n한눈에 확인할 수 있어요.' }), button('현황 보러가기', 'text-button', goAbsences, [icon('arrow')])]),
    el('div', { class: 'side-version', text: 'PERSONAL NEXTEP / 01' })
  ]);
  const sourceLink = el('a', { class: 'ep-link', href: 'https://portal.posco.net/', target: '_blank', rel: 'noopener' }, [el('span', { class: 'ep-symbol', text: 'EP' }), d.createTextNode('EP 바로가기'), icon('arrow')]);
  const header = el('header', { class: 'topbar' }, [el('div', { class: 'top-title' }, [icon('focus'), el('h1', { text: 'Smart Focus' }), el('span', { class: 'personal-tag', text: '개인용' })]), sourceLink]);
  const todayValue = el('strong', { text: '—' });
  const tomorrowValue = el('strong', { text: '—' });
  const connection = el('span', { class: 'connection-label', text: '연결 확인 중' });
  const intro = el('section', { class: 'intro' }, [el('div', {}, [el('div', { class: 'eyebrow', text: 'MY WORKSPACE' }), el('h2', { text: '오늘의 업무, 조금 더 가볍게.' }), el('p', { text: '필요한 정보만 모아 나의 하루를 준비하세요.' })]), el('div', { class: 'connection' }, [el('span', { class: 'status-dot' }), connection])]);
  const summary = el('section', { class: 'summary-strip', 'aria-label': '비근무 요약' }, [
    el('div', { class: 'summary-name' }, [icon('people'), el('span', { text: '부서원 비근무' })]),
    el('div', { class: 'summary-number' }, [el('span', { text: '오늘' }), todayValue]),
    el('div', { class: 'summary-number' }, [el('span', { text: '내일' }), tomorrowValue]),
    el('div', { class: 'summary-caption', text: '원본에 등록된 비근무 현황 기준' })
  ]);
  const heading = el('h2', { id: 'absence-heading', tabindex: '-1', text: '부서원 비근무 현황' });
  const refresh = button('새로고침', 'refresh-button', () => controller.refresh(), [icon('refresh')]);
  const dayTab = key => el('button', { type: 'button', id: `day-${key}`, class: 'day-tab', role: 'tab', 'aria-controls': 'absence-results', onclick: () => { selected = key; filter = ''; render(lastState); } });
  const todayTab = dayTab('today');
  const tomorrowTab = dayTab('tomorrow');
  const tabs = el('div', { class: 'day-tabs', role: 'tablist', 'aria-label': '조회 날짜' }, [todayTab, tomorrowTab]);
  tabs.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    selected = e.key === 'Home' ? 'today' : e.key === 'End' ? 'tomorrow' : selected === 'today' ? 'tomorrow' : 'today';
    filter = '';
    render(lastState);
    (selected === 'today' ? todayTab : tomorrowTab).focus();
  });
  const autoLabel = el('span', { text: '5분마다 자동 갱신' });
  const meta = el('span', { class: 'last-updated', text: '아직 조회하지 않았습니다' });
  const searchInput = el('input', { id: 'name-search', type: 'search', placeholder: '이름으로 검색', autocomplete: 'off', 'aria-label': '부서원 이름 검색', oninput: e => { query = e.target.value; renderList(lastState); } });
  const typeSelect = el('select', { id: 'type-filter', 'aria-label': '비근무 유형 필터', onchange: e => { filter = e.target.value; renderList(lastState); } });
  const filters = el('div', { class: 'filters' }, [el('label', { class: 'search-box', for: 'name-search' }, [icon('search'), searchInput]), el('label', { class: 'type-select', for: 'type-filter' }, [el('span', { class: 'sr-only', text: '비근무 유형' }), typeSelect])]);
  const alert = el('div', { class: 'notice', role: 'status', 'aria-live': 'polite' });
  const resultTitle = el('h3', { text: '오늘의 비근무' });
  const count = el('span', { class: 'count-label' });
  const typeCounts = el('div', { class: 'type-counts', 'aria-label': '유형별 건수' });
  const rows = el('div', { class: 'people-grid' });
  const results = el('div', { id: 'absence-results', role: 'tabpanel', 'aria-labelledby': 'day-today', class: 'results' }, [el('div', { class: 'results-heading' }, [resultTitle, count]), typeCounts, rows]);
  const card = el('section', { class: 'absence-card', 'aria-labelledby': 'absence-heading' }, [
    el('div', { class: 'card-heading' }, [el('div', { class: 'card-title' }, [el('span', { class: 'title-icon' }, [icon('people')]), el('div', {}, [el('span', { class: 'eyebrow', text: 'TEAM AVAILABILITY' }), heading])]), refresh]),
    el('div', { class: 'day-toolbar' }, [tabs, el('div', { class: 'update-info' }, [el('span', { class: 'auto-label' }, [el('span', { class: 'tiny-dot' }), autoLabel]), meta])]),
    alert, filters, results,
    el('div', { class: 'card-footnote' }, [icon('info'), el('span', { text: 'EP에 등록된 현황입니다. 목록에 없는 부서원의 근무 여부를 의미하지 않습니다.' })])
  ]);
  const futureCard = (name, title, body) => el('section', { class: 'future-card' }, [el('div', { class: 'future-heading' }, [el('div', { class: 'future-name' }, [icon(name), el('h3', { text: title })]), el('span', { class: 'coming-badge', text: '준비 중' })]), el('p', { text: body }), el('div', { class: 'future-lines' }, [el('span'), el('span')])]);
  const future = el('div', { class: 'future-grid' }, [futureCard('calendar', '나의 일정', '오늘의 일정과 업무 흐름을 이곳에 모을 예정이에요.'), futureCard('mail', '메일 브리핑', '필요한 메일을 빠르게 확인할 수 있도록 준비하고 있어요.')]);
  const footer = el('footer', { class: 'footer' }, [el('span', { text: 'PERSONAL NEXTEP' }), el('span', { text: '필요한 기능부터, 나의 방식으로.' })]);
  const content = el('div', { class: 'content' }, [intro, summary, card, future, footer]);
  if (demo) content.prepend(el('div', { class: 'demo-banner', role: 'note', text: '가상 데이터 미리보기 · 실제 부서원 정보가 아닙니다.' }));
  const shell = el('div', { class: 'workspace' }, [nav, side, el('main', { class: 'main' }, [header, content])]);
  d.body.replaceChildren(el('a', { href: '#absence-heading', class: 'skip-link', text: '비근무 현황으로 바로 이동' }), shell, toast);
  if (options.demoControls) options.demoControls(d, content);
  const clockFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: core.ZONE, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const humanDate = key => new Intl.DateTimeFormat('ko-KR', { timeZone: core.ZONE, month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${key}T00:00:00+09:00`));
  const compactDate = key => key.slice(5).replace('-', '.');
  function numberLabel(records) {
    const s = core.summarize(records);
    return s.unknown ? `${s.people}명 + 확인 필요` : `${s.people}명`;
  }
  function render(state) {
    if (!state) return;
    lastState = state;
    const snapshot = state.snapshot;
    const nowDay = core.dateKey();
    const outdatedDay = snapshot && snapshot.today.date !== nowDay;
    const day = snapshot?.today.date || nowDay;
    todayTab.textContent = `오늘 ${compactDate(day)}`;
    tomorrowTab.textContent = `내일 ${compactDate(snapshot?.tomorrow.date || core.nextDate(day))}`;
    for (const [key, tab] of [['today', todayTab], ['tomorrow', tomorrowTab]]) {
      tab.setAttribute('aria-selected', String(selected === key));
      tab.tabIndex = selected === key ? 0 : -1;
      tab.classList.toggle('active', selected === key);
    }
    results.setAttribute('aria-labelledby', `day-${selected}`);
    results.setAttribute('aria-busy', String(state.inFlight));
    refresh.disabled = state.inFlight;
    refresh.classList.toggle('loading', state.inFlight);
    refresh.lastChild.textContent = state.inFlight ? '조회 중' : state.authStopped ? '로그인 후 재시도' : '새로고침';
    autoLabel.textContent = state.authStopped ? '자동 갱신 중지' : d.visibilityState === 'hidden' ? '자동 갱신 대기' : '5분마다 자동 갱신';
    connection.textContent = demo ? '가상 데이터' : state.authStopped ? '로그인 확인 필요' : state.error ? '연결 확인 필요' : snapshot ? 'EP 연결됨' : '연결 확인 중';
    connection.parentElement.classList.toggle('warning', Boolean(state.error));
    todayValue.textContent = snapshot ? numberLabel(snapshot.today.records) : '—';
    tomorrowValue.textContent = snapshot ? numberLabel(snapshot.tomorrow.records) : '—';
    meta.textContent = snapshot ? `마지막 성공 ${snapshot.today.date} ${clockFormat.format(snapshot.fetchedAt)}` : '아직 조회하지 않았습니다';
    const message = state.error ? `${state.error.message}${snapshot ? ' 아래는 이전 조회 결과입니다.' : ''}` : outdatedDay ? '날짜가 바뀌었습니다. 표시된 날짜의 이전 결과이며 새 현황을 조회 중입니다.' : '';
    alert.hidden = !message;
    alert.textContent = message;
    alert.classList.toggle('error', Boolean(state.error));
    searchInput.disabled = !snapshot;
    typeSelect.disabled = !snapshot;
    const available = core.summarize(snapshot?.[selected].records || []).types.map(([type]) => type);
    if (filter && !available.includes(filter)) filter = '';
    typeSelect.replaceChildren(el('option', { value: '', text: '모든 유형' }), ...available.map(type => el('option', { value: type, text: type })));
    typeSelect.value = filter;
    renderList(state);
  }
  function renderList(state) {
    if (!state) return;
    const day = state.snapshot?.[selected];
    const all = day?.records || [];
    const filtered = core.filterRecords(all, query, filter);
    const summary = core.summarize(all);
    const visibleSummary = core.summarize(filtered);
    resultTitle.textContent = day ? `${humanDate(day.date)} 비근무` : `${selected === 'today' ? '오늘' : '내일'}의 비근무`;
    count.textContent = day ? `${query || filter ? `검색 결과 ${visibleSummary.records}건 / ` : ''}총 ${summary.people}명${summary.unknown ? ` · 식별정보 없는 ${summary.unknown}건` : ''}` : '';
    typeCounts.replaceChildren(...summary.types.map(([name, amount]) => el('span', { class: `type-chip ${typeColor(name)}` }, [d.createTextNode(name), el('strong', { text: `${amount}건` })])));
    rows.replaceChildren();
    if (!day) {
      rows.append(el('div', { class: 'empty-state' }, [icon(state.error ? 'info' : 'refresh', state.inFlight ? 'spinning' : ''), el('strong', { text: state.error ? '현황을 불러오지 못했습니다' : '부서원 현황을 불러오고 있어요' }), el('p', { text: state.error ? '로그인과 연결 상태를 확인한 뒤 새로고침해 주세요.' : '오늘과 내일의 정보를 함께 확인합니다.' })]));
      return;
    }
    if (!filtered.length) {
      rows.append(el('div', { class: 'empty-state' }, [icon(all.length ? 'search' : 'check'), el('strong', { text: all.length ? '검색 조건에 맞는 부서원이 없습니다' : '등록된 비근무 현황이 없습니다' }), el('p', { text: all.length ? '다른 이름이나 유형으로 검색해 보세요.' : `${humanDate(day.date)} 기준 원본 조회 결과입니다.` }), ...(all.length ? [button('검색 조건 초기화', 'text-button', () => { query = ''; filter = ''; searchInput.value = ''; render(state); })] : [])]));
      return;
    }
    for (const person of filtered) {
      const avatar = el('span', { class: `avatar ${typeColor(person.type)}`, 'aria-hidden': 'true', text: Array.from(person.name)[0] });
      rows.append(el('article', { class: 'person-card' }, [avatar, el('div', { class: 'person-details' }, [el('div', { class: 'person-name-line' }, [el('h4', { text: person.name }), el('span', { class: 'person-title', text: person.title })]), el('span', { class: `absence-type ${typeColor(person.type)}`, text: person.type })])]));
    }
  }
  function typeColor(type) {
    if (/휴가|연차|반차|휴무/.test(type)) return 'rose';
    if (/출장|파견/.test(type)) return 'blue';
    if (/교육|연수/.test(type)) return 'green';
    return 'purple';
  }
  controller = core.createController({
    loadAbsences: options.loadAbsences,
    onChange: render,
    visible: d.visibilityState !== 'hidden',
    setTimer: win.setTimeout.bind(win),
    clearTimer: win.clearTimeout.bind(win)
  });
  const onVisibility = () => { controller.setVisible(d.visibilityState !== 'hidden'); render(controller.getState()); };
  const onPageShow = event => { if (event.persisted) controller.setVisible(d.visibilityState !== 'hidden'); };
  const onPageHide = event => { if (event.persisted) controller.setVisible(false); else dispose(); };
  d.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pageshow', onPageShow);
  win.addEventListener('pagehide', onPageHide);
  function dispose() {
    controller.dispose();
    win.clearTimeout(toastTimer);
    d.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pageshow', onPageShow);
    win.removeEventListener('pagehide', onPageHide);
  }
  render(controller.getState());
  controller.start();
  return { version: 1, refresh: () => controller.refresh(), dispose };
}
