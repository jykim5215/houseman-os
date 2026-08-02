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
  function viewFacade() {
    const rows = floorRows(bld);
    return {
      title: bld.name, sub: rows.length ? '층을 눌러 들어가세요' : '층별 자료 없음',
      html: rows.length
        ? `<div class="facwrap">${facade(bld)}</div>
        <p class="dnote">건물 정면은 실제 사진의 특징(형태·색·중앙 띠)을 따라 그린 그림입니다. 층 오른쪽 숫자는 <b>신경 쓸 객실 수</b>입니다.</p>`
        : `<div class="plart">${Illust.svg(bld.art)}</div>
        <div class="dempty">이 동은 <b>층별 자료가 아직 없습니다.</b><br>현장 게시물·업무 카드에서 확인된 내용만 넣습니다. 층별 린넨실·창고 배치를 알려주시면 바로 추가하겠습니다.</div>`,
      bind(root, push) {
        root.querySelectorAll('.fac .fl').forEach((g) => {
          const go = () => push(viewFloor(rows[+g.dataset.i]));
          g.addEventListener('click', go);
          g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        });
      },
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
        ${isStay() ? `<div class="dsec"><div class="dh">${w.plan} ${rooms.length ? `<span class="cnt">${rooms.length}실</span>` : ''}</div>
          ${rooms.length ? plan(rooms) + legend()
        : `<div class="dempty">이 층은 <b>등록된 객실이 없습니다.</b><br>현장에서 확인된 객실만 넣습니다. 층별 호수 목록을 주시면 바로 채웁니다.</div>`}
        </div>` : ''}
        ${isStay() && RoomData.has(bld.bld) ? `<p class="dnote">출처: ${E(RoomData.source(bld.bld))} · 배치는 호수 순서로 그린 개념도입니다.</p>` : ''}
        ${bld.floorNote ? `<div class="warnbox">${E(bld.floorNote)}</div>` : ''}`,
      bind(root, push) {
        root.querySelectorAll('[data-no]').forEach((b2) => b2.onclick = () => {
          const r = rooms.find((x) => x.no === b2.dataset.no); if (r) push(viewRoom(r, type, extra));
        });
      },
    };
  }

  /* 복도를 사이에 둔 객실 평면 개념도 — 호수 순서대로 위·아래로 나눠 배치 */
  function plan(rooms) {
    const half = Math.ceil(rooms.length / 2);
    const top = rooms.slice(0, half), bot = rooms.slice(half);
    const cw = 62, ch = 46, gap = 5, corr = 26;
    const cols = Math.max(top.length, bot.length);
    const W2 = cols * (cw + gap) + gap, H2 = ch * 2 + corr + gap * 3;
    const cell = (r, i, y) => {
      const st = Store.ROOM_STATUS[r.status] || Store.ROOM_STATUS.unknown;
      return `<g class="rm s-${st.k}" data-no="${E(r.no)}" tabindex="0" role="button" aria-label="${E(r.no)}호 ${E(st.ko)}">
        <rect x="${gap + i * (cw + gap)}" y="${y}" width="${cw}" height="${ch}" rx="7"/>
        <text class="n" x="${gap + i * (cw + gap) + cw / 2}" y="${y + 21}">${E(r.no)}</text>
        <text class="s" x="${gap + i * (cw + gap) + cw / 2}" y="${y + 35}">${E(st.ko)}</text>
      </g>`;
    };
    return `<div class="planwrap"><svg class="plan" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}" xmlns="http://www.w3.org/2000/svg">
      <rect class="corr" x="0" y="${gap + ch}" width="${W2}" height="${corr}"/>
      <text class="corrt" x="${W2 / 2}" y="${gap + ch + corr / 2 + 4}">복도</text>
      ${top.map((r, i) => cell(r, i, gap)).join('')}
      ${bot.map((r, i) => cell(r, i, gap * 2 + ch + corr)).join('')}
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
    if (old) { old.classList.remove('here'); old.classList.add(dir === 'back' ? 'out-back' : 'out-fwd'); setTimeout(() => old.remove(), 280); }
    // rAF는 화면이 합성되지 않을 때(백그라운드 탭 등) 지연돼 페이지가 영영 안 보일 수 있다 → 타이머 사용
    setTimeout(() => page.classList.add('here'), 10);
    st.scrollTop = 0;
  }
  const push = (v) => { stack.push(v); render('fwd'); };
  const pop = () => { if (stack.length <= 1) return close(); stack.pop(); render('back'); };
  function close() { const el = shell(); el.classList.remove('open'); setTimeout(() => { el.classList.add('hide'); el.querySelector('#dStage').innerHTML = ''; stack = []; }, 240); }
  function open(placeId) {
    const p = MapData.places.find((x) => x.id === placeId);
    if (!p || !(p.bld || floorRows(p).length)) return false;
    bld = p; try { Store.ensureRooms(); } catch (e) {}
    stack = [viewFacade()];
    const el = shell(); el.classList.remove('hide');
    setTimeout(() => el.classList.add('open'), 10);
    render('fwd');
    return true;
  }
  return { open, close, isOpen: () => { const el = document.getElementById('drill'); return !!el && !el.classList.contains('hide'); } };
})();
