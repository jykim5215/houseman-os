/* 하우스맨 노트 — 도메인 로직 (동별 필터 · 상태 집계 · 브리핑 · 명령 파서 · 소스 검색)
   min(정량)이 null이면 정량 없는 품목(수건 등) → 부족 경보 대상 아님. AI 없이 동작. */
'use strict';

const Logic = (() => {
  const now = () => { const d = new Date(); const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 19).replace('T', ' '); };
  const dday = (dl) => !dl ? 999 : Math.ceil((new Date(dl.replace(' ', 'T')) - Date.now()) / 86400000);
  const daysSince = (ts) => !ts ? 0 : Math.floor((Date.now() - new Date(ts.replace(' ', 'T'))) / 86400000);
  const tracked = (s) => s.min != null && s.min !== '';

  const STAGES = ['reported', 'first_check', 'second_action', 'transferred', 'done'];
  const STAGE_KO = { reported: '접수', first_check: '1차 확인', second_action: '2차 조치', transferred: '시설팀 이관', done: '완료' };

  /* scope: null이면 현재 선택 동, '*'이면 전체 동(챗 기본 — 동을 미리 고를 필요 없게) */
  function rows(coll, scope) {
    if (!scope) return Store.inBld(coll);
    const all = Store.load()[coll] || [];
    return (scope === '*' ? all : all.filter((r) => r.bld === scope)).map((r) => ({ ...r, _b: r.bld }));
  }
  function statusBoard(scope) {
    const stock = rows('stock', scope), equipment = rows('equipment', scope),
      lost = rows('lost', scope), defects = rows('defects', scope);
    const shortage = stock.filter((s) => tracked(s) && s.qty < s.min);
    const overdue = equipment.filter((e) => e.borrower && e.dueAt && e.dueAt < now());
    const broken = equipment.filter((e) => e.condition !== 'ok' || e.battery === 'bad');
    const lostUrgent = lost.filter((l) => l.status === 'stored' && (l.valuable || dday(l.deadline) <= 3));
    const lostStored = lost.filter((l) => l.status === 'stored');
    const openDefects = defects.filter((d) => d.stage !== 'done');
    const staleDefects = openDefects.filter((d) => d.stage === 'transferred' && daysSince(d.updatedAt) >= 2);
    return { shortage, overdue, broken, lostUrgent, lostStored, openDefects, staleDefects };
  }

  function briefing() {
    const b = statusBoard();
    const notices = Store.inBld('messages').filter((m) => m.type === 'notice').slice(0, 3);
    const lines = [];
    b.overdue.forEach((e) => lines.push({ tag: '미반납', text: `${e.label} — ${e.borrower}, ${e.loanedAt} 대여` }));
    b.shortage.forEach((s) => lines.push({ tag: '부족', text: `${s.item} · ${s.location} ${s.qty}/${s.min}` }));
    b.staleDefects.forEach((d) => lines.push({ tag: '하자', text: `${d.room} ${d.title} — 이관 ${daysSince(d.updatedAt)}일 경과` }));
    b.lostUrgent.forEach((l) => lines.push({ tag: '습득물', text: `${l.desc} (${l.room || l.place}) — ${l.valuable ? '귀중품, 즉시 인계' : 'D-' + Math.max(dday(l.deadline), 0)}` }));
    notices.forEach((n) => lines.push({ tag: '공지', text: `${n.text} (${n.author})` }));
    return lines;
  }

  const norm = (s) => String(s || '').replace(/\s+/g, '');
  function matchStocks(text) {
    const t = norm(text);
    const stock = Store.inBld('stock');
    let hit = stock.filter((r) => t.includes(norm(r.item)));
    if (!hit.length) {
      hit = stock.filter((r) => ['타올', '수건', '조끼', '커버', '시트', '슬리퍼', '어메니티', '생수'].some((k) => t.includes(k) && norm(r.item).includes(k === '수건' ? '타올' : k)));
      const size = text.match(/\b([SML])\b/i);
      if (size) hit = hit.filter((r) => r.item.endsWith(size[1].toUpperCase()));
    }
    return hit;
  }

  function parseCommand(text) {
    // 공지/메시지 삭제·초기화
    if (/(공지|메시지|톡|대화)/.test(text) && /(초기화|비우|지워|삭제|정리|없애)/.test(text)) {
      const onlyNotice = /공지/.test(text) && !/(메시지|톡|대화)/.test(text);
      const targets = Store.inBld('messages').filter((m) => onlyNotice ? m.type === 'notice' : true);
      if (!targets.length) return { kind: 'clarify', question: onlyNotice ? '이 동에 공지가 없습니다.' : '지울 메시지가 없습니다.' };
      return { kind: 'delete', entity: 'messages', ids: targets.map((m) => m.id),
        summary: `${onlyNotice ? '공지' : '톡 메시지'} ${targets.length}건 삭제`,
        preview: targets.slice(0, 5).map((m) => (m.type === 'notice' ? '[공지] ' : '') + (m.text || '(사진)')) };
    }
    // 공지 등록
    const nm = text.match(/^(?:공지|알림)\s*[:：]?\s*(.+?)\s*(?:등록|올려|추가|해줘|해라)?$/);
    if (nm && /(공지|알림)/.test(text) && nm[1] && nm[1].length > 3 && !/(초기화|지워|삭제|뭐|알려|있어)/.test(text)) {
      return { kind: 'newNotice', text: nm[1].trim(), summary: `공지 등록: ${nm[1].trim()}` };
    }
    if (/(뭐.*할 수|무엇을 할|도움말|어떻게 써|사용법|기능)/.test(text)) return { kind: 'help' };

    const eq = text.match(/무전기\s*(\d+)\s*번?\s*(.*)/);
    if (eq) {
      const row = Store.inBld('equipment').find((e) => e.label === `무전기 ${eq[1]}번`);
      if (!row) return { kind: 'clarify', question: `무전기 ${eq[1]}번이 이 동에 등록되어 있지 않습니다.` };
      const rest = eq[2] || '', C = (field, nv) => ({ entity: 'equipment', entityId: row.id, field, newValue: nv, reason: text });
      if (/배터리/.test(rest) && /(불량|방전|나감)/.test(rest)) return { kind: 'proposal', summary: `${row.label} 배터리 → 불량`, changes: [C('battery', 'bad')], before: [['배터리', row.battery]] };
      if (/(고장|파손)/.test(rest)) return { kind: 'proposal', summary: `${row.label} → 고장`, changes: [C('condition', 'broken')], before: [['상태', row.condition]] };
      if (/(정상|수리\s*완료|멀쩡)/.test(rest)) return { kind: 'proposal', summary: `${row.label} → 정상`, changes: [C('condition', 'ok'), C('battery', 'ok')], before: [['상태', row.condition]] };
      if (/반납/.test(rest)) { if (!row.borrower) return { kind: 'clarify', question: `${row.label}은 대여 중이 아닙니다.` }; return { kind: 'proposal', summary: `${row.label} 반납 (${row.borrower})`, changes: [C('borrower', null), C('loanedAt', null), C('dueAt', null)], before: [['대여자', row.borrower]] }; }
      return null;
    }
    if (/인계/.test(text)) {
      const stored = Store.inBld('lost').filter((l) => l.status === 'stored');
      const roomM = text.match(/(\d{3,4})호/);
      const hit = stored.filter((l) => (roomM && (l.room || '').includes(roomM[1])) || norm(text).includes(norm(l.desc).slice(0, 3)));
      if (hit.length === 1) { const l = hit[0]; return { kind: 'proposal', summary: `습득물 인계: ${l.desc} (${l.room || l.place})`, changes: [{ entity: 'lost', entityId: l.id, field: 'status', newValue: 'handed_over', reason: text }, { entity: 'lost', entityId: l.id, field: 'handedAt', newValue: now(), reason: text }], before: [['상태', '보관중']] }; }
      if (hit.length > 1) return { kind: 'clarify', question: '어느 습득물인가요?', candidates: hit.map((l) => `${l.desc} (${l.room || l.place})`) };
      if (/습득|아이폰|지갑|패딩|물안경|폰/.test(text)) return { kind: 'clarify', question: '보관중인 습득물 중 일치하는 항목이 없습니다.' };
    }
    if (/(이관|완료|2차|1차)/.test(text) && /(누수|하자|도어락|커튼|파손|고장)/.test(text)) {
      const roomM = text.match(/(\d{3,4})호/);
      const open = Store.inBld('defects').filter((d) => d.stage !== 'done').filter((d) => !roomM || (d.room || '').includes(roomM[1]));
      if (open.length === 1) { const d = open[0]; const to = /완료/.test(text) ? 'done' : /이관/.test(text) ? 'transferred' : /2차/.test(text) ? 'second_action' : 'first_check'; return { kind: 'proposal', summary: `${d.room} ${d.title} — ${STAGE_KO[d.stage]} → ${STAGE_KO[to]}`, changes: [{ entity: 'defects', entityId: d.id, field: 'stage', newValue: to, reason: text }], before: [['단계', STAGE_KO[d.stage]]] }; }
      if (open.length > 1) return { kind: 'clarify', question: '어느 하자 건인가요? 객실 번호를 함께 말해주세요.', candidates: open.map((d) => `${d.room} ${d.title}`) };
    }
    const qtyM = text.match(/(\d+)\s*(?:장|개|매|병|세트|켤레)?/);
    const minus = /(차감|사용|지급|빼|소진|반출)/.test(text), plus = /(보충|추가|입고|채워|반입)/.test(text);
    if (qtyM && (minus || plus)) {
      const n = Number(qtyM[1]);
      const hits = matchStocks(text);
      if (!hits.length) return { kind: 'clarify', question: '품목을 찾지 못했습니다. 예: "바스타올 30장 차감"' };
      if (hits.length > 1) return { kind: 'clarify', question: '여러 품목이 일치합니다. 품목명을 정확히 말해주세요.', candidates: hits.map((h) => `${h.item} · ${h.location}`) };
      const s = hits[0], after = minus ? s.qty - n : s.qty + n;
      if (after < 0) return { kind: 'clarify', question: `${s.item} 현재 ${s.qty}라 ${n} 차감 시 음수가 됩니다.` };
      const warn = tracked(s) && after < s.min ? ` · ⚠️ 최소 기준(${s.min}) 미만` : '';
      return { kind: 'proposal', summary: `${s.item} · ${s.location}: ${s.qty} → ${after}${warn}`, changes: [{ entity: 'stock', entityId: s.id, field: 'qty', newValue: after, reason: text }], before: [['수량', s.qty]] };
    }
    return null;
  }

  function tokens(text) {
    return (text.match(/[가-힣A-Za-z0-9]{2,}/g) || []).map((t) => {
      const s = t.replace(/(은|는|이|가|을|를|의|에|로|까지|부터|이야|인가요|인가|해줘|알려줘|어때|뭐야)$/, '');
      return s.length >= 2 ? s : t; // 조사 떼서 1글자 되면 원형 유지 (있는→'있'X→'있는')
    }).filter((t) => t.length >= 2);
  }
  // 자료에서 질문과 관련된 조각만 추출 (전체 나열 대신 핵심만)
  function extract(content, toks) {
    const frags = String(content).split(/\n+|(?<=[.。])\s+|(?<=다\.)\s*/).map((s) => s.trim()).filter((s) => s.length > 1);
    // 점수 높은 순, 동점이면 짧은(더 집중된) 조각 우선
    const scored = frags.map((f) => ({ f, n: toks.reduce((a, t) => a + (f.includes(t) ? 1 : 0), 0) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.f.length - b.f.length);
    const cut = (s) => (s.length > 180 ? s.slice(0, 180) + '…' : s);
    if (scored.length) {
      const max = scored[0].n;
      const best = scored.filter((x) => x.n === max);
      const pick = [best[0]];
      // 2번째는 동점이면서 충분히 짧을 때만 (장황한 나열 방지)
      if (best[1] && best[1].f.length <= 80) pick.push(best[1]);
      return pick.map((x) => cut(x.f)).join('\n');
    }
    return cut(frags[0] || String(content));
  }
  /* 문장에서 동을 알아낸다 — 못 찾으면 null (동을 미리 고를 필요 없게 하기 위한 핵심) */
  function bldFromText(text) {
    const t = String(text || '');
    const alias = {
      A: ['체리동', '체리', 'A동', 'a동'], B: ['오크동', '오크', 'B동', 'b동'], C: ['파인동', '파인', 'C동', 'c동'],
      '캄': ['소노캄', '캄동', '캄'], D: ['메이플동', '메이플', '호텔', 'D동', 'd동'], E: ['노블리안', '소노펫', '펫동', '펫', 'E동', 'e동'],
    };
    for (const id of Object.keys(alias)) if (alias[id].some((a) => t.includes(a))) return id;
    return null;
  }
  function bldLabel(id) { const b = Store.buildings().find((x) => x.id === id); return b ? `${b.name}(${b.id})` : id; }

  function searchSources(text) {
    const toks = tokens(text); if (!toks.length) return [];
    // 동을 미리 고를 필요 없음. 문장에 동이 있으면 그 동을 크게 가산할 뿐, 잘라내지는 않는다.
    // (하드 필터링하면 '펫 침구류'처럼 다른 동 자료에 답이 있는 질문을 통째로 놓친다)
    const want = bldFromText(text);
    const bonus = (s) => !want ? 0 : (s.bld === want ? 2 : s.bld === '*' ? 0.5 : -0.5);
    const enabled = Store.load().sources.filter((s) => s.enabled !== false);
    const hits = enabled.map((s) => ({ s, score: toks.reduce((a, t) => a + (s.content.includes(t) ? 1 : 0) + (s.title.includes(t) ? 0.5 : 0), 0) }))
      .filter((x) => x.score > 0)
      .map((x) => ({ ...x, score: x.score + bonus(x.s) }));
    hits.sort((a, b) => a.s.priority - b.s.priority || b.score - a.score);
    return hits.map((x) => x.s);
  }

  function answer(text) {
    // 동을 미리 고를 필요 없음: 문장에 동이 있으면 그 동, 없으면 전체 동을 본다
    const want = bldFromText(text);
    const scope = want || '*';
    const b = statusBoard(scope);
    const tag = (r) => (want || !r._b) ? '' : `[${r._b}] `;
    const scopeNote = want ? `${bldLabel(want)} 기준` : '전체 동 기준';
    const src = (t) => [{ type: 'db', title: t, meta: `실시간 · ${scopeNote}` }];
    if (/부족|모자/.test(text)) return { kind: 'answer', refused: false, internalText: b.shortage.length ? `부족 재고 ${b.shortage.length}건: ` + b.shortage.map((s) => `${tag(s)}${s.item}(${s.location}) ${s.qty}/${s.min}`).join(', ') : '최소 기준을 정한 품목 중 부족한 것은 없습니다. (수건 등 정량 없는 품목은 부족 판정 대상이 아닙니다)', sources: src('재고 집계') };
    if (/미반납|안.*반납/.test(text)) return { kind: 'answer', refused: false, internalText: b.overdue.length ? '미반납 ' + b.overdue.map((e) => `${tag(e)}${e.label}(${e.borrower})`).join(', ') : '미반납 장비가 없습니다.', sources: src('장비 집계') };
    if (/습득물|분실물/.test(text)) return { kind: 'answer', refused: false, internalText: `보관중 ${b.lostStored.length}건` + (b.lostUrgent.length ? `, 긴급 ${b.lostUrgent.length}건: ` + b.lostUrgent.map((l) => `${tag(l)}${l.desc}(${l.room || l.place})`).join(', ') : ''), sources: src('습득물 집계') };
    if (/하자|시설/.test(text)) return { kind: 'answer', refused: false, internalText: b.openDefects.length ? '진행중 ' + b.openDefects.map((d) => `${tag(d)}${d.room} ${d.title}(${STAGE_KO[d.stage]})`).join(', ') : '진행중 하자가 없습니다.', sources: src('하자 집계') };
    if (/브리핑/.test(text)) return { kind: 'briefing' };
    const rs = searchSources(text);
    if (!rs.length) return { kind: 'answer', refused: true, internalText: '등록된 자료와 DB에서 근거를 찾지 못했습니다. 데이터 탭에서 관련 문서를 등록하면 답할 수 있습니다.', sources: [] };
    const top = rs[0];
    const toks = tokens(text);
    const conflict = rs.length > 1 && rs.some((r) => r.priority !== top.priority) ? `우선순위가 다른 출처가 함께 검색됐습니다. 높은 출처("${top.title}")를 채택했습니다.` : null;
    const cust = rs.find((r) => r.custVisible);
    const clip = (t) => t.length > 140 ? t.slice(0, 140) + '…' : t;
    // 질문 토큰과 관련된 문장/줄만 뽑아 "묻는 것만" 답한다 (전체 나열 방지)
    // 동을 안 물어봤어도 어느 동 자료인지는 항상 밝힌다
    const pre = (!want && top.bld && top.bld !== '*') ? `**${bldLabel(top.bld)}** — ` : '';
    return { kind: 'answer', refused: false, customerText: cust ? extract(cust.content, toks) : null, internalText: pre + extract(top.content, toks) + (top.custVisible ? '' : ' _(내부 자료)_'), conflict,
      sources: rs.slice(0, 3).map((r, i) => ({ type: 'doc', n: i + 1, id: r.id, title: r.title, meta: `${['', '① 내부', '② VINFO', '③ 공식홈', '④ 메모'][r.priority] || ''} · ${(r.collectedAt || '').slice(0, 10)}${r.custVisible ? ' · 고객 안내 가능' : ' · 내부'}`, snippet: clip(r.content) })) };
  }

  /* AI에 넘길 현재 동 데이터 스냅샷 (개인 연락처 등은 제외) */
  /* AI에 넘길 스냅샷 — 동을 미리 고를 필요가 없도록 전 동을 담고, 줄마다 동을 표시한다.
     질문에 동이 있으면 그 동으로 좁혀 토큰을 아낀다. (개인 연락처 등은 제외) */
  function snapshot(text) {
    const want = text ? bldFromText(text) : null;
    const scope = want || '*';
    const clip = (s, n) => String(s || '').slice(0, n);
    const B = (r) => bldLabel(r.bld);
    return {
      범위: want ? bldLabel(want) : '전체 동',
      동목록: Store.buildings().map((x) => `${x.id}=${x.name}`).join(', '),
      오늘: now().slice(0, 16),
      재고: rows('stock', scope).map((s) => ({ id: s.id, 동: B(s), 품목: s.item, 위치: s.location, 수량: s.qty, 최소: s.min, 정량없음: !tracked(s), 비고: clip(s.note, 60) })),
      장비: rows('equipment', scope).map((e) => ({ id: e.id, 동: B(e), 이름: e.label, 배터리: e.battery, 상태: e.condition, 대여자: e.borrower, 대여시각: e.loanedAt, 비고: clip(e.note, 60) })),
      습득물: rows('lost', scope).map((l) => ({ id: l.id, 동: B(l), 품목: l.desc, 객실: l.room || l.place, 귀중품: !!l.valuable, 상태: l.status, 기한: l.deadline })),
      하자: rows('defects', scope).map((d) => ({ id: d.id, 동: B(d), 객실: d.room, 제목: d.title, 단계: STAGE_KO[d.stage] || d.stage, 상세: clip(d.detail, 80) })),
      톡: rows('messages', scope).slice(-25).map((m) => ({ id: m.id, 동: B(m), 종류: m.type, 작성자: m.author, 내용: clip(m.text, 160), 시각: m.ts })),
      자료: Store.load().sources.filter((s) => s.enabled !== false && (!want || s.bld === want || s.bld === '*'))
        .map((s) => ({ 제목: s.title, 동: s.bld === '*' ? '공통' : bldLabel(s.bld), 우선순위: s.priority, 고객안내가능: !!s.custVisible, 본문: clip(s.content, 3000) })),
    };
  }

  return { statusBoard, briefing, parseCommand, answer, searchSources, snapshot, dday, daysSince, tracked, bldFromText, bldLabel, STAGES, STAGE_KO };
})();
