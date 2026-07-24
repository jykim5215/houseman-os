/* 하우스맨 노트 — UI v0.5 (동별 분리 · 챗 모드 · 팀 톡 · 관리자 PIN) */
'use strict';
const APP_VERSION = '0.6.0';

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const db = () => Store.load();
const W = () => Store.worker || '';
const bldName = () => (Store.buildings().find((b) => b.id === Store.bld) || { name: Store.bld }).name;

const BATT_KO = { ok: ['양호', 'k'], low: ['부족', 'w'], bad: ['불량', 'd'] };
const COND_KO = { ok: ['정상', 'k'], broken: ['고장', 'd'], lost: ['분실', 'd'] };

const state = { tab: 'chat', seg: 'stock', q: '', shortOnly: false, xp: null, chatMode: 'ask', talkType: 'text', pendingImg: null };
const isAdmin = () => Store.Auth.isAdmin();
const me = () => Store.Auth.current;

/* ── 시트 ── */
function sheet(html) { $('#sheetBody').innerHTML = html; $('#sheetbg').classList.remove('hide'); setTimeout(() => $('#sheet').classList.add('open'), 10); }
function closeSheet() { $('#sheet').classList.remove('open'); $('#sheetbg').classList.add('hide'); }
$('#sheetbg').onclick = closeSheet;

/* ── 챗(AI) ── */
function addMsg(html, cls) { const d = document.createElement('div'); d.className = cls || 'm-ai'; d.innerHTML = html; $('#msgs').appendChild(d); d.scrollIntoView({ behavior: 'smooth', block: 'end' }); return d; }
const aiMsg = (who, body) => addMsg(`${who ? `<div class="who"><span class="dot"><svg class="ic"><use href="#i-chat"/></svg></span>${who}</div>` : ''}<div class="body">${body}</div>`);

function citeChips(sources) {
  if (!sources || !sources.length) return '';
  return '<div style="margin-top:8px">' + sources.map((s, i) => `<span class="cite" data-cite='${esc(JSON.stringify(s))}'>${s.n || i + 1}</span>`).join(' ') + ` <span class="meta">${sources.map((s) => esc(s.title)).join(' · ')}</span></div>`;
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('.cite'); if (!c || !c.dataset.cite) return;
  const s = JSON.parse(c.dataset.cite);
  sheet(`<h3>${esc(s.title)}</h3>${s.snippet ? `<div class="quote">${esc(s.snippet)}</div>` : ''}<div class="meta">${esc(s.meta || '')}</div>`);
});

function briefingCard() {
  const lines = Logic.briefing();
  aiMsg('교대 브리핑 · ' + bldName(), (lines.length ? '확인할 항목 ' + lines.length + '건입니다.<ul class="blist">' + lines.map((l) => `<li><span class="tag">${l.tag}</span><span>${esc(l.text)}</span></li>`).join('') + '</ul>' : '확인할 항목이 없습니다. ✅'));
}

function renderProposal(p) {
  const m = aiMsg('', `<div class="proposal"><div class="head"><svg class="ic sm"><use href="#i-note"/></svg>변경 미리보기 — 승인 후에만 반영</div>
    <div class="prow"><b>${esc(p.summary)}</b>${p.before ? `<span class="why">현재: ${p.before.map(([k, v]) => `${k} <span class="old">${esc(String(v ?? '—'))}</span>`).join(' · ')}</span>` : ''}</div>
    <div class="acts"><button class="btn filled" data-ok>승인하고 저장</button><button class="btn" data-no>취소</button></div></div>`);
  m.querySelector('[data-ok]').onclick = () => {
    try {
      const ids = Store.applyChanges(p.changes, { worker: W(), channel: 'ai' });
      const at = Store.now();
      Store.addRow('messages', { type: 'done', author: W() || '관리자', text: p.summary, meta: { detail: (p.changes[0] && p.changes[0].reason) || '', at }, ts: at }, { worker: W() });
      m.querySelector('.proposal').outerHTML = `<div class="okmsg">✅ <b>처리 완료</b> · ${esc(at.slice(11, 16))} ${W() ? '· ' + esc(W()) : ''}
        <div class="meta" style="margin-top:4px">완료보고가 톡에 기록됐습니다</div>
        <button class="btn" style="padding:3px 12px;font-size:11.5px;margin-top:6px" data-undo>↩ 취소</button></div>`;
      const ub = m.querySelector('[data-undo]'); if (ub) ub.onclick = () => { ids.slice().reverse().forEach((id) => { try { Store.undo(id, W()); } catch {} }); ub.outerHTML = '<span class="meta">복원됨</span>'; refreshAll(); };
      refreshAll();
    } catch (e) { alert(e.message); }
  };
  m.querySelector('[data-no]').onclick = () => { m.querySelector('.proposal').outerHTML = '<div class="body" style="border:none;box-shadow:none;padding:6px 0;color:var(--dim)">취소됨</div>'; };
}

const HELP = `이렇게 말해보세요.
<ul class="blist">
<li>현황: "부족한 재고", "미반납 장비", "오늘 브리핑", "습득물"</li>
<li>자료: "린넨실 비번", "세미취사 층", "에어컨 코드" 등 등록된 자료 질문</li>
<li>수정(관리자): "바스타올 30장 차감", "무전기 4번 배터리 불량", "1204호 아이폰 인계", "공지 초기화"</li>
</ul>`;

function needAdmin(runWhenAdmin) {
  if (state.chatMode === 'admin' && isAdmin()) { runWhenAdmin(); return true; }
  const m = aiMsg('', `이 요청은 <b>수정</b>이라 관리 모드에서만 실행됩니다.<div class="acts" style="display:flex;gap:8px;margin-top:8px"><button class="btn filled" data-go>관리 모드로 전환</button></div>`);
  m.querySelector('[data-go]').onclick = () => requestAdmin(() => { setMode('admin'); runWhenAdmin(); });
  return false;
}

function renderDelete(p) {
  const m = aiMsg('', `<div class="proposal"><div class="head"><svg class="ic sm"><use href="#i-note"/></svg>삭제 미리보기 — 승인 후에만 반영</div>
    <div class="prow"><b>${esc(p.summary)}</b>${p.preview ? `<span class="why">${p.preview.map((t) => esc(String(t).slice(0, 50))).join(' · ')}${p.ids.length > 5 ? ' 외' : ''}</span>` : ''}</div>
    <div class="acts"><button class="btn filled" data-ok>승인하고 삭제</button><button class="btn" data-no>취소</button></div></div>`);
  m.querySelector('[data-ok]').onclick = () => {
    p.ids.forEach((id) => Store.delRow(p.entity, id));
    m.querySelector('.proposal').outerHTML = `<div class="okmsg">✅ ${esc(p.summary)} 완료</div>`;
    refreshAll();
  };
  m.querySelector('[data-no]').onclick = () => { m.querySelector('.proposal').outerHTML = '<div class="body" style="border:none;box-shadow:none;padding:6px 0;color:var(--dim)">취소됨</div>'; };
}

async function send(text) {
  text = (text || $('#inp').value).trim(); if (!text) return;
  $('#inp').value = ''; addMsg(esc(text), 'm-user');

  const p = Logic.parseCommand(text);
  if (p) {
    if (p.kind === 'help') return aiMsg('', HELP);
    if (p.kind === 'proposal') return void needAdmin(() => renderProposal(p));
    if (p.kind === 'delete') return void needAdmin(() => renderDelete(p));
    if (p.kind === 'newNotice') return void needAdmin(() => {
      const mm = aiMsg('', `<div class="proposal"><div class="head">공지 등록 미리보기</div><div class="prow"><b>${esc(p.text)}</b></div>
        <div class="acts"><button class="btn filled" data-ok>등록</button><button class="btn" data-no>취소</button></div></div>`);
      mm.querySelector('[data-ok]').onclick = () => {
        Store.addRow('messages', { type: 'notice', author: W() || '관리자', text: p.text, ts: Store.now() }, { worker: W() });
        mm.querySelector('.proposal').outerHTML = '<div class="okmsg">✅ 공지가 톡에 등록됐습니다</div>'; refreshAll();
      };
      mm.querySelector('[data-no]').onclick = () => { mm.querySelector('.proposal').outerHTML = '<div class="body" style="border:none;box-shadow:none;padding:6px 0;color:var(--dim)">취소됨</div>'; };
    });
    if (p.kind === 'clarify') return aiMsg('', `${esc(p.question)}${p.candidates ? '<ul class="blist">' + p.candidates.map((c) => `<li>${esc(c)}</li>`).join('') + '</ul>' : ''}`);
  }

  const a = Logic.answer(text);
  if (a.kind === 'briefing') return briefingCard();
  if (!a.refused) {
    return aiMsg('', (a.customerText ? `<div class="dual"><div class="box cust"><span class="t">고객 안내용</span>${esc(a.customerText)}</div><div class="box"><span class="t">내부 참고</span>${esc(a.internalText)}</div></div>` : esc(a.internalText)) + (a.conflict ? `<div class="conflict"><svg class="ic sm"><use href="#i-alert"/></svg><span>${esc(a.conflict)}</span></div>` : '') + citeChips(a.sources));
  }

  // 규칙으로 못 풀면 LLM에게 (설정된 경우)
  if (!AI.enabled()) return aiMsg('', `잘 이해하지 못했어요. ${HELP}<div class="meta" style="margin-top:6px">설정 ⚙에서 AI를 연결하면 자유로운 문장도 이해합니다.</div>`);
  const thinking = aiMsg('', '<span class="meta">생각 중…</span>');
  try {
    const r = await AI.ask(text, Logic.snapshot());
    thinking.remove();
    if (r.kind === 'propose' && Array.isArray(r.changes) && r.changes.length) {
      return void needAdmin(() => renderProposal({ summary: r.summary || '변경 제안', changes: r.changes.map((c) => ({ ...c, reason: r.reason || text })) }));
    }
    if (r.kind === 'delete' && Array.isArray(r.ids) && r.ids.length) {
      return void needAdmin(() => renderDelete({ entity: r.entity || 'messages', ids: r.ids, summary: r.summary || '삭제', preview: [] }));
    }
    aiMsg('', esc(r.text || '답을 만들지 못했습니다.') + `<div class="meta" style="margin-top:6px">${esc(AI.providerName())}</div>`);
  } catch (e) {
    thinking.remove();
    aiMsg('', `AI 호출에 실패했습니다: ${esc(e.message)}<div class="meta" style="margin-top:6px">설정 ⚙에서 키와 제공사를 확인하세요.</div>`);
  }
}
$('#sendBtn').onclick = () => send();
$('#inp').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
$$('#sugg button').forEach((b) => b.onclick = () => send(b.textContent));
$('#micBtn').onclick = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return alert('이 브라우저는 음성 입력을 지원하지 않습니다.');
  const r = new SR(); r.lang = 'ko-KR'; $('#micBtn').classList.add('rec');
  r.onresult = (e) => { $('#inp').value = e.results[0][0].transcript; }; r.onend = () => $('#micBtn').classList.remove('rec'); r.onerror = () => $('#micBtn').classList.remove('rec'); r.start();
};

/* ── 챗 모드 (묻기/관리) ── */
function setMode(m) {
  state.chatMode = m;
  $('#mAsk').classList.toggle('on', m === 'ask');
  $('#mAdmin').classList.toggle('on', m === 'admin');
  $('#modeHint').textContent = m === 'admin' ? '관리 모드 — 자연어로 수정할 수 있어요' : '읽기 전용 — 자료·현황을 물어보세요';
}
$('#mAsk').onclick = () => setMode('ask');
$('#mAdmin').onclick = () => { if (isAdmin()) setMode('admin'); else requestAdmin(() => setMode('admin')); };
$('#inp').addEventListener('focus', () => { if (state.chatMode === 'admin' && !isAdmin()) setMode('ask'); });

function requestAdmin(onOk) {
  if (isAdmin()) return onOk();
  const u = me();
  sheet(`<h3>관리자 권한 필요</h3>
    <p class="meta">${u ? esc(u.name) + '님은 <b>근무자</b> 계정이라 수정할 수 없습니다. 관리자 계정으로 로그인하세요.' : '로그인이 필요합니다.'}</p>
    <div class="foot"><button class="btn" data-c>닫기</button><button class="btn filled" data-sw>다른 계정으로 로그인</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-sw]').onclick = () => { Store.Auth.logout(); closeSheet(); showLogin(); };
}

/* ── 카운터 ── */
function renderCounters() {
  const b = Logic.statusBoard();
  const defs = [['short', '부족', b.shortage.length, 'd'], ['loan', '미반납', b.overdue.length, 'd'], ['lost', '기한임박', b.lostUrgent.length, 'w'], ['defect', '미처리 하자', b.staleDefects.length, 'w']].filter(([, , n]) => n > 0);
  $('#counters').innerHTML = defs.length ? defs.map(([k, l, n, c]) => `<button class="counter ${c} ${state.xp === k ? 'on' : ''}" data-x="${k}">${l}<span class="n">${n}</span></button>`).join('') : '<span class="counter k">이상 없음 ✓</span>';
  $$('#counters [data-x]').forEach((btn) => btn.onclick = () => toggleExpand(btn.dataset.x));
  if (state.xp && !defs.some(([k]) => k === state.xp)) { state.xp = null; $('#xp').classList.remove('open'); } else if (state.xp) fillExpand();
}
function toggleExpand(k) { state.xp = state.xp === k ? null : k; $('#xp').classList.toggle('open', !!state.xp); renderCounters(); }
function fillExpand() {
  const b = Logic.statusBoard(); const rows = [];
  if (state.xp === 'short') b.shortage.forEach((s) => rows.push([`${s.item} · ${s.location}`, `${s.qty}/${s.min}`, '보충', () => reqEdit(() => qtySheet(s))]));
  if (state.xp === 'loan') b.overdue.forEach((e) => rows.push([`${e.label} — ${e.borrower}`, Logic.daysSince(e.loanedAt) + '일', '반납', () => reqEdit(() => equipReturn(e))]));
  if (state.xp === 'lost') b.lostUrgent.forEach((l) => rows.push([`${l.desc} (${l.room || l.place})`, l.valuable ? '즉시' : 'D-' + Math.max(Logic.dday(l.deadline), 0), '인계', () => reqEdit(() => lostHandover(l))]));
  if (state.xp === 'defect') b.staleDefects.forEach((d) => rows.push([`${d.room} ${d.title}`, Logic.daysSince(d.updatedAt) + '일', '보기', () => { state.seg = 'defects'; go('data'); }]));
  $('#xpBody').innerHTML = rows.map(([t, v, a], i) => `<div class="xrow"><span>${esc(t)}</span><span class="v">${v}</span><button class="fix" data-i="${i}">${a} →</button></div>`).join('') || '<div class="xrow meta">항목 없음</div>';
  $$('#xpBody [data-i]').forEach((btn) => btn.onclick = () => rows[Number(btn.dataset.i)][3]());
}

/* 수정은 관리자만 */
function reqEdit(fn) { if (isAdmin()) fn(); else requestAdmin(fn); }

/* ── 빠른 처리 ── */
function equipReturn(eq) {
  sheet(`<h3>${esc(eq.label)} 반납</h3><div class="quote">대여자 ${esc(eq.borrower)} · ${esc(eq.loanedAt || '')}</div>
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>반납 저장</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => { Store.applyChanges([{ entity: 'equipment', entityId: eq.id, field: 'borrower', newValue: null, reason: '반납' }, { entity: 'equipment', entityId: eq.id, field: 'loanedAt', newValue: null, reason: '반납' }, { entity: 'equipment', entityId: eq.id, field: 'dueAt', newValue: null, reason: '반납' }], { worker: W() }); closeSheet(); refreshAll(); };
}
function lostHandover(l) {
  sheet(`<h3>습득물 인계 — ${esc(l.desc)}</h3><div class="quote">${esc(l.room || l.place || '')} · ${l.valuable ? '귀중품' : '일반'}</div>
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>상황실 인계</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => { Store.applyChanges([{ entity: 'lost', entityId: l.id, field: 'status', newValue: 'handed_over', reason: '인계' }, { entity: 'lost', entityId: l.id, field: 'handedAt', newValue: Store.now(), reason: '인계' }], { worker: W() }); closeSheet(); refreshAll(); };
}
function qtySheet(s) {
  let val = s.qty;
  sheet(`<h3>${esc(s.item)} <span class="meta">· ${esc(s.location)}</span></h3><div class="diffline" id="qd"></div>
    <div class="stepper"><button data-d="-10">−10</button><button data-d="-1">−</button><div class="val"><span id="qv">${val}</span><small>${Logic.tracked(s) ? '최소 ' + s.min : '정량 없음'}</small></div><button data-d="1">＋</button><button data-d="10">＋10</button></div>
    <label>사유</label><input type="text" id="qr" placeholder="예: 세탁 입고, 객실 지급">
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>승인하고 저장</button></div>`);
  const upd = () => { $('#qv').textContent = val; $('#qd').innerHTML = val === s.qty ? '<span class="meta">변경 없음</span>' : `<span class="old">${s.qty}</span> → <span class="new">${val}</span>${Logic.tracked(s) && val < s.min ? ' · ⚠️ 최소 미만' : ''}`; };
  upd();
  $$('#sheetBody [data-d]').forEach((btn) => btn.onclick = () => { val = Math.max(0, val + Number(btn.dataset.d)); upd(); });
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => { if (val !== s.qty) Store.applyChanges([{ entity: 'stock', entityId: s.id, field: 'qty', newValue: val, reason: $('#qr').value.trim() || null }], { worker: W() }); closeSheet(); refreshAll(); };
}

/* 수정 흔적: 최근 수정 시각 · 수정자 */
function stamp(r) {
  if (!r || !r.updatedAt) return '';
  const t = String(r.updatedAt).slice(5, 16).replace('-', '/');
  return `<span class="editstamp">✎ ${esc(t)}${r.updatedBy ? ' · ' + esc(r.updatedBy) : ''}</span>`;
}

/* ── 데이터 ── */
function renderData() {
  $$('#seg button').forEach((b) => b.classList.toggle('on', b.dataset.c === state.seg));
  const host = $('#dataHost'), q = state.q.trim(), hit = (t) => !q || t.includes(q);
  let html = '';
  if (state.seg === 'stock') {
    html += `<div class="toolrow"><div class="search"><input id="dq" value="${esc(q)}" placeholder="품목·위치 검색"></div><button class="pill ${state.shortOnly ? 'st i' : ''}" id="shortT" style="border:1px solid var(--line);border-radius:999px;padding:7px 14px;font-weight:600;font-size:12.5px">부족만</button>${isAdmin() ? '<button class="act" id="stockAdd" style="border:1px solid var(--accent-line)">＋ 품목</button>' : ''}</div>`;
    const rows = Store.inBld('stock').filter((s) => hit(s.item + s.location)).filter((s) => !state.shortOnly || (Logic.tracked(s) && s.qty < s.min));
    html += rows.map((s) => {
      const tk = Logic.tracked(s), cls = tk && s.qty < s.min ? 'alarm' : tk && s.qty < s.min * 1.2 ? 'warn2' : '';
      const st = !tk ? '' : s.qty < s.min ? '<span class="st d">부족</span>' : s.qty < s.min * 1.2 ? '<span class="st w">주의</span>' : '<span class="st k">정상</span>';
      return `<div class="rowitem ${cls}"><div class="bodyc"><div class="tit">${esc(s.item)} ${st}</div><div class="sub">${esc(s.location)}${s.note ? ' · ' + esc(s.note) : ''}${stamp(s)}</div></div><div class="qty">${s.qty}${tk ? `<small>/${s.min}</small>` : ''}</div><button class="act" data-qty="${s.id}">수정</button></div>`;
    }).join('') || `<div class="empty">${bldName()}에 등록된 재고가 없습니다.${isAdmin() ? '' : ' 관리 모드에서 추가할 수 있어요.'}</div>`;
  }
  if (state.seg === 'equipment') {
    html += `<div class="toolrow"><div class="search"><input id="dq" value="${esc(q)}" placeholder="번호·대여자 검색"></div></div>`;
    const rows = Store.inBld('equipment').filter((e) => hit(e.label + (e.borrower || '')));
    html += rows.map((e) => {
      const [bk, bc] = BATT_KO[e.battery] || [e.battery, 'k'], [ck, cc] = COND_KO[e.condition] || [e.condition, 'k'];
      const overdue = e.borrower && e.dueAt && e.dueAt < Store.now();
      return `<div class="rowitem ${overdue || e.condition !== 'ok' ? 'alarm' : e.battery === 'bad' ? 'warn2' : ''}"><div class="bodyc"><div class="tit">${esc(e.label)} <span class="st ${bc}">배터리 ${bk}</span> <span class="st ${cc}">${ck}</span>${overdue ? ' <span class="st d">미반납</span>' : ''}</div><div class="sub">${e.borrower ? esc(e.borrower) + ' · ' + esc(e.loanedAt || '') : '보관중'}${e.note ? ' · ' + esc(e.note) : ''}${stamp(e)}</div></div><button class="act" data-eq="${e.id}">관리</button></div>`;
    }).join('') || `<div class="empty">${bldName()}에 등록된 장비가 없습니다.</div>`;
  }
  if (state.seg === 'lost') {
    html += `<div class="fabrow"><button class="btn filled" id="lostAdd"><svg class="ic sm"><use href="#i-add"/></svg> 습득물 등록</button></div>`;
    const rows = Store.inBld('lost').filter((l) => hit(l.desc + (l.room || '') + (l.place || '')));
    html += rows.map((l) => { const dd = Logic.dday(l.deadline), stored = l.status === 'stored'; return `<div class="rowitem ${stored && (l.valuable || dd <= 2) ? 'alarm' : stored && dd <= 5 ? 'warn2' : ''}"><div class="bodyc"><div class="tit">${esc(l.desc)} ${l.valuable ? '<span class="st d">귀중품</span>' : ''} ${stored ? '<span class="st w">보관중</span>' : '<span class="st k">인계 완료</span>'}</div><div class="sub">${esc(l.room || l.place || '')} · ${esc((l.foundAt || '').slice(5, 16))}${stored ? ` · ${l.valuable ? '즉시 인계' : 'D-' + Math.max(dd, 0)}` : ''}${stamp(l)}</div></div>${stored ? `<button class="act" data-lost="${l.id}">인계</button>` : ''}</div>`; }).join('') || `<div class="empty">습득물이 없습니다.</div>`;
  }
  if (state.seg === 'defects') {
    html += `<div class="fabrow"><button class="btn filled" id="defAdd"><svg class="ic sm"><use href="#i-add"/></svg> 하자 접수</button></div>`;
    const rows = Store.inBld('defects');
    html += rows.map((f) => { const idx = Logic.STAGES.indexOf(f.stage), stale = f.stage === 'transferred' && Logic.daysSince(f.updatedAt) >= 2, next = Logic.STAGES[idx + 1]; return `<div class="rowitem ${stale ? 'alarm' : f.stage !== 'done' && idx >= 2 ? 'warn2' : ''}"><div class="bodyc"><div class="tit">${esc(f.room || '')} ${esc(f.title)} <span class="st ${f.stage === 'done' ? 'k' : stale ? 'd' : idx >= 2 ? 'w' : 'i'}">${Logic.STAGE_KO[f.stage]}${stale ? ' · ' + Logic.daysSince(f.updatedAt) + '일' : ''}</span></div><div class="sub">${esc(f.detail || '')}${f.assignee ? ' · ' + esc(f.assignee) : ''}${stamp(f)}</div><div class="stage">${Logic.STAGES.slice(1).map((s, i) => `<i class="${i < idx ? 'done' : ''}"></i>`).join('')}</div></div>${next ? `<button class="act" data-def="${f.id}" data-next="${next}">→ ${Logic.STAGE_KO[next]}</button>` : ''}</div>`; }).join('') || `<div class="empty">진행 중 하자가 없습니다.</div>`;
  }
  host.innerHTML = html;
  const dq = $('#dq'); if (dq) dq.oninput = () => { state.q = dq.value; renderData(); setTimeout(() => { const x = $('#dq'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }); };
  const stt = $('#shortT'); if (stt) stt.onclick = () => { state.shortOnly = !state.shortOnly; renderData(); };
  $$('#dataHost [data-qty]').forEach((b) => b.onclick = () => reqEdit(() => qtySheet(Store.find('stock', b.dataset.qty))));
  $$('#dataHost [data-lost]').forEach((b) => b.onclick = () => reqEdit(() => lostHandover(Store.find('lost', b.dataset.lost))));
  $$('#dataHost [data-eq]').forEach((b) => b.onclick = () => reqEdit(() => equipSheet(Store.find('equipment', b.dataset.eq))));
  $$('#dataHost [data-def]').forEach((b) => b.onclick = () => reqEdit(() => { Store.applyChanges([{ entity: 'defects', entityId: b.dataset.def, field: 'stage', newValue: b.dataset.next, reason: '단계 진행' }], { worker: W() }); refreshAll(); }));
  const la = $('#lostAdd'); if (la) la.onclick = () => reqEdit(lostAddSheet);
  const da = $('#defAdd'); if (da) da.onclick = () => reqEdit(defectAddSheet);
  const sa = $('#stockAdd'); if (sa) sa.onclick = stockAddSheet;
  renderSources();
}
function equipSheet(e) {
  sheet(`<h3>${esc(e.label)}</h3>
    <label>배터리</label><select id="eqB">${['ok', 'low', 'bad'].map((v) => `<option value="${v}" ${v === e.battery ? 'selected' : ''}>${BATT_KO[v][0]}</option>`).join('')}</select>
    <label>상태</label><select id="eqC">${['ok', 'broken', 'lost'].map((v) => `<option value="${v}" ${v === e.condition ? 'selected' : ''}>${COND_KO[v][0]}</option>`).join('')}</select>
    <label>비고</label><input type="text" id="eqN" value="${esc(e.note || '')}">
    <div class="foot">${e.borrower ? `<button class="btn danger" data-ret>반납 (${esc(e.borrower)})</button>` : `<button class="btn" data-loan>대여 (${esc(W() || '나')})</button>`}<button class="btn filled" data-ok>저장</button></div>`);
  const r = $('#sheetBody [data-ret]'); if (r) r.onclick = () => { closeSheet(); equipReturn(e); };
  const lo = $('#sheetBody [data-loan]'); if (lo) lo.onclick = () => { Store.applyChanges([{ entity: 'equipment', entityId: e.id, field: 'borrower', newValue: W() || '나', reason: '대여' }, { entity: 'equipment', entityId: e.id, field: 'loanedAt', newValue: Store.now(), reason: '대여' }, { entity: 'equipment', entityId: e.id, field: 'dueAt', newValue: Store.today() + ' 23:59', reason: '대여' }], { worker: W() }); closeSheet(); refreshAll(); };
  $('#sheetBody [data-ok]').onclick = () => { const ch = []; if ($('#eqB').value !== e.battery) ch.push({ entity: 'equipment', entityId: e.id, field: 'battery', newValue: $('#eqB').value }); if ($('#eqC').value !== e.condition) ch.push({ entity: 'equipment', entityId: e.id, field: 'condition', newValue: $('#eqC').value }); if ($('#eqN').value !== (e.note || '')) ch.push({ entity: 'equipment', entityId: e.id, field: 'note', newValue: $('#eqN').value }); if (ch.length) Store.applyChanges(ch.map((c) => ({ ...c, reason: '장비 관리' })), { worker: W() }); closeSheet(); refreshAll(); };
}
function stockAddSheet() {
  sheet(`<h3>재고 품목 추가 <span class="meta">· ${esc(bldName())}</span></h3>
    <label>품목명 *</label><input type="text" id="si" placeholder="예: 바스타올">
    <label>위치</label><input type="text" id="sl" placeholder="예: 3F 린넨실">
    <label>현재 수량</label><input type="number" id="sq" value="0">
    <div class="checkrow"><input type="checkbox" id="strk"><label for="strk" style="margin:0;font-size:13.5px;color:var(--text)">최소 기준 정하기 (수건처럼 정량이 없으면 체크 해제)</label></div>
    <div id="minwrap" class="hide"><label>최소 기준</label><input type="number" id="sm" value="0"></div>
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>추가</button></div>`);
  $('#strk').onchange = () => $('#minwrap').classList.toggle('hide', !$('#strk').checked);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => { const item = $('#si').value.trim(); if (!item) return alert('품목명을 입력하세요'); Store.addRow('stock', { item, location: $('#sl').value.trim(), category: 'etc', qty: Number($('#sq').value) || 0, min: $('#strk').checked ? Number($('#sm').value) : null, note: '' }, { worker: W() }); closeSheet(); refreshAll(); };
}
function lostAddSheet() {
  sheet(`<h3>습득물 등록 <span class="meta">· ${esc(bldName())}</span></h3>
    <label>품목 *</label><input type="text" id="lfD" placeholder="예: 아이폰 15">
    <label>객실</label><input type="text" id="lfR" placeholder="예: 1204호"><label>발견 위치</label><input type="text" id="lfP" placeholder="예: 침대 밑">
    <div class="checkrow"><input type="checkbox" id="lfV"><label for="lfV" style="margin:0;font-size:13.5px;color:var(--text)">귀중품 (즉시 인계)</label></div>
    <label>비고</label><input type="text" id="lfN" placeholder="보관함 번호 등">
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>등록</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => { const desc = $('#lfD').value.trim(); if (!desc) return alert('품목을 입력하세요'); Store.addRow('lost', { foundAt: Store.now(), room: $('#lfR').value.trim(), place: $('#lfP').value.trim(), desc, valuable: $('#lfV').checked, status: 'stored', handedAt: null, deadline: Store.days(30), reporter: W(), note: $('#lfN').value.trim() }, { worker: W() }); closeSheet(); refreshAll(); };
}
function defectAddSheet() {
  sheet(`<h3>하자 접수 <span class="meta">· ${esc(bldName())}</span></h3>
    <label>객실 *</label><input type="text" id="dfR" placeholder="예: 1503호"><label>제목 *</label><input type="text" id="dfT" placeholder="예: 샤워부스 누수"><label>상세</label><textarea id="dfD" rows="3"></textarea>
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>접수</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => { const t = $('#dfT').value.trim(); if (!t) return alert('제목을 입력하세요'); Store.addRow('defects', { room: $('#dfR').value.trim(), title: t, detail: $('#dfD').value.trim(), stage: 'reported', assignee: W(), createdAt: Store.now() }, { worker: W() }); closeSheet(); refreshAll(); };
}
function renderSources() {
  $('#srcList').innerHTML = Store.inBld('sources').map((s) => `<div class="srcitem"><input type="checkbox" data-src="${s.id}" ${s.enabled !== false ? 'checked' : ''}><svg class="ic sm" style="color:var(--dim)"><use href="#i-doc"/></svg><div><div class="tit">${esc(s.title)}</div><div class="meta">${['', '① 내부', '② VINFO', '③ 공식홈', '④ 메모'][s.priority] || ''} · ${s.custVisible ? '고객 안내 가능' : '내부 전용'}</div></div></div>`).join('') || `<div class="empty">등록된 소스가 없습니다.</div>`;
  $$('#srcList [data-src]').forEach((c) => c.onchange = () => { Store.applyChanges([{ entity: 'sources', entityId: c.dataset.src, field: 'enabled', newValue: c.checked, reason: '참조 ' + (c.checked ? '켬' : '끔') }], { worker: W() }); });
}
$('#srcAddBtn').onclick = () => sheet(`<h3>지식 소스 추가 <span class="meta">· ${esc(bldName())}</span></h3>
  <label>제목 *</label><input type="text" id="sT"><label>출처 유형</label><select id="sO"><option value="internal_notice">① 내부 공지</option><option value="vinfo">② VINFO</option><option value="official">③ 공식홈</option><option value="memo" selected>④ 메모</option></select>
  <div class="checkrow"><input type="checkbox" id="sC"><label for="sC" style="margin:0;font-size:13.5px;color:var(--text)">고객 안내 사용 가능</label></div>
  <label>본문 *</label><textarea id="sB" rows="5" placeholder="매뉴얼·공지 본문"></textarea>
  <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>등록</button></div>`) || bindSrcAdd();
function bindSrcAdd() {
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-ok]').onclick = () => { const t = $('#sT').value.trim(), b = $('#sB').value.trim(); if (!t || !b) return alert('제목과 본문을 입력하세요'); const pri = { internal_notice: 1, vinfo: 2, official: 3, memo: 4 }[$('#sO').value]; Store.addRow('sources', { title: t, origin: $('#sO').value, priority: pri, custVisible: $('#sC').checked, collectedAt: Store.now(), content: b, enabled: true }, { worker: W() }); closeSheet(); refreshAll(); };
}

/* ── 팀 톡 ── */
function renderFeed() {
  const msgs = Store.inBld('messages').slice().sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  const me = W();
  let html = '', lastDay = '';
  msgs.forEach((m) => {
    const day = (m.ts || '').slice(0, 10);
    if (day && day !== lastDay) { html += `<div class="day">${day}</div>`; lastDay = day; }
    const mine = me && m.author === me;
    if (m.type === 'notice') { html += `<div class="tmsg notice"><div class="bub"><svg class="ic sm"><use href="#i-pin"/></svg><div><b>공지</b> · ${esc(m.author)}<div style="margin-top:2px">${esc(m.text)}</div></div></div><div class="time">${esc((m.ts || '').slice(11, 16))}</div></div>`; return; }
    if (m.type === 'done') { html += `<div class="tmsg ${mine ? 'mine' : ''} done"><div class="name">${esc(m.author)}</div><div class="bub"><div class="dh"><svg class="ic sm"><use href="#i-check"/></svg>완료: ${esc(m.text)}</div>${m.meta && m.meta.detail ? `<div class="dd">${esc(m.meta.detail)}</div>` : ''}<div class="dt">${esc((m.meta && m.meta.at) || (m.ts || '').slice(0, 16))}</div></div></div>`; return; }
    const file = m.fileId ? (db().files.find((f) => f.id === m.fileId)) : null;
    html += `<div class="tmsg ${mine ? 'mine' : ''}"><div class="name">${esc(m.author)}</div><div class="bub">${m.text ? esc(m.text) : ''}${file ? `<img src="${file.dataUrl}" alt="사진">` : ''}</div><div class="time">${esc((m.ts || '').slice(11, 16))}</div></div>`;
  });
  $('#feed').innerHTML = html || '<div class="empty">첫 메시지를 남겨보세요.</div>';
  $('#feed').scrollTop = $('#feed').scrollHeight;
}
$$('#talkTypes button').forEach((b) => b.onclick = () => { state.talkType = b.dataset.t; $$('#talkTypes button').forEach((x) => x.classList.toggle('on', x === b)); $('#talkText').placeholder = b.dataset.t === 'done' ? '완료한 작업 (예: 812호 도어락 교체)' : b.dataset.t === 'notice' ? '공지 내용' : '메시지'; });
$('#attachBtn').onclick = () => $('#fileInput').click();
$('#camBtn').onclick = () => $('#camInput').click();
const onPick = async (e) => { const f = e.target.files[0]; if (!f) return; state.pendingImg = await compressImage(f); renderAttachPreview(); e.target.value = ''; };
$('#fileInput').onchange = onPick;
$('#camInput').onchange = onPick;
function renderAttachPreview() {
  let p = $('#attachPreview');
  if (!state.pendingImg) { if (p) p.remove(); return; }
  if (!p) { p = document.createElement('div'); p.id = 'attachPreview'; p.className = 'attach-preview'; $('.talkinput').before(p); }
  p.innerHTML = `<img src="${state.pendingImg}"><span>사진 첨부됨</span><button class="rbtn" id="rmImg" style="width:28px;height:28px">✕</button>`;
  $('#rmImg').onclick = () => { state.pendingImg = null; renderAttachPreview(); };
}
function compressImage(file) {
  return new Promise((res) => { const img = new Image(); img.onload = () => { const max = 900, sc = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * sc; c.height = img.height * sc; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.7)); }; img.src = URL.createObjectURL(file); });
}
function sendTalk() {
  const text = $('#talkText').value.trim();
  if (state.talkType === 'text' && !text && !state.pendingImg) return;
  if ((state.talkType === 'notice' || state.talkType === 'done') && !text) return;
  const author = W() || promptName(); if (author === null) return;
  const msg = { type: state.talkType, author, text, ts: Store.now() };
  if (state.pendingImg) { const fid = Store.addRow('files', { dataUrl: state.pendingImg }, { worker: author }); msg.fileId = fid; }
  if (state.talkType === 'done') msg.meta = { detail: '', at: Store.now() };
  Store.addRow('messages', msg, { worker: author });
  $('#talkText').value = ''; state.pendingImg = null; renderAttachPreview();
  state.talkType = 'text'; $$('#talkTypes button').forEach((x) => x.classList.toggle('on', x.dataset.t === 'text'));
  renderFeed();
}
function promptName() { const n = prompt('이름을 입력하세요 (톡에 표시됩니다)'); if (n && n.trim()) { Store.worker = n.trim(); $('#workerChip').textContent = n.trim(); return n.trim(); } return null; }
$('#talkSend').onclick = sendTalk;
$('#talkText').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendTalk(); });

/* ── 스튜디오 ── */
$('#briefGen').onclick = () => { const lines = Logic.briefing(); $('#briefOut').innerHTML = (lines.length ? '<ul class="blist">' + lines.map((l) => `<li><span class="tag">${l.tag}</span><span>${esc(l.text)}</span></li>`).join('') + '</ul>' : '확인할 항목이 없습니다. ✅') + `<p class="meta" style="margin-top:8px">${bldName()} · ${new Date().toTimeString().slice(0, 5)} 생성</p>`; $('#scBrief').classList.add('open'); };
$('#talkSum').onclick = () => {
  const today = Store.today();
  const msgs = Store.inBld('messages').filter((m) => (m.ts || '').startsWith(today));
  const notices = msgs.filter((m) => m.type === 'notice'), dones = msgs.filter((m) => m.type === 'done'), texts = msgs.filter((m) => m.type === 'text');
  $('#talkSumOut').innerHTML = `<div style="font-size:13.5px">오늘 ${bldName()} 톡 <b>${msgs.length}건</b> — 공지 ${notices.length} · 완료보고 ${dones.length} · 대화 ${texts.length}</div>
    ${notices.length ? '<div style="margin-top:8px;font-weight:700;font-size:12.5px;color:var(--clay)">공지</div><ul class="blist">' + notices.map((n) => `<li><span class="tag">공지</span><span>${esc(n.text)} (${esc(n.author)})</span></li>`).join('') + '</ul>' : ''}
    ${dones.length ? '<div style="margin-top:8px;font-weight:700;font-size:12.5px;color:var(--ok)">완료보고</div><ul class="blist">' + dones.map((d) => `<li><span class="tag">완료</span><span>${esc(d.text)}${d.meta && d.meta.detail ? ' — ' + esc(d.meta.detail) : ''} (${esc(d.author)}, ${esc((d.meta && d.meta.at) || (d.ts || '').slice(11, 16))})</span></li>`).join('') + '</ul>' : ''}`;
  $('#scTalk').classList.add('open');
};
$('#dailyBtn').onclick = () => {
  const today = Store.today(), logs = db().audit.filter((a) => (a.ts || '').startsWith(today) && a.bld === Store.bld);
  dlCsv(`일일마감_${bldName()}_${today}.csv`, [['시간', '근무자', '대상', '필드', '전', '후', '사유'], ...logs.map((a) => [a.ts, a.worker, a.entity, a.field, a.old, a.new, a.reason || ''])]);
};
$('#logToggle').onclick = () => { const c = $('#logToggle').closest('.scard'); c.classList.toggle('open'); if (c.classList.contains('open')) renderLog(); };
function renderLog() {
  const rows = db().audit.filter((a) => a.bld === Store.bld).slice(0, 60);
  $('#logOut').innerHTML = rows.map((a) => `<div class="logrow"><span class="t">${esc((a.ts || '').slice(5, 16))}<br>${esc(a.worker || '')}</span><span>${esc(a.entity)} · ${esc(a.field)}: <span style="color:var(--danger);text-decoration:line-through">${esc(String(a.old ?? ''))}</span> → <b>${esc(String(a.new ?? ''))}</b>${a.reason ? ` <span class="meta">· ${esc(a.reason)}</span>` : ''}${a.undone ? ' <span class="st w">취소됨</span>' : ''}</span>${!a.undone && !a.undoOf && a.field !== '(신규)' ? `<button class="undo" data-u="${a.id}"><svg class="ic sm"><use href="#i-undo"/></svg></button>` : ''}</div>`).join('') || '<p class="meta">기록 없음</p>';
  $$('#logOut [data-u]').forEach((b) => b.onclick = () => reqEdit(() => { try { Store.undo(b.dataset.u, W()); } catch (e) { alert(e.message); } refreshAll(); renderLog(); }));
}
function dlCsv(name, rows) { const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; a.click(); }
function renderQuick() {
  const rows = Store.inBld('quickref');
  if (!rows.length) { $('#quickBody').innerHTML = `<p class="meta">${bldName()}의 현장 카드가 없습니다. 공유 서버를 연결하거나 관리자가 등록하면 표시됩니다.</p>`; return; }
  const groups = new Map(); rows.forEach((r) => { if (!groups.has(r.cat)) groups.set(r.cat, []); groups.get(r.cat).push(r); });
  let i = 0;
  $('#quickBody').innerHTML = Array.from(groups.entries()).map(([cat, list]) => `<details class="qgroup" ${i++ < 2 ? 'open' : ''}><summary>${esc(cat)}<span class="meta" style="margin-left:auto">${list.length}</span></summary>${list.map((r) => `<div class="qrow"><span class="ql">${esc(r.label)}</span>${r.value ? `<span class="qcode">${esc(r.value)}</span>` : ''}${r.note ? `<span class="qn">${esc(r.note)}</span>` : ''}</div>`).join('')}</details>`).join('');
}

/* ── 동 선택 ── */
function renderBld() { $('#bldName').textContent = bldName(); }
$('#bldBtn').onclick = () => {
  sheet(`<h3>동 선택</h3><div class="bldlist">${Store.buildings().map((b) => { const n = db().stock.filter((s) => s.bld === b.id).length + db().equipment.filter((s) => s.bld === b.id).length; return `<button data-b="${b.id}" class="${b.id === Store.bld ? 'on' : ''}"><span class="tag">${b.id}</span>${esc(b.name)}<span class="cnt">${n ? '항목 ' + n : '비어 있음'}</span></button>`; }).join('')}</div>`);
  $$('#sheetBody [data-b]').forEach((btn) => btn.onclick = () => { Store.bld = btn.dataset.b; closeSheet(); renderBld(); $('#msgs').innerHTML = ''; briefingCard(); refreshAll(); });
};

/* ── 로그인 / 계정 ── */
function showLogin() {
  const users = Store.Auth.users();
  if (!users.length) {
    sheet(`<h3>관리자 계정 만들기</h3>
      <p class="meta">처음 실행입니다. 관리자 계정을 하나 만들어 주세요. 근무자 계정은 이후 설정에서 추가합니다.</p>
      <label>이름 *</label><input type="text" id="nu" placeholder="예: 김반장" autocomplete="off">
      <label>비밀번호 * (4자 이상)</label><input type="password" id="np" autocomplete="new-password">
      <div id="lerr" class="meta" style="color:var(--danger);min-height:16px;margin-top:6px"></div>
      <div class="foot"><button class="btn filled" data-ok style="width:100%">만들고 시작</button></div>`);
    $('#sheetBody [data-ok]').onclick = async () => {
      try {
        await Store.Auth.create($('#nu').value, $('#np').value, 'admin');
        await Store.Auth.login($('#nu').value.trim(), $('#np').value);
        closeSheet(); afterLogin();
      } catch (e) { $('#lerr').textContent = e.message; }
    };
    return;
  }
  sheet(`<h3>로그인</h3>
    <label>이름</label><select id="lu">${users.map((u) => `<option value="${esc(u.name)}">${esc(u.name)}${u.role === 'admin' ? ' (관리자)' : ''}</option>`).join('')}</select>
    <label>비밀번호</label><input type="password" id="lp" autocomplete="current-password">
    <div id="lerr" class="meta" style="color:var(--danger);min-height:16px;margin-top:6px"></div>
    <div class="foot"><button class="btn filled" data-ok style="width:100%">로그인</button></div>`);
  const go = async () => {
    try { await Store.Auth.login($('#lu').value, $('#lp').value); closeSheet(); afterLogin(); }
    catch (e) { $('#lerr').textContent = e.message; }
  };
  $('#sheetBody [data-ok]').onclick = go;
  $('#lp').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}
function afterLogin() {
  const u = me();
  $('#workerChip').textContent = u ? u.name + (u.role === 'admin' ? ' ·관리' : '') : '로그인';
  $('#msgs').innerHTML = ''; briefingCard(); refreshAll();
}
$('#workerChip').onclick = () => {
  const u = me();
  if (!u) return showLogin();
  sheet(`<h3>${esc(u.name)} <span class="meta">${u.role === 'admin' ? '관리자' : '근무자'}</span></h3>
    ${isAdmin() ? `<label>계정 관리</label><div id="ulist"></div>
      <button class="btn" data-add style="width:100%;margin-top:8px">＋ 근무자 계정 추가</button>` : '<p class="meta">수정 권한은 관리자 계정에만 있습니다.</p>'}
    <div class="foot"><button class="btn" data-c>닫기</button><button class="btn danger" data-out>로그아웃</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-out]').onclick = () => { Store.Auth.logout(); closeSheet(); showLogin(); };
  if (isAdmin()) {
    const draw = () => {
      $('#ulist').innerHTML = Store.Auth.users().map((x) => `<div class="qrow"><span class="ql">${esc(x.name)}</span>
        <span class="meta">${x.role === 'admin' ? '관리자' : '근무자'}</span>
        ${x.id !== u.id ? `<button class="act" data-role="${x.id}" data-to="${x.role === 'admin' ? 'staff' : 'admin'}">${x.role === 'admin' ? '근무자로' : '관리자로'}</button>
        <button class="act" data-del="${x.id}" style="border-color:var(--danger-line);color:var(--danger)">삭제</button>` : '<span class="meta">(나)</span>'}</div>`).join('');
      $$('#ulist [data-role]').forEach((b) => b.onclick = () => { Store.Auth.setRole(b.dataset.role, b.dataset.to); draw(); });
      $$('#ulist [data-del]').forEach((b) => b.onclick = () => { if (confirm('이 계정을 삭제할까요?')) { Store.Auth.remove(b.dataset.del); draw(); } });
    };
    draw();
    $('#sheetBody [data-add]').onclick = () => {
      sheet(`<h3>근무자 계정 추가</h3><label>이름 *</label><input type="text" id="au" autocomplete="off">
        <label>비밀번호 * (4자 이상)</label><input type="password" id="ap" autocomplete="new-password">
        <div class="checkrow"><input type="checkbox" id="aa"><label for="aa" style="margin:0;font-size:13.5px;color:var(--text)">관리자 권한 부여(수정 가능)</label></div>
        <div id="aerr" class="meta" style="color:var(--danger);min-height:16px;margin-top:6px"></div>
        <div class="foot"><button class="btn" data-c>취소</button><button class="btn filled" data-ok>추가</button></div>`);
      $('#sheetBody [data-c]').onclick = closeSheet;
      $('#sheetBody [data-ok]').onclick = async () => {
        try { await Store.Auth.create($('#au').value, $('#ap').value, $('#aa').checked ? 'admin' : 'staff'); closeSheet(); alert('계정이 추가됐습니다.'); }
        catch (e) { $('#aerr').textContent = e.message; }
      };
    };
  }
};

/* ── 설정 ── */
function toggleTheme() { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'dark' ? '' : 'dark'; localStorage.setItem('hos.theme', r.dataset.theme); document.querySelector('meta[name=theme-color]').content = r.dataset.theme === 'dark' ? '#1b1714' : '#faf7f2'; }
$('#gearBtn').onclick = () => {
  const connected = !!Store.Sync.cfg;
  sheet(`<h3>설정</h3>
    <div class="qrow" style="padding:0 0 4px"><span class="ql">공유 서버</span><span class="qcode" style="background:${connected ? 'var(--ok-bg)' : 'var(--surface-2)'};color:${connected ? 'var(--ok)' : 'var(--dim)'}">${connected ? { synced: '연결됨 ✓', syncing: '동기화 중…', error: '오류', idle: '연결됨' }[Store.Sync.status] || '연결됨' : '로컬 모드'}</span></div>
    ${connected && Store.Sync.status === 'error' ? `<div class="meta" style="color:var(--danger);margin-bottom:8px">${esc(Store.Sync.lastError || '동기화 실패 — 토큰/저장소 확인')}</div>` : ''}
    <button class="btn filled" data-team style="width:100%;margin-bottom:6px">팀 암호로 연결</button>
    <button class="btn" data-tok style="width:100%;margin-bottom:8px">GitHub 토큰으로 바로 연결</button>
    <div class="qrow" style="padding:8px 0 6px"><span class="ql">AI 도우미</span><span class="qcode" style="background:${AI.enabled() ? 'var(--ok-bg)' : 'var(--surface-2)'};color:${AI.enabled() ? 'var(--ok)' : 'var(--dim)'}">${esc(AI.providerName())}</span></div>
    <button class="btn" data-ai style="width:100%;margin-bottom:8px">AI 연결 설정</button>
    <details style="margin:8px 0"><summary class="meta" style="cursor:pointer;padding:6px 0">데이터 초기화</summary>
      <button class="btn" data-clear style="width:100%;margin:6px 0">예시 데이터 비우기 (빈 상태로 시작)</button>
      <button class="btn danger" data-reseed style="width:100%">예시 데이터로 되돌리기</button>
      <p class="meta" style="margin-top:6px">공유 서버 연결 시 이 변경도 동기화됩니다. 실제 데이터를 채우기 전에 "비우기"를 권장합니다.</p></details>
    <details style="margin-bottom:8px"><summary class="meta" style="cursor:pointer;padding:6px 0">고급 — 저장소·토큰 직접 입력</summary>
      <label>데이터 저장소</label><input type="text" id="cfgRepo" placeholder="owner/repo" value="${esc((Store.Sync.cfg && Store.Sync.cfg.repo) || '')}">
      <label>토큰</label><input type="password" id="cfgTok" placeholder="github_pat_…" value="${esc((Store.Sync.cfg && Store.Sync.cfg.token) || '')}">
      <div class="foot"><button class="btn" data-off>로컬 모드</button><button class="btn filled" data-save>저장</button></div></details>
    <hr style="border:none;border-top:1px solid var(--surface-2);margin:12px 0">
    <div class="meta">버전 ${APP_VERSION} · <button style="color:var(--accent)" data-upd>업데이트 확인</button> · <button style="color:var(--accent)" data-th>다크/라이트</button></div>`);
  $('#sheetBody [data-team]').onclick = async () => { const cfg = await Store.Team.fetch(); if (!cfg) return alert('아직 팀 연결이 설정되지 않았습니다. 관리자가 seal.html로 team.json을 등록해야 합니다.'); unlockSheet(cfg); };
  $('#sheetBody [data-tok]').onclick = tokenConnectSheet;
  $('#sheetBody [data-ai]').onclick = aiSheet;
  $('#sheetBody [data-clear]').onclick = () => reqEdit(() => { if (confirm(`${bldName()} 포함 모든 동의 재고·장비·습득물·하자·톡·로그를 비웁니다. 계속할까요?`)) { Store.clearOperational(); closeSheet(); refreshAll(); $('#msgs').innerHTML = ''; briefingCard(); } });
  $('#sheetBody [data-reseed]').onclick = () => reqEdit(() => { if (confirm('예시 데이터로 되돌립니다(현재 데이터 삭제). 계속할까요?')) { Store.resetSeed(); location.reload(); } });
  $('#sheetBody [data-save]').onclick = () => { const repo = $('#cfgRepo').value.trim(), token = $('#cfgTok').value.trim(); if (!repo || !token) return alert('저장소와 토큰을 입력하세요'); Store.Sync.configure({ repo, token, branch: 'main', path: 'data/db.json' }); closeSheet(); refreshHead(); };
  $('#sheetBody [data-off]').onclick = () => { Store.Sync.configure(null); closeSheet(); refreshHead(); };
  $('#sheetBody [data-upd]').onclick = checkUpdate;
  $('#sheetBody [data-th]').onclick = toggleTheme;
};
function tokenConnectSheet() {
  const c = Store.Sync.cfg || {};
  sheet(`<h3>GitHub 토큰으로 연결</h3>
    <p class="meta">관리자가 비공개 데이터 저장소용 <b>fine-grained 토큰</b>을 발급해 붙여넣으면 모든 기기가 같은 데이터를 봅니다. 발급 방법은 아래 링크 참고.</p>
    <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" style="color:var(--accent);font-size:12.5px;display:inline-block;margin-bottom:8px">→ GitHub 토큰 발급 페이지 열기</a>
    <div class="meta" style="margin-bottom:8px">발급 시: Repository access = <b>houseman-os-data</b> 하나만 · Permissions = <b>Contents: Read and write</b></div>
    <label>데이터 저장소</label><input type="text" id="tcRepo" value="${esc(c.repo || 'jykim5215/houseman-os-data')}">
    <label>토큰 (github_pat_…)</label><input type="password" id="tcTok" placeholder="붙여넣기" autocomplete="off" value="${esc(c.token || '')}">
    <div id="tcerr" class="meta" style="min-height:16px;margin-top:6px"></div>
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn" data-test>테스트</button><button class="btn filled" data-ok>연결</button></div>`);
  const read = () => ({ repo: $('#tcRepo').value.trim(), token: $('#tcTok').value.trim(), branch: 'main', path: 'data/db.json' });
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-test]').onclick = async (ev) => {
    ev.target.textContent = '확인 중…';
    try { const ok = await Store.Sync.test(read()); $('#tcerr').style.color = ok ? 'var(--ok)' : 'var(--danger)'; $('#tcerr').textContent = ok ? '✓ 연결 확인' : '✗ 실패 — 저장소/토큰 확인'; }
    catch (e) { $('#tcerr').style.color = 'var(--danger)'; $('#tcerr').textContent = e.message; }
    ev.target.textContent = '테스트';
  };
  $('#sheetBody [data-ok]').onclick = () => { const v = read(); if (!v.repo || !v.token) return alert('저장소와 토큰을 입력하세요'); Store.Sync.configure(v); closeSheet(); refreshHead(); setTimeout(() => Store.Sync.pullPush().then(() => refreshAll()), 200); };
}

function aiSheet() {
  const c = AI.cfg || { provider: 'gemini', model: 'gemini-2.5-flash', key: '' };
  const opts = (p) => AI.MODELS[p].map((m) => `<option value="${m}" ${m === c.model ? 'selected' : ''}>${m}</option>`).join('');
  sheet(`<h3>AI 연결</h3>
    <p class="meta">키는 <b>이 기기에만</b> 저장되고 선택한 제공사로만 전송됩니다. 연결하면 정해진 문장이 아니어도 자유롭게 묻고 지시할 수 있습니다.</p>
    <label>제공사</label><select id="aip">
      <option value="gemini" ${c.provider === 'gemini' ? 'selected' : ''}>Gemini (Google · 무료 키)</option>
      <option value="anthropic" ${c.provider === 'anthropic' ? 'selected' : ''}>Claude (Anthropic)</option>
      <option value="openai" ${c.provider === 'openai' ? 'selected' : ''}>OpenAI</option></select>
    <label>모델</label><select id="aim">${opts(c.provider)}</select>
    <label>API 키</label><input type="password" id="aik" placeholder="붙여넣기" value="${esc(c.key || '')}" autocomplete="off">
    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="color:var(--accent);font-size:12.5px;display:inline-block;margin-top:6px" id="aikeylink">→ 무료 Gemini 키 발급 (Google AI Studio)</a>
    <div id="aierr" class="meta" style="min-height:16px;margin-top:6px"></div>
    <div class="foot"><button class="btn" data-off>사용 안 함</button><button class="btn" data-test>연결 테스트</button><button class="btn filled" data-ok>저장</button></div>`);
  $('#aip').onchange = () => {
    const p = $('#aip').value;
    $('#aim').innerHTML = AI.MODELS[p].map((m) => `<option value="${m}">${m}</option>`).join('');
    const links = { gemini: ['https://aistudio.google.com/apikey', '→ 무료 Gemini 키 발급 (Google AI Studio)'], anthropic: ['https://console.anthropic.com/settings/keys', '→ Claude API 키 발급'], openai: ['https://platform.openai.com/api-keys', '→ OpenAI API 키 발급'] }[p];
    const a = $('#aikeylink'); if (a) { a.href = links[0]; a.textContent = links[1]; }
  };
  const read = () => ({ provider: $('#aip').value, model: $('#aim').value, key: $('#aik').value.trim() });
  $('#sheetBody [data-off]').onclick = () => { AI.configure(null); closeSheet(); };
  $('#sheetBody [data-test]').onclick = async (ev) => {
    ev.target.textContent = '확인 중…';
    try { await AI.test(read()); $('#aierr').style.color = 'var(--ok)'; $('#aierr').textContent = '✓ 연결 성공'; }
    catch (e) { $('#aierr').style.color = 'var(--danger)'; $('#aierr').textContent = e.message; }
    ev.target.textContent = '연결 테스트';
  };
  $('#sheetBody [data-ok]').onclick = () => { const v = read(); if (!v.key) return alert('API 키를 입력하세요'); AI.configure(v); closeSheet(); };
}
function unlockSheet(cfg) {
  sheet(`<h3>공유 서버 연결</h3><p class="meta">팀 암호를 입력하면 모든 근무자가 같은 데이터를 봅니다. 이 기기에서는 처음 한 번만.</p>
    <label>팀 암호</label><input type="password" id="tpass" autocomplete="off" placeholder="관리자에게 받은 팀 암호">
    <div id="tperr" class="meta" style="color:var(--danger);min-height:16px;margin-top:6px"></div>
    <div class="foot"><button class="btn" data-skip>로컬로</button><button class="btn filled" data-ok>연결</button></div>`);
  const go = async () => { const p = $('#tpass').value.trim(); if (!p) return; $('#tperr').textContent = '연결 중…'; try { await Store.Team.unlock(p, cfg); closeSheet(); refreshAll(); } catch { $('#tperr').textContent = '암호가 올바르지 않습니다.'; } };
  $('#sheetBody [data-ok]').onclick = go; $('#tpass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); $('#sheetBody [data-skip]').onclick = closeSheet;
}
$('#syncBtn').onclick = () => { if (Store.Sync.cfg) Store.Sync.pullPush(); else $('#gearBtn').click(); };

/* ── 헤더/공통 ── */
function refreshHead() {
  const st = Store.Sync.status, stKo = { local: '로컬', idle: '대기', syncing: '동기화 중', synced: '연결됨', error: '오류' }[st] || st;
  const sb = $('#syncBtn'); sb.classList.toggle('spin', st === 'syncing'); sb.classList.toggle('err', st === 'error'); sb.classList.toggle('okc', st === 'synced');
}
function refreshAll() { renderCounters(); if ($('#tab-data').classList.contains('on')) renderData(); if ($('#tab-talk').classList.contains('on')) renderFeed(); renderQuick(); refreshHead(); }

/* ── 탭 ── */
function go(t) { state.tab = t; $$('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); $$('.tabview').forEach((v) => v.classList.toggle('on', v.id === 'tab-' + t)); if (t === 'data') renderData(); if (t === 'talk') renderFeed(); }
$$('nav button').forEach((b) => b.onclick = () => go(b.dataset.tab));
$$('#seg button').forEach((b) => b.onclick = () => { state.seg = b.dataset.c; state.q = ''; renderData(); });

/* ── PWA ── */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
async function checkUpdate() { try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json(); if (j.version && j.version !== APP_VERSION) $('#updBar').classList.remove('hide'); else alert('최신 버전입니다 (v' + APP_VERSION + ')'); } catch {} }
setInterval(async () => { try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json(); if (j.version && j.version !== APP_VERSION) $('#updBar').classList.remove('hide'); } catch {} }, 5 * 60 * 1000);
$('#updGo').onclick = async () => { if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.update())); } if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } location.reload(); };

/* ── 시작 ── */
(function init() {
  const th = localStorage.getItem('hos.theme'); if (th) { document.documentElement.dataset.theme = th; document.querySelector('meta[name=theme-color]').content = th === 'dark' ? '#1b1714' : '#faf7f2'; }
  Store.load(); renderBld();
  setMode('ask'); renderCounters(); renderQuick(); refreshHead();
  Store.Sync.onStatus(() => refreshHead()); Store.Sync.onChange(() => refreshAll()); Store.Sync.start();
  const u = me();
  if (u) { $('#workerChip').textContent = u.name + (u.role === 'admin' ? ' ·관리' : ''); briefingCard(); }
  else { $('#workerChip').textContent = '로그인'; showLogin(); }
  (async () => { if (!Store.Sync.cfg) { const cfg = await Store.Team.fetch(); if (cfg && !me()) return; if (cfg) unlockSheet(cfg); } })();
})();
