/* 전체화면 패널 3종 — 자주 묻는 것 / 객실 상태 보드 / 요금 계산기
   Drill과 같은 껍데기를 쓰되 단계는 없다. */
'use strict';

const Panels = (() => {
  const E = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const B = (t) => E(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';

  function shell() {
    let el = document.getElementById('panel');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'panel'; el.className = 'drill hide';
    el.innerHTML = `<header class="dtop">
        <div class="dtitle"><h3 id="pTitle"></h3><p id="pSub" class="meta"></p></div>
        <button class="iconbtn" data-close aria-label="닫기">✕</button>
      </header>
      <div class="dstage"><div class="dpage here" id="pBody"></div></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-close]').onclick = close;
    return el;
  }
  let token = 0;
  function close() {
    const el = shell(); el.classList.remove('open');
    const t = ++token;
    setTimeout(() => { if (t !== token) return; el.classList.add('hide'); el.querySelector('#pBody').innerHTML = ''; }, 240);
  }
  function open(title, sub, html, bind) {
    token++;
    const el = shell();
    el.querySelector('#pTitle').textContent = title;
    el.querySelector('#pSub').textContent = sub || '';
    const body = el.querySelector('#pBody');
    body.innerHTML = html; body.scrollTop = 0;
    el.classList.remove('hide');
    setTimeout(() => el.classList.add('open'), 10);
    if (bind) bind(body);
  }

  /* ── 1. 자주 묻는 것 ── */
  function faq() {
    let side = 'guest', cat = null, qy = '';
    const draw = (body) => {
      const list = side === 'guest' ? FAQ.guest : FAQ.staff;
      const cs = FAQ.cats(list);
      const q = qy.trim();
      const hit = list.filter((x) => (!cat || x.c === cat) &&
        (!q || (x.q + x.a + (x.say || '')).toLowerCase().includes(q.toLowerCase())));
      body.querySelector('#faqCats').innerHTML =
        `<button class="${cat ? '' : 'on'}" data-c="">전체 ${list.length}</button>` +
        cs.map((c) => `<button class="${cat === c ? 'on' : ''}" data-c="${E(c)}">${E(c)}</button>`).join('');
      body.querySelector('#faqList').innerHTML = hit.length ? hit.map((x, i) => `
        <details class="qa" ${q && hit.length <= 3 ? 'open' : ''}>
          <summary><span class="qc">${E(x.c)}</span><span class="qq">${E(x.q)}</span></summary>
          <div class="qa-body">
            <div class="ans">${B(x.a)}</div>
            ${x.say ? `<div class="sayrow">
              <div class="say"><span class="saylab">손님께 이렇게</span>${E(x.say)}</div>
              <button class="btn sm" data-say="${i}">복사</button></div>` : ''}
          </div>
        </details>`).join('') : `<div class="dempty">해당하는 질문이 없습니다.</div>`;
      body.querySelectorAll('#faqCats [data-c]').forEach((b) => b.onclick = () => { cat = b.dataset.c || null; draw(body); });
      body.querySelectorAll('[data-say]').forEach((b) => b.onclick = async () => {
        const t = hit[+b.dataset.say].say;
        try { await navigator.clipboard.writeText(t); b.textContent = '복사됨'; }
        catch { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); b.textContent = '복사됨'; }
        setTimeout(() => { b.textContent = '복사'; }, 1400);
      });
    };
    open('자주 묻는 것', '손님 응대 · 하우스맨 업무', `
      <div class="seg" id="faqSide" style="margin-bottom:10px">
        <button class="on" data-s="guest">손님 응대 ${FAQ.guest.length}</button>
        <button data-s="staff">하우스맨 업무 ${FAQ.staff.length}</button>
      </div>
      <div class="search" style="margin-bottom:10px"><input id="faqQ" placeholder="질문·답 검색" autocomplete="off"></div>
      <div class="dcrumb" id="faqCats" style="border:none;background:none;padding:0 0 10px"></div>
      <div id="faqList"></div>
      <p class="dnote">답은 전부 앱에 등록된 자료(공식홈·현장 업무카드)에서 가져왔습니다. 요금·운영시간은 변동이 크니 확정 안내는 프런트·1588-4888로.</p>`,
      (body) => {
        body.querySelectorAll('#faqSide [data-s]').forEach((b) => b.onclick = () => {
          side = b.dataset.s; cat = null;
          body.querySelectorAll('#faqSide [data-s]').forEach((x) => x.classList.toggle('on', x === b));
          draw(body);
        });
        body.querySelector('#faqQ').addEventListener('input', (e) => { qy = e.target.value; draw(body); });
        draw(body);
      });
  }

  /* ── 2. 객실 상태 보드 ── */
  function board() {
    const draw = (body) => {
      const ST = Store.ROOM_STATUS;
      const rooms = Store.load().rooms || [];
      const blds = Store.buildings().filter((b) => rooms.some((r) => r.bld === b.id));
      if (!blds.length) {
        body.querySelector('#bdBody').innerHTML = `<div class="dempty">등록된 객실이 없습니다.<br>지도에서 건물을 열면 확인된 객실이 자동 등록됩니다.</div>`;
        return;
      }
      const tally = (list) => { const t = {}; Object.keys(ST).forEach((k) => t[k] = 0); list.forEach((r) => { t[r.status] = (t[r.status] || 0) + 1; }); return t; };
      body.querySelector('#bdBody').innerHTML = blds.map((b) => {
        const mine = rooms.filter((r) => r.bld === b.id);
        const t = tally(mine);
        const floors = [...new Set(mine.map((r) => r.floor))].sort((x, y) => y - x);
        return `<div class="bdblock">
          <div class="bdhead"><b>${E(b.name)}</b><span>${mine.length}실</span></div>
          <div class="bdsum">${Object.keys(ST).map((k) => `<span class="bdc p-${ST[k].k}"><i>${t[k]}</i>${E(ST[k].ko)}</span>`).join('')}</div>
          <div class="bdfloors">${floors.map((f) => {
          const fr = mine.filter((r) => r.floor === f);
          return `<div class="bdf"><span class="bdfn">${f}F</span>
              <div class="bdcells">${fr.map((r) => `<button class="bdcell p-${(ST[r.status] || ST.unknown).k}" data-id="${E(r.id)}" title="${E(r.no)} ${E((ST[r.status] || ST.unknown).ko)}">${E(r.no)}</button>`).join('')}</div></div>`;
        }).join('')}</div></div>`;
      }).join('');
      body.querySelectorAll('[data-id]').forEach((c) => c.onclick = () => cycle(c.dataset.id, body));
    };
    const ORDER = ['unknown', 'vacant', 'occupied', 'out', 'broken'];
    const cycle = (id, body) => {
      const r = (Store.load().rooms || []).find((x) => x.id === id); if (!r) return;
      const next = ORDER[(ORDER.indexOf(r.status) + 1) % ORDER.length];
      try { Store.setRoomStatus(id, next, { worker: (Store.Auth.current || {}).name || '' }); draw(body); }
      catch (e) { alert(e.message); }
    };
    open('객실 상태 보드', '눌러서 상태 바꾸기 · 되돌리기 가능', `
      <div id="bdBody"></div>
      <p class="dnote">칸을 누르면 미확인 → 공실 → 재실 → 외출 → 고장 순으로 바뀝니다. 모든 변경은 기록에 남고 스튜디오에서 되돌릴 수 있습니다.
      프런트 재실 데이터가 연결되면 자동으로 채워집니다.</p>`, draw);
  }

  /* ── 3. 요금 계산기 ── */
  function calc() {
    const EARLY = [['14~15시', .10], ['12~14시', .30], ['09~12시', .50], ['09시 이전', 1.00]];
    const CANCEL = [['8일 전~', 0], ['6~7일 전', .20], ['4~5일 전', .35], ['2~3일 전', .60], ['1일 전', .80], ['당일 · 노쇼', 1.00]];
    const run = (body) => {
      const rate = Math.max(0, +body.querySelector('#cRate').value || 0);
      const calm = body.querySelector('#cCalm').checked;
      const ppl = Math.max(0, +body.querySelector('#cPpl').value || 0);
      const bed = Math.max(0, +body.querySelector('#cBed').value || 0);
      const early = body.querySelector('#cEarly').value;
      const cancel = body.querySelector('#cCancel').value;
      const perPerson = calm ? 50000 : 11000;
      const pplFee = ppl * perPerson;
      const bedFee = calm ? 0 : bed * 25000;
      const earlyFee = early ? rate * (+early) : 0;
      const cancelFee = cancel ? rate * (+cancel) : 0;
      const rows = [
        ['1박 요금', won(rate), ''],
        [`인원 추가 ${ppl}명`, won(pplFee), calm ? '소노캄 1인 50,000원 (침구 포함)' : '1인 11,000원'],
        [`침구 추가 ${bed}세트`, won(bedFee), calm ? '소노캄은 인원 추가 규정 적용 — 별도 청구 없음' : '세트당 25,000원'],
        ['조기 입실', won(earlyFee), early ? EARLY.find((x) => x[1] === +early)[0] : '해당 없음'],
      ];
      body.querySelector('#cOut').innerHTML = `
        <table class="pltab">${rows.map(([k, v, n]) => `<tr><th>${E(k)}</th><td><b>${E(v)}</b>${n ? `<div class="meta">${E(n)}</div>` : ''}</td></tr>`).join('')}</table>
        <div class="calctotal"><span>예상 합계</span><b>${won(rate + pplFee + bedFee + earlyFee)}</b></div>
        ${cancel ? `<div class="calccancel"><span>취소 위약금 (${E(CANCEL.find((x) => x[1] === +cancel)[0])})</span><b>${won(cancelFee)}</b></div>` : ''}
        <div class="warnbox">참고용 계산입니다. 성수기·객실 타입·프로모션에 따라 달라지므로 <b>확정 금액은 프런트 또는 1588-4888</b>에서 확인하세요. 하우스맨은 요금을 판단하지 않고 이관합니다.</div>`;
    };
    open('요금 계산기', '조기입실 · 인원/침구 추가 · 위약금', `
      <label>1박 요금</label><input type="number" id="cRate" inputmode="numeric" placeholder="예: 200000" value="200000">
      <div class="checkrow"><input type="checkbox" id="cCalm"><label for="cCalm" style="margin:0;font-size:13.5px;color:var(--text)">소노캄 객실 (소노캄A·A코너·B)</label></div>
      <div class="crow"><div><label>인원 추가</label><input type="number" id="cPpl" inputmode="numeric" value="0" min="0"></div>
        <div><label>침구 추가</label><input type="number" id="cBed" inputmode="numeric" value="0" min="0"></div></div>
      <label>조기 입실</label><select id="cEarly"><option value="">안 함</option>${EARLY.map(([k, v]) => `<option value="${v}">${k} (+${v * 100}%)</option>`).join('')}</select>
      <label>취소 시점 (성수기 금·토·연휴 기준)</label><select id="cCancel"><option value="">계산 안 함</option>${CANCEL.map(([k, v]) => `<option value="${v}">${k} (${v * 100}%)</option>`).join('')}</select>
      <div id="cOut" style="margin-top:16px"></div>`,
      (body) => {
        body.querySelectorAll('input,select').forEach((el) => el.addEventListener('input', () => run(body)));
        run(body);
      });
  }

  return { faq, board, calc, close, isOpen: () => { const el = document.getElementById('panel'); return !!el && !el.classList.contains('hide'); } };
})();
