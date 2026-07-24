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
    { id: '캄', name: '소노캄' }, { id: 'D', name: '메이플동', sub: '호텔' }, { id: 'E', name: '노블리안', sub: '펫' },
  ];

  /* ── 시드: 실제 업무 자료(현장 카드·지식 소스)만. 샘플 재고/장비/톡은 넣지 않는다. ── */
  const SEED_VERSION = 6;
  function seed() {
    const db = {
      rev: 1, seedVersion: SEED_VERSION, updatedAt: now(),
      buildings: BUILDINGS.map((b) => ({ ...b })),
      config: { updatedAt: now() },
      users: [], workers: [],
      stock: [], equipment: [], lost: [], defects: [], quickref: [], sources: [], messages: [], files: [], audit: [],
    };
    seedReference(db);
    return db;
  }

  function seedReference(db) {
    seedQuickB(db);
    // 지식 소스
    db.sources.push({ id: uid('src'), bld: 'B', title: '오크동(B) 하우스맨 업무 카드', origin: 'internal_notice', priority: 1, custVisible: false, collectedAt: today(), updatedAt: today(), enabled: true,
      content: '오크동(B) 현장 참고. 매일: 16-20층 린넨실/복도 전자레인지 청소·점검, 퇴근 전 생수 수량 확인 후 보고, 밥솥 회수 시 세척 후 밀봉. 지정객실 2002·2035. 객실 타입: 3-15F 취사, 16-18F 세미취사(밥솥·주걱·밥그릇·찬접시 없음, 요청 시 투입), 19-20F 클린(취사 불가). 전자레인지 있는 층 16-20F. 층별 창고: 3F 테이블이불, 4F 추가침구, 5·8F 투입용 요솜, 6F 오리털이불·양모베개, 7F 침대패드·스커트, 13F 가전(밥솥·선풍기), 14F 가전(냉장고·열풍기), 17F 가구(소파·식탁의자). 에어컨: 1-5F LG(18,23), 6-10F 삼성(14,84), 11-12F LG, 13F 삼성, 14-20F LG. 카드키 매수: HOK 패밀리(4인) 6장, IOK 스위트(5인) 8장, COK 골드(7인) 10장+박스, 골드 6-10F 1·4호 총 10객실. 카드키 발급 절차: 재실고객 조회 → 영업장 02/객실번호 입력·조회 → 객실키 발급 → 발급기에 카드 올리고 신규/본실 발급 → 두 번째 카드 추가 발급. ※ 도어락 비밀번호와 내부 전화번호는 보안상 공유 서버에만 있습니다.' });
    db.sources.push({ id: uid('src'), bld: 'C', title: '파인동(C) 하우스맨 업무 카드', origin: 'internal_notice', priority: 1, custVisible: false, collectedAt: today(), updatedAt: today(), enabled: true,
      content: '파인동(C) 현장 참고. 컴퓨터 있는 층 3F·11F. 추가침구(추침)는 3층 창고에서 제작·보관. 객실 타입: 9-12F 세미취사(밥솥·밥그릇·주걱 미투입) — 오크동과 층이 다름. 식탁의자: 3-7F 일룸(1005), 8-12F 원목(나우의자), 2F 일룸 201·203~213·222·223, 2F 원목 202·214~217·220·221·224~226, 223호는 더블침대. 층별 창고: 3F 추침 제작·보관+컴퓨터, 4F T테이블·등받이·방석(소파), 5F 소파 프레임, 6F 식탁의자(2,9~12) 나우의자·소파 프레임, 7F TV·소파 프레임, 8F 식탁의자(3,9~12) 나우의자, 9F 선풍기, 11F 컴퓨터. 각층 린넨실 유지: 롤휴지 겉봉투 뜯기, 각티슈 1~2박스 뜯기, 냄비류·밥솥 회수 후 나머지 폐기(앵글 꼼꼼히), 대여용품(아기욕조·열풍기) 회수, 말통 교체는 수시로. 단체 입실 시: 재실내역 조회로 수시 최신화 → 최종 변동 객실 기준 진행 → 연타/칼·가위 투입, 연타 미리 확보, 파손품은 각층 창고로 이동. 놓치기 쉬운 것: 에어컨 사용 시 책상 밑 물통 확인, 식탁의자 파렛(교체) 확인, 재실내역 수시 최신화. ※ 습득물 비번 등 민감 정보와 직원 연락처는 보안상 공유 서버에만 있습니다.' });
    db.sources.push({ id: uid('src'), bld: 'B', title: '서비스 평가 기준 (공통)', origin: 'internal_notice', priority: 1, custVisible: false, collectedAt: today(), updatedAt: today(), enabled: true,
      content: '객실 하우스키핑 서비스 평가(Standard): SOP 60점 + 인적서비스 40점 = 100점. 판정 준수1/미준수2/관찰불가0, 미준수는 V 표시 후 감점. SOP 8항목: 1 전화 인사(소속·성명 명확, 벨 3번 전 수신, 초과 시 사과) 필수 5점, 2 방문인사(밝게 목례) 필수 5점, 3 퇴실 인사(밝은 표정 목례, 시간·상황에 맞는 인사말) 필수 5점, 4 고객 요구사항 확인(요청 확인, 객실번호·요청 복명복창, 추가 요청 확인, 추가 요금 안내) 필수 5점, 5 예상 방문 소요시간 안내(별도 요청 없으면 15분 내 방문, 초과 시 사과와 이유) 성과 7점, 6 객실 방문(초인종/노크 후 잘 보이는 위치 대기, 소속·용무 명확) 필수 5점, 7 물품 전달(두 손 가슴~배 높이, 양손 불가 시 목례와 공손히, 무거운 물품 사전 안내 후 객실 안쪽) 성과 7점, 8 추가 요청사항 확인(15분 내 재방문, 초과 시 소요시간 안내) 성과 7점. 인적 서비스 4항목: 전화 응대 표현(쉬운 용어·명확한 발음·표준어, 공손·정중, 적당한 말 빠르기, 미~파 톤, 적절한 억양), 표정(부드러운 미소 유지), 방문 응대 표현(동일 기준), 용모복장(청결·단정 유니폼, 깨끗한 신발, 헤어 단정 — 남 헤어제품 정돈, 여 단발은 보브컷·긴머리는 올림머리) 각 필수 5점.' });
  }

  // 공개 저장소에는 민감 정보(도어락 비번·내부 전화번호·직원 연락처)를 넣지 않는다.
  // 그 값들은 비공개 데이터 저장소(data/db.json)에만 두고 공유 서버 연결 시 내려온다.
  function seedQuickB(db) {
    const B = 'B';
    const q = (cat, label, value, note) => db.quickref.push({ id: uid('q'), bld: B, cat, label, value, note: note || '' });
    q('비밀번호', '린넨실 도어락 · 창고', '', '민감 정보 — 공유 서버 연결 시 표시됩니다');
    q('매일 체크', '전자레인지', '', '16–20층 린넨실·복도 매일 청소·점검');
    q('매일 체크', '생수 수량', '', '퇴근 전 16–20층 확인 후 보고');
    q('매일 체크', '밥솥 회수', '', '세척 확인 후 밀봉 보관');
    q('매일 체크', '지정객실', '2002 · 2035', '1502·1503·1803 제외');
    q('객실 타입', '3F–15F', '취사'); q('객실 타입', '16F–18F', '세미취사', '밥솥·주걱·밥그릇·찬접시 없음(요청 시 투입)'); q('객실 타입', '19F–20F', '클린', '취사 불가 · 전자레인지 16–20F');
    q('층별 창고', '3F', '', '테이블이불(계단쪽)'); q('층별 창고', '4F', '', '추가침구'); q('층별 창고', '5F·8F', '', '투입용 요솜');
    q('층별 창고', '6F', '', '오리털 이불·양모베개 (봉지 안은 사은품)'); q('층별 창고', '7F', '', '침대 패드·스커트');
    q('층별 창고', '13F', '', '가전 — 밥솥·선풍기'); q('층별 창고', '14F', '', '가전 — 냉장고·열풍기'); q('층별 창고', '17F', '', '가구 — 소파·식탁의자');
    q('에어컨 리모컨', '1-5F·11-12F·14-20F', 'LG (18, 23)'); q('에어컨 리모컨', '6-10F·13F', '삼성 (14, 84)');
    q('카드키 매수', 'HOK 패밀리(4인)', '6장'); q('카드키 매수', 'IOK 스위트(5인)', '8장'); q('카드키 매수', 'COK 골드(7인)', '10장+박스', '골드 6–10F: 1·4호 총 10객실');
    q('카드키 발급', '룸체인지 절차', '', '재실고객 조회 → 영업장 02/객실번호 → 객실키 발급 → 카드 올리고 신규/본실 발급 → 두 번째 카드 추가 발급');
    seedQuickC(db);
  }
  function seedQuickC(db) {
    const C = 'C';
    const q = (cat, label, value, note) => db.quickref.push({ id: uid('q'), bld: C, cat, label, value, note: note || '' });
    q('비밀번호', '습득물 · 기타', '', '민감 정보 — 공유 서버 연결 시 표시됩니다');
    q('핵심 메모', '컴퓨터 있는 층', '3F · 11F');
    q('핵심 메모', '추가침구(추침)', '3F 창고', '제작·보관');
    q('핵심 메모', '에어컨 사용 시', '', '책상 밑 물통 꼭 확인');
    q('핵심 메모', '재실내역', '', '수시로 최신화 — 단체 입실 시 최종 변동 객실 기준');
    q('객실 타입', '9F–12F', '세미취사', '밥솥·밥그릇·주걱 미투입 (오크와 층이 다름)');
    q('식탁의자', '3F–7F', '일룸 (1005)'); q('식탁의자', '8F–12F', '원목(나우의자)');
    q('식탁의자', '2F 일룸', '201, 203~213, 222, 223'); q('식탁의자', '2F 원목', '202, 214~217, 220, 221, 224~226', '223호 더블침대');
    q('층별 창고', '3F', '', '추침 제작·보관 · 컴퓨터'); q('층별 창고', '4F', '', 'T테이블·등받이·방석(소파)');
    q('층별 창고', '5F', '', '소파 프레임'); q('층별 창고', '6F', '', '식탁의자(2,9~12) 나우의자 · 소파 프레임');
    q('층별 창고', '7F', '', 'TV · 소파 프레임'); q('층별 창고', '8F', '', '식탁의자(3,9~12) 나우의자'); q('층별 창고', '9F', '', '선풍기');
    q('린넨실 유지', '휴지류', '', '롤휴지 겉봉투 뜯기 · 각티슈 1~2박스 뜯기');
    q('린넨실 유지', '회수품', '', '냄비류·밥솥 회수, 나머지 폐기 (앵글 꼼꼼히)');
    q('린넨실 유지', '대여용품', '', '아기욕조·열풍기 회수 · 말통 교체 (수시로)');
    q('단체 입실', '순서', '', '재실내역 조회 → 최종 변동 객실 기준 → 연타/칼·가위 투입 · 연타 미리 확보 · 파손품은 각층 창고로');
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
    if (!db.config) db.config = { updatedAt: now() };
    if (!db.users) db.users = [];
    if (!db.workers) db.workers = [];
    // 예전 버전의 샘플 데이터(가짜 이름·무전기·톡)를 자동 정리하고 실제 자료만 다시 심는다
    if ((db.seedVersion || 0) < SEED_VERSION) {
      db.stock = []; db.equipment = []; db.lost = []; db.defects = [];
      db.messages = []; db.files = []; db.audit = []; db.workers = [];
      db.quickref = []; db.sources = [];
      db.buildings = BUILDINGS.map((b) => ({ ...b }));
      seedReference(db);
      db.seedVersion = SEED_VERSION;
      persist();
    }
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

  /* ── 계정 로그인 (이름 + 비밀번호 + 역할) ── */
  const enc = new TextEncoder();
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  async function derive(pw, salt) {
    const km = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, km, 256);
    return hex(bits);
  }
  const Auth = {
    users() { return load().users || []; },
    hasUsers() { return this.users().length > 0; },
    get current() { try { return JSON.parse(sessionStorage.getItem('hos.session') || 'null'); } catch { return null; } },
    isAdmin() { const c = this.current; return !!c && c.role === 'admin'; },
    async create(name, pw, role) {
      name = String(name || '').trim();
      if (!name) throw new Error('이름을 입력하세요');
      if (String(pw || '').length < 4) throw new Error('비밀번호는 4자 이상으로 정해주세요');
      if (!db.users) db.users = [];
      if (this.users().some((u) => u.name === name)) throw new Error('이미 있는 이름입니다');
      const salt = uid('s');
      const u = { id: uid('u'), name, role: role || 'staff', salt, hash: await derive(pw, salt), createdAt: now() };
      db.users.push(u);
      if (!db.workers) db.workers = [];
      if (!db.workers.includes(name)) db.workers.push(name);
      persist(); Sync.schedule();
      return u;
    },
    async login(name, pw) {
      const u = this.users().find((x) => x.name === String(name || '').trim());
      if (!u) throw new Error('없는 계정입니다');
      if ((await derive(pw, u.salt)) !== u.hash) throw new Error('비밀번호가 올바르지 않습니다');
      sessionStorage.setItem('hos.session', JSON.stringify({ id: u.id, name: u.name, role: u.role }));
      localStorage.setItem(LS_WORKER, u.name);
      return u;
    },
    logout() { sessionStorage.removeItem('hos.session'); },
    setRole(id, role) { const u = this.users().find((x) => x.id === id); if (u) { u.role = role; persist(); Sync.schedule(); } },
    remove(id) { db.users = this.users().filter((u) => u.id !== id); persist(); Sync.schedule(); },
  };

  /* ── 초기화 ── */
  function clearOperational() {
    const d = load();
    ['stock', 'equipment', 'lost', 'defects', 'messages', 'files', 'audit'].forEach((k) => { d[k] = []; });
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
      const um = new Map();
      [...(remote.users || []), ...(local.users || [])].forEach((u) => { const ex = um.get(u.id); if (!ex || String(u.createdAt || '') >= String(ex.createdAt || '')) um.set(u.id, u); });
      out.users = Array.from(um.values());
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
    Sync, Team, Auth, uid, now, today, days, DEVICE, BUILDINGS,
    inBld, clearOperational, resetSeed,
    get bld() { return bld(); }, set bld(b) { setBld(b); },
    get worker() { return localStorage.getItem(LS_WORKER) || ''; },
    set worker(n) { localStorage.setItem(LS_WORKER, n); },
    buildings() { return load().buildings; },
    reset() { localStorage.removeItem(LS_DB); db = null; },
  };
})();
