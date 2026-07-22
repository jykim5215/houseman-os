# 하우스맨 노트 (Vivaldi Park Houseman OS)

비발디파크 하우스맨/객실관리 근무자용 **휴대폰·태블릿 PWA**.
재고·장비(무전기)·습득물·시설하자·업무 인계를 한 앱에서 관리하고, 등록된 자료와 DB만 근거로 답하는 신뢰형 챗이 중심 화면이다. UI는 NotebookLM 디자인 언어(하단 3탭: 챗 / 소스&데이터 / 스튜디오)를 따른다.

## 사용 (휴대폰 설치)

1. 휴대폰 브라우저에서 **https://jykim5215.github.io/houseman-os/** 접속
2. 메뉴 → **"홈 화면에 추가"** (Android: Chrome 메뉴, iPhone: 공유 → 홈 화면에 추가)
3. 홈 화면 아이콘으로 실행하면 일반 앱처럼 전체화면으로 동작
4. **업데이트**: 개발자가 이 저장소에 푸시하면 다음 실행/새로고침 때 자동 반영. 새 버전이 감지되면 상단에 "지금 업데이트" 배너가 뜬다.

## 공유 서버 (모두 같은 데이터 보기)

근무 데이터·현장 카드(도어락 비번 등)는 이 공개 저장소에 저장하지 않고 **비공개 저장소(`houseman-os-data`)의 `data/db.json`** 에 둔다. 근무자는 **팀 암호 하나만** 입력하면 연결된다 — 토큰을 각자 붙일 필요가 없다.

### 관리자: 최초 1회 봉인
1. GitHub → Settings → Developer settings → **Fine-grained personal access token** 발급
   - Repository access: `houseman-os-data` **하나만**
   - Permissions: **Contents → Read and write** 만
2. https://jykim5215.github.io/houseman-os/seal.html 접속(오프라인 동작) → 토큰 + 데이터 저장소 + **팀 암호** 입력 → "봉인하기"
3. 출력된 JSON을 이 저장소의 **`docs/team.json`** 으로 커밋
   - team.json에는 토큰이 **팀 암호로 암호화(AES-GCM + PBKDF2 20만회)** 되어 들어간다. 평문 토큰은 어디에도 안 남는다.
4. 근무자들에게 **팀 암호**만 공유

### 근무자: 첫 실행
앱을 열면 "공유 서버 연결 — 팀 암호" 창이 뜬다. 팀 암호를 넣으면 끝. 이 기기에서는 다시 묻지 않는다. (암호를 모르면 "로컬로 사용" 가능)

이후 30초마다 + 변경 직후 자동 동기화(행 단위 최신-우선 병합). ⚙ 설정에서 고급(저장소·토큰 직접 입력)도 가능하다. 실시간성이 더 필요해지면 Supabase 등으로 교체할 수 있게 동기화 계층(`docs/store.js`의 `Sync`)이 분리되어 있다.

## 안드로이드 APK

PWA(홈 화면 추가)가 가장 간단하지만, 설치형 APK도 제공한다.

- 다운로드: 이 저장소 **Releases → `apk-latest` → `houseman-note.apk`** (휴대폰에서 내려받아 설치, "출처를 알 수 없는 앱" 허용 필요)
- 빌드: **Actions → "Android APK 빌드" → Run workflow**. WebView 래퍼로 빌드되어 전체화면으로 동작한다. iPhone은 APK 대신 홈 화면 추가(PWA) 사용.
- 안정적 업데이트(덮어쓰기 설치)를 원하면 첫 빌드의 `signing-keystore` 아티팩트를 받아 `ANDROID_KEYSTORE_B64`(base64), `ANDROID_KEYSTORE_PASSWORD` 시크릿으로 저장하면 이후 같은 키로 서명한다.

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
