/* 하우스맨 노트 — 도메인 로직 (상태 집계·브리핑·명령 파서·소스 검색)
   Electron v1의 briefing.js/parser.js/search.js를 배열 모델로 이식. AI 없이 동작. */
'use strict';

const Logic = (() => {
  const now = () => { const d = new Date(); const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 19).replace('T', ' '); };
  const dday = (deadline) => !deadline ? 999 : Math.ceil((new Date(deadline.replace(' ', 'T')) - Date.now()) / 86400000);
  const daysSince = (ts) => !ts ? 0 : Math.floor((Date.now() - new Date(ts.replace(' ', 'T'))) / 86400000);

  const STAGES = ['reported', 'first_check', 'second_action', 'transferred', 'done'];
  const STAGE_KO = { reported: '접수', first_check: '1차 확인', second_action: '2차 조치', transferred: '시설팀 이관', done: '완료' };

  /* ── 상태 집계 (홈 카운터·브리핑의 근거) ── */
  function statusBoard(db) {
    const shortage = db.stock.filter((s) => s.qty < s.min);
    const warning = db.stock.filter((s) => s.qty >= s.min && s.qty < s.min * 1.2);
    const overdue = db.equipment.filter((e) => e.borrower && e.dueAt && e.dueAt < now());
    const broken = db.equipment.filter((e) => e.condition !== 'ok' || e.battery === 'bad');
    const lostUrgent = db.lost.filter((l) => l.status === 'stored' && (l.valuable || dday(l.deadline) <= 3));
    const lostStored = db.lost.filter((l) => l.status === 'stored');
    const openDefects = db.defects.filter((d) => d.stage !== 'done');
    const staleDefects = openDefects.filter((d) => d.stage === 'transferred' && daysSince(d.updatedAt) >= 2);
    const notes = db.handover.filter((h) => !h.resolved);
    return { shortage, warning, overdue, broken, lostUrgent, lostStored, openDefects, staleDefects, notes };
  }

  /* ── 교대 브리핑 (SQL 없이 집계 → 문장 리스트) ── */
  function briefing(db) {
    const b = statusBoard(db);
    const lines = [];
    b.overdue.forEach((e) => lines.push({ tag: '미반납', text: `${e.label} — ${e.borrower}, ${e.loanedAt} 대여`, cite: 'db' }));
    b.shortage.forEach((s) => lines.push({ tag: '부족', text: `${s.item} · ${s.location} ${s.qty}/${s.min}`, cite: 'db' }));
    b.staleDefects.forEach((d) => lines.push({ tag: '하자', text: `${d.room} ${d.title} — 이관 ${daysSince(d.updatedAt)}일 경과, 재촉 필요`, cite: 'db' }));
    b.lostUrgent.forEach((l) => lines.push({ tag: '습득물', text: `${l.desc} (${l.room || l.place}) — ${l.valuable ? '귀중품, 즉시 인계' : 'D-' + Math.max(dday(l.deadline), 0)}`, cite: 'db' }));
    b.notes.forEach((n) => lines.push({ tag: '인계', text: `${n.room ? n.room + ' ' : ''}${n.content} (${n.author})`, cite: 'note' }));
    return lines;
  }

  /* ── 명령 파서 (규칙 기반) ──
     반환: {kind:'proposal',changes,summary} | {kind:'clarify',question,candidates} | null */
  const norm = (s) => String(s || '').replace(/\s+/g, '');

  function matchStocks(db, text) {
    const t = norm(text);
    let hit = db.stock.filter((r) => t.includes(norm(r.item)));
    if (!hit.length) {
      hit = db.stock.filter((r) => ['타올', '조끼', '커버', '시트', '슬리퍼', '어메니티', '생수'].some((k) => t.includes(k) && norm(r.item).includes(k)));
      const size = text.match(/\b([SML])\b/i);
      if (size) hit = hit.filter((r) => r.item.endsWith(size[1].toUpperCase()));
    }
    const bm = text.match(/([가-힣A-Za-z]+)동/);
    if (bm) {
      const nb = hit.filter((r) => r.location.includes(bm[1] + '동'));
      if (nb.length) hit = nb;
    }
    return hit;
  }

  function parseCommand(db, text) {
    // 장비: "무전기 4번 배터리 불량 / 고장 / 정상 / 반납 / 대여"
    const eq = text.match(/무전기\s*(\d+)\s*번?\s*(.*)/);
    if (eq) {
      const row = db.equipment.find((e) => e.label === `무전기 ${eq[1]}번`);
      if (!row) return { kind: 'clarify', question: `무전기 ${eq[1]}번이 등록되어 있지 않습니다.` };
      const rest = eq[2] || '';
      const C = (field, nv) => ({ entity: 'equipment', entityId: row.id, field, newValue: nv, reason: text });
      if (/배터리/.test(rest) && /(불량|방전|나감)/.test(rest))
        return { kind: 'proposal', summary: `${row.label} 배터리 → 불량`, changes: [C('battery', 'bad')], before: [['배터리', row.battery]] };
      if (/(고장|파손)/.test(rest))
        return { kind: 'proposal', summary: `${row.label} → 고장 처리`, changes: [C('condition', 'broken')], before: [['상태', row.condition]] };
      if (/(정상|수리\s*완료|멀쩡)/.test(rest))
        return { kind: 'proposal', summary: `${row.label} → 정상 처리`, changes: [C('condition', 'ok'), C('battery', 'ok')], before: [['상태', row.condition], ['배터리', row.battery]] };
      if (/반납/.test(rest)) {
        if (!row.borrower) return { kind: 'clarify', question: `${row.label}은 대여 중이 아닙니다.` };
        return { kind: 'proposal', summary: `${row.label} 반납 (대여자 ${row.borrower})`, changes: [C('borrower', null), C('loanedAt', null), C('dueAt', null)], before: [['대여자', row.borrower]] };
      }
      if (/(대여|불출)/.test(rest)) {
        if (row.borrower) return { kind: 'clarify', question: `${row.label}은 이미 ${row.borrower}님이 대여 중입니다.` };
        return { kind: 'loan', equipmentId: row.id, summary: `${row.label} 대여 — 현재 근무자로 등록할까요?` };
      }
      return null;
    }

    // 습득물 인계: "1204호 아이폰 인계 완료"
    if (/인계/.test(text)) {
      const stored = db.lost.filter((l) => l.status === 'stored');
      const roomM = text.match(/(\d{3,4})호/);
      const hit = stored.filter((l) =>
        (roomM && (l.room || '').includes(roomM[1])) || norm(text).includes(norm(l.desc).slice(0, 3)));
      if (hit.length === 1) {
        const l = hit[0];
        return {
          kind: 'proposal', summary: `습득물 인계 완료: ${l.desc} (${l.room || l.place})`,
          changes: [
            { entity: 'lost', entityId: l.id, field: 'status', newValue: 'handed_over', reason: text },
            { entity: 'lost', entityId: l.id, field: 'handedAt', newValue: now(), reason: text },
          ], before: [['상태', '보관중']],
        };
      }
      if (hit.length > 1) return { kind: 'clarify', question: '어느 습득물인가요?', candidates: hit.map((l) => `${l.desc} (${l.room || l.place})`) };
      if (/습득|아이폰|지갑|패딩|물안경|폰/.test(text)) return { kind: 'clarify', question: '보관중인 습득물 중 일치하는 항목을 찾지 못했습니다.' };
    }

    // 하자 단계
    if (/(이관|완료|2차|1차)/.test(text) && /(누수|하자|도어락|커튼|파손|고장)/.test(text)) {
      const roomM = text.match(/(\d{3,4})호/);
      const open = db.defects.filter((d) => d.stage !== 'done').filter((d) => !roomM || (d.room || '').includes(roomM[1]));
      if (open.length === 1) {
        const d = open[0];
        const to = /완료/.test(text) ? 'done' : /이관/.test(text) ? 'transferred' : /2차/.test(text) ? 'second_action' : 'first_check';
        return { kind: 'proposal', summary: `${d.room} ${d.title} — ${STAGE_KO[d.stage]} → ${STAGE_KO[to]}`, changes: [{ entity: 'defects', entityId: d.id, field: 'stage', newValue: to, reason: text }], before: [['단계', STAGE_KO[d.stage]]] };
      }
      if (open.length > 1) return { kind: 'clarify', question: '어느 하자 건인가요? 객실 번호를 함께 말해주세요.', candidates: open.map((d) => `${d.room} ${d.title} (${STAGE_KO[d.stage]})`) };
    }

    // 재고 차감/보충
    const qtyM = text.match(/(\d+)\s*(?:장|개|매|병|세트|켤레)?/);
    const minus = /(차감|사용|지급|빼|소진|반출)/.test(text);
    const plus = /(보충|추가|입고|채워|반입)/.test(text);
    if (qtyM && (minus || plus)) {
      const n = Number(qtyM[1]);
      const hits = matchStocks(db, text);
      if (!hits.length) return { kind: 'clarify', question: '품목·위치를 찾지 못했습니다. 예: "메이플동 바스타올 30장 차감"' };
      if (hits.length > 1) return { kind: 'clarify', question: '여러 행이 일치합니다. 위치(동)를 지정해주세요.', candidates: hits.map((h) => `${h.item} · ${h.location}`) };
      const s = hits[0];
      const after = minus ? s.qty - n : s.qty + n;
      if (after < 0) return { kind: 'clarify', question: `${s.item}(${s.location}) 현재 ${s.qty}라 ${n} 차감 시 음수가 됩니다.` };
      const warn = after < s.min ? ` · ⚠️ 최소 기준(${s.min}) 미만` : '';
      return {
        kind: 'proposal', summary: `${s.item} · ${s.location}: ${s.qty} → ${after}${warn}`,
        changes: [{ entity: 'stock', entityId: s.id, field: 'qty', newValue: after, reason: text }],
        before: [['수량', s.qty]],
      };
    }
    return null;
  }

  /* ── 소스 검색 + 신뢰 규칙 ── */
  function tokens(text) {
    return (text.match(/[가-힣A-Za-z0-9]{2,}/g) || [])
      .map((t) => t.replace(/(은|는|이|가|을|를|의|에|로|까지|부터|이야|인가요|인가|해줘|알려줘|어때)$/, ''))
      .filter((t) => t.length >= 2);
  }

  function searchSources(db, text) {
    const toks = tokens(text);
    if (!toks.length) return [];
    const enabled = db.sources.filter((s) => s.enabled !== false);
    const hits = enabled.map((s) => {
      const score = toks.reduce((a, t) => a + (s.content.includes(t) ? 1 : 0) + (s.title.includes(t) ? 0.5 : 0), 0);
      return { s, score };
    }).filter((x) => x.score > 0);
    hits.sort((a, b) => a.s.priority - b.s.priority || b.score - a.score);
    return hits.map((x) => x.s);
  }

  function answer(db, text) {
    // 1) DB 사실 질의
    const b = statusBoard(db);
    if (/부족|모자/.test(text)) {
      return { kind: 'answer', refused: false, internalText: b.shortage.length ? `부족 재고 ${b.shortage.length}건: ` + b.shortage.map((s) => `${s.item}(${s.location}) ${s.qty}/${s.min}`).join(', ') : '최소 기준 미만 재고가 없습니다.', sources: [{ type: 'db', title: 'DB 집계 — 재고 테이블', meta: '실시간' }] };
    }
    if (/미반납|안.*반납/.test(text)) {
      return { kind: 'answer', refused: false, internalText: b.overdue.length ? '미반납 ' + b.overdue.map((e) => `${e.label}(${e.borrower}, ${e.loanedAt})`).join(', ') : '미반납 장비가 없습니다.', sources: [{ type: 'db', title: 'DB 집계 — 장비 테이블', meta: '실시간' }] };
    }
    if (/습득물|분실물/.test(text)) {
      return { kind: 'answer', refused: false, internalText: `보관중 ${b.lostStored.length}건` + (b.lostUrgent.length ? `, 긴급 ${b.lostUrgent.length}건: ` + b.lostUrgent.map((l) => `${l.desc}(${l.room || l.place})`).join(', ') : ''), sources: [{ type: 'db', title: 'DB 집계 — 습득물', meta: '실시간' }] };
    }
    if (/하자|시설/.test(text) && /(현황|알려|뭐|목록|있)/.test(text)) {
      return { kind: 'answer', refused: false, internalText: b.openDefects.length ? '진행중 ' + b.openDefects.map((d) => `${d.room} ${d.title}(${STAGE_KO[d.stage]})`).join(', ') : '진행중 하자가 없습니다.', sources: [{ type: 'db', title: 'DB 집계 — 하자', meta: '실시간' }] };
    }
    if (/브리핑/.test(text)) return { kind: 'briefing' };

    // 2) 소스 검색
    const rs = searchSources(db, text);
    if (!rs.length) return { kind: 'answer', refused: true, internalText: '등록된 자료와 DB에서 근거를 찾지 못했습니다. 소스&데이터 탭에서 관련 문서를 등록하면 답할 수 있습니다.', sources: [] };
    const top = rs[0];
    const conflict = rs.length > 1 && rs.some((r) => r.priority !== top.priority)
      ? `출처 우선순위 차이 감지 — "${top.title}"(우선)와 "${rs.find((r) => r.priority !== top.priority).title}" 내용이 다를 수 있습니다. 낮은 우선순위 출처의 갱신을 확인하세요.` : null;
    const cust = rs.find((r) => r.custVisible);
    const clip = (t) => t.length > 200 ? t.slice(0, 200) + '…' : t;
    return {
      kind: 'answer', refused: false,
      customerText: cust ? clip(cust.content) : null,
      internalText: clip(top.content) + (top.custVisible ? '' : ' (내부 자료 — 고객 안내에 그대로 사용 금지)'),
      conflict,
      sources: rs.slice(0, 3).map((r, i) => ({ type: 'doc', n: i + 1, id: r.id, title: r.title, meta: `${['', '① 내부 공지', '② VINFO', '③ 공식홈', '④ 메모'][r.priority] || ''} · 수집 ${(r.collectedAt || '').slice(0, 10)}${r.custVisible ? ' · 고객 안내 가능' : ' · 내부 전용'}`, snippet: clip(r.content) })),
    };
  }

  return { statusBoard, briefing, parseCommand, answer, searchSources, dday, daysSince, STAGES, STAGE_KO };
})();
