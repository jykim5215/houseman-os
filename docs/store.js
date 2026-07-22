/* 하우스맨 OS — 데이터 계층
   로컬(localStorage) 우선 + GitHub 비공개 데이터 저장소 동기화(선택).
   모든 쓰기는 applyChanges() 단일 경로 → 감사 로그 + Undo. */
'use strict';

const Store = (() => {
  const LS_DB = 'hos.db';
  const LS_CFG = 'hos.sync';
  const LS_WORKER = 'hos.worker';
  const DEVICE = (localStorage.getItem('hos.device') || (() => {
    const d = 'd' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('hos.device', d);
    return d;
  })());

  // 로컬(한국) 시간 기준 — toISOString은 UTC라 그대로 쓰면 안 됨
  const localIso = (d) => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 19).replace('T', ' '); };
  const now = () => localIso(new Date());
  const today = () => now().slice(0, 10);
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const days = (n) => localIso(new Date(Date.now() + n * 86400000));

  /* ── 시드 데이터 ── */
  function seed() {
    return {
      rev: 1, updatedAt: now(),
      workers: [{ id: 'w1', name: '김재영' }, { id: 'w2', name: '박지훈' }, { id: 'w3', name: '이수진' }, { id: 'w4', name: '최민호' }],
      stock: [
        { id: 's1', item: '바스타올', category: 'towel', location: '메이플동 B1 린넨실', qty: 42, min: 60, owner: '김재영', note: '단체 입실 대비 보충 필요', updatedAt: now(), updatedBy: '김재영' },
        { id: 's2', item: '바스타올', category: 'towel', location: '오크동 3F 린넨실', qty: 88, min: 60, owner: '이수진', note: '', updatedAt: now(), updatedBy: '이수진' },
        { id: 's3', item: '핸드타올', category: 'towel', location: '오크동 3F 린넨실', qty: 118, min: 100, owner: '이수진', note: '', updatedAt: now(), updatedBy: '박지훈' },
        { id: 's4', item: '수영조끼 S', category: 'vest', location: '파인동 B1 창고', qty: 22, min: 15, owner: '최민호', note: '', updatedAt: now(), updatedBy: '최민호' },
        { id: 's5', item: '수영조끼 M', category: 'vest', location: '파인동 B1 창고', qty: 6, min: 15, owner: '최민호', note: '단체 320명 — 수요 급증 예상', updatedAt: now(), updatedBy: '최민호' },
        { id: 's6', item: '수영조끼 L', category: 'vest', location: '파인동 B1 창고', qty: 18, min: 12, owner: '최민호', note: '', updatedAt: now(), updatedBy: '최민호' },
        { id: 's7', item: '베개커버', category: 'linen', location: '체리동 1F 데스크', qty: 34, min: 40, owner: '김재영', note: '세탁 회수 대기', updatedAt: now(), updatedBy: '김재영' },
        { id: 's8', item: '이불커버', category: 'linen', location: '메이플동 B1 린넨실', qty: 72, min: 50, owner: '김재영', note: '', updatedAt: now(), updatedBy: '김재영' },
        { id: 's9', item: '침대시트', category: 'linen', location: '메이플동 B1 린넨실', qty: 95, min: 70, owner: '김재영', note: '', updatedAt: now(), updatedBy: '김재영' },
        { id: 's10', item: '객실 슬리퍼', category: 'consumable', location: '체리동 1F 데스크', qty: 140, min: 80, owner: '이수진', note: '', updatedAt: now(), updatedBy: '이수진' },
        { id: 's11', item: '어메니티 세트', category: 'consumable', location: '오크동 3F 린넨실', qty: 210, min: 120, owner: '이수진', note: '', updatedAt: now(), updatedBy: '박지훈' },
        { id: 's12', item: '생수 500ml', category: 'consumable', location: '파인동 B1 창고', qty: 360, min: 200, owner: '최민호', note: '', updatedAt: now(), updatedBy: '최민호' },
      ],
      equipment: Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const e = { id: 'e' + n, label: `무전기 ${n}번`, battery: 'ok', condition: 'ok', note: '', borrower: null, loanedAt: null, dueAt: null, updatedAt: now(), updatedBy: null };
        if (n === 4) { e.battery = 'bad'; e.note = '배터리 교체 요청'; }
        if (n === 9) { e.condition = 'broken'; e.note = '액정 파손 — 수리 접수'; }
        if (n === 11) e.battery = 'low';
        if (n === 1) { e.borrower = '김재영'; e.loanedAt = today() + ' 06:58'; e.dueAt = today() + ' 22:00'; }
        if (n === 2) { e.borrower = '이수진'; e.loanedAt = today() + ' 07:01'; e.dueAt = today() + ' 22:00'; }
        if (n === 7) { e.borrower = '박지훈'; e.loanedAt = days(-1).slice(0, 10) + ' 20:10'; e.dueAt = today() + ' 07:00'; }
        return e;
      }),
      lost: [
        { id: 'l1', foundAt: today() + ' 13:50', room: '1204호', place: '침대 밑', desc: '아이폰 15 (금색)', valuable: true, status: 'stored', handedAt: null, deadline: days(0), reporter: '이수진', note: '귀중품 — 상황실 즉시 인계 필요', updatedAt: now() },
        { id: 'l2', foundAt: days(-5).slice(0, 10) + ' 15:20', room: '707호', place: '옷장', desc: '아동 패딩 (네이비)', valuable: false, status: 'stored', handedAt: null, deadline: days(2), reporter: '박지훈', note: '보관함 B-12', updatedAt: now() },
        { id: 'l3', foundAt: days(-5).slice(0, 10) + ' 11:05', room: '', place: '애견동 로비', desc: '지갑 (카드 3장)', valuable: true, status: 'handed_over', handedAt: days(-5).slice(0, 10) + ' 12:00', deadline: days(2), reporter: '김재영', note: '고객 연락 대기', updatedAt: now() },
        { id: 'l4', foundAt: days(-28).slice(0, 10) + ' 16:40', room: '', place: '오션월드 락커', desc: '물안경', valuable: false, status: 'handed_over', handedAt: days(-28).slice(0, 10) + ' 17:00', deadline: days(25), reporter: '최민호', note: '보관함 C-03', updatedAt: now() },
      ],
      defects: [
        { id: 'd1', room: '1503호', title: '샤워부스 누수', detail: '부스 하단 실리콘 균열, 물 고임', stage: 'transferred', assignee: '김재영', createdAt: days(-3).slice(0, 10) + ' 10:15', updatedAt: days(-3).slice(0, 10) + ' 17:00' },
        { id: 'd2', room: '812호', title: '도어락 배터리 방전', detail: '', stage: 'second_action', assignee: '최민호', createdAt: today() + ' 08:40', updatedAt: today() + ' 10:20' },
        { id: 'd3', room: '2201호', title: '커튼레일 이탈', detail: '왼쪽 브래킷 빠짐', stage: 'first_check', assignee: '이수진', createdAt: today() + ' 09:05', updatedAt: today() + ' 09:05' },
      ],
      handover: [
        { id: 'h1', date: today(), shift: 'night', kind: 'voc', room: '1811호', content: '이불 교체 요청 — 16시 이후 방문 희망', resolved: false, author: '박지훈', createdAt: today() + ' 06:40', updatedAt: now() },
        { id: 'h2', date: today(), shift: 'night', kind: 'note', room: '', content: '메이플동 단체 320명 입실(16시) — 수영조끼 수요 급증 예상', resolved: false, author: '박지훈', createdAt: today() + ' 06:40', updatedAt: now() },
        { id: 'h3', date: today(), shift: 'day', kind: 'notice', room: '', content: '파인동 온수 공급 점검 14:00–15:00', resolved: false, author: '김재영', createdAt: today() + ' 11:30', updatedAt: now() },
      ],
      sources: [
        { id: 'src1', title: '하우스키핑 주간 공지 (7월 3주)', origin: 'internal_notice', priority: 1, custVisible: false, collectedAt: today() + ' 08:00', updatedAt: today() + ' 08:00', content: '금일 오션월드 야간 운영 21:00까지 연장 (파도풀 20:30 종료). 메이플동 단체 320명 입실 예정, 수영조끼 M 수요 급증 예상. 조끼 반납 회수는 20:00부터 시작.' },
        { id: 'src2', title: 'VINFO 운영시간표 7월', origin: 'vinfo', priority: 2, custVisible: true, collectedAt: days(-7).slice(0, 10), updatedAt: days(-7).slice(0, 10), content: '오션월드 주간 10:00-18:00, 야간 18:00-21:00(성수기). 스키장 휴장. 사우나 06:00-22:00. 수하물 보관 서비스는 각 동 프런트에서 제공.' },
        { id: 'src3', title: '공식홈 이용안내', origin: 'official', priority: 3, custVisible: true, collectedAt: days(-16).slice(0, 10), updatedAt: days(-16).slice(0, 10), content: '오션월드 운영시간 10:00-20:00. 체크인 15:00, 체크아웃 11:00. 애견 동반 입장은 애견 전용동에 한하며 사전 예약이 필요합니다. 몸무게 15kg 이하 소형견 2마리까지.' },
        { id: 'src4', title: '습득물 처리 매뉴얼 v2', origin: 'internal_notice', priority: 1, custVisible: false, collectedAt: days(-30).slice(0, 10), updatedAt: days(-30).slice(0, 10), content: '귀중품(휴대폰, 지갑, 카드, 현금, 귀금속)은 발견 즉시 상황실 인계. 일반 습득물 보관 기한은 30일이며 기한 경과 시 경찰서 이관. 습득물 등록 시 사진 필수.' },
        { id: 'src5', title: '밴드 공지 정리본 (7월 2주)', origin: 'memo', priority: 4, custVisible: false, collectedAt: days(-3).slice(0, 10), updatedAt: days(-3).slice(0, 10), content: '무전기 충전기 2대 고장으로 B1 충전소만 사용. 카트 3호기 브레이크 점검 완료. 신규 입사자 교육 7/20 예정.' },
      ],
      // 현장 카드(비번·전화번호 등): 민감 정보라 공개 코드에는 넣지 않는다.
      // 실데이터는 비공개 데이터 저장소(db.json)에 있고 동기화로 내려온다.
      quickref: [],
      audit: [],
    };
  }

  /* ── 로컬 저장 ── */
  let db = null;
  function load() {
    if (db) return db;
    try { db = JSON.parse(localStorage.getItem(LS_DB)); } catch { db = null; }
    if (!db || !db.workers) { db = seed(); persist(); }
    if (!db.quickref) { db.quickref = []; persist(); } // 구버전 로컬 DB 마이그레이션
    return db;
  }
  function persist() {
    db.updatedAt = now();
    localStorage.setItem(LS_DB, JSON.stringify(db));
  }

  const COLLECTIONS = { stock: 'stock', equipment: 'equipment', lost: 'lost', defects: 'defects', handover: 'handover', sources: 'sources', quickref: 'quickref' };
  // 필드 화이트리스트 (임의 필드 수정 방지)
  const EDITABLE = {
    stock: ['qty', 'min', 'note', 'owner'],
    equipment: ['battery', 'condition', 'note', 'borrower', 'loanedAt', 'dueAt'],
    lost: ['status', 'handedAt', 'note', 'room', 'place', 'desc', 'valuable', 'deadline'],
    defects: ['stage', 'detail', 'assignee', 'room', 'title'],
    handover: ['resolved', 'content'],
    sources: ['enabled', 'title', 'content', 'custVisible'],
    quickref: ['cat', 'label', 'value', 'note'],
  };

  function find(entity, id) {
    const col = load()[COLLECTIONS[entity]];
    return col && col.find((r) => r.id === id);
  }

  /* 모든 쓰기의 단일 경로. changes: [{entity, entityId, field, newValue, reason?}] */
  function applyChanges(changes, opts) {
    const worker = opts.worker || '?';
    const channel = opts.channel || 'manual';
    const auditIds = [];
    for (const c of changes) {
      if (!EDITABLE[c.entity] || !EDITABLE[c.entity].includes(c.field)) throw new Error(`수정 불가: ${c.entity}.${c.field}`);
      const row = find(c.entity, c.entityId);
      if (!row) throw new Error('대상 행을 찾을 수 없습니다');
      const old = row[c.field];
      if (old === c.newValue) continue;
      const aid = uid('a');
      db.audit.unshift({ id: aid, ts: now(), worker, entity: c.entity, entityId: c.entityId, field: c.field, old, new: c.newValue, reason: c.reason || opts.reason || null, channel, undone: false, undoOf: c.undoOf || null });
      row[c.field] = c.newValue;
      row.updatedAt = now();
      row.updatedBy = worker;
      auditIds.push(aid);
    }
    if (db.audit.length > 500) db.audit.length = 500;
    persist();
    Sync.schedule();
    return auditIds;
  }

  function addRow(entity, row, opts) {
    row.id = row.id || uid(entity[0]);
    row.updatedAt = now();
    row.updatedBy = opts.worker;
    load()[COLLECTIONS[entity]].unshift(row);
    db.audit.unshift({ id: uid('a'), ts: now(), worker: opts.worker || '?', entity, entityId: row.id, field: '(신규)', old: null, new: row.desc || row.title || row.content || row.item || row.id, reason: opts.reason || null, channel: opts.channel || 'manual', undone: false, undoOf: null });
    persist();
    Sync.schedule();
    return row.id;
  }

  function undo(auditId, worker) {
    const a = load().audit.find((x) => x.id === auditId);
    if (!a) throw new Error('감사 로그를 찾을 수 없습니다');
    if (a.undone) throw new Error('이미 취소된 변경입니다');
    if (a.field === '(신규)') throw new Error('신규 등록은 취소를 지원하지 않습니다');
    const ids = applyChanges([{ entity: a.entity, entityId: a.entityId, field: a.field, newValue: a.old, reason: `실행 취소`, undoOf: a.id }], { worker, channel: 'undo' });
    a.undone = true;
    persist();
    return ids;
  }

  /* ── GitHub 동기화 (선택) ── */
  const Sync = (() => {
    let cfg = null;
    try { cfg = JSON.parse(localStorage.getItem(LS_CFG)); } catch { cfg = null; }
    let status = cfg ? 'idle' : 'local';
    let lastSha = null;
    let timer = null;
    let listeners = [];

    const setStatus = (s, detail) => { status = s; listeners.forEach((f) => f(s, detail)); };
    const api = (path, init) => fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}` + (init && init.method ? '' : `?ref=${cfg.branch || 'main'}&t=${Date.now()}`), {
      ...init,
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init && init.headers),
      },
    });
    const b64e = (s) => btoa(unescape(encodeURIComponent(s)));
    const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));

    // 병합: 행 단위 updatedAt 최신 우선, 감사 로그는 합집합
    function merge(remote, local) {
      const out = { ...remote };
      for (const key of Object.values(COLLECTIONS)) {
        const map = new Map();
        (remote[key] || []).forEach((r) => map.set(r.id, r));
        (local[key] || []).forEach((r) => {
          const ex = map.get(r.id);
          if (!ex || String(r.updatedAt || '') > String(ex.updatedAt || '')) map.set(r.id, r);
        });
        out[key] = Array.from(map.values());
      }
      const am = new Map();
      [...(remote.audit || []), ...(local.audit || [])].forEach((a) => { if (!am.has(a.id) || a.undone) am.set(a.id, a); });
      out.audit = Array.from(am.values()).sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 500);
      out.workers = (remote.workers && remote.workers.length >= (local.workers || []).length) ? remote.workers : local.workers;
      return out;
    }

    async function pullPush() {
      if (!cfg || !cfg.repo || !cfg.token) return;
      setStatus('syncing');
      try {
        const path = cfg.path || 'data/db.json';
        let remote = null;
        const res = await api(path);
        if (res.status === 200) {
          const j = await res.json();
          lastSha = j.sha;
          remote = JSON.parse(b64d(j.content));
        } else if (res.status === 404) {
          lastSha = null;
        } else if (res.status === 401 || res.status === 403) {
          throw new Error('토큰 권한 오류 (' + res.status + ')');
        } else throw new Error('서버 응답 ' + res.status);

        const merged = remote ? merge(remote, db) : db;
        const localStr = JSON.stringify(db);
        const mergedStr = JSON.stringify(merged);
        if (mergedStr !== localStr) {
          db = merged;
          localStorage.setItem(LS_DB, mergedStr);
          if (onRemoteChange) onRemoteChange();
        }
        const remoteStr = remote ? JSON.stringify(remoteNormalize(remote)) : '';
        if (!remote || remoteStr !== JSON.stringify(remoteNormalize(merged))) {
          const put = await api(path, {
            method: 'PUT',
            body: JSON.stringify({
              message: `sync from ${DEVICE} ${now()}`,
              content: b64e(mergedStr),
              branch: cfg.branch || 'main',
              ...(lastSha ? { sha: lastSha } : {}),
            }),
          });
          if (put.status === 409 || put.status === 422) { setStatus('idle'); return schedule(1500); }
          if (!put.ok) throw new Error('업로드 실패 ' + put.status);
          const pj = await put.json();
          lastSha = pj.content && pj.content.sha;
        }
        setStatus('synced');
      } catch (e) {
        setStatus('error', e.message);
      }
    }
    const remoteNormalize = (d) => ({ ...d, rev: 0, updatedAt: 0 });

    function schedule(ms) {
      clearTimeout(timer);
      timer = setTimeout(pullPush, ms || 2500);
    }
    let onRemoteChange = null;

    return {
      get cfg() { return cfg; },
      get status() { return status; },
      configure(c) {
        cfg = c;
        if (c) localStorage.setItem(LS_CFG, JSON.stringify(c));
        else { localStorage.removeItem(LS_CFG); setStatus('local'); }
        if (c) schedule(10);
      },
      schedule, pullPush,
      onStatus(f) { listeners.push(f); },
      onChange(f) { onRemoteChange = f; },
      start() {
        if (cfg) schedule(100);
        setInterval(() => { if (cfg && document.visibilityState === 'visible') pullPush(); }, 30000);
        document.addEventListener('visibilitychange', () => { if (cfg && document.visibilityState === 'visible') schedule(300); });
      },
      async test(c) {
        const saved = cfg; cfg = c;
        try {
          const res = await api(c.path || 'data/db.json');
          cfg = saved;
          return res.status === 200 || res.status === 404;
        } catch { cfg = saved; return false; }
      },
    };
  })();

  /* ── 팀 연결코드: 공개 team.json의 암호화된 토큰을 팀 암호로 복호화 ── */
  const b64ToBuf = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const Team = {
    async fetch() {
      try {
        const r = await fetch('team.json?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) return null;
        const j = await r.json();
        return (j && j.ct) ? j : null;
      } catch { return null; }
    },
    async unlock(passphrase, cfg) {
      const enc = new TextEncoder();
      const keyMat = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: b64ToBuf(cfg.salt), iterations: cfg.iter || 200000, hash: 'SHA-256' },
        keyMat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(cfg.iv) }, key, b64ToBuf(cfg.ct));
      const token = new TextDecoder().decode(pt);
      Sync.configure({ repo: cfg.repo, token, branch: cfg.branch || 'main', path: cfg.path || 'data/db.json' });
      return token;
    },
  };

  return {
    load, persist, applyChanges, addRow, undo, find, seed,
    Sync, Team, uid, now, today, days, DEVICE,
    get worker() { return localStorage.getItem(LS_WORKER) || null; },
    set worker(n) { localStorage.setItem(LS_WORKER, n); },
    reset() { localStorage.removeItem(LS_DB); db = null; },
  };
})();
