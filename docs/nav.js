/* 뒤로가기 처리 — 폰에서 뒤로 한 번에 앱이 꺼지던 문제.
   오버레이(시트·드릴다운·패널·사진뷰어)가 떠 있으면 그걸 먼저 닫고,
   탭을 옮겼으면 이전 탭으로, 루트에서는 한 번 더 눌러야 나간다. */
'use strict';

const Nav = (() => {
  const layers = [];        // {name, close}
  let armed = false;        // 종료 확인 대기
  let armTimer = null;

  function ensureBase() {
    // 뒤로 눌렀을 때 소비할 여분의 히스토리를 하나 만들어 둔다
    if (!history.state || !history.state.hos) history.replaceState({ hos: 'base' }, '');
  }
  function pushLayer(name, close) {
    layers.push({ name, close });
    history.pushState({ hos: 'layer', n: layers.length }, '');
  }
  function dropLayer(name) {
    const i = layers.map((l) => l.name).lastIndexOf(name);
    if (i >= 0) layers.splice(i, 1);
  }
  function toast(msg) {
    let t = document.getElementById('navToast');
    if (!t) { t = document.createElement('div'); t.id = 'navToast'; t.className = 'navtoast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1800);
  }

  function onPop() {
    // 1) 떠 있는 오버레이부터 닫는다
    if (layers.length) {
      const top = layers.pop();
      try { top.close(); } catch (e) { /* 닫기 실패해도 진행 */ }
      history.pushState({ hos: 'base' }, '');   // 소비한 만큼 다시 채워 둔다
      return;
    }
    // 2) 챗 탭이 아니면 챗으로 되돌린다
    if (typeof state !== 'undefined' && state.tab && state.tab !== 'chat') {
      go('chat');
      history.pushState({ hos: 'base' }, '');
      return;
    }
    // 3) 루트에서 한 번 더 눌러야 나간다
    if (!armed) {
      armed = true;
      toast('한 번 더 누르면 앱을 나갑니다');
      clearTimeout(armTimer);
      armTimer = setTimeout(() => { armed = false; }, 2000);
      history.pushState({ hos: 'base' }, '');
      return;
    }
    // armed 상태면 그대로 둔다 → 브라우저/OS가 뒤로 처리(앱 종료)
  }

  function start() {
    ensureBase();
    history.pushState({ hos: 'base' }, '');   // 여분 한 칸
    window.addEventListener('popstate', onPop);
  }
  return { start, pushLayer, dropLayer, toast, get depth() { return layers.length; } };
})();

/* const로 선언한 전역은 window에 붙지 않는다. 다른 파일에서 window.Nav로 확인하므로 명시적으로 노출한다. */
window.Nav = Nav;
