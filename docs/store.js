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
  const SEED_VERSION = 10;
  function seed() {
    const db = {
      rev: 1, seedVersion: SEED_VERSION, updatedAt: now(),
      buildings: BUILDINGS.map((b) => ({ ...b })),
      config: { updatedAt: '' },
      users: [], workers: [],
      stock: [], equipment: [], lost: [], defects: [], quickref: [], sources: [], messages: [], files: [], rooms: [], audit: [],
    };
    seedReference(db);
    return db;
  }

  // 참고자료 시드 — 멱등: 이미 있는 id는 건너뜀(기존 기기도 매 로드 시 누락분만 추가)
  function seedReference(db) {
    const S = (o) => { if (!db.sources.some((s) => s.id === o.id)) db.sources.push(o); };
    seedQuickB(db);
    seedSupplies(db);
    // 지식 소스 (id 결정적 — 기기 간 동기화 시 중복 방지)
    S({ id: 'src-B-oak', bld: 'B', title: '오크동(B) 하우스맨 업무 카드', origin: 'internal_notice', priority: 1, custVisible: false, collectedAt: today(), updatedAt: today(), enabled: true,
      content: '오크동(B) 현장 참고. 매일: 16-20층 린넨실/복도 전자레인지 청소·점검, 퇴근 전 생수 수량 확인 후 보고, 밥솥 회수 시 세척 후 밀봉. 지정객실 2002·2035. 객실 타입: 3-15F 취사, 16-18F 세미취사(밥솥·주걱·밥그릇·찬접시 없음, 요청 시 투입), 19-20F 클린(취사 불가). 전자레인지 있는 층 16-20F. 층별 창고: 3F 테이블이불, 4F 추가침구, 5·8F 투입용 요솜, 6F 오리털이불·양모베개, 7F 침대패드·스커트, 13F 가전(밥솥·선풍기), 14F 가전(냉장고·열풍기), 17F 가구(소파·식탁의자). 에어컨: 1-5F LG(18,23), 6-10F 삼성(14,84), 11-12F LG, 13F 삼성, 14-20F LG. 카드키 매수: HOK 패밀리(4인) 6장, IOK 스위트(5인) 8장, COK 골드(7인) 10장+박스, 골드 6-10F 1·4호 총 10객실. 카드키 발급 절차: 재실고객 조회 → 영업장 02/객실번호 입력·조회 → 객실키 발급 → 발급기에 카드 올리고 신규/본실 발급 → 두 번째 카드 추가 발급. ※ 도어락 비밀번호와 내부 전화번호는 보안상 공유 서버에만 있습니다.' });
    S({ id: 'src-C-pine', bld: 'C', title: '파인동(C) 하우스맨 업무 카드', origin: 'internal_notice', priority: 1, custVisible: false, collectedAt: today(), updatedAt: today(), enabled: true,
      content: '파인동(C) 현장 참고. 컴퓨터 있는 층 3F·11F. 추가침구(추침)는 3층 창고에서 제작·보관. 객실 타입: 9-12F 세미취사(밥솥·밥그릇·주걱 미투입) — 오크동과 층이 다름. 식탁의자: 3-7F 일룸(1005), 8-12F 원목(나우의자), 2F 일룸 201·203~213·222·223, 2F 원목 202·214~217·220·221·224~226, 223호는 더블침대. 층별 창고: 3F 추침 제작·보관+컴퓨터, 4F T테이블·등받이·방석(소파), 5F 소파 프레임, 6F 식탁의자(2,9~12) 나우의자·소파 프레임, 7F TV·소파 프레임, 8F 식탁의자(3,9~12) 나우의자, 9F 선풍기, 11F 컴퓨터. 각층 린넨실 유지: 롤휴지 겉봉투 뜯기, 각티슈 1~2박스 뜯기, 냄비류·밥솥 회수 후 나머지 폐기(앵글 꼼꼼히), 대여용품(아기욕조·열풍기) 회수, 말통 교체는 수시로. 단체 입실 시: 재실내역 조회로 수시 최신화 → 최종 변동 객실 기준 진행 → 연타/칼·가위 투입, 연타 미리 확보, 파손품은 각층 창고로 이동. 놓치기 쉬운 것: 에어컨 사용 시 책상 밑 물통 확인, 식탁의자 파렛(교체) 확인, 재실내역 수시 최신화. ※ 습득물 비번 등 민감 정보와 직원 연락처는 보안상 공유 서버에만 있습니다.' });
    // 비발디파크 공식 정보 (공개 정보, 전 동 공통) — bld:'*' 이면 모든 동에서 검색됨
    S({ id: 'src-official-vp', bld: '*', title: '비발디파크 공식 안내 (소노 공식홈)', origin: 'official', priority: 3, custVisible: true, collectedAt: '2026-07-24', updatedAt: '2026-07-24', enabled: true,
      content: '비발디파크(소노) 공식 안내. 운영사 (주)소노인터내셔널, 소노예약센터 1588-4888(09:00~18:00 연중무휴). 숙박 브랜드: 소노벨 비발디파크(A동/B·C동/D동), 소노캄 비발디파크, 소노펠리체, 소노펠리체 빌리지, 소노펫, 유스호스텔. 부대시설: 오션월드(워터파크), 스키월드, 스노위랜드, 골프장.\n[입퇴실] 입실 15:00~22:00, 22:00 이후 도착 시 프런트 사전 연락 필수. 퇴실 11:00까지. 객실 배정 12:00부터 선착순. 스마트 객실은 자율 퇴실.\n[조기 입실 요금 2026.06.01~] 14~15시 1박료 10%, 12~14시 30%, 09~12시 50%, 09시 이전 100% 추가. 당일 객실 상황에 따라 제한/불가.\n[객실 비품 차이] 리조트 취사객실=미취사 비품+전기레인지 등 조리비품. 리조트 미취사=전기포트·냉장고·식기, 타월·비누·샴푸·바디워시·드라이기 (칫솔·치약·헤어빗 미제공, 조리 불가). 호텔=전기포트·컵·접시·포크, 타월·비누·샴푸·컨디셔너·바디워시·칫솔·치약·헤어빗·드라이기+미니바 무료. 핵심 차이: 칫솔/치약/헤어빗·컨디셔너는 호텔만. 리조트 객실에 칫솔세트 요청 오면 미제공 품목 안내.\n[인원 추가] 대부분 사업장 1인 11,000원(요청 시 타월 제공). 소노캄 비발디파크(소노캄 A/A코너/B) 1인 50,000원(침구류 포함). 7세 미만/영유아 무료. 일부 객실 인원 추가 불가.\n[침구 추가] 대부분 침구세트당 25,000원(침구세트+타월 제공). 소노캄 비발디파크는 인원 추가 규정 적용(별도 침구 요금 미청구). 요점: 인원 추가=타월 추가, 침구 추가=침구세트+타월.\n[미성년자] 만 19세 미만 보호자 없이 이용 불가. 단독 숙박 시 미성년자 숙박동의서+보호자 신분증 사본+가족관계증명서/등본(주민뒷자리 마스킹) 제출, 이성 간 혼숙 금지.\n[스키 장비] 투숙 중 스키/보드 장비 객실 반입 시 시설 파손하면 변상 의무. 각 동 1층 로비 장비 락커 또는 시즌보관소 이용.\n[분실물] 보관 기간 1개월, 미인계분은 대명복지재단 기부. 등록: 공식홈 고객지원>분실물 센터(사업장·습득일·분류). 분류: 옷/모자/안경/우산, 물건/기타. ★프런트에 보관하지 않은 분실물은 보상 대상 아님(객실 귀중품은 고객 직접 관리 안내). 습득 시 습득일+30일 인계 기한, D-7 알림.\n[오션월드 복장] 수영복 필수, 머리 완전히 덮는 수영모/야구모/두건 필수, 아쿠아슈즈 의무(미착용 이용 불가), 안경·선글라스 금지(도수 물안경/렌즈 권장), 유아 방수기저귀. 면바지·청바지·썬캡·구두·운동화·등산화 불가. 태닝오일 후 입수 불가.\n[오션월드 음식] 외부 음식 반입 금지(무료 냉장보관). 예외: 밀폐용기 씨/껍질 제거 과일, 죽/미음 이유식·환자식, PET 음료. 유리용기 불가. 캔맥주 성인 1인 2캔·500ml 이하. 돗자리·캐리어·카트·버너·유모차 반입 불가.\n[오션월드 안전] 어트랙션 구명조끼 필수(바디슬라이드 등 제외), 튜브 재질 구명조끼 제한, 개인 튜브는 지름 1m 미만 원형만. 스노클링·풀페이스 수경·물총·오리발 불가. 얼리파크인 120cm 미만 어트랙션 제한. 락커·샤워실 촬영 금지. ★긴급방송 외 일행 찾기 방송 없음(일행 분실은 안내데스크 동행).\n[오션월드 대여요금] 구명조끼 8,000원, 타월 1,500원/장, 찜질복+타월 5,000원. 대인=중학생 이상, 소인=36개월~초등, 36개월 미만 무료(서류 제시).\n[스키월드] 슬로프 10면. 정설 매일 17:30~19:00. 심야스키 월→화 심야 정기 휴장. 안전헬멧 착용 의무(미착용 시 리프트/곤돌라 제한). 리프트권 3/5/7시간 타임패스. 대인 14세 이상/소인 13세 이하. 온라인 구매분도 매표소 방문. 렌탈: QR>동의·번호인증>신장·발사이즈>창구 수령. 숏스키·프리스타일 스키·알파인보드 대여 불가. 의류 렌탈 신분증 필수, 장갑·고글·모자는 구매만. 시즌권 실물 미소지 시 입장 불가, 재발급 수수료 20,000원.\n[스노위랜드] 메인센터 1층 입장권>2층 전용 곤돌라. 곤돌라 이동 후 외출 불가, 취사 불가. 개인 눈썰매 반입 가능하나 제동장치 있는 썰매 불가.\n[의무실] 비발디파크 스키장 의무실=메인센터 1층. 스노위랜드 의무실=스노위하우스 1층. 인근 응급실: 춘천 강원대병원 033-258-2000, 한림대병원 033-240-5000(각 편도 약 1시간).\n[취소 위약금 2025.07.01 입실분~] 8일 전 전액 환불. 성수기 금토연휴: 6~7일 전 20%, 4~5일 30~40%, 2~3일 60%, 1일 전 80%, 당일/노쇼 100%. 비수기 일~목은 2일 전까지 전액 환불. 위약금 면제 신청은 MY SONO>위약금 철회(입실일+30일 내), 노쇼는 철회 불가.\n[전기차] 충전소 전 지역 24시간. [모바일 회원카드] 앱 흔들기 또는 My SONO 바코드.\n[응대 원칙] 요금·환불·위약금은 하우스맨이 판단하지 않고 프런트/1588-4888 이관. 기록 없는 약속 금지(습득물·하자·인원추가는 시스템 등록 후 안내). 안전(부상·미아·시설파손)은 즉시 상급 보고+사진. 규정 외 요금 면제·할인 임의 약속 금지, 습득물 개인 보관/전달 금지, 고객 소지품 임의 이동 금지, 개인정보 외부 공유 금지.\n※ 요금·시즌 운영시간·휴장일은 변동성이 큼 — 확정 안내는 프런트/예약센터 확인.' });
    // 단지 구성 · 객실 구조 (공식홈 기준, 전 동 공통)
    S({ id: 'src-rooms-vp', bld: '*', title: '비발디파크 단지·객실 구조 (공식홈)', origin: 'official', priority: 3, custVisible: true, collectedAt: '2026-07-24', updatedAt: '2026-07-24', enabled: true,
      content: '비발디파크 단지 구성과 객실 구조.\n[단지 구성] 숙박: 소노벨 비발디파크(A동/B·C동/D동), 소노캄 비발디파크, 소노펠리체 비발디파크, 소노펠리체 빌리지, 소노펫 클럽&리조트, 유스호스텔. 부대시설: 오션월드(워터파크), 스키월드, 스노위랜드, 골프장, 지하 부대시설. 스키 장비는 각 동 1층 로비 장비보관 락커 또는 시즌보관소.\n[소노벨 A동] 87.6㎡ · 침실 2 + 거실 + 주방 겸 식당 + 화장실 2 · 기본 5인/최대 8인 · 취사/미취사 선택 · 파크뷰.\n[소노벨 B동] 85.9㎡ · 침실 2 + 거실 + 주방 겸 식당 + 화장실 2 · 기본 5인/최대 8인.\n[소노벨 C동] 92.5㎡ · 침실 2 + 거실 + 주방 겸 식당 + 화장실 1 · 기본 5인/최대 8인. A·B와 달리 화장실이 1개.\n[소노벨 D동(호텔)] 46.62㎡ · 침실 + 화장실 · 정원 2인(더블+더블로 추가 2인 가능) · 미취사 객실 · 객실은 2~9층.\n[소노캄 비발디파크] 객실 타입: 패밀리(패밀리 스탠다드, 패밀리 코너 스탠다드) 정원 4인, 스위트(스위트 스탠다드) 5인, 소노캄A(파크뷰/스탠다드/코너 파크뷰/코너 스탠다드) 3인, 소노캄B(파크뷰) 4인. 인원 추가 시 소노캄A/A코너/B는 1인 50,000원(침구류 포함).\n[소노펫 클럽&리조트] 객실 타입: 패밀리 4인, 스위트 5인, 실버 6인, 골드 7인. 반려동물 몸무게 45kg 이하 입실 가능, 종합백신+광견병 접종 완료 확인 필요, 중성화 안 된 반려견은 매너벨트 착용 필수, 공공영역 이동 시 고정형 1.5m 리드줄(동물보호법).\n※ 객실 평면도(내부 구조도) 이미지는 공식 저작물이라 앱에 싣지 않았습니다. 정확한 평면은 공식홈 Rooms > 객실타입 상세를 참고하세요. 소노벨 동별 세부 비품 차이와 소노펠리체/유스호스텔 구조는 미수집.' });
    S({ id: 'src-K-calm', bld: '캄', title: '소노캄(캄) 하우스맨 업무 카드', origin: 'internal_notice', priority: 1, custVisible: false, collectedAt: today(), updatedAt: today(), enabled: true,
      content: '소노캄(캄) 현장 참고 — 상황실 게시물에서 옮김.\n[침구류 보유층] 5F는 캄 전용: 이불(더블·싱글·한실), 패드(더블·싱글), 베개(대·중), 투입용 요, 추가침구(캄 전용). 11F는 펫 전용 추가침구 — 11~13F용 펫 침구류(패드·이불).\n[층별 자재 배치] 2F 견방석. 3F·7F 비품. 4F·9F 린넨류. 5F·8F 타올. 5F 견타올. 2F·5F·8F 수트카(린넨물 수거). 6F 이불솜·요솜·베게솜(모든 커버). 10F 추가침구(장지류).\n[주의] 캄·펫 전기포트와 드라이기가 없으면 펫층 것으로 가져온다. 3층에서 가져가지 말 것 — 불출이 다르다.\n[지정객실] 1804호·1806호는 3F 전용 비품으로 투입.\n[불량] 메트리스 커버 지퍼 불량 1214호·1220호·1510호. 속커튼 없음 1312·713·1621. 커튼(속) 1312.\n[투입 기준] 3층 스위트 제8, 3층 패밀리(H) 제6 — 베타 투입 X, 생수 X. 캄은 제4·베2(생수 2, 한산수 2).\n[구배불량 객실 — 세팅되어 있음] 414, 518, 618, 619, 621, 622, 624, 625, 727, 804~810, 813, 814, 818, 819, 927, 1005, 1028, 1402, 1403, 1405, 1419, 1421, 1423, 1501, 1502, 1504, 1508, 1509, 1612, 1613, 1615, 1620, 1706, 1708, 1905, 1906, 1910.\n※ 층 린넨실·창고·세탁실 비밀번호와 내부 번호는 보안상 공유 서버(비공개)에만 있습니다. 앱 코드에는 넣지 않습니다.' });
    S({ id: 'src-eval', bld: 'B', title: '서비스 평가 기준 (공통)', origin: 'internal_notice', priority: 1, custVisible: false, collectedAt: today(), updatedAt: today(), enabled: true,
      content: '객실 하우스키핑 서비스 평가(Standard): SOP 60점 + 인적서비스 40점 = 100점. 판정 준수1/미준수2/관찰불가0, 미준수는 V 표시 후 감점. SOP 8항목: 1 전화 인사(소속·성명 명확, 벨 3번 전 수신, 초과 시 사과) 필수 5점, 2 방문인사(밝게 목례) 필수 5점, 3 퇴실 인사(밝은 표정 목례, 시간·상황에 맞는 인사말) 필수 5점, 4 고객 요구사항 확인(요청 확인, 객실번호·요청 복명복창, 추가 요청 확인, 추가 요금 안내) 필수 5점, 5 예상 방문 소요시간 안내(별도 요청 없으면 15분 내 방문, 초과 시 사과와 이유) 성과 7점, 6 객실 방문(초인종/노크 후 잘 보이는 위치 대기, 소속·용무 명확) 필수 5점, 7 물품 전달(두 손 가슴~배 높이, 양손 불가 시 목례와 공손히, 무거운 물품 사전 안내 후 객실 안쪽) 성과 7점, 8 추가 요청사항 확인(15분 내 재방문, 초과 시 소요시간 안내) 성과 7점. 인적 서비스 4항목: 전화 응대 표현(쉬운 용어·명확한 발음·표준어, 공손·정중, 적당한 말 빠르기, 미~파 톤, 적절한 억양), 표정(부드러운 미소 유지), 방문 응대 표현(동일 기준), 용모복장(청결·단정 유니폼, 깨끗한 신발, 헤어 단정 — 남 헤어제품 정돈, 여 단발은 보브컷·긴머리는 올림머리) 각 필수 5점.' });
  }

  /* 상황실 구비 물품 — A·B·C·캄·E 공통 (blds로 다중 동 스코프) */
  function seedSupplies(db) {
    const COMMON = ['A', 'B', 'C', '캄', 'E'];
    const q = (cat, label, note, blds) => {
      const scope = blds || COMMON;
      const id = `sup-${cat}-${label}-${scope.join('')}`;
      if (!db.quickref.some((x) => x.id === id)) db.quickref.push({ id, bld: scope[0], blds: scope, cat, label, value: '', note: note || '' });
    };
    const C1 = '상황실 · 조리기구';
    q(C1, '후라이팬'); q(C1, '자루냄비 (한손)', '뚜껑 함께'); q(C1, '전골냄비 (양손)', '뚜껑 함께');
    q(C1, '전기밥솥'); q(C1, '커피포트'); q(C1, '도마'); q(C1, '냄비받침대');
    const C2 = '상황실 · 식기·수저';
    q(C2, '밥그릇'); q(C2, '국그릇', '밥그릇보다 큼'); q(C2, '사기컵'); q(C2, '와인잔');
    q(C2, '쇠수저'); q(C2, '수저통'); q(C2, '주걱');
    const C3 = '상황실 · 칼·도구';
    q(C3, '과도'); q(C3, '식칼'); q(C3, '주방가위'); q(C3, '와인오프너');
    const C4 = '상황실 · 주방 소모품';
    q(C4, '행주'); q(C4, '수세미'); q(C4, '주방세제'); q(C4, '싱크대 거름망');
    q(C4, '씽크대 뚜껑'); q(C4, '식기건조대'); q(C4, '비닐봉투');
    const C5 = '상황실 · 욕실';
    q(C5, '화장실 슬리퍼'); q(C5, '화장실 비누', '투입 시 상자에 담긴 것으로');
    q(C5, '비누받침대'); q(C5, '드라이기'); q(C5, '드라이기 보관상자'); q(C5, '유아욕조');
    const C6 = '상황실 · 리모컨·가전';
    q(C6, '에어컨 리모컨', 'LG · 삼성'); q(C6, 'TV 리모컨', 'LG · 삼성 · 스마트');
    q(C6, '객실용 전화기'); q(C6, '건전지 AAA');
    const C7 = '상황실 · 청소·환경';
    q(C7, '쓰레기통'); q(C7, '음식물 쓰레기통'); q(C7, '페브리즈'); q(C7, '무취방향제'); q(C7, '빨래건조대');
    const C8 = '상황실 · 휴지·티슈';
    q(C8, '각티슈'); q(C8, '롤휴지 (두루마리)');
    const C9 = '상황실 · 식음료';
    q(C9, '녹차티백'); q(C9, '커피'); q(C9, '생수 500ml');
    const CT = '상황실 · 수건';
    q(CT, '수건', '일반타올만', ['A', 'B', 'C']);
    q(CT, '수건', '바스 · 일반 · 페이스타올 3종', ['캄', 'D', 'E']);
  }

  // 공개 저장소에는 민감 정보(도어락 비번·내부 전화번호·직원 연락처)를 넣지 않는다.
  // 그 값들은 비공개 데이터 저장소(data/db.json)에만 두고 공유 서버 연결 시 내려온다.
  function seedQuickB(db) {
    const B = 'B';
    // id를 bld+cat+label로 결정적 생성 → 기기 간 동기화 시 같은 항목이 하나로 수렴
    const q = (cat, label, value, note) => { const id = `q-${B}-${cat}-${label}`; if (!db.quickref.some((x) => x.id === id)) db.quickref.push({ id, bld: B, cat, label, value, note: note || '' }); };
    // 비번 등 민감 정보는 공개 코드에 시드하지 않음 — 공유 서버(비공개)에서 내려옴
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
    const q = (cat, label, value, note) => { const id = `q-${C}-${cat}-${label}`; if (!db.quickref.some((x) => x.id === id)) db.quickref.push({ id, bld: C, cat, label, value, note: note || '' }); };
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
    seedQuickCalm(db);
  }
  /* 소노캄(캄) — 현장 게시물 사진에서 옮김 (2026-08-01).
     ※ 린넨실·창고 비밀번호는 공개 저장소 금지 → 비공개 데이터 저장소에만 있음 */
  function seedQuickCalm(db) {
    const K = '캄';
    const q = (cat, label, value, note) => { const id = `q-${K}-${cat}-${label}`; if (!db.quickref.some((x) => x.id === id)) db.quickref.push({ id, bld: K, cat, label, value, note: note || '' }); };
    q('침구류 보유층', '5F — 캄 전용', '이불(더블·싱글·한실) · 패드(더블·싱글) · 베개(대·중) · 투입용 요 · 추가침구(캄 전용)');
    q('침구류 보유층', '11F — 펫 전용', '추가침구', '11~13F용 펫 침구류 (패드 · 이불)');
    q('층별 자재', '2F', '견방석');
    q('층별 자재', '3F · 7F', '비품', '3F는 전용 비품 — 캄·펫 물품을 3층에서 가져가지 말 것(불출이 다름)');
    q('층별 자재', '4F · 9F', '린넨류');
    q('층별 자재', '5F · 8F', '타올');
    q('층별 자재', '5F', '견타올');
    q('층별 자재', '2F · 5F · 8F', '수트카', '린넨물 수거');
    q('층별 자재', '6F', '이불솜 · 요솜 · 베게솜', '모든 커버');
    q('층별 자재', '10F', '추가침구', '장지류');
    q('주의', '캄·펫 전기포트·드라이기', '펫층 것으로', '3층에서 가져가지 마세요 — 불출이 다릅니다');
    q('지정객실', '1804 · 1806', '3F 전용 비품으로 투입');
    q('불량', '메트리스 커버 지퍼', '1214 · 1220 · 1510');
    q('불량', '속커튼 없음', '1312 · 713 · 1621');
    q('투입 기준', '3층 스위트', '제8', '베타 투입 X · 생수 X');
    q('투입 기준', '3층 패밀리(H)', '제6', '베타 투입 X · 생수 X');
    q('투입 기준', '캄', '제4 · 베2', '생수 2 · 한산수 2');
    q('구배불량 객실', '4~9F', '414 · 518 · 618 · 619 · 621 · 622 · 624 · 625 · 727 · 804~810 · 813 · 814 · 818 · 819 · 927', '세팅되어 있는 객실');
    q('구배불량 객실', '10~15F', '1005 · 1028 · 1402 · 1403 · 1405 · 1419 · 1421 · 1423 · 1501 · 1502 · 1504 · 1508 · 1509', '세팅되어 있는 객실');
    q('구배불량 객실', '16~19F', '1612 · 1613 · 1615 · 1620 · 1706 · 1708 · 1905 · 1906 · 1910', '세팅되어 있는 객실');
  }

  /* ── 로컬 저장 ── */
  let db = null;
  function load() {
    if (db) return db;
    try { db = JSON.parse(localStorage.getItem(LS_DB)); } catch { db = null; }
    if (!db || !db.buildings) { db = seed(); persist(); }
    // 마이그레이션
    if (!db.messages) db.messages = [];
    if (!db.rooms) db.rooms = [];
    if (!db.files) db.files = [];
    // updatedAt을 비워 둔다 — 빈 config가 '최신'으로 이겨서 팀 공유 AI 키를 지우던 문제 방지
    if (!db.config) db.config = { updatedAt: '' };
    if (!db.users) db.users = [];
    if (!db.workers) db.workers = [];
    ensureFixedUser(db);   // 공용 계정 하나만 유지
    // 예전 버전의 샘플 데이터(가짜 이름·무전기·톡)를 자동 정리하고 실제 자료만 다시 심는다
    // 비파괴 마이그레이션: 실제 근무 데이터는 절대 지우지 않고, 동 목록 갱신 + 누락 참고자료만 추가
    if ((db.seedVersion || 0) < SEED_VERSION) {
      db.buildings = BUILDINGS.map((b) => ({ ...b }));
      seedReference(db); // 멱등 — 이미 있는 id는 건너뜀
      db.seedVersion = SEED_VERSION;
      persist();
    }
    return db;
  }
  function persist() { db.updatedAt = now(); localStorage.setItem(LS_DB, JSON.stringify(db)); }

  const COLLECTIONS = ['stock', 'equipment', 'lost', 'defects', 'quickref', 'sources', 'messages', 'files', 'rooms'];
  const EDITABLE = {
    stock: ['qty', 'min', 'note', 'item', 'location', 'category'],
    equipment: ['battery', 'condition', 'note', 'borrower', 'loanedAt', 'dueAt'],
    lost: ['status', 'handedAt', 'note', 'room', 'place', 'desc', 'valuable', 'deadline'],
    defects: ['stage', 'detail', 'assignee', 'room', 'title'],
    sources: ['enabled', 'title', 'content', 'custVisible'],
    quickref: ['cat', 'label', 'value', 'note'],
    messages: ['text'],
    rooms: ['status', 'type', 'note', 'no', 'floor'],
  };

  // 관리자가 넣은 AI 키를 팀 전체에 공유(비공개 저장소로만 동기화). 키는 사용자가 입력.
  function setSharedAI(aiCfg) {
    const d = load();
    d.config = { ...(d.config || {}), aiShared: aiCfg || null, updatedAt: now() };
    persist(); Sync.schedule();
  }
  function getSharedAI() { const c = load().config; return c && c.aiShared || null; }

  /* ── 객실 상태 ──
     status: unknown 미확인 · vacant 공실 · occupied 재실 · out 외출 · broken 고장
     실제 재실 데이터는 나중에 프런트 시스템에서 받아 넣는다. 지금은 수동 표시. */
  const ROOM_STATUS = {
    unknown: { ko: '미확인', k: 'u' }, vacant: { ko: '공실', k: 'v' },
    occupied: { ko: '재실', k: 'o' }, out: { ko: '외출', k: 't' }, broken: { ko: '고장', k: 'b' },
  };
  const roomId = (b, no) => `rm-${b}-${no}`;
  /* 확인된 객실을 rooms 컬렉션에 멱등 등록 (RoomData가 있을 때만) */
  function ensureRooms() {
    if (typeof RoomData === 'undefined') return 0;
    const d = load(); if (!d.rooms) d.rooms = [];
    let n = 0;
    BUILDINGS.forEach((b) => {
      if (!RoomData.has(b.id)) return;
      Object.keys(RoomData.counts(b.id)).forEach((f) => {
        RoomData.onFloor(b.id, +f).forEach((r) => {
          const id = roomId(b.id, r.no);
          if (d.rooms.some((x) => x.id === id)) return;
          d.rooms.push({ id, bld: b.id, no: r.no, floor: +f, type: '', status: 'unknown', note: '', updatedAt: now() });
          n++;
        });
      });
    });
    if (n) persist();
    return n;
  }
  const roomsOn = (b, floors) => (load().rooms || [])
    .filter((r) => r.bld === b && floors.includes(r.floor))
    .sort((a, x) => (+a.no) - (+x.no));
  function setRoomStatus(id, status, opts) {
    const r = (load().rooms || []).find((x) => x.id === id);
    if (!r) throw new Error('객실을 찾을 수 없습니다');
    return applyChanges([{ entity: 'rooms', entityId: id, field: 'status', newValue: status }], opts);
  }

  /* 비공개 저장소에서 파일 받아오기 (팀 코드로 연결된 기기만 가능).
     객실 실사 사진처럼 공개 저장소에 두면 안 되는 자료를 여기에 둔다.
     경로 예: photos/캄/1804.jpg → 없으면 photos/캄/_default.jpg */
  const _fileCache = new Map();
  async function privateFile(path) {
    const cfg = Sync.cfg; if (!cfg || !cfg.token) return null;
    if (_fileCache.has(path)) return _fileCache.get(path);
    try {
      const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${encodeURI(path)}?ref=${cfg.branch || 'main'}`,
        { headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github.raw' } });
      if (!r.ok) { _fileCache.set(path, null); return null; }
      const url = URL.createObjectURL(await r.blob());
      _fileCache.set(path, url); return url;
    } catch { return null; }
  }
  async function roomPhoto(b, no) {
    return (await privateFile(`photos/${b}/${no}.jpg`)) || (await privateFile(`photos/${b}/_default.jpg`));
  }

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
  const ITER = 310000; // OWASP 권장에 근접(PBKDF2-SHA256)
  async function derive(pw, salt, iter) {
    const km = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: iter || ITER, hash: 'SHA-256' }, km, 256);
    return hex(bits);
  }
  /* 계정은 팀 공용 하나로 고정 (사장님 지시) — 계정 생성/추가 없음.
     주의: 이 앱은 공개 저장소로 배포되므로 여기 있는 해시는 누구나 볼 수 있다.
     실제 데이터 접근을 막는 것은 '팀 코드'이고, 이 로그인은 앱 내 편의·오작동 방지용이다. */
  const FIXED = {
    id: 'u-houseman', name: 'houseman', role: 'admin',
    salt: 'hos-fixed-2026', iter: 310000,
    hash: '49e0e8d23b39b14a60e5b6ac45984d4706c8f1cc029bee18fe8e6771e2583de0',
    createdAt: '2026-08-01 00:00:00',
  };
  function ensureFixedUser(d) {
    if (!d.users) d.users = [];
    const i = d.users.findIndex((u) => u.id === FIXED.id || u.name === FIXED.name);
    if (i < 0) d.users.unshift({ ...FIXED });
    else d.users[i] = { ...FIXED };          // 항상 고정값으로 되돌린다(동기화로 변형돼도)
    return d;
  }

  const Auth = {
    FIXED_NAME: FIXED.name,
    // 공용 계정만 노출 — 예전에 만들어진 계정이 동기화로 돌아와도 보이지 않는다
    users() { return (load().users || []).filter((u) => u.id === FIXED.id); },
    hasUsers() { return this.users().length > 0; },
    hasAdmin() { return this.users().some((u) => u.role === 'admin'); },
    // 로그인 유지: localStorage (개인 기기 전제, 매번 재로그인 안 함)
    get current() { try { const c = JSON.parse(localStorage.getItem('hos.session') || 'null'); if (!c) return null; const u = this.users().find((x) => x.id === c.id); return u ? { id: u.id, name: u.name, role: u.role } : c; } catch { return null; } },
    isAdmin() { const c = this.current; return !!c && c.role === 'admin'; },
    async create() { throw new Error('계정은 팀 공용 하나로 고정돼 있습니다. 새로 만들 수 없습니다.'); },
    async _createDisabled(name, pw, role) {
      name = String(name || '').trim();
      if (!name) throw new Error('이름을 입력하세요');
      if (String(pw || '').length < 4) throw new Error('비밀번호는 4자 이상으로 정해주세요');
      if (!db.users) db.users = [];
      if (this.users().some((u) => u.name === name)) throw new Error('이미 있는 이름입니다');
      const salt = uid('s');
      const u = { id: uid('u'), name, role: role || 'staff', salt, iter: ITER, hash: await derive(pw, salt, ITER), createdAt: now() };
      db.users.push(u);
      if (!db.workers) db.workers = [];
      if (!db.workers.includes(name)) db.workers.push(name);
      persist(); Sync.schedule();
      return u;
    },
    async login(name, pw) {
      const nm = String(name || '').trim();
      // 같은 이름이 여러 개일 수 있다(예전 버전에서 동기화 전에 계정이 중복 생성됨).
      // 이름만 보고 첫 번째를 고르면 비밀번호가 어긋나므로, 이름이 같은 계정을 전부 시도한다.
      const cands = this.users().filter((x) => x.name === nm);
      if (!cands.length) throw new Error('없는 계정입니다');
      let u = null;
      for (const c of cands) { if ((await derive(pw, c.salt, c.iter || 150000)) === c.hash) { u = c; break; } }
      if (!u) throw new Error('비밀번호가 올바르지 않습니다');
      // 구버전 반복 수 자동 상향(로그인 성공 시 재해시)
      if ((u.iter || 150000) < ITER) { u.iter = ITER; u.hash = await derive(pw, u.salt, ITER); persist(); Sync.schedule(); }
      // 중복 계정 자동 정리 — 인증에 성공한 계정만 남긴다
      if (cands.length > 1) { db.users = this.users().filter((x) => x.name !== nm || x.id === u.id); persist(); Sync.schedule(); }
      localStorage.setItem('hos.session', JSON.stringify({ id: u.id, name: u.name, role: u.role }));
      localStorage.setItem(LS_WORKER, u.name);
      return u;
    },
    dupes() { const c = {}; this.users().forEach((u) => { c[u.name] = (c[u.name] || 0) + 1; }); return Object.keys(c).filter((n) => c[n] > 1); },
    async setPassword(id, pw) {
      const u = this.users().find((x) => x.id === id); if (!u) throw new Error('계정 없음');
      if (String(pw || '').length < 4) throw new Error('비밀번호는 4자 이상');
      u.salt = uid('s'); u.iter = ITER; u.hash = await derive(pw, u.salt, ITER); persist(); Sync.schedule();
    },
    logout() { localStorage.removeItem('hos.session'); },
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
    let lastSha = null, timer = null, listeners = [], onRemoteChange = null, lastError = null;
    // 첫 동기화가 끝나기 전에 로그인 화면을 띄우면 "계정 없음"으로 보여 중복 계정이 생긴다.
    // 그래서 첫 왕복이 끝날 때(성공·실패 무관) 풀리는 약속을 둔다.
    let firstResolve = null;
    const firstDone = new Promise((r) => { firstResolve = r; });
    const settleFirst = () => { if (firstResolve) { firstResolve(); firstResolve = null; } };
    const setStatus = (s, d) => { status = s; if (s === 'error') lastError = d; if (s === 'synced') lastError = null; listeners.forEach((f) => f(s, d)); };
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
      // config는 통째로 갈아끼우지 않는다 — 최신이 이기되, 최신에 없는 필드(예: aiShared)는 보존.
      // (예전 버그: 빈 config가 최신 타임스탬프로 올라와 팀 공유 AI 키를 지웠음)
      const rc = remote.config || {}, lc = local.config || {};
      const newer = (String(lc.updatedAt || '') > String(rc.updatedAt || '')) ? lc : rc;
      const older = (newer === lc) ? rc : lc;
      out.config = { ...older, ...newer };
      return out;
    }
    const norm = (d) => JSON.stringify({ ...d, rev: 0, updatedAt: 0 });

    // 저장소 자체에 접근 가능한지 (contents 404가 '파일 없음'인지 '권한 없음'인지 구분용)
    const repoInfo = () => fetch(`https://api.github.com/repos/${cfg.repo}`, {
      headers: { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    async function ghMsg(res) { try { const j = await res.clone().json(); return j && j.message ? ' — ' + j.message : ''; } catch { return ''; } }

    async function pullPush() {
      if (!cfg || !cfg.repo || !cfg.token) return;
      setStatus('syncing');
      try {
        const path = cfg.path || 'data/db.json';
        let remote = null;
        const res = await api(path);
        if (res.status === 200) { const j = await res.json(); lastSha = j.sha; remote = JSON.parse(b64d(j.content)); }
        else if (res.status === 404) {
          // 파일이 없는 건지, 저장소에 접근을 못 하는 건지 구분
          const rr = await repoInfo();
          if (rr.status === 404) throw new Error(`저장소에 접근할 수 없습니다 (${cfg.repo}). 토큰이 이 저장소를 선택하지 않았거나 만료됐습니다.`);
          if (rr.status === 401) throw new Error('토큰이 만료·무효입니다 (401). 관리자에게 재봉인을 요청하세요.');
          lastSha = null; // 저장소는 보이는데 파일만 없음 → 새로 만든다
        }
        else if (res.status === 401) throw new Error('토큰이 만료·무효입니다 (401)');
        else if (res.status === 403) throw new Error('접근이 거부됐습니다 (403)' + (await ghMsg(res)));
        else throw new Error('서버 응답 ' + res.status + (await ghMsg(res)));

        const merged = ensureFixedUser(remote ? merge(remote, db) : db);
        if (JSON.stringify(merged) !== JSON.stringify(db)) {
          db = merged; localStorage.setItem(LS_DB, JSON.stringify(db));
          if (onRemoteChange) onRemoteChange();
        }
        if (!remote || norm(remote) !== norm(merged)) {
          const put = await api(path, { method: 'PUT', body: JSON.stringify({ message: `sync ${DEVICE} ${now()}`, content: b64e(JSON.stringify(merged)), branch: cfg.branch || 'main', ...(lastSha ? { sha: lastSha } : {}) }) });
          if (put.status === 409 || put.status === 422) { setStatus('idle'); return schedule(1500); }
          if (put.status === 404) {
            // 읽기는 됐는데 쓰기가 404 → GitHub이 권한 부족을 404로 가린 것
            throw new Error('쓰기 권한이 없습니다. 토큰 권한을 Contents: Read and write 로 다시 발급해 재봉인하세요.');
          }
          if (put.status === 401) throw new Error('토큰이 만료·무효입니다 (401)');
          if (put.status === 403) throw new Error('쓰기가 거부됐습니다 (403)' + (await ghMsg(put)));
          if (!put.ok) throw new Error('업로드 실패 ' + put.status + (await ghMsg(put)));
          const pj = await put.json(); lastSha = pj.content && pj.content.sha;
        }
        setStatus('synced');
      } catch (e) { setStatus('error', e.message); }
      finally { settleFirst(); }
    }
    function schedule(ms) { clearTimeout(timer); timer = setTimeout(pullPush, ms || 2500); }
    return {
      get cfg() { return cfg; }, get status() { return status; }, get lastError() { return lastError; },
      configure(c) { cfg = c; if (c) localStorage.setItem(LS_CFG, JSON.stringify(c)); else { localStorage.removeItem(LS_CFG); setStatus('local'); } if (c) schedule(10); },
      schedule, pullPush,
      // 첫 동기화 완료까지 기다린다(미연결이면 즉시). 8초 넘으면 그냥 진행.
      ready() { return cfg ? Promise.race([firstDone, new Promise((r) => setTimeout(r, 8000))]) : Promise.resolve(); },
      onStatus(f) { listeners.push(f); }, onChange(f) { onRemoteChange = f; },
      start() { if (cfg) schedule(100); setInterval(() => { if (cfg && document.visibilityState === 'visible') pullPush(); }, 20000); document.addEventListener('visibilitychange', () => { if (cfg && document.visibilityState === 'visible') schedule(300); }); },
      // 저장소 접근 + 쓰기 권한까지 확인 (404를 무조건 통과시키던 버그 수정)
      async test(c) { const r = await this.diagnose(c); return r.ok; },
      /* 연결 진단: 어디서 막혔는지 정확히 알려준다 */
      async diagnose(c) {
        const target = c || cfg;
        if (!target || !target.repo || !target.token) return { ok: false, step: 'config', msg: '저장소·토큰이 설정되지 않았습니다.' };
        const s = cfg; cfg = target;
        const done = (r) => { cfg = s; return r; };
        try {
          // 1) 저장소 접근
          const rr = await repoInfo();
          if (rr.status === 401) return done({ ok: false, step: 'token', msg: '토큰이 만료·무효입니다 (401). 새 토큰으로 재봉인하세요.' });
          if (rr.status === 404) return done({ ok: false, step: 'repo', msg: `저장소에 접근할 수 없습니다 (${target.repo}). 토큰 발급 시 이 저장소를 선택했는지 확인하세요.` });
          if (!rr.ok) return done({ ok: false, step: 'repo', msg: `저장소 확인 실패 (${rr.status})` });
          const info = await rr.json();
          // 2) 쓰기 권한 (fine-grained PAT는 권한 부족을 404로 가리므로 여기서 미리 잡는다)
          // permissions 필드가 없으면 판단을 미룬다(오탐 방지). 명시적으로 push=false 일 때만 읽기 전용으로 확정.
          if (info.permissions && info.permissions.push === false) {
            return done({ ok: false, step: 'write', msg: '이 토큰은 읽기 전용입니다. 토큰 권한을 Contents: Read and write 로 다시 발급해 재봉인하세요.' });
          }
          // 3) 브랜치
          const want = target.branch || 'main';
          if (info.default_branch && info.default_branch !== want) {
            const br = await fetch(`https://api.github.com/repos/${target.repo}/branches/${want}`, { headers: { 'Authorization': 'Bearer ' + target.token, 'Accept': 'application/vnd.github+json' } });
            if (!br.ok) return done({ ok: false, step: 'branch', msg: `브랜치 '${want}' 가 없습니다. 기본 브랜치는 '${info.default_branch}' 입니다.` });
          }
          // 4) 데이터 파일
          const fr = await api(target.path || 'data/db.json');
          if (fr.status === 200) return done({ ok: true, step: 'ok', msg: '정상 — 읽기·쓰기 모두 가능합니다.' });
          if (fr.status === 404) return done({ ok: true, step: 'newfile', msg: '정상 — 데이터 파일이 아직 없어 첫 동기화 때 생성됩니다.' });
          return done({ ok: false, step: 'file', msg: `데이터 파일 확인 실패 (${fr.status})` });
        } catch (e) { return done({ ok: false, step: 'network', msg: '네트워크 오류: ' + e.message }); }
      },
    };
  })();

  const b64ToBuf = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const bufToB64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
  const Team = {
    async fetch() { try { const r = await fetch('team.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return null; const j = await r.json(); return (j && j.ct) ? j : null; } catch { return null; } },
    // 관리자용: 토큰을 팀 코드로 암호화해 team.json 내용을 만든다 (평문 토큰은 저장 안 됨)
    async seal(token, repo, passphrase) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const iter = 200000;
      const km = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token));
      return { v: 1, repo, branch: 'main', path: 'data/db.json', iter, salt: bufToB64(salt), iv: bufToB64(iv), ct: bufToB64(ct) };
    },
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
    inBld, clearOperational, resetSeed, setSharedAI, getSharedAI,
    ROOM_STATUS, ensureRooms, roomsOn, setRoomStatus, roomId, privateFile, roomPhoto,
    get bld() { return bld(); }, set bld(b) { setBld(b); },
    get worker() { return localStorage.getItem(LS_WORKER) || ''; },
    set worker(n) { localStorage.setItem(LS_WORKER, n); },
    buildings() { return load().buildings; },
    reset() { localStorage.removeItem(LS_DB); db = null; },
  };
})();
