/* 건물 → 층 → 객실 → 실사 로 파고드는 화면.
   층·비품은 MapData.stack, 객실은 RoomData(현장 확인분) + 실시간 DB(하자·습득물)에서 가져온다.
   객실 실사 사진은 소노 저작물이라 앱에 싣지 않고 공식 페이지를 연다. */
'use strict';

const Drill = (() => {
  let stack = [];              // 화면 이력
  let bld = null;              // 현재 건물 place
  const E = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const B = (t) => E(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  /* '19F' → [19] · '14~16F' → [14,15,16] · 'B1'·'2002·2035' → [] */
  function parseFloors(label) {
    const m = String(label).match(/^(\d+)\s*[~-]\s*(\d+)\s*F$/);
    if (m) { const a = +m[1], b = +m[2], r = []; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) r.push(i); return r; }
    const s = String(label).match(/^(\d+)\s*F$/);
    return s ? [+s[1]] : [];
  }
  /* 층별 객실 타입 — 각 동 업무 카드 기준 */
  const TYPE = {
    B: (f) => f >= 19 ? '클린 (취사 불가)' : f >= 16 ? '세미취사' : f >= 3 ? '취사' : '',
    C: (f) => (f >= 9 && f <= 12) ? '세미취사' : f >= 2 ? '취사' : '',
    'D': (f) => (f >= 2 && f <= 9) ? '호텔형 미취사' : '',
    '캄': (f) => (f >= 11 && f <= 13) ? '펫 전용' : '',
  };
  /* 시설 종류별 문구 — 숙박이 아닌 곳에 '객실·전망' 같은 말을 쓰지 않는다 */
  const WORDS = {
    stay: { floors: '층을 눌러 들어가세요', linen: '이 층의 린넨실 · 비품', unit: '객실', plan: '객실 배치' },
    play: { floors: '층을 눌러 보세요', linen: '이 층의 시설', unit: '시설', plan: '입점 · 구역' },
    food: { floors: '층을 눌러 보세요', linen: '이 구역의 업장', unit: '업장', plan: '업장' },
    conv: { floors: '층을 눌러 보세요', linen: '이 층의 시설', unit: '시설', plan: '시설' },
    move: { floors: '층을 눌러 보세요', linen: '안내', unit: '시설', plan: '시설' },
    nature: { floors: '둘러보기', linen: '안내', unit: '구역', plan: '구역' },
  };
  const W = () => WORDS[bld.kind] || WORDS.stay;
  const isStay = () => bld.kind === 'stay';

  const EXTRA = {
    B: (f) => (f >= 16 && f <= 20) ? ['전자레인지 있음'] : [],
    C: (f) => (f === 3 || f === 11) ? ['컴퓨터 있음'] : [],
  };

  /* ── 건물 정면 (실사 특징을 따라 그린 일러스트) ── */
  const SKIN = {
    belle: { wall: '#f2e7d5', wall2: '#ddcdb0', band: '#1f6f5c', roof: null, win: '#5c6b74' },
    calm: { wall: '#dcbe95', wall2: '#c5a276', band: null, roof: '#8f5138', win: '#5a5148' },
    pet: { wall: '#dcbe95', wall2: '#c5a276', band: null, roof: '#8f5138', win: '#5a5148' },
    hotel: { wall: '#f2e7d5', wall2: '#ddcdb0', band: '#1f6f5c', roof: null, win: '#5c6b74' },
    felice: { wall: '#e6cdbd', wall2: '#cfb2a1', band: null, roof: '#4e93a8', win: '#7fa8bd' },
  };
  /* stack이 없으면 floors를 층으로 쓰고, 그것도 없으면 빈 목록 */
  function floorRows(p) {
    const src = (p.stack && p.stack.length) ? p.stack : (p.floors || []).map(([f, t]) => [f, t, 'room']);
    return src.filter((r) => parseFloors(r[0]).length || /^B\d/i.test(r[0]));
  }
  function facade(place) {
    const rows = floorRows(place);
    const sk = SKIN[place.art] || SKIN.belle;
    const W = 300, fh = 30, pad = 26;
    const H = pad + rows.length * fh + 34;
    const counts = RoomData.has(place.bld) ? RoomData.counts(place.bld) : {};
    let s = `<svg class="fac" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    // 지붕
    if (sk.roof) s += `<path d="M14 ${pad} L${W / 2} 6 L${W - 14} ${pad} Z" fill="${sk.roof}"/>`;
    else s += `<rect x="26" y="${pad - 12}" width="${W - 52}" height="12" rx="3" fill="${sk.wall2}"/>
      <rect x="${W / 2 - 20}" y="${pad - 22}" width="40" height="12" rx="3" fill="${sk.wall}" stroke="${sk.wall2}" stroke-width="1.4"/>`;
    rows.forEach((r, i) => {
      const y = pad + i * fh, fl = parseFloors(r[0]);
      const n = fl.reduce((a, f) => a + (counts[f] || 0), 0);
      s += `<g class="fl k-${r[2] || 'room'}" data-i="${i}" tabindex="0" role="button" aria-label="${E(r[0])} ${E(r[1])}">
        <rect class="wall" x="30" y="${y}" width="${W - 60}" height="${fh - 2}" fill="${sk.wall}"/>
        ${sk.band ? `<rect x="${W / 2 - 11}" y="${y}" width="22" height="${fh - 2}" fill="${sk.band}"/>` : ''}
        ${[0, 1, 2, 3, 4, 5].map((c) => { const x = 40 + c * 37; if (sk.band && x > W / 2 - 20 && x < W / 2 + 12) return ''; return `<rect x="${x}" y="${y + 8}" width="20" height="12" rx="1.5" fill="${sk.win}" opacity=".55"/>`; }).join('')}
        <rect class="hit" x="30" y="${y}" width="${W - 60}" height="${fh - 2}" fill="transparent"/>
        <text class="fnum" x="20" y="${y + 20}">${E(r[0])}</text>
        ${n ? `<circle class="badge" cx="${W - 22}" cy="${y + 14}" r="9"/><text class="bnum" x="${W - 22}" y="${y + 18}">${n}</text>` : ''}
      </g>`;
    });
    s += `<rect x="18" y="${pad + rows.length * fh}" width="${W - 36}" height="10" rx="3" fill="${sk.wall2}"/>
      <ellipse cx="${W / 2}" cy="${pad + rows.length * fh + 16}" rx="${W / 2 - 10}" ry="7" fill="rgba(60,40,18,.14)"/></svg>`;
    return s;
  }

  /* ── 화면들 ── */
  /* 루트 화면은 시설 성격에 따라 완전히 다르게 짠다.
     resort 층·객실 / hotel 객실기준 / pet 반려동물 규정 / estate 동·등급표
     waterpark 준비물·금지 / ski 이용 흐름 / mall 카테고리 / dining 업장 / help 한 장 정보 */
  const pick = (keys) => (bld.items || []).filter(([k]) => keys.some((x) => k.includes(x)));
  const restOf = (used) => (bld.items || []).filter(([k]) => !used.some(([u]) => u === k));
  const tbl = (rows) => rows.length ? `<table class="pltab">${rows.map(([k, v]) => `<tr><th>${E(k)}</th><td>${B(v)}</td></tr>`).join('')}</table>` : '';
  const chips = (arr) => `<div class="dchips">${arr.map((x) => `<span class="dchip">${E(x)}</span>`).join('')}</div>`;
  const split = (v) => String(v).split(/\s·\s|\s\|\s|\s\/\s/).map((x) => x.trim()).filter(Boolean);
  const rules = (list, tone) => `<ul class="rulelist ${tone || ''}">${list.map((t) => `<li>${B(t)}</li>`).join('')}</ul>`;
  /* 사진이 있으면 실사를, 없으면 일러스트를. 사진은 비공개 저장소에서 받아온다. */
  const hero = () => `<div class="plart" id="heroBox" data-place="${E(bld.id)}">${Illust.svg(bld.art)}</div>
    <div class="heroctl"><span class="hnote" id="hNote">직접 그린 그림</span>
      <button class="btn sm" data-addphoto>사진 추가</button></div>`;

  /* 화면이 그려진 뒤 사진을 붙인다(있으면) */
  async function fillHero(root) {
    const box = root.querySelector('#heroBox'); if (!box) return;
    const id = box.dataset.place;
    const P = Store.Sync.photos;
    if (!P.ready()) { const n = root.querySelector('#hNote'); if (n) n.textContent = '직접 그린 그림 · 사진은 팀 서버 연결 후'; return; }
    const list = await P.list(id);
    if (!list.length) return;
    const urls = [];
    for (const f of list.slice(0, 8)) { const u = await P.load(f); if (u) urls.push({ u, f }); }
    if (!urls.length || !root.isConnected) return;
    box.classList.add('hasphoto');
    box.innerHTML = `<div class="hrail">${urls.map(({ u }, i) => `<img src="${u}" alt="" loading="lazy" data-i="${i}">`).join('')}</div>
      ${urls.length > 1 ? `<div class="hdots">${urls.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}`;
    const note = root.querySelector('#hNote'); if (note) note.textContent = `사진 ${urls.length}장 · 비공개 서버`;
    const rail = box.querySelector('.hrail');
    rail.addEventListener('scroll', () => {
      const i = Math.round(rail.scrollLeft / rail.clientWidth);
      box.querySelectorAll('.hdots i').forEach((d, n2) => d.classList.toggle('on', n2 === i));
    }, { passive: true });
    box.querySelectorAll('img').forEach((im) => im.onclick = () => viewer(urls.map((x) => x.u), +im.dataset.i));
  }

  function viewer(urls, start) {
    const v = document.createElement('div');
    v.className = 'photoview';
    v.innerHTML = `<button class="pvclose" aria-label="닫기">✕</button>
      <div class="pvrail">${urls.map((u) => `<img src="${u}" alt="">`).join('')}</div>`;
    document.body.appendChild(v);
    setTimeout(() => { v.classList.add('on'); const r = v.querySelector('.pvrail'); r.scrollLeft = r.clientWidth * (start || 0); }, 10);
    const kill = () => { v.classList.remove('on'); setTimeout(() => v.remove(), 220); };
    v.querySelector('.pvclose').onclick = kill;
    v.addEventListener('click', (e) => { if (e.target === v) kill(); });
  }

  /* 사진 고르기 → 긴 변 1600px로 줄여 JPEG로 → 비공개 저장소 업로드 */
  function addPhoto(root) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = async () => {
      const files = [...(inp.files || [])]; if (!files.length) return;
      const note = root.querySelector('#hNote');
      const placeId = bld.id;
      try {
        for (let i = 0; i < files.length; i++) {
          if (note) note.textContent = `올리는 중 ${i + 1}/${files.length}…`;
          const b64 = await shrink(files[i]);
          const name = `${Date.now().toString(36)}${i}.jpg`;
          await Store.Sync.photos.upload(placeId, name, b64);
        }
        if (note) note.textContent = '올렸습니다';
        Store.Sync.photos.forget(placeId);
        await fillHero(root);
      } catch (e) { if (note) note.textContent = e.message; alert(e.message); }
    };
    inp.click();
  }
  function shrink(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const max = 1600, sc = Math.min(1, max / Math.max(im.width, im.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc);
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          res(cv.toDataURL('image/jpeg', 0.82).split(',')[1]);
        };
        im.onerror = () => rej(new Error('이미지를 읽지 못했습니다'));
        im.src = fr.result;
      };
      fr.onerror = () => rej(new Error('파일을 읽지 못했습니다'));
      fr.readAsDataURL(file);
    });
  }

  const openBtn = (txt) => bld.roomsUrl ? `<div class="foot"><button class="btn" data-open style="width:100%">${E(txt)}</button></div>` : '';
  const bindOpen = (root) => { const o = root.querySelector('[data-open]'); if (o) o.onclick = () => window.open(bld.roomsUrl, '_blank', 'noopener'); };
  const floorCards = (rows) => `<div class="zgrid">${rows.map((r, i) => `<button class="zcard" data-f="${i}"><span class="zk">${E(r[0])}</span><span class="zv">${B(r[1])}</span><span class="zn">›</span></button>`).join('')}</div>`;

  function viewFacade() {
    const L = bld.layout || 'help';
    const rows = floorRows(bld);
    if (L === 'resort' && rows.length) return facadeView(rows);
    if (L === 'hotel') return hotelView(rows);
    if (L === 'pet') return petView();
    if (L === 'estate') return estateView();
    if (L === 'waterpark') return waterView();
    if (L === 'ski') return skiView(rows);
    if (L === 'mall') return mallView();
    if (L === 'dining') return diningView();
    if (L === 'outdoorzone' || L === 'help' || L === 'stayinfo') return helpView();
    return rows.length ? facadeView(rows) : ((bld.items || []).length ? mallView() : blankView());
  }


  /* 리조트 동 — 정면에서 층 선택 */
  function facadeView(rows) {
    return {
      title: bld.name, sub: W().floors,
      html: `<div class="facwrap">${facade(bld)}</div>
        ${hero()}
        <p class="dnote">건물 정면은 실제 사진의 특징(형태·색·중앙 띠)을 따라 그린 그림입니다.${isStay() ? ' 층 오른쪽 숫자는 <b>신경 쓸 객실 수</b>입니다.' : ''}</p>
        ${infoBlock()}`,
      bind(root, push) {
        root.querySelectorAll('.fac .fl').forEach((g) => {
          const go = () => push(viewFloor(rows[+g.dataset.i]));
          g.addEventListener('click', go);
          g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        });
      },
    };
  }

  /* 구역 상세 — 카테고리 안의 항목들 */
  function viewZone(it) {
    const parts = split(it[1]);
    return {
      title: it[0], sub: bld.name,
      html: `<div class="dsec"><div class="dh">${E(it[0])} · ${parts.length}개</div>
          <div class="zlist">${parts.map((x) => `<div class="zrow">${B(x)}</div>`).join('')}</div></div>
        ${bld.roomsUrl ? `<div class="foot"><button class="btn" data-open style="width:100%">공식 페이지에서 보기</button></div>` : ''}`,
      bind: bindOpen,
    };
  }

  function blankView() {
    return {
      title: bld.name, sub: '자료 미확보',
      html: `${hero()}${infoBlock()}
        <div class="dempty">이 시설은 <b>층·구역 자료가 아직 없습니다.</b><br>확인된 내용만 넣는 원칙이라 비워 뒀습니다. 현장 자료를 주시면 바로 채웁니다.</div>`,
    };
  }

  function infoBlock() {
    const info = bld.info || [];
    if (!info.length) return '';
    return `<div class="dsec"><div class="dh">알아둘 것</div>
      <ul class="plinfo">${info.map((t) => `<li${/^⚠/.test(t) ? ' class="warn"' : ''}>${B(t)}</li>`).join('')}</ul></div>`;
  }

  /* 호텔 — 층은 단순(2~9F 객실). 리조트와 뭐가 다른지가 핵심 */
  function hotelView(rows) {
    return {
      title: bld.name, sub: '호텔형 · 미취사',
      html: `${hero()}
        <div class="keyrow"><div class="key"><b>2~9F</b><span>객실</span></div>
          <div class="key"><b>2인</b><span>정원 (최대 4)</span></div>
          <div class="key"><b>46.62㎡</b><span>침실+화장실</span></div></div>
        <div class="dsec"><div class="dh">리조트와 다른 점</div>
          ${rules(['**칫솔·치약·헤어빗·컨디셔너가 나옵니다** — 리조트 객실에는 없습니다', '**미니바 무료**', '취사 불가 — 전기포트·컵·접시·포크만'], 'ok')}</div>
        ${tbl(pick(['비품', '수건']))}
        <div class="dsec"><div class="dh">층</div>${floorCards(rows)}</div>
        ${openBtn('공식 객실 정보 보기')}`,
      bind(root, push) {
        root.querySelectorAll('[data-f]').forEach((b2) => b2.onclick = () => push(viewFloor(rows[+b2.dataset.f])));
        bindOpen(root);
      },
    };
  }

  /* 소노펫 — 반려동물 규정이 가장 먼저 */
  function petView() {
    const rl = (bld.info || []).filter((t) => /반려|접종|매너벨트|리드줄|45kg/.test(t));
    const others = (bld.info || []).filter((t) => rl.indexOf(t) < 0);
    const roomItem = pick(['객실'])[0];
    return {
      title: bld.name, sub: '반려동물 동반 숙박',
      html: `${hero()}
        <div class="dsec"><div class="dh">입실 전 반드시 확인</div>${rules(rl, 'warn')}</div>
        ${roomItem ? `<div class="dsec"><div class="dh">객실 등급</div>${chips(split(roomItem[1]))}</div>` : ''}
        ${tbl(pick(['부대', '야외', '수건']))}
        ${others.length ? `<div class="dsec"><div class="dh">참고</div>${rules(others)}</div>` : ''}
        ${openBtn('공식 객실 정보 보기')}`,
      bind: bindOpen,
    };
  }

  /* 소노펠리체 · 빌리지 — 동(Tower/Village) 구성과 등급별 평수가 핵심 */
  function estateView() {
    const towers = pick(['동 구분']);
    const grades = (bld.items || []).filter(([k]) => /스위트|타입|펫 객실/.test(k));
    const other = restOf(towers.concat(grades));
    return {
      title: bld.name, sub: '동 구성 · 객실 등급',
      html: `${hero()}
        ${towers.length ? `<div class="dsec"><div class="dh">취사 / 미취사는 동으로 갈립니다</div>
          <div class="towerbox">${split(towers[0][1]).map((t) => `<div class="tw ${/미취사/.test(t) ? 'no' : 'yes'}">${E(t)}</div>`).join('')}</div></div>` : ''}
        ${grades.length ? `<div class="dsec"><div class="dh">등급별</div>
          <div class="gradelist">${grades.map(([k, v]) => `<div class="grade"><div class="gk">${E(k)}</div><div class="gv">${B(v)}</div></div>`).join('')}</div></div>` : ''}
        ${(bld.floors || []).length ? `<div class="dsec"><div class="dh">전망은 층으로 갈립니다</div>
          <div class="floors">${(bld.floors).map(([f, v]) => `<div class="flrow"><span class="fl">${E(f)}</span><span>${B(v)}</span></div>`).join('')}</div></div>` : ''}
        ${tbl(other)}
        ${openBtn('공식 객실 정보 보기')}`,
      bind: bindOpen,
    };
  }

  /* 오션월드 — 준비물과 금지사항이 먼저. 손님 문의 1순위 */
  function waterView() {
    const info = bld.info || [];
    const must = info.filter((t) => /필수|의무/.test(t));
    const no = info.filter((t) => must.indexOf(t) < 0 && /금지|불가|없음/.test(t));
    const etc = info.filter((t) => must.indexOf(t) < 0 && no.indexOf(t) < 0);
    return {
      title: bld.name, sub: '워터파크',
      html: `${hero()}
        <div class="dsec"><div class="dh">꼭 챙겨야 할 것</div>${rules(must, 'ok')}</div>
        <div class="dsec"><div class="dh">안 되는 것</div>${rules(no, 'bad')}</div>
        <div class="dsec"><div class="dh">대여 · 요금 기준</div>${tbl(bld.items || [])}</div>
        ${etc.length ? `<div class="dsec"><div class="dh">그 밖에</div>${rules(etc)}</div>` : ''}`,
    };
  }

  /* 스키월드 계열 — 이용 흐름(순서)이 핵심 */
  function skiView(rows) {
    const steps = bld.id === 'snowy'
      ? ['메인센터 1층에서 입장권 구매', '메인센터 2층 전용 곤돌라 탑승', '곤돌라로 올라가면 외출 불가']
      : bld.id === 'main' ? ['1층 매표소에서 리프트권 · 장비 렌탈', '장비 받고 슬로프로', '2층은 스노위랜드 전용 곤돌라']
        : [];
    return {
      title: bld.name, sub: bld.id === 'ski' ? '슬로프 10면' : '스키월드',
      html: `${hero()}
        ${steps.length ? `<div class="dsec"><div class="dh">이용 순서</div>
          <ol class="steps">${steps.map((t) => `<li>${E(t)}</li>`).join('')}</ol></div>` : ''}
        <div class="dsec"><div class="dh">알아둘 것</div>${rules(bld.info || [], 'warn')}</div>
        ${(bld.items || []).length ? `<div class="dsec"><div class="dh">시설</div>${tbl(bld.items)}</div>` : ''}
        ${rows.length ? `<div class="dsec"><div class="dh">층</div>${floorCards(rows)}</div>` : ''}`,
      bind(root, push) { root.querySelectorAll('[data-f]').forEach((b2) => b2.onclick = () => push(viewFloor(rows[+b2.dataset.f]))); },
    };
  }

  /* 비바 플렉스 몰 — 한 층뿐이라 층 단계 없음. 카테고리로 바로 */
  function mallView() {
    const items = bld.items || [];
    const ICON = { 놀이: '🎳', 가족: '🎠', 휴식: '♨️', 편의: '💊', 쇼핑: '🛍️', 푸드코트: '🍜', 식당: '🍽️' };
    return {
      title: bld.name, sub: bld.oneFloor ? `${bld.oneFloor} · 한 층에 전부` : '구역',
      html: `${hero()}
        ${bld.oneFloor ? `<div class="oneline">이 시설은 <b>${E(bld.oneFloor)}</b> 한 층입니다. 층 구분 없이 구역만 찾으면 됩니다.</div>` : ''}
        <div class="dsec"><div class="dh">무엇을 찾으세요?</div>
          <div class="catgrid">${items.map((it, i) => `<button class="cat" data-z="${i}">
            <span class="ci">${ICON[it[0]] || '📍'}</span><span class="ck">${E(it[0])}</span>
            <span class="cn">${split(it[1]).length}</span></button>`).join('')}</div></div>
        ${(bld.info || []).length ? `<div class="dsec"><div class="dh">참고</div>${rules(bld.info)}</div>` : ''}`,
      bind(root, push) { root.querySelectorAll('[data-z]').forEach((b2) => b2.onclick = () => push(viewZone(items[+b2.dataset.z]))); },
    };
  }

  /* 식음 — 업장 카드 */
  function diningView() {
    const items = bld.items || [];
    return {
      title: bld.name, sub: '식음업장',
      html: `${hero()}
        ${items.length ? `<div class="dsec"><div class="dh">업장</div>
          <div class="zgrid">${items.map(([k, v]) => `<div class="zcard static"><span class="zk">${E(k)}</span><span class="zv">${B(v)}</span></div>`).join('')}</div></div>` : ''}
        ${(bld.info || []).length ? `<div class="dsec"><div class="dh">안내</div>${rules(bld.info)}</div>` : ''}
        <p class="dnote">운영시간·휴무는 변동이 커서 넣지 않았습니다. 확정 안내는 프런트 또는 1588-4888.</p>`,
    };
  }

  /* 편의·교통·야외 구역 — 한 장짜리 정보 카드 */
  function helpView() {
    const items = bld.items || [];
    const info = bld.info || [];
    return {
      title: bld.name, sub: MapData.KINDS[bld.kind].ko,
      html: `${hero()}
        ${info.length ? `<div class="dsec">${rules(info)}</div>` : ''}
        ${items.length ? tbl(items) : ''}
        ${!info.length && !items.length ? `<div class="dempty">확인된 자료가 없습니다.</div>` : ''}`,
    };
  }

  function viewFloor(row) {
    const [label, what, kind] = row;
    const fl = parseFloors(label);
    const w = W();
    const type = isStay() && fl.length && TYPE[bld.bld] ? TYPE[bld.bld](fl[0]) : '';
    const extra = isStay() && fl.length && EXTRA[bld.bld] ? EXTRA[bld.bld](fl[0]) : [];
    const live = liveOnFloor(fl);
    const rooms = isStay() && bld.bld ? Store.roomsOn(bld.bld, fl) : [];
    return {
      title: `${bld.short || bld.name} · ${label}`, sub: type || (isStay() ? '층 상세' : w.unit),
      html: `
        <div class="dsec"><div class="dh">${w.linen}</div>
          <div class="dbox k-${kind || 'room'}">${B(what)}</div></div>
        ${type || extra.length ? `<div class="dsec"><div class="dh">객실 기준</div>
          <div class="dchips">${type ? `<span class="dchip on">${E(type)}</span>` : ''}${extra.map((x) => `<span class="dchip">${E(x)}</span>`).join('')}</div></div>` : ''}
        ${live.length ? `<div class="dsec"><div class="dh">지금 진행 중</div>
          <div class="dlive">${live.map((l) => `<div class="lv ${l.k}"><b>${E(l.room)}</b> ${E(l.text)}</div>`).join('')}</div></div>` : ''}
        <div class="dsec"><div class="dh">층 평면도 ${rooms.length ? `<span class="cnt">${rooms.length}실</span>` : ''}</div>
          ${rooms.length ? plan(rooms) + legend() : planZones(what)}
          ${isStay() && !rooms.length ? `<p class="dnote">이 층은 등록된 객실이 없어 <b>용도별 평면</b>으로 보여 줍니다. 층별 호수 목록을 주시면 객실 평면으로 바뀝니다.</p>` : ''}
        </div>
        ${isStay() && RoomData.has(bld.bld) ? `<p class="dnote">출처: ${E(RoomData.source(bld.bld))} · 평면도는 실측 도면이 아니라 호수 순서로 그린 개념 평면입니다 — 엘리베이터·린넨실 위치는 예시입니다.</p>` : ''}
        ${bld.floorNote ? `<div class="warnbox">${E(bld.floorNote)}</div>` : ''}`,
      bind(root, push) {
        root.querySelectorAll('[data-no]').forEach((b2) => b2.onclick = () => {
          const r = rooms.find((x) => x.no === b2.dataset.no); if (r) push(viewRoom(r, type, extra));
        });
      },
    };
  }

  /* 층 평면도 — 외벽·복도·객실 경계벽·출입문·코어(EV/계단)·린넨실을 갖춘 도면.
     실측 도면이 아니라 호수 순서로 그린 개념 평면이다(화면에 명시). */
  function plan(rooms) {
    const RW = 74, RD = 78, CORR = 44, WALL = 5, CORE = 86;   // 객실폭·깊이·복도·벽두께·코어폭
    const half = Math.ceil(rooms.length / 2);
    const top = rooms.slice(0, half), bot = rooms.slice(half);
    const cols = Math.max(top.length, bot.length);
    const bodyW = cols * RW + CORE;                 // 코어를 오른쪽 끝에 둔다
    const W2 = bodyW + WALL * 2;
    const H2 = RD * 2 + CORR + WALL * 2;
    const yTop = WALL, yCorr = WALL + RD, yBot = WALL + RD + CORR;

    const room = (r, i, top_) => {
      const x = WALL + i * RW;
      const y = top_ ? yTop : yBot;
      const st = Store.ROOM_STATUS[r.status] || Store.ROOM_STATUS.unknown;
      // 문: 복도 쪽 벽에 낸다
      const dy = top_ ? y + RD : y;
      const dx = x + RW * 0.5;
      const swing = top_
        ? `M${dx - 15} ${dy} a15 15 0 0 0 15 -15`
        : `M${dx - 15} ${dy} a15 15 0 0 1 15 15`;
      return `<g class="rm s-${st.k}" data-no="${E(r.no)}" tabindex="0" role="button" aria-label="${E(r.no)}호 ${E(st.ko)}">
        <rect class="rf" x="${x}" y="${y}" width="${RW}" height="${RD}"/>
        <text class="n" x="${x + RW / 2}" y="${y + RD / 2 - 2}">${E(r.no)}</text>
        <text class="s" x="${x + RW / 2}" y="${y + RD / 2 + 15}">${E(st.ko)}</text>
        <line class="dv" x1="${x + RW}" y1="${y}" x2="${x + RW}" y2="${y + RD}"/>
        <rect class="dgap" x="${dx - 15}" y="${top_ ? dy - 2.5 : dy - 2.5}" width="30" height="5"/>
        <path class="dsw" d="${swing}"/>
      </g>`;
    };
    const cx = WALL + cols * RW;
    return `<div class="planwrap"><svg class="plan" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}" xmlns="http://www.w3.org/2000/svg">
      <rect class="slab" x="0" y="0" width="${W2}" height="${H2}"/>
      <rect class="corr" x="${WALL}" y="${yCorr}" width="${bodyW}" height="${CORR}"/>
      ${top.map((r, i) => room(r, i, true)).join('')}
      ${bot.map((r, i) => room(r, i, false)).join('')}
      <g class="core">
        <rect x="${cx}" y="${WALL}" width="${CORE}" height="${RD}"/>
        <text x="${cx + CORE / 2}" y="${WALL + RD / 2 - 4}">엘리베이터</text>
        <text x="${cx + CORE / 2}" y="${WALL + RD / 2 + 13}">· 계단</text>
        <rect x="${cx}" y="${yBot}" width="${CORE}" height="${RD}"/>
        <text x="${cx + CORE / 2}" y="${yBot + RD / 2 - 4}">린넨실</text>
        <text x="${cx + CORE / 2}" y="${yBot + RD / 2 + 13}">· 창고</text>
      </g>
      <text class="corrt" x="${WALL + bodyW / 2}" y="${yCorr + CORR / 2 + 5}">복 도</text>
      <rect class="env" x="${WALL / 2}" y="${WALL / 2}" width="${W2 - WALL}" height="${H2 - WALL}"/>
    </svg></div>`;
  }

  /* 객실이 없는 층(창고·린넨·시설)도 평면으로 — 외벽·복도·코어 + 용도별 실 */
  function planZones(what) {
    const parts = String(what).split(/\s·\s|\s\|\s|,\s*/).map((x) => x.trim()).filter(Boolean).slice(0, 10);
    const RW = 108, RD = 78, CORR = 40, WALL = 5, CORE = 84;
    const half = Math.ceil(parts.length / 2) || 1;
    const top = parts.slice(0, half), bot = parts.slice(half);
    const cols = Math.max(top.length, bot.length, 1);
    const bodyW = cols * RW + CORE, W2 = bodyW + WALL * 2;
    const H2 = RD * 2 + CORR + WALL * 2;
    const yTop = WALL, yCorr = WALL + RD, yBot = WALL + RD + CORR;
    const cellsOf = (arr, y, isTop) => arr.map((t, i) => {
      const x = WALL + i * RW;
      const dx = x + RW * 0.5, dy = isTop ? y + RD : y;
      const swing = isTop ? `M${dx - 15} ${dy} a15 15 0 0 0 15 -15` : `M${dx - 15} ${dy} a15 15 0 0 1 15 15`;
      // 긴 이름은 두 줄로
      const words = t.split(/\s+/); let l1 = '', l2 = '';
      words.forEach((w2) => { if ((l1 + ' ' + w2).trim().length <= 9 && !l2) l1 = (l1 + ' ' + w2).trim(); else l2 = (l2 + ' ' + w2).trim(); });
      return `<g class="zn">
        <rect class="zf" x="${x}" y="${y}" width="${RW}" height="${RD}"/>
        <text class="zt" x="${x + RW / 2}" y="${y + RD / 2 + (l2 ? -4 : 5)}">${E(l1)}</text>
        ${l2 ? `<text class="zt sm" x="${x + RW / 2}" y="${y + RD / 2 + 14}">${E(l2.length > 12 ? l2.slice(0, 11) + '…' : l2)}</text>` : ''}
        <line class="dv" x1="${x + RW}" y1="${y}" x2="${x + RW}" y2="${y + RD}"/>
        <rect class="dgap" x="${dx - 15}" y="${dy - 2.5}" width="30" height="5"/>
        <path class="dsw" d="${swing}"/></g>`;
    }).join('');
    const cx = WALL + cols * RW;
    return `<div class="planwrap"><svg class="plan" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}" xmlns="http://www.w3.org/2000/svg">
      <rect class="slab" x="0" y="0" width="${W2}" height="${H2}"/>
      <rect class="corr" x="${WALL}" y="${yCorr}" width="${bodyW}" height="${CORR}"/>
      ${cellsOf(top, yTop, true)}${cellsOf(bot, yBot, false)}
      <g class="core"><rect x="${cx}" y="${WALL}" width="${CORE}" height="${RD}"/>
        <text x="${cx + CORE / 2}" y="${WALL + RD / 2 - 4}">엘리베이터</text>
        <text x="${cx + CORE / 2}" y="${WALL + RD / 2 + 13}">· 계단</text>
        <rect x="${cx}" y="${yBot}" width="${CORE}" height="${RD}"/>
        <text x="${cx + CORE / 2}" y="${yBot + RD / 2 + 4}">비상계단</text></g>
      <text class="corrt" x="${WALL + bodyW / 2}" y="${yCorr + CORR / 2 + 5}">복 도</text>
      <rect class="env" x="${WALL / 2}" y="${WALL / 2}" width="${W2 - WALL}" height="${H2 - WALL}"/>
    </svg></div>`;
  }

  function legend() {
    return `<div class="plegend">${Object.keys(Store.ROOM_STATUS).map((k) => {
      const s = Store.ROOM_STATUS[k];
      return `<span class="lg s-${s.k}"><i></i>${E(s.ko)}</span>`;
    }).join('')}</div>`;
  }

  function liveOnFloor(fl) {
    if (!fl.length) return [];
    const d = Store.load();
    const inF = (room) => { const s = String(room || ''); const f = s.length >= 4 ? +s.slice(0, 2) : +s.slice(0, 1); return fl.includes(f); };
    const out = [];
    (d.defects || []).filter((x) => x.bld === bld.bld && x.stage !== 'done' && inF(x.room))
      .forEach((x) => out.push({ room: x.room, text: `${x.title} — ${Logic.STAGE_KO[x.stage] || x.stage}`, k: 'bad' }));
    (d.lost || []).filter((x) => x.bld === bld.bld && x.status === 'stored' && inF(x.room))
      .forEach((x) => out.push({ room: x.room, text: `습득물 보관중 — ${x.desc}`, k: 'warn' }));
    return out;
  }

  function viewRoom(r, type, extra) {
    const d = Store.load();
    const flags = (RoomData.has(bld.bld) ? RoomData.onFloor(bld.bld, r.floor) : []).find((x) => x.no === r.no);
    const tags = (flags && flags.tags) || [];
    const defects = (d.defects || []).filter((x) => x.bld === bld.bld && String(x.room) === r.no);
    const lost = (d.lost || []).filter((x) => x.bld === bld.bld && String(x.room) === r.no);
    const open = defects.filter((x) => x.stage !== 'done');
    const st = Store.ROOM_STATUS[r.status] || Store.ROOM_STATUS.unknown;
    return {
      title: `${r.no}호`, sub: `${bld.short || bld.name} · ${r.floor}층`,
      html: `
        <div class="rmhead">
          <div class="rmno">${E(r.no)}</div>
          <div class="rmmeta"><div>${E(bld.name)}</div><div class="meta">${r.floor}층${type ? ' · ' + E(type) : ''}</div></div>
          <span class="rmstate p-${st.k}">${E(st.ko)}</span>
        </div>
        <div class="dsec"><div class="dh">객실 상태</div>
          <div class="stpick">${Object.keys(Store.ROOM_STATUS).map((k) => {
        const v = Store.ROOM_STATUS[k];
        return `<button class="stbtn p-${v.k} ${k === r.status ? 'on' : ''}" data-st="${k}">${E(v.ko)}</button>`;
      }).join('')}</div>
          <p class="dnote">지금은 직접 표시합니다. 프런트 재실 데이터가 연결되면 자동으로 채워집니다.</p></div>
        ${tags.length ? `<div class="dsec"><div class="dh">특이사항</div>
          <div class="dtags">${tags.map((t) => `<div class="dtag t-${t.k}"><b>${E(t.t)}</b>${t.d ? `<span>${E(t.d)}</span>` : ''}</div>`).join('')}</div></div>` : ''}
        ${extra.length ? `<div class="dsec"><div class="dh">이 층 기준</div><div class="dchips">${extra.map((x) => `<span class="dchip">${E(x)}</span>`).join('')}</div></div>` : ''}
        ${open.length ? `<div class="dsec"><div class="dh">진행 중 하자</div>${open.map((x) => `<div class="lv bad"><b>${E(x.title)}</b> — ${E(Logic.STAGE_KO[x.stage] || x.stage)}${x.detail ? '<br>' + E(x.detail) : ''}</div>`).join('')}</div>` : ''}
        ${lost.length ? `<div class="dsec"><div class="dh">습득물</div>${lost.map((x) => `<div class="lv warn"><b>${E(x.desc)}</b> — ${E(x.status === 'stored' ? '보관 중' : '인계됨')}</div>`).join('')}</div>` : ''}
        <div class="foot"><button class="btn filled" data-photo style="width:100%">객실 구조 · 실사 보기</button></div>`,
      bind(root, push) {
        root.querySelector('[data-photo]').onclick = () => push(viewPhoto(r, type));
        root.querySelectorAll('[data-st]').forEach((b2) => b2.onclick = () => {
          try {
            Store.setRoomStatus(r.id, b2.dataset.st, { worker: (Store.Auth.current || {}).name || '' });
            r.status = b2.dataset.st;
            root.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b2));
            const badge = root.querySelector('.rmstate');
            const v = Store.ROOM_STATUS[r.status];
            badge.className = 'rmstate p-' + v.k; badge.textContent = v.ko;
          } catch (e) { alert(e.message); }
        });
      },
    };
  }

  function viewPhoto(r, type) {
    const spec = (bld.items || []).filter(([k]) => /객실|비품|수건|세미취사|컴퓨터|추가침구/.test(k));
    const url = bld.roomsUrl || 'https://www.sonohotelsresorts.com/complex_vp/roomsviewall';
    return {
      title: `${r.no}호 · 구조`, sub: '객실 구성 · 실사',
      html: `
        <div class="plart" id="rmPhoto">${Illust.svg(bld.art)}</div>
        <div class="dsec"><div class="dh">객실 구성</div>
          ${spec.length ? `<table class="pltab">${spec.map(([k, v]) => `<tr><th>${E(k)}</th><td>${B(v)}</td></tr>`).join('')}</table>`
        : '<div class="dempty">등록된 객실 구성 정보가 없습니다.</div>'}
        </div>
        <div class="warnbox">객실 실사 사진은 소노 공식 저작물이라 앱에 담지 않았습니다. 아래 버튼으로 공식 페이지에서 타입별 사진과 평면을 확인하세요.</div>
        <div class="foot"><button class="btn filled" data-open style="width:100%">공식 홈페이지에서 실사 보기</button></div>`,
      bind(root) {
        root.querySelector('[data-open]').onclick = () => window.open(url, '_blank', 'noopener');
        // 비공개 저장소에 실사 사진이 올라와 있으면 그림 대신 사진을 쓴다 (팀 기기만 접근)
        Store.roomPhoto(bld.bld, r.no).then((src) => {
          if (!src) return;
          const box = root.querySelector('#rmPhoto'); if (!box) return;
          box.innerHTML = `<img class="rmphoto" src="${src}" alt="${E(r.no)}호 실사">`;
          const w = root.querySelector('.warnbox');
          if (w) w.textContent = '팀 비공개 서버에 올라온 사진입니다. 공개 주소로는 나가지 않습니다.';
        });
      },
    };
  }

  /* ── 오버레이 · 전환 애니메이션 ── */
  function shell() {
    let el = document.getElementById('drill');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'drill'; el.className = 'drill hide';
    el.innerHTML = `<header class="dtop">
        <button class="iconbtn" data-back aria-label="뒤로"><svg class="ic"><use href="#i-chev"/></svg></button>
        <div class="dtitle"><h3 id="dTitle"></h3><p id="dSub" class="meta"></p></div>
        <button class="iconbtn" data-close aria-label="닫기">✕</button>
      </header>
      <div class="dcrumb" id="dCrumb"></div>
      <div class="dstage" id="dStage"></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-back]').onclick = () => pop();
    el.querySelector('[data-close]').onclick = () => close();
    return el;
  }
  function render(dir) {
    const el = shell(), st = el.querySelector('#dStage'), v = stack[stack.length - 1];
    el.querySelector('#dTitle').textContent = v.title;
    el.querySelector('#dSub').textContent = v.sub || '';
    el.querySelector('[data-back]').style.visibility = stack.length > 1 ? 'visible' : 'hidden';
    el.querySelector('#dCrumb').innerHTML = stack.map((s, i) =>
      `<button data-c="${i}" class="${i === stack.length - 1 ? 'on' : ''}">${E(s.title)}</button>`).join('<span>›</span>');
    el.querySelectorAll('#dCrumb [data-c]').forEach((b) => b.onclick = () => { const i = +b.dataset.c; if (i < stack.length - 1) { stack = stack.slice(0, i + 1); render('back'); } });

    const old = st.querySelector('.dpage');
    const page = document.createElement('div');
    page.className = 'dpage ' + (dir === 'back' ? 'in-back' : 'in-fwd');
    page.innerHTML = v.html;
    st.appendChild(page);
    if (v.bind) v.bind(page, push);
    const ap = page.querySelector('[data-addphoto]');
    if (ap) ap.onclick = () => addPhoto(page);
    fillHero(page);
    if (old) { old.classList.remove('here'); old.classList.add(dir === 'back' ? 'out-back' : 'out-fwd'); setTimeout(() => old.remove(), 280); }
    // rAF는 화면이 합성되지 않을 때(백그라운드 탭 등) 지연돼 페이지가 영영 안 보일 수 있다 → 타이머 사용
    setTimeout(() => page.classList.add('here'), 10);
    st.scrollTop = 0;
  }
  const push = (v) => { stack.push(v); render('fwd'); };
  const pop = () => { if (stack.length <= 1) return close(); stack.pop(); render('back'); };
  /* 닫기 정리는 240ms 뒤에 하는데, 그 사이에 다시 열리면 새 화면을 지워 버린다.
     그래서 토큰으로 무효화한다(닫자마자 다시 열면 빈 화면이던 버그). */
  let closeToken = 0;
  function close() {
    const el = shell(); el.classList.remove('open');
    const t = ++closeToken;
    setTimeout(() => {
      if (t !== closeToken) return;                 // 그새 다시 열렸다 → 정리하지 않는다
      el.classList.add('hide'); el.querySelector('#dStage').innerHTML = ''; stack = [];
    }, 240);
  }
  function open(placeId) {
    const p = MapData.places.find((x) => x.id === placeId);
    if (!p) return false;   // 모든 시설에서 열린다 — 자료가 없으면 없다고 알려 준다
    closeToken++;                                   // 진행 중인 닫기 정리를 무효화
    bld = p; try { Store.ensureRooms(); } catch (e) {}
    stack = [viewFacade()];
    const el = shell(); el.classList.remove('hide');
    el.querySelector('#dStage').innerHTML = '';      // 이전에 열었던 화면이 남지 않게 비운다
    setTimeout(() => el.classList.add('open'), 10);
    render('fwd');
    return true;
  }
  return { open, close, isOpen: () => { const el = document.getElementById('drill'); return !!el && !el.classList.contains('hide'); } };
})();
