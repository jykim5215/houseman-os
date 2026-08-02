/* 하우스맨 노트 — UI v0.5 (동별 분리 · 챗 모드 · 팀 톡 · 관리자 PIN) */
'use strict';
const APP_VERSION = '0.11.0';

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
const thinkingDots = '<span class="thinking" aria-label="생각 중"><i></i><i></i><i></i></span>';

/* 답변을 보기 좋게: 표 | | · 불릿 - · **굵게** · 줄바꿈 렌더 (가벼운 마크다운) */
function md(s) {
  const esch = (x) => String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const inline = (x) => esch(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>');
  const lines = String(s || '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length;) {
    const ln = lines[i];
    if (/^\s*\|.*\|\s*$/.test(ln) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const rows = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]), body = rows.slice(2).map(cells);
      out.push('<div class="md-tw"><table class="md"><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>' + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (/^\s*[-•]\s+/.test(ln)) {
      const items = []; while (i < lines.length && /^\s*[-•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-•]\s+/, ''));
      out.push('<ul class="md">' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ul>');
      continue;
    }
    if (/^\s*#{1,3}\s+/.test(ln)) { out.push(`<div class="md-h">${inline(ln.replace(/^\s*#{1,3}\s+/, ''))}</div>`); i++; continue; }
    if (ln.trim() === '') { i++; continue; }
    out.push(`<div class="md-p">${inline(ln)}</div>`); i++;
  }
  return out.join('');
}

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
    return aiMsg('', (a.customerText ? `<div class="dual"><div class="box cust"><span class="t">고객 안내용</span>${md(a.customerText)}</div><div class="box"><span class="t">내부 참고</span>${md(a.internalText)}</div></div>` : md(a.internalText)) + (a.conflict ? `<div class="conflict"><svg class="ic sm"><use href="#i-alert"/></svg><span>${esc(a.conflict)}</span></div>` : '') + citeChips(a.sources));
  }

  // 규칙으로 못 풀면 LLM에게 (설정된 경우)
  if (!AI.enabled()) return aiMsg('', `잘 이해하지 못했어요. ${HELP}<div class="meta" style="margin-top:6px">설정 ⚙에서 AI를 연결하면 자유로운 문장도 이해합니다.</div>`);
  const thinking = aiMsg('', thinkingDots);
  try {
    const r = await AI.ask(text, Logic.snapshot(text));
    thinking.remove();
    if (r.kind === 'propose' && Array.isArray(r.changes) && r.changes.length) {
      return void needAdmin(() => renderProposal({ summary: r.summary || '변경 제안', changes: r.changes.map((c) => ({ ...c, reason: r.reason || text })) }));
    }
    if (r.kind === 'delete' && Array.isArray(r.ids) && r.ids.length) {
      return void needAdmin(() => renderDelete({ entity: r.entity || 'messages', ids: r.ids, summary: r.summary || '삭제', preview: [] }));
    }
    aiMsg('', md(r.text || '답을 만들지 못했습니다.') + `<div class="meta" style="margin-top:6px">${esc(AI.providerName())}</div>`);
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
  const list = Store.load().sources.filter((s) => s.bld === Store.bld || s.bld === '*');
  $('#srcList').innerHTML = list.map((s) => `<div class="srcitem"><input type="checkbox" data-src="${s.id}" ${s.enabled !== false ? 'checked' : ''}><svg class="ic sm" style="color:var(--dim)"><use href="#i-doc"/></svg><div><div class="tit">${esc(s.title)}${s.bld === '*' ? ' <span class="st k">공통</span>' : ''}</div><div class="meta">${['', '① 내부', '② VINFO', '③ 공식홈', '④ 메모'][s.priority] || ''} · ${s.custVisible ? '고객 안내 가능' : '내부 전용'}</div></div></div>`).join('') || `<div class="empty">등록된 소스가 없습니다.</div>`;
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
  const b = Store.bld;
  const rows = Store.load().quickref.filter((r) => r.bld === b || r.bld === '*' || (Array.isArray(r.blds) && r.blds.includes(b)));
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
  // 계정은 팀 공용 하나뿐 — 만들기·선택 없이 비밀번호만
  sheet(`<h3>로그인</h3>
    <p class="meta">팀 공용 계정 하나로 모든 기능을 씁니다.</p>
    <label>아이디</label><input type="text" id="lu" value="${esc(Store.Auth.FIXED_NAME)}" autocomplete="username" readonly>
    <label>비밀번호</label><input type="password" id="lp" autocomplete="current-password" placeholder="비밀번호">
    <div id="lerr" class="meta" style="color:var(--danger);min-height:16px;margin-top:6px"></div>
    <div class="foot"><button class="btn filled" data-ok style="width:100%">로그인</button></div>`);
  const go = async () => {
    try { await Store.Auth.login($('#lu').value, $('#lp').value); closeSheet(); afterLogin(); }
    catch (e) { $('#lerr').textContent = e.message; }
  };
  $('#sheetBody [data-ok]').onclick = go;
  $('#lp').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  setTimeout(() => { const el = $('#lp'); if (el) el.focus(); }, 320);
}
function afterLogin() {
  const u = me();
  $('#workerChip').textContent = u ? u.name + (u.role === 'admin' ? ' ·관리' : '') : '로그인';
  $('#msgs').innerHTML = ''; briefingCard(); refreshAll();
}
$('#workerChip').onclick = () => {
  const u = me();
  if (!u) return showLogin();
  sheet(`<h3>${esc(u.name)} <span class="meta">팀 공용 계정</span></h3>
    <p class="meta">계정은 하나로 고정돼 있고 모든 기능을 쓸 수 있습니다. 계정 추가·권한 변경은 없습니다.</p>
    <div class="foot"><button class="btn" data-c>닫기</button><button class="btn danger" data-out>로그아웃</button></div>`);
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-out]').onclick = () => { Store.Auth.logout(); closeSheet(); showLogin(); };
};

/* ── 설정 ── */
function toggleTheme() { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'dark' ? '' : 'dark'; localStorage.setItem('hos.theme', r.dataset.theme); document.querySelector('meta[name=theme-color]').content = r.dataset.theme === 'dark' ? '#1a1410' : '#f7f1e5'; }
$('#gearBtn').onclick = () => {
  const connected = !!Store.Sync.cfg, admin = isAdmin(), st = Store.Sync.status;
  const stLabel = connected ? ({ synced: '연결됨 ✓', syncing: '동기화 중…', error: '오류', idle: '연결됨' }[st] || '연결됨') : '미연결';
  sheet(`<h3>설정</h3>
    <div class="qrow" style="padding:0 0 6px"><span class="ql">공유 서버</span><span class="qcode" style="background:${connected ? 'var(--ok-bg)' : 'var(--surface-2)'};color:${connected ? 'var(--ok)' : 'var(--dim)'}">${stLabel}</span></div>
    ${connected && st === 'error' ? `<div class="meta" style="color:var(--danger);margin-bottom:6px">${esc(Store.Sync.lastError || '동기화 실패')}</div>` : ''}
    ${connected ? `<button class="btn" data-diag style="width:100%;margin-bottom:4px">연결 진단</button>
    <div id="diagOut" class="meta" style="min-height:16px;margin-bottom:6px"></div>
    ${st === 'error' && admin ? `<button class="btn filled" data-fix style="width:100%;margin-bottom:8px">지금 고치기 — 새 토큰으로 재봉인</button>` : ''}` : ''}
    ${connected ? '' : `<button class="btn filled" data-conn style="width:100%;margin-bottom:8px">팀 코드로 연결</button>`}
    ${admin ? `<details style="margin:6px 0" open><summary style="cursor:pointer;font-weight:700;padding:6px 0;font-size:13.5px">관리자 설정</summary>
      <div class="qrow" style="padding:6px 0 2px"><span class="ql">팀 코드 연결</span><span class="qcode" id="tjState" style="background:var(--surface-2);color:var(--dim)">확인 중…</span></div>
      <p class="meta" id="tjHint" style="margin:2px 0 8px">&nbsp;</p>
      <div class="qrow" style="padding:2px 0"><span class="ql">AI 도우미</span><span class="qcode" style="background:${AI.enabled() ? 'var(--ok-bg)' : 'var(--surface-2)'};color:${AI.enabled() ? 'var(--ok)' : 'var(--dim)'}">${esc(AI.providerName())}${Store.getSharedAI() ? ' · 팀공유' : ''}</span></div>
      <button class="btn" data-ai style="width:100%;margin:4px 0 8px">AI 키 설정 (팀 공유)</button>
      <button class="btn" data-clear style="width:100%;margin:4px 0">예시 데이터 비우기</button>
      <details style="margin-top:10px"><summary class="meta" style="cursor:pointer;padding:6px 0">고급 — 토큰 교체·재봉인</summary>
        <p class="meta" style="margin:4px 0">평소에는 쓸 일이 없습니다. GitHub 토큰이 만료·유출됐거나 팀 코드를 바꿀 때만 사용하세요.</p>
        <button class="btn" data-seal style="width:100%;margin:4px 0">토큰 재봉인 / 팀 코드 변경</button>
        <button class="btn danger" data-reseed style="width:100%;margin-top:6px">예시로 되돌리기</button>
      </details>
      </details>` : `<p class="meta" style="margin:2px 0 8px">토큰·AI 키는 관리자가 이미 설정해 두었습니다. 이 기기에 자동 적용되므로 따로 입력할 필요가 없습니다.</p>`}
    <hr style="border:none;border-top:1px solid var(--surface-2);margin:12px 0">
    <div class="meta">${esc((me() || {}).name || '')}${admin ? ' · 관리자' : ''} · 버전 ${APP_VERSION} · <button style="color:var(--accent)" data-upd>업데이트</button> · <button style="color:var(--accent)" data-th>다크/라이트</button> · <button style="color:var(--danger)" data-out>로그아웃</button></div>`);
  $('#sheetBody [data-conn]') && ($('#sheetBody [data-conn]').onclick = connectFlow);
  $('#sheetBody [data-diag]') && ($('#sheetBody [data-diag]').onclick = async (ev) => {
    const out = $('#diagOut'); ev.target.textContent = '진단 중…';
    out.style.color = 'var(--dim)'; out.textContent = '';
    const r = await Store.Sync.diagnose();
    out.style.color = r.ok ? 'var(--ok)' : 'var(--danger)';
    out.textContent = (r.ok ? '✓ ' : '✗ ') + r.msg;
    if (r.ok) { try { await Store.Sync.pullPush(); refreshAll(); } catch {} }
    ev.target.textContent = '연결 진단';
  });
  $('#sheetBody [data-seal]') && ($('#sheetBody [data-seal]').onclick = sealSheet);
  $('#sheetBody [data-fix]') && ($('#sheetBody [data-fix]').onclick = sealSheet);
  if (admin && $('#tjState')) {
    Store.Team.fetch().then((tj) => {
      const s = $('#tjState'), h = $('#tjHint'); if (!s) return;
      if (tj) { s.textContent = '준비됨 ✓'; s.style.background = 'var(--ok-bg)'; s.style.color = 'var(--ok)'; h.textContent = '다른 기기는 팀 코드만 입력하면 연결됩니다. 토큰을 다시 넣을 필요 없습니다.'; }
      else { s.textContent = '미설정'; s.style.background = 'var(--warn-bg)'; s.style.color = 'var(--warn)'; h.innerHTML = '아직 팀 코드 연결이 없습니다. 아래 <b>고급</b>에서 한 번만 봉인하세요.'; }
    });
  }
  $('#sheetBody [data-ai]') && ($('#sheetBody [data-ai]').onclick = aiSheet);
  $('#sheetBody [data-clear]') && ($('#sheetBody [data-clear]').onclick = () => reqEdit(() => { if (confirm('모든 동의 재고·장비·습득물·하자·톡·로그를 비웁니다. 계속할까요?')) { Store.clearOperational(); closeSheet(); refreshAll(); $('#msgs').innerHTML = ''; briefingCard(); } }));
  $('#sheetBody [data-reseed]') && ($('#sheetBody [data-reseed]').onclick = () => reqEdit(() => { if (confirm('예시 데이터로 되돌립니다(현재 기기 데이터 삭제). 계속할까요?')) { Store.resetSeed(); location.reload(); } }));
  $('#sheetBody [data-upd]').onclick = checkUpdate;
  $('#sheetBody [data-th]').onclick = toggleTheme;
  $('#sheetBody [data-out]').onclick = () => { Store.Auth.logout(); closeSheet(); showLogin(); };
};

async function connectFlow() {
  const cfg = await Store.Team.fetch();
  if (cfg) return teamGate(cfg);
  if (isAdmin()) { if (confirm('아직 팀 서버가 설정되지 않았습니다. 지금 만들까요?')) sealSheet(); return; }
  alert('관리자가 아직 팀 서버를 설정하지 않았습니다. 관리자에게 문의하세요.');
}

/* 관리자: 토큰을 팀 코드로 봉인 → 이 기기 즉시 연결 + team.json 내용 생성 */
function sealSheet() {
  sheet(`<h3>팀 서버 설정</h3>
    <p class="meta">GitHub 토큰과 <b>팀 코드</b>를 정하면 모든 기기가 <b>팀 코드 하나</b>로 연결됩니다. 토큰은 팀 코드로 암호화되어 공개 코드엔 평문으로 남지 않습니다.</p>
    <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" class="btn" style="display:block;text-align:center;text-decoration:none;margin:8px 0">→ GitHub 토큰 발급 페이지 열기</a>
    <div class="meta" style="background:var(--warn-bg);border-radius:var(--r-md);padding:9px 11px;margin-bottom:6px;color:var(--warn)">
      발급할 때 <b>3가지</b>를 꼭 맞춰주세요. 하나라도 틀리면 연결이 안 됩니다.<br>
      ① Repository access → <b>Only select repositories</b> → <b>houseman-os-data</b> 선택<br>
      &nbsp;&nbsp;&nbsp;(기본값 <i>Public repositories</i> 그대로 두면 비공개 저장소를 못 봅니다)<br>
      ② Permissions → Repository → <b>Contents: Read and write</b><br>
      ③ Expiration → 길게 (만료되면 다시 발급해야 합니다)
    </div>
    <label>데이터 저장소</label><input type="text" id="szRepo" value="${esc((Store.Sync.cfg && Store.Sync.cfg.repo) || 'jykim5215/houseman-os-data')}">
    <label>GitHub 토큰 (github_pat_…)</label><input type="password" id="szTok" placeholder="붙여넣기" autocomplete="off">
    <label>팀 코드 (근무자에게 알려줄 암호 · 길게)</label><input type="text" id="szCode" placeholder="예: vivaldi-oak-2026">
    <p class="meta" style="margin-top:4px">이미 쓰던 팀 코드가 있다면 <b>같은 코드를 그대로</b> 입력하세요. 그러면 다른 기기는 아무것도 다시 할 필요가 없습니다.</p>
    <div id="szerr" class="meta" style="min-height:16px;margin-top:6px"></div>
    <div class="foot"><button class="btn" data-c>취소</button><button class="btn" data-test>토큰 확인</button><button class="btn filled" data-ok>봉인하고 연결</button></div>`);
  const read = () => ({ repo: $('#szRepo').value.trim(), token: $('#szTok').value.trim(), code: $('#szCode').value.trim() });
  $('#sheetBody [data-c]').onclick = closeSheet;
  $('#sheetBody [data-test]').onclick = async (ev) => {
    const v = read(); if (!v.repo || !v.token) return alert('저장소와 토큰을 입력하세요');
    ev.target.textContent = '확인 중…';
    try { const r = await Store.Sync.diagnose({ repo: v.repo, token: v.token, branch: 'main', path: 'data/db.json' }); $('#szerr').style.color = r.ok ? 'var(--ok)' : 'var(--danger)'; $('#szerr').textContent = (r.ok ? '✓ ' : '✗ ') + r.msg; }
    catch (e) { $('#szerr').style.color = 'var(--danger)'; $('#szerr').textContent = e.message; }
    ev.target.textContent = '토큰 확인';
  };
  $('#sheetBody [data-ok]').onclick = async () => {
    const v = read();
    if (!v.repo || !v.token) return alert('저장소와 토큰을 입력하세요');
    if (v.code.length < 6) return alert('팀 코드는 6자 이상으로 정해주세요');
    $('#szerr').style.color = 'var(--dim)'; $('#szerr').textContent = '봉인 중…';
    try {
      // 1) 이 기기 즉시 연결
      Store.Sync.configure({ repo: v.repo, token: v.token, branch: 'main', path: 'data/db.json' });
      await Store.Sync.pullPush();
      // 2) team.json 내용 생성(암호문)
      const blob = await Store.Team.seal(v.token, v.repo, v.code);
      const json = JSON.stringify(blob, null, 2);
      sheet(`<h3>✅ 이 기기 연결 완료</h3>
        <p class="meta">다른 기기는 아래 <b>team.json</b>을 등록해야 팀 코드로 연결됩니다. 이 내용을 복사해 Claude에게 주거나 저장소의 <code>docs/team.json</code>에 커밋하세요. (암호문이라 안전합니다)</p>
        <textarea id="szout" readonly style="height:150px;font-family:monospace;font-size:11px">${esc(json)}</textarea>
        <div class="foot"><button class="btn" data-copy>복사</button><button class="btn filled" data-done>완료</button></div>`);
      $('#sheetBody [data-copy]').onclick = () => { const t = $('#szout'); t.select(); try { navigator.clipboard.writeText(json); } catch { document.execCommand('copy'); } $('#sheetBody [data-copy]').textContent = '복사됨 ✓'; };
      $('#sheetBody [data-done]').onclick = () => { closeSheet(); refreshAll(); };
    } catch (e) { $('#szerr').style.color = 'var(--danger)'; $('#szerr').textContent = e.message; }
  };
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
    ${isAdmin() ? `<div class="checkrow"><input type="checkbox" id="aishare" ${(Store.getSharedAI() || !AI.enabled()) ? 'checked' : ''}><label for="aishare" style="margin:0;font-size:13px;color:var(--text)">팀 전체에 공유 (모든 기기가 이 키로 자동 사용 — 권장)</label></div>
    <p class="meta" style="margin-top:4px">공유하면 다른 근무자는 키를 넣을 필요가 없습니다. 키는 비공개 데이터 저장소에만 저장됩니다.</p>` : ''}
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
  $('#sheetBody [data-ok]').onclick = () => {
    const v = read(); if (!v.key) return alert('API 키를 입력하세요');
    const share = isAdmin() ? $('#aishare') : null;
    const shared = !!(share && share.checked);
    AI.configure({ ...v, own: !shared });   // 팀 공유가 아니면 '이 기기 전용' 표시 → 공유 키가 덮어쓰지 않음
    if (isAdmin()) Store.setSharedAI(shared ? v : null);
    closeSheet();
  };
}
/* 팀 코드 입력 → 토큰 복호화 → 연결 → 계정/키 동기화 → 로그인 */
function teamGate(cfg) {
  const loggedIn = !!me();
  sheet(`<h3>팀 연결</h3><p class="meta">팀 코드를 입력하면 우리 팀 데이터에 연결됩니다. 이 기기에서는 <b>처음 한 번만</b> 입력하면 됩니다.</p>
    <label>팀 코드</label><input type="password" id="tg" autocomplete="off" placeholder="관리자에게 받은 팀 코드">
    <div id="tge" class="meta" style="min-height:16px;margin-top:6px"></div>
    <div class="foot"><button class="btn" data-skip>나중에</button><button class="btn filled" data-ok>연결</button></div>`);
  const go = async () => {
    const p = $('#tg').value.trim(); if (!p) return;
    $('#tge').style.color = 'var(--dim)'; $('#tge').textContent = '연결 중…';
    try { await Store.Team.unlock(p, cfg); await Store.Sync.pullPush(); closeSheet(); if (loggedIn) { afterLogin(); } else { showLogin(); } }
    catch { $('#tge').style.color = 'var(--danger)'; $('#tge').textContent = '팀 코드가 올바르지 않습니다.'; }
  };
  $('#sheetBody [data-ok]').onclick = go;
  $('#tg').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  $('#sheetBody [data-skip]').onclick = () => { closeSheet(); if (!loggedIn) showLogin(); };
}
$('#syncBtn').onclick = () => { if (Store.Sync.cfg) Store.Sync.pullPush(); else $('#gearBtn').click(); };

/* ── 헤더/공통 ── */
function refreshHead() {
  const st = Store.Sync.status, stKo = { local: '로컬', idle: '대기', syncing: '동기화 중', synced: '연결됨', error: '오류' }[st] || st;
  const sb = $('#syncBtn'); sb.classList.toggle('spin', st === 'syncing'); sb.classList.toggle('err', st === 'error'); sb.classList.toggle('okc', st === 'synced');
}
/* 팀 공유 AI 키를 이 기기에 계속 붙여 둔다.
   예전엔 '키가 없을 때만' 적용해서, 로컬 키가 한 번 비거나 어긋나면 다시 안 붙었다(키가 자꾸 빠지는 증상). */
function applySharedAI() {
  const s = Store.getSharedAI(); if (!s || !s.key) return;
  const c = AI.cfg;
  if (c && c.own) return;                                        // 이 기기에서 직접 넣은 키는 그대로 존중
  if (c && c.key === s.key && c.provider === s.provider) return;  // 이미 같은 키
  AI.configure({ ...s, own: false });
}
function refreshAll() { applySharedAI(); renderCounters(); if ($('#tab-data').classList.contains('on')) renderData(); if ($('#tab-talk').classList.contains('on')) renderFeed(); renderQuick(); refreshHead(); }

/* ── 탭 ── */
/* ── 지도 ── */
const mapState = { kind: 'all', k: 1.9, tx: 0, ty: 0, built: false, sel: null };
function mapSvg() {
  const D = MapData, esc2 = esc;
  const block = (p) => {
    const lv = p.lv || 0, k = MapData.KINDS[p.kind].c;
    const cx = p.x + p.w / 2;
    const label = p.short || p.name;
    if (p.shape === 'slope') return `<g class="pl ${k}" data-id="${p.id}" tabindex="0" role="button" aria-label="${esc2(p.name)}">
      <path class="slope" d="M${p.x} ${p.y + p.h} L${cx} ${p.y} L${p.x + p.w} ${p.y + p.h} Z"/>
      <path class="snow" d="M${cx - 46} ${p.y + 40} L${cx} ${p.y + 6} L${cx + 46} ${p.y + 40} Z"/>
      <text class="nm" x="${cx}" y="${p.y + p.h - 16}">${esc2(label)}</text></g>`;
    if (p.shape === 'flat') return `<g class="pl ${k}" data-id="${p.id}" tabindex="0" role="button" aria-label="${esc2(p.name)}">
      <rect class="flat" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="14"/>
      <text class="nm" x="${cx}" y="${p.y + p.h / 2 + 6}">${esc2(label)}</text></g>`;
    return `<g class="pl ${k}${p.big ? ' big' : ''}" data-id="${p.id}" tabindex="0" role="button" aria-label="${esc2(p.name)}" style="--d:${(p.y / 900).toFixed(2)}s">
      <ellipse class="shadow" cx="${cx + 4}" cy="${p.y + p.h + lv + 8}" rx="${p.w * 0.54}" ry="7"/>
      <rect class="side" x="${p.x}" y="${p.y + 7}" width="${p.w}" height="${p.h + lv}" rx="9"/>
      <rect class="top" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="9"/>
      <rect class="gloss" x="${p.x + 3}" y="${p.y + 3}" width="${p.w - 6}" height="${Math.max(4, p.h * 0.16)}" rx="4"/>
      ${p.no ? `<circle class="no" cx="${p.x + p.w - 11}" cy="${p.y + 11}" r="9"/><text class="not" x="${p.x + p.w - 11}" y="${p.y + 15}">${p.no}</text>` : ''}
      ${p.bld ? `<text class="bd" x="${p.x + 12}" y="${p.y + p.h / 2 + 5}">${esc2(p.bld)}</text>` : ''}
      <text class="nm" x="${cx}" y="${p.y + p.h + lv + 26}">${esc2(label)}</text></g>`;
  };
  const order = (p) => (p.shape ? 0 : 1);
  const list = D.places.slice().sort((a, b) => order(a) - order(b) || (a.y + (a.h || 0)) - (b.y + (b.h || 0)));
  return `<svg id="mapSvg" viewBox="0 0 ${D.W} ${D.H}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="mgGround" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--surface-3)"/><stop offset="1" stop-color="var(--bg)"/>
      </linearGradient>
    </defs>
    <rect class="ground" x="0" y="0" width="${D.W}" height="${D.H}" fill="url(#mgGround)"/>
    <path class="green" d="M0 300 Q 260 258 520 300 T 1100 292 L1100 ${D.H} L0 ${D.H} Z"/>
    <path class="road main" d="M30 372 C 260 344 520 380 780 350 C 900 336 1000 330 1080 318"/>
    <path class="road" d="M300 560 C 460 528 660 534 860 566"/>
    <path class="road thin" d="M470 372 L 500 604"/>
    ${list.map(block).join('')}
  </svg>`;
}
function renderMap() {
  const stage = $('#mapStage');
  if (!mapState.built) {
    const ks = MapData.KINDS;
    $('#mapFilter').innerHTML = `<button data-k="all" class="on">전체</button>` +
      Object.keys(ks).map((k) => `<button data-k="${k}" class="${ks[k].c}">${ks[k].ko}</button>`).join('');
    $$('#mapFilter button').forEach((b) => b.onclick = () => {
      mapState.kind = b.dataset.k;
      $$('#mapFilter button').forEach((x) => x.classList.toggle('on', x === b));
      applyMapFilter();
    });
    stage.innerHTML = `<div class="mapzoomer" id="mapZoomer">${mapSvg()}</div>
      <div class="mapzoom"><button data-z="in" aria-label="확대">＋</button><button data-z="out" aria-label="축소">－</button><button data-z="fit">전체</button></div>`;
    $$('#mapStage .mapzoom button').forEach((b) => b.onclick = () => {
      if (b.dataset.z === 'fit') { mapState.k = 1; mapState.tx = 0; mapState.ty = 0; }
      else { const n = mapState.k * (b.dataset.z === 'in' ? 1.3 : 1 / 1.3); mapState.k = Math.min(5, Math.max(0.8, n)); }
      applyMapTx();
    });
    $$('#mapStage .pl').forEach((g) => {
      const open = () => placeSheet(g.dataset.id);
      g.addEventListener('click', open);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    bindMapGestures();
    mapState.built = true;
  }
  applyMapTx(); applyMapFilter();
}
function applyMapTx() { const z = $('#mapZoomer'); if (z) z.style.transform = `translate(${mapState.tx}px,${mapState.ty}px) scale(${mapState.k})`; }
function applyMapFilter() {
  $$('#mapStage .pl').forEach((g) => {
    const p = MapData.places.find((x) => x.id === g.dataset.id);
    g.classList.toggle('dim', mapState.kind !== 'all' && p.kind !== mapState.kind);
  });
}
function bindMapGestures() {
  const st = $('#mapStage'); let pts = new Map(), base = null;
  const dist = () => { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
  const mid = () => { const a = [...pts.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; };
  st.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) base = { x: e.clientX, y: e.clientY, tx: mapState.tx, ty: mapState.ty, moved: false };
    if (pts.size === 2) base = { d: dist(), k: mapState.k, m: mid(), tx: mapState.tx, ty: mapState.ty };
  });
  st.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1 && base && base.tx !== undefined && base.d === undefined) {
      const dx = e.clientX - base.x, dy = e.clientY - base.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) base.moved = true;
      mapState.tx = base.tx + dx; mapState.ty = base.ty + dy; applyMapTx();
    } else if (pts.size === 2 && base && base.d) {
      mapState.k = Math.min(5, Math.max(0.8, base.k * (dist() / base.d))); applyMapTx();
    }
  });
  const up = (e) => { pts.delete(e.pointerId); if (!pts.size) base = null; };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
  // 드래그 직후의 클릭은 무시 (지도를 밀다가 시설이 열리는 것 방지)
  st.addEventListener('click', (e) => { if (base && base.moved) { e.stopPropagation(); e.preventDefault(); } }, true);
  st.addEventListener('wheel', (e) => { e.preventDefault(); mapState.k = Math.min(5, Math.max(0.8, mapState.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); applyMapTx(); }, { passive: false });
}
function placeSheet(id) {
  const p = MapData.places.find((x) => x.id === id); if (!p) return;
  const kd = MapData.KINDS[p.kind];
  const b = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); // 이스케이프 후 **굵게**만 허용
  const rows = (p.items || []).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${b(v)}</td></tr>`).join('');
  const fl = (p.floors || []).map(([f, v]) => `<div class="flrow"><span class="fl">${esc(f)}</span><span>${b(v)}</span></div>`).join('');
  const bullets = (p.info || []).map((t) => `<li${/^⚠/.test(t) ? ' class="warn"' : ''}>${b(t)}</li>`).join('');
  const art = (p.art && Illust.has(p.art)) ? `<div class="plart">${Illust.svg(p.art)}</div>` : '';
  // 층별 배치 구조도 — 위층이 위로 오는 세로 단면
  const stack = (p.stack || []).map(([f, t, k]) => `<div class="stfl s-${k || 'room'}">
      <span class="lv">${esc(f)}</span><span class="wh">${b(t)}</span></div>`).join('');
  const stackBox = stack ? `<div class="stwrap"><div class="sthead">층별 배치</div><div class="stack">${stack}</div>
      <div class="stroof"></div></div>` : '';
  sheet(`${art}<div class="plhead ${kd.c}"><span class="kchip">${kd.ko}</span>${p.no ? `<span class="kchip no">가이드맵 ${p.no}</span>` : ''}</div>
    <h3>${esc(p.name)}</h3>
    ${fl ? `<div class="floors">${fl}</div>` : ''}
    ${stackBox}
    ${bullets ? `<ul class="plinfo">${bullets}</ul>` : ''}
    ${rows ? `<table class="pltab">${rows}</table>` : ''}
    ${(p.bld || (p.floors || []).length || stack) ? `<div class="foot"><button class="btn filled" data-drill style="width:100%">층·객실 들어가 보기</button></div>` : ''}
    ${p.bld ? `<div class="foot"><button class="btn" data-ask style="width:100%">이 동 자료 챗에서 보기</button></div>` : ''}
    <p class="meta" style="margin-top:10px">출처: 소노 공식홈 시설·식음 안내 및 공식 가이드맵 범례 (2026-08-01 수집). 운영시간·요금은 변동이 크니 확정 안내는 프런트·1588-4888로 확인하세요.</p>`);
  const db2 = $('#sheetBody [data-drill]');
  if (db2) db2.onclick = () => { closeSheet(); setTimeout(() => Drill.open(p.id), 180); };
  const ab = $('#sheetBody [data-ask]');
  if (ab) ab.onclick = () => { closeSheet(); go('chat'); send(`${p.name} 안내`); };
}

function go(t) { state.tab = t; $$('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); $$('.tabview').forEach((v) => v.classList.toggle('on', v.id === 'tab-' + t));   // 챗·지도는 동에 매이지 않는다 → 동 선택 버튼을 감춰 혼란을 없앤다
  const free = (t === 'chat' || t === 'map');
  $('#bldBtn').classList.toggle('hide', free); $('#appTitle').classList.toggle('hide', !free);
  if (t === 'data') renderData(); if (t === 'talk') renderFeed(); if (t === 'map') renderMap(); }
$$('nav button').forEach((b) => b.onclick = () => go(b.dataset.tab));
$$('#seg button').forEach((b) => b.onclick = () => { state.seg = b.dataset.c; state.q = ''; renderData(); });

/* ── PWA ── */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
async function checkUpdate() { try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json(); if (j.version && j.version !== APP_VERSION) $('#updBar').classList.remove('hide'); else alert('최신 버전입니다 (v' + APP_VERSION + ')'); } catch {} }
setInterval(async () => { try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json(); if (j.version && j.version !== APP_VERSION) $('#updBar').classList.remove('hide'); } catch {} }, 5 * 60 * 1000);
$('#updGo').onclick = async () => { if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.update())); } if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } location.reload(); };

/* ── 시작: 연결(팀 코드) → 로그인 → 앱 ── */
(function boot() {
  const th = localStorage.getItem('hos.theme'); if (th) { document.documentElement.dataset.theme = th; document.querySelector('meta[name=theme-color]').content = th === 'dark' ? '#1a1410' : '#f7f1e5'; }
  Store.load(); renderBld();
  setMode('ask'); renderCounters(); renderQuick(); refreshHead();
  $('#bldBtn').classList.add('hide'); $('#appTitle').classList.remove('hide'); // 시작 탭이 챗
  Store.Sync.onStatus(() => refreshHead()); Store.Sync.onChange(() => refreshAll()); Store.Sync.start();
  const u = me();
  if (Store.Sync.cfg) { // 이미 연결됨
    if (u) { $('#workerChip').textContent = u.name + (u.role === 'admin' ? ' ·관리' : ''); briefingCard(); }
    // 계정이 공용 하나로 고정이라 동기화를 기다릴 필요가 없다 (중복 생성 위험 없음)
    else { $('#workerChip').textContent = '로그인'; showLogin(); }
    return;
  }
  // 미연결: team.json 있으면 팀 코드로 연결, 없으면 로그인(로컬/최초 관리자)
  $('#workerChip').textContent = u ? u.name + (u.role === 'admin' ? ' ·관리' : '') : '로그인';
  Store.Team.fetch().then((cfg) => {
    if (cfg && !u) return teamGate(cfg);      // 첫 실행: 팀 코드 → 로그인
    if (u) { briefingCard(); if (cfg) teamGate(cfg); }  // 로그인돼 있는데 미연결 → 팀 코드 권유
    else showLogin();
  });
})();
