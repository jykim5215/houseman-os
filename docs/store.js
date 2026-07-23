/* 하우스맨 노트 — 데이터 계층 v0.5
   동별 완전 분리(A~E) · 팀 톡/파일 · 관리자 PIN · 정량 없는 품목 지원
   로컬(localStorage) 우선 + GitHub 비공개 저장소 동기화(팀 암호). 모든 쓰기는 감사 로그 + Undo. */
'use strict';

const Store = (() => {
  const LS_DB = 'hos.db';
  const LS_CFG = 'hos.sync';
  const LS_WORKER = 'hos.worker';
  const LS_BLD = 'hos.bld';
  const DEVICE = (localStorage.getItem('hos.device') || (() => {
    const d = 'd' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('hos.device', d);
    return d;
  })());

  const localIso = (d) => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 19).replace('T', ' '); };
  const now = () => localIso(new Date());
  const today = () => now().slice(0, 10);
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const days = (n) => localIso(new Date(Date.now() + n * 86400000));

  const BUILDINGS = [
    { id: 'A', name: '체리동' }, { id: 'B', name: '오크동' }, { id: 'C', name: '파인동' },
    { id: 'D', name: '소노캄' }, { id: 'E', name: '노블리안' },
  ];

  /* ── 시드 (샘플은 오크동 B에만, 나머지 동은 빈 상태) ── */
  function seed() {
    const db = {
      rev: 1, updatedAt: now(),
      buildings: BUILDINGS.map((b) => ({ ...b })),
      config: { updatedAt: now(), adminSalt: null, adminHash: null },
      workers: ['김반장', '이주임', '박대리'],
      stock: [], equipment: [], lost: [], defects: [], quickref: [], sources: [], messages: [], files: [], audit: [],
    };
    seedBuildingB(db);
    // 다른 동은 환영 공지만
    ['A', 'C', 'D', 'E'].forEach((bld) => {
      db.messages.push({ id: uid('m'), bld, type: 'notice', author: '시스템', text: `${BUILDINGS.find((b) => b.id === bld).name} 노트가 준비됐습니다. 재고·현장 카드·공지를 채워보세요.`, ts: now() });
    });
    return db;
  }

  function seedBuildingB(db) {
    const B = 'B';
    // 재고 — 수건류는 정량(min) 없음(null), 조끼/소모품 일부만 기준 설정
    const stock = [
      ['바스타올', 'towel', '3F 린넨실', 40, null, '수시 세탁 순환 — 정량 없음'],
      ['핸드타올', 'towel', '3F 린넨실', 62, null, ''],
      ['페이스타올', 'towel', '3F 린넨실', 30, null, ''],
      ['수영조끼 M', 'vest', 'B1 창고', 6, 15, '단체 입실 대비 보충 필요'],
      ['수영조끼 L', 'vest', 'B1 창고', 18, 12, ''],
      ['생수 500ml', 'consumable', 'B1 창고', 60, 100, ''],
      ['객실 슬리퍼', 'consumable', '프런트', 120, null, ''],
      ['어메니티 세트', 'consumable', '3F 린넨실', 90, 60, ''],
    ];
    stock.forEach(([item, category, location, qty, min, note]) => {
      db.stock.push({ id: uid('s'), bld: B, item, category, location, qty, min, note, updatedAt: now(), updatedBy: '' });
    });
    // 장비
    for (let i = 1; i <= 6; i++) {
      const e = { id: 'e' + i, bld: B, label: `무전기 ${i}번`, battery: 'ok', condition: 'ok', note: '', borrower: null, loanedAt: null, dueAt: null, updatedAt: now(), updatedBy: '' };
      if (i === 3) { e.battery = 'bad'; e.note = '배터리 교체 요청'; }
      if (i === 5) { e.condition = 'broken'; e.note = '액정 파손 — 수리 접수'; }
      if (i === 2) { e.borrower = '이주임'; e.loanedAt = days(-1).slice(0, 10) + ' 20:10'; e.dueAt = today() + ' 07:00'; }
      db.equipment.push(e);
    }
    // 습득물
    db.lost.push({ id: uid('l'), bld: B, foundAt: today() + ' 13:50', room: '1204호', place: '침대 밑', desc: '아이폰 15 (금색)', valuable: true, status: 'stored', handedAt: null, deadline: days(30), reporter: '이주임', note: '귀중품 — 상황실 즉시 인계' });
    db.lost.push({ id: uid('l'), bld: B, foundAt: days(-5).slice(0, 10) + ' 15:20', room: '707호', place: '옷장', desc: '아동 패딩 (네이비)', valuable: false, status: 'stored', handedAt: null, deadline: days(2), reporter: '박대리', note: '보관함 B-12' });
    // 하자
    db.defects.push({ id: uid('d'), bld: B, room: '1503호', title: '샤워부스 누수', detail: '실리콘 균열, 물 고임', stage: 'transferred', assignee: '김반장', createdAt: days(-3).slice(0, 10) + ' 10:15', updatedAt: days(-3).slice(0, 10) + ' 17:00' });
    db.defects.push({ id: uid('d'), bld: B, room: '812호', title: '도어락 배터리 방전', detail: '', stage: 'second_action', assignee: '박대리', createdAt: today() + ' 08:40', updatedAt: today() + ' 10:20' });
    // 현장 카드(오크동 업무 카드)
    seedQuickB(db);
    // 지식 소스
    db.sources.push({ id: uid('src'), bld: B, title: '오크동(B) 하우스맨 업무 카드', origin: 'internal_notice', priority: 1, custVisible: false, collectedAt: today(), updatedAt: today(), enabled: true,
      content: '오크동(B) 현장 참고. 린넨실 도어락 비번: 2F 6012*, 3-4F 0351*, 5-13F 0111*, 14F 1234*, 15-20F 0111*. 매일: 16-20층 린넨실/복도 전자레인지 청소·점검, 퇴근 전 생수 수량 확인 후 보고, 밥솥 회수 시 세척 후 밀봉. 지정객실 2002·2035. 객실 타입: 3-15F 취사, 16-18F 세미취사(밥솥·주걱·찬접시 없음, 요청 시 투입), 19-20F 클린. 에어컨: 1-5F LG(18,23), 6-10F 삼성(14,84), 14-20F LG(18,23). 린넨실 전화: 오크 8000351, 파인 8010351, 체리 8060732. 카드키: 패밀리 6장, 스위트 8장, 골드 10장+박스.' });
    // 톡
    db.messages.push({ id: uid('m'), bld: B, type: 'notice', author: '김반장', text: '오늘 16시 메이플동 단체 320명 입실 — 수영조끼 M 수요 급증 예상. 재고 확인 부탁합니다.', ts: today() + ' 08:00' });
    db.messages.push({ id: uid('m'), bld: B, type: 'text', author: '이주임', text: '1204호에서 아이폰 습득했습니다. 상황실 인계 진행할게요.', ts: today() + ' 13:52' });
    db.messages.push({ id: uid('m'), bld: B, type: 'done', author: '박대리', text: '812호 도어락 배터리 교체', meta: { detail: '예비 배터리로 교체, 정상 작동 확인', at: today() + ' 10:20' }, ts: today() + ' 10:21' });
  }

  function seedQuickB(db) {
    const B = 'B';
    const q = (cat, label, value, note) => db.quickref.push({ id: uid('q'), bld: B, cat, label, value, note: note || '' });
    q('비밀번호 · 린넨실 도어락', '2F', '6012*'); q('비밀번호 · 린넨실 도어락', '3F–4F', '0351*');
    q('비밀번호 · 린넨실 도어락', '5F–13F', '0111*'); q('비밀번호 · 린넨실 도어락', '14F', '1234*');
    q('비밀번호 · 린넨실 도어락', '15F–20F', '0111*');
    q('비밀번호 · 창고/기타', '2F 창고', '5920'); q('비밀번호 · 창고/기타', '13·14·17F 창고', '6012');
    q('비밀번호 · 창고/기타', '18F 자물쇠', '5678'); q('비밀번호 · 창고/기타', '19F', '5920 / 6012*', '기록 두 가지 — 현장 확인');
    q('전화번호', '오크(B) 린넨실', '8000351'); q('전화번호', '파인(C) 린넨실', '8010351');
    q('전화번호', '체리(A) 린넨실', '8060732'); q('전화번호', '세탁실(오크)', '7680'); q('전화번호', '프런트(오크)', '101');
    q('매일 체크', '전자레인지', '', '16–20층 린넨실·복도 매일 청소·점검');
    q('매일 체크', '생수 수량', '', '퇴근 전 16–20층 확인 후 보고');
    q('매일 체크', '지정객실', '2002 · 2035', '1502·1503·1803 제외');
    q('객실 타입', '3F–15F', '취사', ''); q('객실 타입', '16F–18F', '세미취사', '밥솥·주걱·찬접시 없음(요청 시 투입)'); q('객실 타입', '19F–20F', '클린', '취사 불가');
    q('에어컨 리모컨', '1-5F·11-12F·14-20F', 'LG (18, 23)'); q('에어컨 리모컨', '6-10F·13F', '삼성 (14, 84)');
    q('카드키 매수', '패밀리(4인)', '6장'); q('카드키 매수', '스위트(5인)', '8장'); q('카드키 매수', '골드(7인)', '10장+박스');
  }

  /* ── 로컬 저장 ── */
  let db = null;
  function load() {
    if (db) return db;
    try { db = JSON.parse(localStorage.getItem(LS_DB)); } catch { db = null; }
    if (!db || !db.buildings) { db = seed(); persist(); }
    // 마이그레이션
    if (!db.messages) db.messages = [];
    if (!db.files) db.files = [];
    if (!db.config) db.config = { updatedAt: now(), adminSalt: null, adminHash: null };
    return db;
  }
  function persist() { db.updatedAt = now(); localStorage.setItem(LS_DB, JSON.stringify(db)); }

  const COLLECTIONS = ['stock', 'equipment', 'lost', 'defects', 'quickref', 'sources', 'messages', 'files'];
  const EDITABLE = {
    stock: ['qty', 'min', 'note', 'item', 'location', 'category'],
    equipment: ['battery', 'condition', 'note', 'borrower', 'loanedAt', 'dueAt'],
    lost: ['status', 'handedAt', 'note', 'room', 'place', 'desc', 'valuable', 'deadline'],
    defects: ['stage', 'detail', 'assignee', 'room', 'title'],
    sources: ['enabled', 'title', 'content', 'custVisible'],
    quickref: ['cat', 'label', 'value', 'note'],
    messages: ['text'],
  };

  const bld = () => localStorage.getItem(LS_BLD) || 'B';
  const setBld = (b) => localStorage.setItem(LS_BLD, b);
  const inBld = (coll) => load()[coll].filter((r) => r.bld === bld());

  function find(entity, id) { return (load()[entity] || []).find((r) => r.id === id); }

  function applyChanges(changes, opts) {
    const worker = opts.worker || '';
    const channel = opts.channel || 'manual';
    const auditIds = [];
    for (const c of changes) {
      if (!EDITABLE[c.entity] || !EDITABLE[c.entity].includes(c.field)) throw new Error(`수정 불가: ${c.entity}.${c.field}`);
      const row = find(c.entity, c.entityId);
      if (!row) throw new Error('대상을 찾을 수 없습니다');
      const old = row[c.field];
      if (old === c.newValue) continue;
      const aid = uid('a');
      db.audit.unshift({ id: aid, ts: now(), bld: row.bld, worker, entity: c.entity, entityId: c.entityId, field: c.field, old, new: c.newValue, reason: c.reason || opts.reason || null, channel, undone: false, undoOf: c.undoOf || null });
      row[c.field] = c.newValue;
      row.updatedAt = now(); row.updatedBy = worker;
      auditIds.push(aid);
    }
    if (db.audit.length > 800) db.audit.length = 800;
    persist(); Sync.schedule();
    return auditIds;
  }

  function addRow(entity, row, opts) {
    row.id = row.id || uid(entity[0]);
    row.bld = row.bld || bld();
    row.updatedAt = now(); row.updatedBy = opts && opts.worker;
    load()[entity].unshift(row);
    db.audit.unshift({ id: uid('a'), ts: now(), bld: row.bld, worker: (opts && opts.worker) || '', entity, entityId: row.id, field: '(신규)', old: null, new: row.desc || row.title || row.content || row.item || row.text || row.label || row.id, reason: (opts && opts.reason) || null, channel: (opts && opts.channel) || 'manual', undone: false, undoOf: null });
    persist(); Sync.schedule();
    return row.id;
  }
  function delRow(entity, id) {
    const arr = load()[entity]; const i = arr.findIndex((r) => r.id === id);
    if (i >= 0) { arr.splice(i, 1); persist(); Sync.schedule(); }
  }

  function undo(auditId, worker) {
    const a = load().audit.find((x) => x.id === auditId);
    if (!a) throw new Error('감사 로그를 찾을 수 없습니다');
    if (a.undone || a.field === '(신규)') throw new Error('취소할 수 없는 항목입니다');
    const ids = applyChanges([{ entity: a.entity, entityId: a.entityId, field: a.field, newValue: a.old, reason: '실행 취소', undoOf: a.id }], { worker, channel: 'undo' });
    a.undone = true; persist();
    return ids;
  }

  /* ── 관리자 PIN ── */
  const enc = new TextEncoder();
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  async function hashPin(pin, salt) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(salt + '::' + pin))); }
  const Admin = {
    hasPin() { const c = load().config; return !!(c && c.adminHash); },
    async setPin(pin) {
      const salt = uid('salt');
      const h = await hashPin(pin, salt);
      db.config = { updatedAt: now(), adminSalt: salt, adminHash: h };
      persist(); Sync.schedule();
    },
    async verify(pin) {
      const c = load().config;
      if (!c || !c.adminHash) return false;
      return (await hashPin(pin, c.adminSalt)) === c.adminHash;
    },
  };

  /* ── 초기화 ── */
  function clearOperational() {
    const d = load();
    ['stock', 'equipment', 'lost', 'defects', 'messages', 'files', 'audit'].forEach((k) => { d[k] = []; });
    // 각 동 환영 공지만 유지
    d.buildings.forEach((b) => d.messages.push({ id: uid('m'), bld: b.id, type: 'notice', author: '시스템', text: `${b.name} — 빈 상태에서 시작합니다.`, ts: now() }));
    persist(); Sync.schedule();
  }
  function resetSeed() { localStorage.removeItem(LS_DB); db = null; load(); Sync.schedule(); }

  /* ── GitHub 동기화 ── */
  const Sync = (() => {
    let cfg = null;
    try { cfg = JSON.parse(localStorage.getItem(LS_CFG)); } catch { cfg = null; }
    let status = cfg ? 'idle' : 'local';
    let lastSha = null, timer = null, listeners = [], onRemoteChange = null;
    const setStatus = (s, d) => { status = s; listeners.forEach((f) => f(s, d)); };
    const api = (path, init) => fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}` + (init && init.method ? '' : `?ref=${cfg.branch || 'main'}&t=${Date.now()}`), {
      ...init, headers: { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init && init.headers) },
    });
    const b64e = (s) => btoa(unescape(encodeURIComponent(s)));
    const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));

    function merge(remote, local) {
      const out = { ...remote };
      for (const key of COLLECTIONS) {
        const map = new Map();
        (remote[key] || []).forEach((r) => map.set(r.id, r));
        (local[key] || []).forEach((r) => { const ex = map.get(r.id); if (!ex || String(r.updatedAt || r.ts || '') > String(ex.updatedAt || ex.ts || '')) map.set(r.id, r); });
        out[key] = Array.from(map.values());
      }
      const am = new Map();
      [...(remote.audit || []), ...(local.audit || [])].forEach((a) => { if (!am.has(a.id) || a.undone) am.set(a.id, a); });
      out.audit = Array.from(am.values()).sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 800);
      out.buildings = (remote.buildings && remote.buildings.length) ? remote.buildings : local.buildings;
      out.workers = Array.from(new Set([...(remote.workers || []), ...(local.workers || [])]));
      const rc = remote.config || {}, lc = local.config || {};
      out.config = (String(rc.updatedAt || '') >= String(lc.updatedAt || '')) ? rc : lc;
      return out;
    }
    const norm = (d) => JSON.stringify({ ...d, rev: 0, updatedAt: 0 });

    async function pullPush() {
      if (!cfg || !cfg.repo || !cfg.token) return;
      setStatus('syncing');
      try {
        const path = cfg.path || 'data/db.json';
        let remote = null;
        const res = await api(path);
        if (res.status === 200) { const j = await res.json(); lastSha = j.sha; remote = JSON.parse(b64d(j.content)); }
        else if (res.status === 404) lastSha = null;
        else if (res.status === 401 || res.status === 403) throw new Error('토큰 권한 오류 (' + res.status + ')');
        else throw new Error('서버 응답 ' + res.status);

        const merged = remote ? merge(remote, db) : db;
        if (JSON.stringify(merged) !== JSON.stringify(db)) {
          db = merged; localStorage.setItem(LS_DB, JSON.stringify(db));
          if (onRemoteChange) onRemoteChange();
        }
        if (!remote || norm(remote) !== norm(merged)) {
          const put = await api(path, { method: 'PUT', body: JSON.stringify({ message: `sync ${DEVICE} ${now()}`, content: b64e(JSON.stringify(merged)), branch: cfg.branch || 'main', ...(lastSha ? { sha: lastSha } : {}) }) });
          if (put.status === 409 || put.status === 422) { setStatus('idle'); return schedule(1500); }
          if (!put.ok) throw new Error('업로드 실패 ' + put.status);
          const pj = await put.json(); lastSha = pj.content && pj.content.sha;
        }
        setStatus('synced');
      } catch (e) { setStatus('error', e.message); }
    }
    function schedule(ms) { clearTimeout(timer); timer = setTimeout(pullPush, ms || 2500); }
    return {
      get cfg() { return cfg; }, get status() { return status; },
      configure(c) { cfg = c; if (c) localStorage.setItem(LS_CFG, JSON.stringify(c)); else { localStorage.removeItem(LS_CFG); setStatus('local'); } if (c) schedule(10); },
      schedule, pullPush,
      onStatus(f) { listeners.push(f); }, onChange(f) { onRemoteChange = f; },
      start() { if (cfg) schedule(100); setInterval(() => { if (cfg && document.visibilityState === 'visible') pullPush(); }, 20000); document.addEventListener('visibilitychange', () => { if (cfg && document.visibilityState === 'visible') schedule(300); }); },
      async test(c) { const s = cfg; cfg = c; try { const r = await api(c.path || 'data/db.json'); cfg = s; return r.status === 200 || r.status === 404; } catch { cfg = s; return false; } },
    };
  })();

  const b64ToBuf = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const Team = {
    async fetch() { try { const r = await fetch('team.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return null; const j = await r.json(); return (j && j.ct) ? j : null; } catch { return null; } },
    async unlock(passphrase, c) {
      const km = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64ToBuf(c.salt), iterations: c.iter || 200000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(c.iv) }, key, b64ToBuf(c.ct));
      const token = new TextDecoder().decode(pt);
      Sync.configure({ repo: c.repo, token, branch: c.branch || 'main', path: c.path || 'data/db.json' });
      return token;
    },
  };

  return {
    load, persist, applyChanges, addRow, delRow, undo, find, seed,
    Sync, Team, Admin, uid, now, today, days, DEVICE, BUILDINGS,
    inBld, clearOperational, resetSeed,
    get bld() { return bld(); }, set bld(b) { setBld(b); },
    get worker() { return localStorage.getItem(LS_WORKER) || ''; },
    set worker(n) { localStorage.setItem(LS_WORKER, n); },
    buildings() { return load().buildings; },
    reset() { localStorage.removeItem(LS_DB); db = null; },
  };
})();
