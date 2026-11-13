export function launchNextep(createCore, mountNextep, css) {
  const source = window;
  const allowedOrigin = 'https://portal.posco.net';
  if (source.location.origin !== allowedOrigin) {
    source.alert('로그인한 NEXTEP 탭(portal.posco.net)에서 개인 NEXTEP 즐겨찾기를 눌러 주세요.');
    return;
  }
  const key = '__personalNextepV1__';
  const previous = source[key];
  try {
    if (previous && !previous.closed && previous[key]?.version === 1) {
      previous.focus();
      previous[key].refresh();
      return;
    }
  } catch { /* A navigated tab must not be read or overwritten. */ }
  const target = source.open('', 'NEXTEP_PERSONAL_V1');
  if (!target) {
    source.alert('새 탭을 열 수 없습니다. 브라우저의 차단 안내를 확인해 주세요.');
    return;
  }
  try {
    if (target[key]?.version === 1) {
      source[key] = target;
      target.focus();
      target[key].refresh();
      return;
    }
    if (target.location.href !== 'about:blank') {
      source.alert('개인 NEXTEP 탭이 다른 페이지로 이동했습니다. 그 탭을 닫은 뒤 다시 실행해 주세요.');
      return;
    }
    const core = createCore();
    const loadAbsences = core.makeLoader({
      fetchImpl: target.fetch.bind(target),
      url: `${allowedOrigin}/api/attend/briefing`,
      setTimer: target.setTimeout.bind(target),
      clearTimer: target.clearTimeout.bind(target),
      AbortControllerImpl: target.AbortController
    });
    source[key] = target;
    target[key] = mountNextep(target, core, { css, loadAbsences });
    target.focus();
  } catch {
    source.alert('새 탭에서 개인화 화면을 실행하지 못했습니다. 브라우저 정책 또는 로그인 상태를 확인해 주세요.');
  }
}
