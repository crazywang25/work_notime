import { createCore } from './core.mjs';
import { mountNextep } from './ui.mjs';

const core = createCore();
let mode = 'normal';
let app;
const fixtures = {
  today: [
    { lid: 'demo-01', nm: '김하늘', jt: '수석연구원', offName: '연차휴가' },
    { lid: 'demo-02', nm: '이서준', jt: '책임연구원', offName: '국내출장' },
    { lid: 'demo-03', nm: '박지우', jt: '연구원', offName: '해외연수' },
    { lid: 'demo-04', nm: '정다온', jt: '선임연구원', offName: '오후반차' },
    { lid: 'demo-05', nm: '최도윤', jt: '책임연구원', offName: '국내출장' },
    { lid: 'demo-06', nm: '윤서아', jt: '연구원', offName: '교육' }
  ],
  tomorrow: [
    { lid: 'demo-03', nm: '박지우', jt: '연구원', offName: '해외연수' },
    { lid: 'demo-07', nm: '한도현', jt: '수석연구원', offName: '국내출장' }
  ]
};
async function loadAbsences({ signal } = {}) {
  const selectedMode = mode;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, selectedMode === 'delay' ? 5000 : 450);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('취소됨', 'AbortError')); }, { once: true });
  });
  if (selectedMode === 'auth') throw core.error('AUTH');
  if (selectedMode === 'error') throw core.error('NETWORK');
  if (selectedMode === 'timeout') throw core.error('TIMEOUT');
  const payload = selectedMode === 'empty' ? { today: [], tomorrow: [] } : selectedMode === 'missing' ? { today: [{ nm: '가상 사용자', offName: '교육' }], tomorrow: [] } : selectedMode === 'unsafe' ? { today: [{ lid: 'demo-safe', nm: '<img src=x onerror=alert(1)>', jt: '<script>테스트</script>', offName: '<b>교육</b>' }], tomorrow: [] } : fixtures;
  return core.normalizePayload(payload, Date.now());
}
function controls(d, content) {
  const panel = d.createElement('div');
  panel.className = 'demo-controls';
  const label = d.createElement('label');
  label.textContent = '가상 상태 테스트 ';
  const select = d.createElement('select');
  select.setAttribute('aria-label', '가상 데이터 상태');
  for (const [value, text] of [['normal', '정상'], ['empty', '빈 목록'], ['delay', '5초 지연'], ['error', '연결 실패'], ['auth', '로그인 만료'], ['timeout', '시간 초과'], ['missing', '누락 필드'], ['unsafe', 'HTML 문자를 포함한 이름']]) {
    const option = d.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.addEventListener('change', () => { mode = select.value; app.refresh(); });
  label.append(select);
  panel.append(label);
  content.append(panel);
}
const css = await fetch(new URL('./style.css', import.meta.url)).then(r => { if (!r.ok) throw Error('미리보기 스타일을 불러오지 못했습니다.'); return r.text(); });
app = mountNextep(window, core, { css, demo: true, loadAbsences, demoControls: controls });
