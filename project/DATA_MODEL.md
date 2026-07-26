# DATA_MODEL.md — SQLite 스키마 초안 (v0.1)

단일 SQLite 파일(`houseman.db`)을 main 프로세스가 소유한다. 챗봇과 테이블 UI는 모두 이 DB 하나를 본다. 아래 DDL은 초안이며, 구현 시 `app/src/main/db/schema.sql`로 옮기고 마이그레이션 버전을 붙인다.

## 설계 원칙
1. **수량은 이벤트 소싱**: 재고 현재값을 직접 UPDATE하지 않고 `stock_moves`(±n, 사유)를 INSERT, 현재값은 파생(뷰/캐시). 감사·Undo·일일 리포트가 공짜로 나온다.
2. **모든 쓰기는 audit_log를 남긴다**: 테이블 직접 수정·챗 승인 편집·xlsx import 모두 동일 경로(`applyProposal`).
3. **위치는 트리**: 동 → 층 → 린넨실/창고. `locations.parent_id` 자기참조.
4. **문서와 DB가 같은 검색 인덱스**: 소스 문서 청크는 FTS5, DB 행은 질의 시 실시간 조회.

## 핵심 테이블

```sql
-- 근무자 (로그인 없음, 시작 시 선택)
CREATE TABLE workers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT DEFAULT 'houseman',        -- houseman | supervisor | etc
  active INTEGER NOT NULL DEFAULT 1
);

-- 위치 트리: 동/층/린넨실·창고
CREATE TABLE locations (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES locations(id),
  name TEXT NOT NULL,                  -- '메이플동', '3F', 'B1 린넨실'
  kind TEXT NOT NULL,                  -- building | floor | storage | desk | etc
  sort INTEGER DEFAULT 0
);

-- 품목 마스터
CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                  -- '바스타올', '수영조끼 M'
  category TEXT NOT NULL,              -- towel | linen | vest | consumable | etc
  unit TEXT DEFAULT '개',
  active INTEGER NOT NULL DEFAULT 1
);

-- 재고 = 품목×위치 (Excel형 테이블의 행)
CREATE TABLE stock (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  min_qty INTEGER NOT NULL DEFAULT 0,  -- 최소 기준
  owner_worker_id INTEGER REFERENCES workers(id),  -- 담당자
  note TEXT,
  UNIQUE(item_id, location_id)
);

-- 재고 변동 이벤트 (현재 수량 = 합계)
CREATE TABLE stock_moves (
  id INTEGER PRIMARY KEY,
  stock_id INTEGER NOT NULL REFERENCES stock(id),
  delta INTEGER NOT NULL,              -- +입고 / -차감 / 이동은 두 행(출발-,도착+) + 같은 transfer_group
  reason TEXT,
  transfer_group TEXT,                 -- 이동 묶음 uuid
  worker_id INTEGER REFERENCES workers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  audit_id INTEGER REFERENCES audit_log(id)
);

CREATE VIEW v_stock AS               -- Excel형 테이블 뷰: 품목/위치/현재/최소/상태/담당/최근수정
SELECT s.id, i.name AS item, i.category, l.name AS location, s.min_qty,
       COALESCE(SUM(m.delta),0) AS qty,
       CASE WHEN COALESCE(SUM(m.delta),0) < s.min_qty THEN 'shortage'
            WHEN COALESCE(SUM(m.delta),0) < s.min_qty*1.2 THEN 'warning'
            ELSE 'ok' END AS status,
       s.owner_worker_id, s.note,
       (SELECT worker_id  FROM stock_moves WHERE stock_id=s.id ORDER BY id DESC LIMIT 1) AS last_worker_id,
       (SELECT created_at FROM stock_moves WHERE stock_id=s.id ORDER BY id DESC LIMIT 1) AS updated_at
FROM stock s JOIN items i ON i.id=s.item_id JOIN locations l ON l.id=s.location_id
LEFT JOIN stock_moves m ON m.stock_id=s.id GROUP BY s.id;
```

```sql
-- 장비 (무전기 등)
CREATE TABLE equipment (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'radio',  -- radio | key | tablet | etc
  label TEXT NOT NULL,                 -- '무전기 4번' (QR 코드 값 = 'EQ:{id}')
  battery TEXT DEFAULT 'ok',           -- ok | low | bad
  condition TEXT DEFAULT 'ok',         -- ok | broken | lost
  note TEXT,
  updated_at TEXT, updated_by INTEGER REFERENCES workers(id)
);

-- 대여/반납 (QR 스캔 또는 번호 입력)
CREATE TABLE equipment_loans (
  id INTEGER PRIMARY KEY,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id),
  borrower_worker_id INTEGER REFERENCES workers(id),
  borrower_name TEXT,                  -- 외부인/타팀 폴백
  loaned_at TEXT NOT NULL,
  due_at TEXT,                         -- 미반납 판단 기준(교대 종료 등)
  returned_at TEXT,                    -- NULL = 미반납
  method TEXT DEFAULT 'qr'             -- qr | manual
);

-- 습득물
CREATE TABLE lost_found (
  id INTEGER PRIMARY KEY,
  found_at TEXT NOT NULL,
  room TEXT,                           -- '1204호'
  location_id INTEGER REFERENCES locations(id),
  item_desc TEXT NOT NULL,
  is_valuable INTEGER NOT NULL DEFAULT 0,   -- 1 = 귀중품(즉시 인계 플래그)
  photo_path TEXT,                     -- 앱 데이터 폴더 상대경로
  status TEXT NOT NULL DEFAULT 'stored',    -- stored | handed_over | returned | disposed
  handed_over_at TEXT,                 -- 상황실 인계 시각
  deadline_at TEXT,                    -- 보관 기한 (기한 임박 경고 = deadline_at - now)
  reporter_worker_id INTEGER REFERENCES workers(id),
  note TEXT
);

-- 시설 하자 (단계 플로우)
CREATE TABLE defects (
  id INTEGER PRIMARY KEY,
  room TEXT, location_id INTEGER REFERENCES locations(id),
  title TEXT NOT NULL, detail TEXT,
  stage TEXT NOT NULL DEFAULT 'reported',
  -- reported → first_check(1차 확인) → second_action(2차 조치) → transferred(시설팀 이관) → done
  assignee_worker_id INTEGER REFERENCES workers(id),
  created_at TEXT NOT NULL, updated_at TEXT
);
CREATE TABLE defect_steps (            -- 단계별 기록 + 사진
  id INTEGER PRIMARY KEY,
  defect_id INTEGER NOT NULL REFERENCES defects(id),
  stage TEXT NOT NULL, note TEXT, photo_path TEXT,
  worker_id INTEGER REFERENCES workers(id),
  created_at TEXT NOT NULL
);

-- 업무 인계판 / 특이사항 (교대 브리핑 소스)
CREATE TABLE handover_notes (
  id INTEGER PRIMARY KEY,
  shift_date TEXT NOT NULL,            -- '2026-07-17'
  shift TEXT NOT NULL,                 -- day | night
  kind TEXT DEFAULT 'note',            -- note | voc | room_issue | notice
  content TEXT NOT NULL,
  room TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  author_worker_id INTEGER REFERENCES workers(id),
  created_at TEXT NOT NULL
);
```

```sql
-- 지식 소스 (공식홈/밴드 정리본/사내 문서/매뉴얼)
CREATE TABLE sources (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  origin TEXT NOT NULL,                -- internal_notice | vinfo | official | memo
  priority INTEGER NOT NULL,           -- 1(내부공지) < 2(VINFO) < 3(공식홈) < 4(메모) — 낮을수록 우선
  customer_visible INTEGER NOT NULL DEFAULT 0,  -- 고객 안내에 사용 가능 여부
  collected_at TEXT, updated_at TEXT,
  file_path TEXT, url TEXT,
  owner_worker_id INTEGER REFERENCES workers(id)
);
CREATE TABLE source_chunks (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  seq INTEGER NOT NULL,
  content TEXT NOT NULL
);
-- FTS5 인덱스 (한국어: unicode61 + 별도 bigram 컬럼으로 부분일치 보완)
CREATE VIRTUAL TABLE fts_chunks USING fts5(
  content, bigrams, source_id UNINDEXED, chunk_id UNINDEXED,
  tokenize='unicode61'
);

-- 감사 로그 (모든 쓰기의 단일 진실)
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  worker_id INTEGER REFERENCES workers(id),
  entity TEXT NOT NULL,                -- stock | equipment | lost_found | defect | handover | source
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,                -- insert | update | delete | move
  field TEXT, old_value TEXT, new_value TEXT,
  reason TEXT,
  channel TEXT NOT NULL DEFAULT 'manual',  -- manual | ai | import | quick_action
  undo_of INTEGER REFERENCES audit_log(id), -- 이 로그가 어떤 로그의 취소인지
  undone INTEGER NOT NULL DEFAULT 0         -- 이미 취소됨 표시
);

CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
-- 예: current_worker_id, ai_provider, shift_hours. API 키는 DB에 저장하지 않음(OS 자격 증명 저장소).
```

## ChangeProposal (AI 승인형 편집의 공통 형식)

```ts
type ChangeProposal = {
  entity: 'stock'|'equipment'|'lost_found'|'defect'|'handover';
  entityId?: number;            // 신규면 없음
  action: 'update'|'insert'|'move'|'adjust';
  changes: { field: string; before: unknown; after: unknown }[];
  reason: string;               // "B동 타올 30장 차감" 원문
  needsConfirm?: string;        // 애매하면 되물을 질문
};
```
- 파서는 ① 규칙 기반(오프라인, "N장 차감/추가/이동" 패턴) ② AI 기반(JSON만 출력 강제) 이중화. AI 실패 시 규칙 폴백.
- `applyProposal()`이 트랜잭션으로 반영 + audit_log 기록. **Undo = audit_log 역적용 후 `undo_of` 링크.**

## 홈 상태판 집계 (뷰로 제공)
- 부족 재고: `v_stock WHERE status='shortage'`
- 미반납 장비: `equipment_loans WHERE returned_at IS NULL AND due_at < now`
- 고장/분실: `equipment WHERE condition != 'ok' OR battery='bad'`
- 습득물 경고: `lost_found WHERE status='stored' AND (is_valuable=1 OR deadline_at < now+3일)`
- 미처리 하자: `defects WHERE stage NOT IN ('done')`, 이관 후 N일 경과 강조
- 교대 브리핑 = 위 5개 + 전 근무조 `handover_notes` 미해결분 (SQL만으로 생성 가능, AI는 문장화만)

## xlsx import/export 매핑
- export: `v_stock` 컬럼 그대로 (품목/분류/위치/현재 수량/최소 기준/상태/담당자/최근 수정자/수정 시간/비고). 장비·습득물·하자도 각 테이블 1시트.
- import: 품목+위치 키로 매칭 → 수량 차이를 `stock_moves`로 변환(사유='xlsx import') → diff 미리보기 후 일괄 승인. 미지의 품목/위치는 생성 여부를 확인.
- 일일 마감 리포트: 당일 `audit_log` + `stock_moves` 요약 1시트 + 인계사항 1시트, 인쇄용 스타일.

## 확장 여지 (v2, 지금은 스키마만 비워둠)
- `stock_moves` 축적 → 시즌 수요 패턴/재주문점 제안.
- `source_chunks`에 `embedding BLOB` 컬럼 추가 → 임베딩 RAG.
- `audit_log` 기반 LAN 동기화(CRDT 불필요, last-write-wins + 로그 병합).
