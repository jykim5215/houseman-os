/* 하우스맨 노트 — UI (Style C: Command Chat) */
'use strict';
const APP_VERSION = '0.2.0';

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const db = () => Store.load();
const W = () => Store.worker || '?';
const BATT_KO = { ok: ['양호', 'k'], low: ['부족', 'w'], bad: ['불량', 'd'] };
const COND_KO = { ok: ['정상', 'k'], broken: ['고장', 'd'], lost: ['분실', 'd'] };
const KIND_KO = { voc: 'VOC', notice: '공지', note: '특이', room_issue: '객실' };
const ORIGIN = { internal_notice: ['① 내부 공지', 'i-note'], vinfo: ['② VINFO', 'i-doc'], official: ['③ 공식홈', 'i-globe'], memo: ['④ 메모', 'i-doc'] };

const state = { seg: 'stock', q: '', shortOnly: false, xp: null };

/* ── 시트 ── */
function sheet(html) {
  $('#sheetBody').innerHTML = html;
  $('#sheetbg').classList.remove('hide');
  requestAnimationFrame(() => $('#sheet').classList.add('open'));
}
function closeSheet() {
  $('#sheet').classList.remove('open');
  $('#sheetbg').classList.add('hide');
}
$('#sheetbg').onclick = closeSheet;

/* ── 챗 ── */
function addMsg(html, cls) {
  const d = document.createElement('div');
  d.className = cls || 'm-ai';
  d.innerHTML = html;
  $('#msgs').appendChild(d);
  d.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return d;
}
const aiMsg = (who, body) => addMsg(`<div class="who"><span class="dot">H</span>${who}</div><div class="body">${body}</div>`);

function citeChips(sources) {
  if (!sources || !sources.length) return '';
  return '<div style="margin-top:8px">' + sources.map((s, i) =>
    `<span class="cite" data-cite='${esc(JSON.stringify(s))}'>${s.n || i + 1}</span>`).join(' ') +
    ` <span class="meta">${sources.map((s) => s.title).join(' · ')}</span></div>`;
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('.cite');
  if (!c || !c.dataset.cite) return;
  const s = JSON.parse(c.dataset.cite);
  sheet(`<h3>${esc(s.title)}</h3>${s.snippet ? `<div class="quote">${esc(s.snippet)}</div>` : ''}<div class="meta">${esc(s.meta || '')}</div>`);
});

function briefingCard() {
  const lines = Logic.briefing(db());
  aiMsg('자동 교대 브리핑 · DB 집계',
    (lines.length ? '확인할 항목 ' + lines.length + '건입니다.<ul class="blist">' +
      lines.map((l) => `<li><span class="tag">${l.tag}</span><span>${esc(l.text)}</span></li>`).join('') + '</ul>'
      : '확인할 항목이 없습니다. ✅') +
    '<div style="margin-top:8px" class="meta">근거: 실시간 DB 집계 · ' + new Date().toTimeString().slice(0, 5) + '</div>');
}

function renderProposal(p) {
  const m = aiMsg('승인형 편집 · 저장 전 확인', `
    <div class="proposal">
      <div class="head"><svg class="ic sm"><use href="#i-note"/></svg>변경 미리보기 — 승인 후에만 반영</div>
      <div class="prow"><b>${esc(p.summary)}</b>
        ${p.before ? `<span class="why">현재: ${p.before.map(([k, v]) => `${k} <span class="old">${esc(String(v ?? '—'))}</span>`).join(' · ')} · 사유: ${esc(p.changes[0].reason || '')}</span>` : ''}</div>
      <div class="acts"><button class="btn filled" data-ok>승인하고 저장</button><button class="btn" data-no>취소</button></div>
    </div>`);
  m.querySelector('[data-ok]').onclick = () => {
    try {
      const ids = Store.applyChanges(p.changes, { worker: W(), channel: 'ai' });
      m.querySelector('.proposal').outerHTML =
        `<div class="okmsg">✅ <b>저장 완료</b> — 감사 로그 ${ids.map((i) => '#' + i.slice(-4)).join(', ')} <button class="btn" style="padding:3px 12px;font-size:11.5px" data-undo>↩ 취소</button></div>`;
      const ub = m.querySelector('[data-undo]');
      if (ub) ub.onclick = () => { ids.slice().reverse().forEach((id) => { try { Store.undo(id, W()); } catch {} }); ub.outerHTML = '<span class="meta">복원됨</span>'; refreshAll(); };
      refreshAll();
    } catch (e) { alert(e.message); }
  };
  m.querySelector('[data-no]').onclick = () => {
    m.querySelector('.proposal').outerHTML = '<div class="body" style="border:none;box-shadow:none;padding:6px 0;color:var(--dim)">취소됨 — 저장되지 않았습니다.</div>';
  };
}

function send(text) {
  text = (text || $('#inp').value).trim();
  if (!text) return;
  $('#inp').value = '';
  addMsg(esc(text), 'm-user');
  const p = Logic.parseCommand(db(), text);
  if (p) {
    if (p.kind === 'proposal') return renderProposal(p);
    if (p.kind === 'clarify') return aiMsg('되묻기', `❓ ${esc(p.question)}${p.candidates ? '<ul class="blist">' + p.candidates.map((c) => `<li>${esc(c)}</li>`).join('') + '</ul>' : ''}`);
    if (p.kind === 'loan') {
      const eqRow = db().equipment.find((e) => e.id === p.equipmentId);
      return renderProposal({
        summary: `${eqRow.label} 대여 — ${W()}`, before: [['대여자', eqRow.borrower || '—']],
        changes: [
          { entity: 'equipment', entityId: eqRow.id, field: 'borrower', newValue: W(), reason: text },
          { entity: 'equipment', entityId: eqRow.id, field: 'loanedAt', newValue: Store.now(), reason: text },
          { entity: 'equipment', entityId: eqRow.id, field: 'dueAt', newValue: Store.today() + ' 23:59', reason: text },
        ],
      });
    }
  }
  const a = Logic.answer(db(), text);
  if (a.kind === 'briefing') return briefingCard();
  if (a.refused) return aiMsg('근거 없음', `🤔 ${esc(a.internalText)}`);
  aiMsg(`근거 ${a.sources.length}건`,
    (a.customerText
      ? `<div class="dual"><div class="box cust"><span class="t">고객 안내용</span>${esc(a.customerText)}</div><div class="box"><span class="t">내부 참고 — 고객 노출 금지</span>${esc(a.internalText)}</div></div>`
      : esc(a.internalText)) +
    (a.conflict ? `<div class="conflict"><svg class="ic sm"><use href="#i-alert"/></svg><span>${esc(a.conflict)}</span></div>` : '') +
    citeChips(a.sources));
}
$('#sendBtn').onclick = () => send();
$('#inp').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
$$('#sugg button').forEach((b) => b.onclick = () => send(b.textContent));

/* 음성 입력 */
$('#micBtn').onclick = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return alert('이 브라우저는 음성 입력을 지원하지 않습니다.');
  const r = new SR();
  r.lang = 'ko-KR';
  $('#micBtn').classList.add('rec');
  r.onresult = (e) => { $('#inp').value = e.results[0][0].transcript; };
  r.onend = () => $('#micBtn').classList.remove('rec');
  r.onerror = () => $('#micBtn').classList.remove('rec');
  r.start();
};

/* ── 카운터 칩 ── */
function renderCounters() {
  const b = Logic.statusBoard(db());
  const lostN = b.lostUrgent.length;
  const defs = [
    ['short', '부족', b.shortage.length, 'd'],
    ['loan', '미반납', b.overdue.length, 'd'],
    ['lost', '기한임박', lostN, 'w'],
    ['defect', '미처리 하자', b.staleDefects.length, 'w'],
  ].filter(([, , n]) => n > 0);
  $('#counters').innerHTML = defs.length
    ? defs.map(([k, l, n, c]) => `<button class="counter ${c} ${state.xp === k ? 'on' : ''}" data-x="${k}">${l}<span class="n">${n}</span></button>`).join('')
    : '<span class="counter k">이상 없음 ✓</span>';
  $$('#counters [data-x]').forEach((btn) => btn.onclick = () => toggleExpand(btn.dataset.x));
  if (state.xp && !defs.some(([k]) => k === state.xp)) { state.xp = null; $('#xp').classList.remove('open'); }
  else if (state.xp) fillExpand();
}
function toggleExpand(k) {
  state.xp = state.xp === k ? null : k;
  $('#xp').classList.toggle('open', !!state.xp);
  renderCounters();
}
function fillExpand() {
  const b = Logic.statusBoard(db());
  const rows = [];
  if (state.xp === 'short') b.shortage.forEach((s) => rows.push([`${s.item} · ${s.location}`, `${s.qty}/${s.min}`, '보충', () => qtySheet(s)]));
  if (state.xp === 'loan') b.overdue.forEach((e) => rows.push([`${e.label} — ${e.borrower}`, Logic.daysSince(e.loanedAt) + '일', '반납', () => equipReturn(e)]));
  if (state.xp === 'lost') b.lostUrgent.forEach((l) => rows.push([`${l.desc} (${l.room || l.place})`, l.valuable ? '즉시' : 'D-' + Math.max(Logic.dday(l.deadline), 0), '인계', () => lostHandover(l)]));
  if (state.xp === 'defect') b.staleDefects.forEach((d) => rows.push([`${d.room} ${d.title} — 이관 ${Logic.daysSince(d.updatedAt)}일`, '', '보기', () => { state.seg = 'defects'; go('data'); }]));
  $('#xpBody').innerHTML = rows.map(([t, v, a], i) => `<div class="xrow"><span>${esc(t)}</span><span class="v">${v}</span><button class="fix" data-i="${i}">${a} →</button></div>`).join('') || '<div class="xrow meta">항목 없음</div>';
  $$('#xpBody [data-i]').forEach((btn) => btn.onclick = () => rows[Number(btn.dataset.i)][3]());
}

/* ── 빠른 처리 (칩 확장의 액션) ── */
function equipReturn(eq) {
  sheet(`<h3>${esc(eq.label)} 반납 처리</h3>
    <div class="quote">대여자 ${esc(eq.borrower)} · ${esc(eq.loanedAt || '')} 대여</div>
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>반납 저장</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => {
    Store.applyChanges([
      { entity: 'equipment', entityId: eq.id, field: 'borrower', newValue: null, reason: '반납' },
      { entity: 'equipment', entityId: eq.id, field: 'loanedAt', newValue: null, reason: '반납' },
      { entity: 'equipment', entityId: eq.id, field: 'dueAt', newValue: null, reason: '반납' },
    ], { worker: W() });
    closeSheet(); refreshAll();
  };
}
function lostHandover(l) {
  sheet(`<h3>습득물 인계 — ${esc(l.desc)}</h3>
    <div class="quote">${esc(l.room || l.place || '')} · ${l.valuable ? '귀중품' : '일반'} · 발견 ${esc(l.foundAt)}</div>
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>상황실 인계 완료</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => {
    Store.applyChanges([
      { entity: 'lost', entityId: l.id, field: 'status', newValue: 'handed_over', reason: '상황실 인계' },
      { entity: 'lost', entityId: l.id, field: 'handedAt', newValue: Store.now(), reason: '상황실 인계' },
    ], { worker: W() });
    closeSheet(); refreshAll();
  };
}

/* ── 수량 시트 (재고 편집 = diff + 사유) ── */
function qtySheet(s) {
  let val = s.qty;
  sheet(`<h3>${esc(s.item)} <span class="meta">· ${esc(s.location)}</span></h3>
    <div class="diffline" id="qd"></div>
    <div class="stepper">
      <button data-d="-10">−10</button><button data-d="-1">−</button>
      <div class="val"><span id="qv">${val}</span><small>최소 ${s.min}</small></div>
      <button data-d="1">＋</button><button data-d="10">＋10</button>
    </div>
    <label>사유</label><input type="text" id="qreason" placeholder="예: 세탁 입고, 객실 지급">
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>승인하고 저장</button></div>`);
  const upd = () => {
    $('#qv').textContent = val;
    $('#qd').innerHTML = val === s.qty ? '<span class="meta">변경 없음</span>'
      : `수량 <span class="old">${s.qty}</span> → <span class="new">${val}</span>${val < s.min ? ' · ⚠️ 최소 기준 미만' : ''}`;
  };
  upd();
  $$('#sheetBody [data-d]').forEach((btn) => btn.onclick = () => { val = Math.max(0, val + Number(btn.dataset.d)); upd(); });
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => {
    if (val !== s.qty) Store.applyChanges([{ entity: 'stock', entityId: s.id, field: 'qty', newValue: val, reason: $('#qreason').value.trim() || null }], { worker: W() });
    closeSheet(); refreshAll();
  };
}

/* ── 소스&데이터 탭 ── */
function renderData() {
  $$('#seg button').forEach((b) => b.classList.toggle('on', b.dataset.c === state.seg));
  const host = $('#dataHost');
  const q = state.q.trim();
  const hit = (t) => !q || t.includes(q);
  const d = db();
  let html = '';

  if (state.seg === 'stock') {
    html += `<div class="toolrow"><div class="search">🔍<input id="dq" value="${esc(q)}" placeholder="품목·위치 검색"></div>
      <button class="pill ${state.shortOnly ? 'tonal' : ''}" id="shortT">부족만</button>
      <button class="pill" id="csvBtn">CSV 내보내기</button></div>`;
    d.stock.filter((s) => hit(s.item + s.location)).filter((s) => !state.shortOnly || s.qty < s.min).forEach((s) => {
      const cls = s.qty < s.min ? 'alarm' : s.qty < s.min * 1.2 ? 'warn2' : '';
      const st = s.qty < s.min ? '<span class="st d">부족</span>' : s.qty < s.min * 1.2 ? '<span class="st w">주의</span>' : '<span class="st k">정상</span>';
      html += `<div class="rowitem ${cls}"><div class="bodyc"><div class="tit">${esc(s.item)} ${st}</div>
        <div class="sub">${esc(s.location)} · ${esc((s.updatedAt || '').slice(5, 16))} ${esc(s.updatedBy || '')}${s.note ? ' · ' + esc(s.note) : ''}</div></div>
        <div class="qty">${s.qty}<small>/${s.min}</small></div><button class="act" data-qty="${s.id}">✎ 수정</button></div>`;
    });
  }

  if (state.seg === 'equipment') {
    html += `<div class="toolrow"><div class="search">🔍<input id="dq" value="${esc(q)}" placeholder="번호·대여자 검색"></div></div>`;
    d.equipment.filter((e) => hit(e.label + (e.borrower || ''))).forEach((e) => {
      const [bk, bc] = BATT_KO[e.battery] || [e.battery, 'k'];
      const [ck, cc] = COND_KO[e.condition] || [e.condition, 'k'];
      const overdue = e.borrower && e.dueAt && e.dueAt < Store.now();
      html += `<div class="rowitem ${overdue || e.condition !== 'ok' ? 'alarm' : e.battery === 'bad' ? 'warn2' : ''}">
        <div class="bodyc"><div class="tit">${esc(e.label)} <span class="st ${bc}">배터리 ${bk}</span> <span class="st ${cc}">${ck}</span>${overdue ? ' <span class="st d">미반납</span>' : ''}</div>
        <div class="sub">${e.borrower ? esc(e.borrower) + ' · ' + esc(e.loanedAt || '') : '보관중'}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
        <button class="act" data-eq="${e.id}">관리</button></div>`;
    });
  }

  if (state.seg === 'lost') {
    html += `<div class="fabrow"><button class="btn filled" id="lostAdd">＋ 습득물 등록</button></div>`;
    d.lost.filter((l) => hit(l.desc + (l.room || '') + (l.place || ''))).forEach((l) => {
      const dd = Logic.dday(l.deadline);
      const stored = l.status === 'stored';
      html += `<div class="rowitem ${stored && (l.valuable || dd <= 2) ? 'alarm' : stored && dd <= 5 ? 'warn2' : ''}">
        <div class="bodyc"><div class="tit">${esc(l.desc)} ${l.valuable ? '<span class="st d">귀중품</span>' : ''} ${stored ? '<span class="st w">보관중</span>' : '<span class="st k">인계 완료</span>'}</div>
        <div class="sub">${esc(l.room || l.place || '')} · 발견 ${esc((l.foundAt || '').slice(5, 16))} ${esc(l.reporter || '')}${stored ? ` · ${l.valuable ? '즉시 인계' : 'D-' + Math.max(dd, 0)}` : ''}${l.note ? ' · ' + esc(l.note) : ''}</div></div>
        ${stored ? `<button class="act" data-lost="${l.id}">인계</button>` : ''}</div>`;
    });
  }

  if (state.seg === 'defects') {
    html += `<div class="fabrow"><button class="btn filled" id="defAdd">＋ 하자 접수</button></div>`;
    d.defects.forEach((f) => {
      const idx = Logic.STAGES.indexOf(f.stage);
      const stale = f.stage === 'transferred' && Logic.daysSince(f.updatedAt) >= 2;
      const next = Logic.STAGES[idx + 1];
      html += `<div class="rowitem ${stale ? 'alarm' : f.stage !== 'done' && idx >= 2 ? 'warn2' : ''}">
        <div class="bodyc"><div class="tit">${esc(f.room || '')} ${esc(f.title)}
          <span class="st ${f.stage === 'done' ? 'k' : stale ? 'd' : idx >= 2 ? 'w' : 'i'}">${Logic.STAGE_KO[f.stage]}${stale ? ' · ' + Logic.daysSince(f.updatedAt) + '일' : ''}</span></div>
        <div class="sub">${esc(f.detail || '')} · 담당 ${esc(f.assignee || '')} · ${esc((f.updatedAt || '').slice(5, 16))}</div>
        <div class="stage">${Logic.STAGES.slice(1).map((s, i) => `<i class="${i < idx ? 'done' : ''}"></i>`).join('')}</div></div>
        ${next ? `<button class="act" data-def="${f.id}" data-next="${next}">→ ${Logic.STAGE_KO[next]}</button>` : ''}</div>`;
    });
  }

  if (state.seg === 'handover') {
    html += `<div class="fabrow"><button class="btn filled" id="hoAdd">＋ 인계 메모</button></div>`;
    d.handover.forEach((h) => {
      html += `<div class="rowitem" style="${h.resolved ? 'opacity:.55' : ''}">
        <div class="bodyc"><div class="tit"><span class="st ${h.kind === 'voc' ? 'd' : h.kind === 'notice' ? 'i' : 'w'}">${KIND_KO[h.kind] || h.kind}</span> ${h.room ? esc(h.room) + ' · ' : ''}${esc(h.content)}</div>
        <div class="sub">${esc(h.author || '')} · ${esc(h.createdAt || '')} · ${h.shift === 'night' ? '야간조' : '주간조'}</div></div>
        ${h.resolved ? '<span class="st k">해결</span>' : `<button class="act" data-ho="${h.id}">✓ 해결</button>`}</div>`;
    });
  }
  host.innerHTML = html;

  const dq = $('#dq');
  if (dq) dq.oninput = () => { state.q = dq.value; renderData(); setTimeout(() => { const x = $('#dq'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }); };
  const st = $('#shortT'); if (st) st.onclick = () => { state.shortOnly = !state.shortOnly; renderData(); };
  const cb = $('#csvBtn'); if (cb) cb.onclick = exportStockCsv;
  $$('#dataHost [data-qty]').forEach((b) => b.onclick = () => qtySheet(d.stock.find((s) => s.id === b.dataset.qty)));
  $$('#dataHost [data-lost]').forEach((b) => b.onclick = () => lostHandover(d.lost.find((l) => l.id === b.dataset.lost)));
  $$('#dataHost [data-eq]').forEach((b) => b.onclick = () => equipSheet(d.equipment.find((e) => e.id === b.dataset.eq)));
  $$('#dataHost [data-def]').forEach((b) => b.onclick = () => {
    const f = d.defects.find((x) => x.id === b.dataset.def);
    Store.applyChanges([{ entity: 'defects', entityId: f.id, field: 'stage', newValue: b.dataset.next, reason: '단계 진행' }], { worker: W() });
    refreshAll();
  });
  $$('#dataHost [data-ho]').forEach((b) => b.onclick = () => {
    Store.applyChanges([{ entity: 'handover', entityId: b.dataset.ho, field: 'resolved', newValue: true, reason: '해결 처리' }], { worker: W() });
    refreshAll();
  });
  const la = $('#lostAdd'); if (la) la.onclick = lostAddSheet;
  const da = $('#defAdd'); if (da) da.onclick = defectAddSheet;
  const ha = $('#hoAdd'); if (ha) ha.onclick = handoverAddSheet;

  renderSources();
}

function equipSheet(e) {
  sheet(`<h3>${esc(e.label)}</h3>
    <label>배터리</label><select id="eqB">${['ok', 'low', 'bad'].map((v) => `<option value="${v}" ${v === e.battery ? 'selected' : ''}>${BATT_KO[v][0]}</option>`).join('')}</select>
    <label>상태</label><select id="eqC">${['ok', 'broken', 'lost'].map((v) => `<option value="${v}" ${v === e.condition ? 'selected' : ''}>${COND_KO[v][0]}</option>`).join('')}</select>
    <label>비고</label><input type="text" id="eqN" value="${esc(e.note || '')}">
    <div class="foot">
      ${e.borrower ? `<button class="btn danger" data-ret>반납 (${esc(e.borrower)})</button>` : `<button class="btn" data-loan>대여 (${esc(W())})</button>`}
      <button class="btn filled" data-ok>저장</button></div>`);
  const r = $('#sheetBody [data-ret]');
  if (r) r.onclick = () => { closeSheet(); equipReturn(e); };
  const lo = $('#sheetBody [data-loan]');
  if (lo) lo.onclick = () => {
    Store.applyChanges([
      { entity: 'equipment', entityId: e.id, field: 'borrower', newValue: W(), reason: '대여' },
      { entity: 'equipment', entityId: e.id, field: 'loanedAt', newValue: Store.now(), reason: '대여' },
      { entity: 'equipment', entityId: e.id, field: 'dueAt', newValue: Store.today() + ' 23:59', reason: '대여' },
    ], { worker: W() });
    closeSheet(); refreshAll();
  };
  $('#sheetBody [data-ok]').onclick = () => {
    const ch = [];
    if ($('#eqB').value !== e.battery) ch.push({ entity: 'equipment', entityId: e.id, field: 'battery', newValue: $('#eqB').value });
    if ($('#eqC').value !== e.condition) ch.push({ entity: 'equipment', entityId: e.id, field: 'condition', newValue: $('#eqC').value });
    if ($('#eqN').value !== (e.note || '')) ch.push({ entity: 'equipment', entityId: e.id, field: 'note', newValue: $('#eqN').value });
    if (ch.length) Store.applyChanges(ch.map((c) => ({ ...c, reason: '장비 관리' })), { worker: W() });
    closeSheet(); refreshAll();
  };
}

function lostAddSheet() {
  sheet(`<h3>습득물 등록</h3>
    <label>품목 *</label><input type="text" id="lfD" placeholder="예: 아이폰 15 (금색)">
    <label>객실</label><input type="text" id="lfR" placeholder="예: 1204호">
    <label>발견 위치</label><input type="text" id="lfP" placeholder="예: 침대 밑">
    <div class="checkrow"><input type="checkbox" id="lfV"><label for="lfV" style="margin:0;font-size:13px;color:var(--text)">귀중품 (즉시 인계 플래그)</label></div>
    <label>비고</label><input type="text" id="lfN" placeholder="보관함 번호 등">
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>등록</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => {
    const desc = $('#lfD').value.trim();
    if (!desc) return alert('품목을 입력하세요');
    Store.addRow('lost', {
      foundAt: Store.now(), room: $('#lfR').value.trim(), place: $('#lfP').value.trim(), desc,
      valuable: $('#lfV').checked, status: 'stored', handedAt: null,
      deadline: Store.days(30), reporter: W(), note: $('#lfN').value.trim(),
    }, { worker: W() });
    closeSheet(); refreshAll();
  };
}
function defectAddSheet() {
  sheet(`<h3>하자 접수</h3>
    <label>객실 *</label><input type="text" id="dfR" placeholder="예: 1503호">
    <label>제목 *</label><input type="text" id="dfT" placeholder="예: 샤워부스 누수">
    <label>상세</label><textarea id="dfD" rows="3"></textarea>
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>접수</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => {
    const t = $('#dfT').value.trim();
    if (!t) return alert('제목을 입력하세요');
    Store.addRow('defects', { room: $('#dfR').value.trim(), title: t, detail: $('#dfD').value.trim(), stage: 'reported', assignee: W(), createdAt: Store.now() }, { worker: W() });
    closeSheet(); refreshAll();
  };
}
function handoverAddSheet() {
  sheet(`<h3>인계 메모</h3>
    <label>구분</label><select id="hoK"><option value="note">특이사항</option><option value="voc">VOC</option><option value="room_issue">객실</option><option value="notice">공지</option></select>
    <label>객실</label><input type="text" id="hoR" placeholder="(선택)">
    <label>내용 *</label><textarea id="hoC" rows="3" placeholder="다음 교대에 넘길 내용"></textarea>
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>추가</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => {
    const c = $('#hoC').value.trim();
    if (!c) return alert('내용을 입력하세요');
    Store.addRow('handover', { date: Store.today(), shift: 'day', kind: $('#hoK').value, room: $('#hoR').value.trim(), content: c, resolved: false, author: W(), createdAt: Store.now() }, { worker: W() });
    closeSheet(); refreshAll();
  };
}

/* 소스 목록 */
function renderSources() {
  $('#srcList').innerHTML = db().sources.map((s) => {
    const [ok, icon] = ORIGIN[s.origin] || ['④ 메모', 'i-doc'];
    return `<div class="srcitem"><input type="checkbox" data-src="${s.id}" ${s.enabled !== false ? 'checked' : ''}>
      <svg class="ic sm" style="color:var(--dim)"><use href="#${icon}"/></svg>
      <div><div class="tit">${esc(s.title)}</div><div class="meta">${ok} · 수집 ${esc((s.collectedAt || '').slice(0, 10))} · ${s.custVisible ? '고객 안내 가능' : '내부 전용'}</div></div></div>`;
  }).join('');
  $$('#srcList [data-src]').forEach((c) => c.onchange = () => {
    Store.applyChanges([{ entity: 'sources', entityId: c.dataset.src, field: 'enabled', newValue: c.checked, reason: '챗 참조 ' + (c.checked ? '켬' : '끔') }], { worker: W() });
    refreshHead();
  });
}
$('#srcAddBtn').onclick = () => {
  sheet(`<h3>지식 소스 추가</h3>
    <label>제목 *</label><input type="text" id="sT">
    <label>출처 유형</label><select id="sO"><option value="internal_notice">① 내부 공지</option><option value="vinfo">② VINFO/상품지식</option><option value="official">③ 공식홈</option><option value="memo" selected>④ 일반 메모</option></select>
    <div class="checkrow"><input type="checkbox" id="sC"><label for="sC" style="margin:0;font-size:13px;color:var(--text)">고객 안내에 사용 가능</label></div>
    <label>본문 *</label><textarea id="sB" rows="5" placeholder="밴드 공지·매뉴얼 본문 붙여넣기"></textarea>
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>등록</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => {
    const t = $('#sT').value.trim(), b = $('#sB').value.trim();
    if (!t || !b) return alert('제목과 본문을 입력하세요');
    const pri = { internal_notice: 1, vinfo: 2, official: 3, memo: 4 }[$('#sO').value];
    Store.addRow('sources', { title: t, origin: $('#sO').value, priority: pri, custVisible: $('#sC').checked, collectedAt: Store.now(), content: b, enabled: true }, { worker: W() });
    closeSheet(); refreshAll();
  };
};

/* ── 스튜디오 ── */
$('#briefGen').onclick = () => {
  const lines = Logic.briefing(db());
  $('#briefOut').innerHTML = (lines.length
    ? '<ul class="blist">' + lines.map((l) => `<li><span class="tag">${l.tag}</span><span>${esc(l.text)}</span></li>`).join('') + '</ul>'
    : '확인할 항목이 없습니다. ✅') +
    `<p class="meta" style="margin-top:8px">근거: 실시간 DB 집계 · ${new Date().toTimeString().slice(0, 5)} 생성</p>`;
  $('#scBrief').classList.add('open');
};
$('#dailyBtn').onclick = exportDailyCsv;
$('#logToggle').onclick = () => {
  const card = $('#logToggle').closest('.scard');
  card.classList.toggle('open');
  if (card.classList.contains('open')) renderLog();
};
function renderLog() {
  const rows = db().audit.slice(0, 60);
  $('#logOut').innerHTML = rows.map((a) => `
    <div class="logrow"><span class="t">${esc((a.ts || '').slice(5, 16))}<br>${esc(a.worker || '')}</span>
      <span>${esc(a.entity)} · ${esc(a.field)}: <span style="color:var(--danger);text-decoration:line-through">${esc(String(a.old ?? ''))}</span> → <b>${esc(String(a.new ?? ''))}</b>
      ${a.reason ? `<span class="meta"> · ${esc(a.reason)}</span>` : ''}${a.undone ? ' <span class="st w">취소됨</span>' : ''}${a.undoOf ? ' <span class="meta">(복원)</span>' : ''}</span>
      ${!a.undone && !a.undoOf && a.field !== '(신규)' ? `<button class="undo" data-u="${a.id}"><svg class="ic sm"><use href="#i-undo"/></svg></button>` : ''}</div>`).join('') || '<p class="meta">기록 없음</p>';
  $$('#logOut [data-u]').forEach((b) => b.onclick = () => { try { Store.undo(b.dataset.u, W()); } catch (e) { alert(e.message); } refreshAll(); renderLog(); });
}

/* CSV */
function dlCsv(name, rows) {
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
}
function exportStockCsv() {
  dlCsv(`재고_${Store.today()}.csv`, [['품목', '위치', '현재 수량', '최소 기준', '상태', '담당', '최근 수정', '비고'],
    ...db().stock.map((s) => [s.item, s.location, s.qty, s.min, s.qty < s.min ? '부족' : s.qty < s.min * 1.2 ? '주의' : '정상', s.owner || '', `${s.updatedAt || ''} ${s.updatedBy || ''}`, s.note || ''])]);
}
function exportDailyCsv() {
  const today = Store.today();
  const logs = db().audit.filter((a) => (a.ts || '').startsWith(today));
  dlCsv(`일일마감_${today}.csv`, [['시간', '근무자', '대상', '필드', '전', '후', '사유', '경로'],
    ...logs.map((a) => [a.ts, a.worker, a.entity, a.field, a.old, a.new, a.reason || '', a.channel]),
    [], ['미해결 인계'], ...db().handover.filter((h) => !h.resolved).map((h) => [h.createdAt, h.author, h.room || '', KIND_KO[h.kind] || h.kind, h.content])]);
}

/* ── 근무자·설정 ── */
function workerSheet(first) {
  sheet(`<h3>근무 시작 — 이름 선택</h3><div class="wlist">
    ${db().workers.map((w) => `<button data-w="${esc(w.name)}">${esc(w.name)}</button>`).join('')}</div>
    <p class="meta" style="margin-top:10px">선택한 이름이 수정자·감사 로그에 자동 반영됩니다. 로그인은 없습니다.</p>`);
  $$('#sheetBody [data-w]').forEach((b) => b.onclick = () => {
    Store.worker = b.dataset.w;
    $('#workerChip').textContent = b.dataset.w + ' · 근무중';
    closeSheet();
    if (first) briefingCard();
  });
}
$('#workerChip').onclick = () => workerSheet(false);

$('#gearBtn').onclick = () => {
  const c = Store.Sync.cfg || {};
  sheet(`<h3>설정</h3>
    <label>공유 서버 (GitHub 데이터 저장소)</label>
    <input type="text" id="cfgRepo" placeholder="owner/repo — 예: jykim5215/houseman-os-data" value="${esc(c.repo || '')}">
    <label>액세스 토큰 (fine-grained PAT · 해당 저장소 Contents 읽기/쓰기만)</label>
    <input type="password" id="cfgTok" placeholder="github_pat_…" value="${esc(c.token || '')}">
    <p class="meta" style="margin-top:6px">토큰은 이 기기에만 저장됩니다. 설정하면 30초마다 + 변경 직후 자동 동기화되어 모든 근무자가 같은 데이터를 봅니다. 비워두면 로컬 모드.</p>
    <div class="foot">
      <button class="btn" data-test>연결 테스트</button>
      <button class="btn" data-off>로컬 모드로</button>
      <button class="btn filled" data-save>저장</button></div>
    <hr style="border:none;border-top:1px solid var(--surface-2);margin:14px 0">
    <div class="meta">버전 ${APP_VERSION} · <button style="color:var(--accent)" data-upd>업데이트 확인</button> · <button style="color:var(--danger)" data-reset>데이터 초기화(시드)</button></div>`);
  $('#sheetBody [data-save]').onclick = () => {
    const repo = $('#cfgRepo').value.trim(), token = $('#cfgTok').value.trim();
    if (!repo || !token) return alert('저장소와 토큰을 모두 입력하세요 (해제는 "로컬 모드로")');
    Store.Sync.configure({ repo, token, branch: 'main', path: 'data/db.json' });
    closeSheet(); refreshHead();
  };
  $('#sheetBody [data-off]').onclick = () => { Store.Sync.configure(null); closeSheet(); refreshHead(); };
  $('#sheetBody [data-test]').onclick = async (ev) => {
    ev.target.textContent = '확인 중…';
    const ok = await Store.Sync.test({ repo: $('#cfgRepo').value.trim(), token: $('#cfgTok').value.trim(), branch: 'main', path: 'data/db.json' });
    ev.target.textContent = ok ? '✓ 연결 성공' : '✗ 실패 (저장소/토큰 확인)';
  };
  $('#sheetBody [data-upd]').onclick = checkUpdate;
  $('#sheetBody [data-reset]').onclick = () => { if (confirm('이 기기의 로컬 데이터를 시드로 초기화할까요?')) { Store.reset(); location.reload(); } };
};

$('#syncBtn').onclick = () => { if (Store.Sync.cfg) Store.Sync.pullPush(); else $('#gearBtn').click(); };
$('#themeBtn').onclick = () => {
  const r = document.documentElement;
  r.dataset.theme = r.dataset.theme === 'dark' ? '' : 'dark';
  localStorage.setItem('hos.theme', r.dataset.theme);
};

/* ── 헤더·상태 반영 ── */
function refreshHead() {
  const n = db().sources.filter((s) => s.enabled !== false).length;
  const st = Store.Sync.status;
  const stKo = { local: '로컬 모드', idle: '동기화 대기', syncing: '동기화 중…', synced: '공유 서버 연결됨', error: '동기화 오류' }[st] || st;
  $('#hdMeta').textContent = `참조 소스 ${n} · ${stKo}`;
  const sb = $('#syncBtn');
  sb.classList.toggle('spin', st === 'syncing');
  sb.classList.toggle('err', st === 'error');
  sb.classList.toggle('okc', st === 'synced');
}
function refreshAll() {
  renderCounters();
  if ($('#tab-data').classList.contains('on')) renderData();
  refreshHead();
}

/* ── 탭 ── */
function go(t) {
  $$('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $$('.tabview').forEach((v) => v.classList.toggle('on', v.id === 'tab-' + t));
  if (t === 'data') renderData();
}
$$('nav button').forEach((b) => b.onclick = () => go(b.dataset.tab));
$$('#seg button').forEach((b) => b.onclick = () => { state.seg = b.dataset.c; state.q = ''; renderData(); });

/* ── PWA: SW 등록 + 업데이트 확인 ── */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
async function checkUpdate() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (j.version && j.version !== APP_VERSION) $('#updBar').classList.remove('hide');
    else alert('최신 버전입니다 (v' + APP_VERSION + ')');
  } catch { }
}
setInterval(async () => {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (j.version && j.version !== APP_VERSION) $('#updBar').classList.remove('hide');
  } catch { }
}, 5 * 60 * 1000);
$('#updGo').onclick = async () => {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.update()));
  }
  if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
  location.reload();
};

/* ── 시작 ── */
(function init() {
  const th = localStorage.getItem('hos.theme');
  if (th) document.documentElement.dataset.theme = th;
  Store.load();
  addMsg(`${new Date().getMonth() + 1}월 ${new Date().getDate()}일 · 하우스맨 노트`, 'datechip');
  if (Store.worker) {
    $('#workerChip').textContent = Store.worker + ' · 근무중';
    briefingCard();
  } else workerSheet(true);
  renderCounters();
  refreshHead();
  Store.Sync.onStatus(() => refreshHead());
  Store.Sync.onChange(() => { refreshAll(); });
  Store.Sync.start();
})();
