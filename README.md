# 하우스맨 노트 (Vivaldi Park Houseman OS)

비발디파크 하우스맨/객실관리 근무자용 **휴대폰·태블릿 PWA**.
재고·장비(무전기)·습득물·시설하자·업무 인계를 한 앱에서 관리하고, 등록된 자료와 DB만 근거로 답하는 신뢰형 챗이 중심 화면이다. UI는 NotebookLM 디자인 언어(하단 3탭: 챗 / 소스&데이터 / 스튜디오)를 따른다.

## 사용 (휴대폰 설치)

1. 휴대폰 브라우저에서 **https://jykim5215.github.io/houseman-os/** 접속
2. 메뉴 → **"홈 화면에 추가"** (Android: Chrome 메뉴, iPhone: 공유 → 홈 화면에 추가)
3. 홈 화면 아이콘으로 실행하면 일반 앱처럼 전체화면으로 동작
4. **업데이트**: 개발자가 이 저장소에 푸시하면 다음 실행/새로고침 때 자동 반영. 새 버전이 감지되면 상단에 "지금 업데이트" 배너가 뜬다.

## 공유 서버 (모두 같은 데이터 보기)

근무 데이터는 이 공개 저장소에 저장하지 않는다. **비공개 저장소(`houseman-os-data`)를 데이터 서버로 사용**:

1. 관리자: GitHub → Settings → Developer settings → **Fine-grained personal access token** 발급
   - Repository access: `houseman-os-data` 저장소 **하나만** 선택
   - Permissions: **Contents → Read and write** 만 부여
2. 각 근무자 휴대폰: 앱 우상단 ⚙ 설정 → 저장소 `jykim5215/houseman-os-data`와 토큰 입력 → 연결 테스트 → 저장
3. 이후 30초마다 + 변경 직후 자동 동기화. 토큰을 입력하지 않으면 기기 로컬 모드로 동작한다.

행 단위 최신-우선(last-write-wins) 병합이라 소규모 팀(수 명)에 적합하다. 실시간성이 더 필요해지면 Supabase 등으로 교체할 수 있게 동기화 계층(`docs/store.js`의 `Sync`)이 분리되어 있다.

## 구조

```
docs/               ← GitHub Pages 배포 루트 (PWA)
  index.html        화면 구조 (하단 3탭)
  styles.css        NotebookLM 디자인 언어 · Style C(Command Chat)
  app.js            UI — 챗/카운터 칩/데이터 편집/스튜디오/설정
  logic.js          도메인 로직 — 상태 집계·브리핑·한국어 명령 파서·소스 검색 (AI 없이 동작)
  store.js          데이터 계층 — localStorage + GitHub 동기화 + 감사 로그/Undo
  sw.js             서비스워커 (네트워크 우선 + 오프라인 폴백)
  manifest.webmanifest / version.json / icon-*.png
```

## 안전 규칙 (구현됨)

- 모든 쓰기는 `Store.applyChanges()` 단일 경로 → **감사 로그 + Undo**
- 챗 수정 명령은 **변경 미리보기(전→후·사유) 승인 후에만** 반영, 애매하면 되물음
- 챗 답변은 등록 소스·DB에서만 근거를 찾고, 없으면 "모른다"고 답함. 번호형 출처 칩 + 출처 우선순위(내부 공지 > VINFO > 공식홈 > 메모) + 충돌 경고 + 고객용/내부용 분리
- 토큰은 기기 localStorage에만 저장되며 이 저장소에는 어떤 데이터/키도 커밋하지 않는다

## 개발

정적 파일뿐이라 빌드 불필요. `docs/`를 수정하고 푸시하면 배포된다.
새 버전 배포 시 `docs/version.json`과 `app.js`의 `APP_VERSION`, `sw.js`의 `CACHE`를 함께 올릴 것.

라이선스: MIT
