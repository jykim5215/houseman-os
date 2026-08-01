/* 시설 일러스트 — 소노 공식홈의 실제 건물 사진을 보고 특징만 뽑아 직접 그린 원본 SVG.
   사진 자체는 저작물이라 앱에 넣지 않고, 관찰한 특징만 단순화해 새로 그렸습니다.
   관찰한 포인트
   · 소노벨   크림색 고층 슬래브 + 정중앙 진한 초록 세로 띠 + 옥상 사인, 규칙적인 창 격자
   · 소노캄   낮은 베이지 매스에 갈색 박공지붕이 계단식으로 이어짐
   · 소노펠리체 뾰족한 청록 지붕을 얹은 계단식 타워들이 부채꼴로 둘러싸고, 중앙에 아치형 유리 아트리움
   · 공통     뒤로 짙은 초록 능선, 앞으로 넓은 잔디 */
'use strict';

const Illust = (() => {
  const W = 320, H = 150;
  /* 팔레트 (라이트/다크 공통으로 읽히게 채도 낮춤) */
  const C = {
    sky1: '#dfeaf2', sky2: '#f3ece0', ridge: '#3f6b46', ridge2: '#547f52', lawn: '#7fa856', lawn2: '#6b944a',
    cream: '#f4ead8', cream2: '#e2d3ba', creamD: '#cdb897', band: '#1f6f5c', bandD: '#175449',
    tan: '#dcbe95', tanD: '#c2a077', roof: '#8f5138', roofD: '#743e29',
    teal: '#4e93a8', tealD: '#3b7186', glass: '#9cc6da', glassD: '#7fb0c8',
    stone: '#cfc3ae', stoneD: '#b3a48c', water: '#5fb2d4', water2: '#8fd0e6', snow: '#fbfdff',
    dark: '#4a4034', warm: '#c98a2c', red: '#b5533c',
  };
  const bg = () => `<rect width="${W}" height="${H}" fill="url(#ilSky)"/>`;
  const ridge = (y = 78) => `
    <path d="M0 ${y + 16} L34 ${y - 8} L62 ${y + 6} L96 ${y - 18} L134 ${y + 4} L168 ${y - 14} L206 ${y + 2} L246 ${y - 16} L286 ${y + 4} L320 ${y - 6} L320 ${H} L0 ${H} Z" fill="${C.ridge}"/>
    <path d="M0 ${y + 26} L44 ${y + 6} L88 ${y + 20} L140 ${y + 2} L192 ${y + 18} L250 ${y + 4} L320 ${y + 16} L320 ${H} L0 ${H} Z" fill="${C.ridge2}" opacity=".85"/>`;
  const lawn = (y = 118) => `
    <path d="M0 ${y} Q160 ${y - 12} 320 ${y} L320 ${H} L0 ${H} Z" fill="${C.lawn}"/>
    <path d="M0 ${y + 14} Q160 ${y + 4} 320 ${y + 14} L320 ${H} L0 ${H} Z" fill="${C.lawn2}"/>`;
  /* 창 격자 */
  const grid = (x, y, w, h, cols, rows, o = '.5') => {
    let s = '';
    const cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      s += `<rect x="${(x + c * cw + cw * 0.22).toFixed(1)}" y="${(y + r * rh + rh * 0.24).toFixed(1)}" width="${(cw * 0.56).toFixed(1)}" height="${(rh * 0.5).toFixed(1)}" fill="#4a5a63" opacity="${o}" rx="0.6"/>`;
    return s;
  };
  const trees = (xs, y, s = 1) => xs.map((x) => `
    <path d="M${x} ${y} L${x - 7 * s} ${y + 15 * s} L${x + 7 * s} ${y + 15 * s} Z" fill="#3d6b42"/>
    <rect x="${x - 1.2 * s}" y="${y + 14 * s}" width="${2.4 * s}" height="${5 * s}" fill="#6b4a2e"/>`).join('');

  /* ── 소노벨 A·B·C ──
     실사 참고: 크림색 고층 슬래브 2동이 나란히, 정중앙에 진초록 세로 띠 + 옥상 사인.
     양옆으로 갈색 모임지붕을 얹은 낮은 베이지 동, 앞쪽에 아치 캐노피 상가동, 그 앞이 잔디. */
  const belle = () => {
    // 측면 저층동 (베이지 + 갈색 모임지붕, 계단식)
    const wing = (x, y, w, h) => `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.tan}"/>
      ${grid(x, y + 5, w, h - 5, Math.round(w / 11), Math.round((h - 5) / 9))}
      <path d="M${x - 4} ${y} L${x + w * 0.3} ${y - 11} L${x + w * 0.7} ${y - 11} L${x + w + 4} ${y} Z" fill="${C.roof}"/>`;
    return `${bg()}${ridge(66)}
    <g>
      ${wing(14, 78, 62, 44)}${wing(250, 82, 58, 40)}
      <rect x="80" y="60" width="46" height="62" fill="${C.cream2}"/>${grid(80, 66, 46, 56, 4, 8)}
      <rect x="204" y="62" width="44" height="60" fill="${C.cream2}"/>${grid(204, 68, 44, 54, 4, 8)}
      <rect x="126" y="30" width="80" height="92" fill="${C.cream}"/>
      <rect x="126" y="30" width="80" height="4" fill="${C.creamD}"/>
      ${grid(126, 40, 30, 82, 3, 12)}${grid(178, 40, 28, 82, 3, 12)}
      <rect x="156" y="30" width="22" height="92" fill="${C.band}"/>
      <rect x="156" y="30" width="22" height="5" fill="${C.bandD}"/>
      <rect x="150" y="20" width="34" height="11" rx="2" fill="${C.cream}" stroke="${C.creamD}" stroke-width="1.4"/>
      <rect x="157" y="23" width="20" height="5" rx="1" fill="${C.band}"/>
    </g>
    <g>
      <rect x="66" y="106" width="188" height="18" fill="${C.stone}"/>
      ${[74, 106, 138, 170, 202].map((x) => `<path d="M${x} 124 v-9 a11 7 0 0 1 22 0 v9 Z" fill="${C.red}" opacity=".82"/>`).join('')}
      <rect x="66" y="104" width="188" height="4" fill="${C.stoneD}"/>
    </g>
    ${lawn(124)}${trees([8, 312], 108, .8)}`;
  };

  /* ── 소노캄 — 베이지 + 갈색 박공지붕 계단식 ── */
  const calm = () => `${bg()}${ridge(66)}
    <g>
      <rect x="34" y="76" width="70" height="48" fill="${C.tanD}"/>${grid(34, 82, 70, 40, 6, 5)}
      <path d="M30 76 L69 56 L108 76 Z" fill="${C.roofD}"/>
      <rect x="98" y="58" width="88" height="66" fill="${C.tan}"/>${grid(98, 64, 88, 58, 7, 7)}
      <path d="M93 58 L142 34 L191 58 Z" fill="${C.roof}"/>
      <rect x="180" y="70" width="76" height="54" fill="${C.tanD}"/>${grid(180, 76, 76, 46, 6, 6)}
      <path d="M176 70 L218 50 L260 70 Z" fill="${C.roofD}"/>
      <rect x="132" y="100" width="22" height="24" rx="2" fill="${C.dark}" opacity=".55"/>
    </g>
    ${lawn(120)}${trees([18, 288, 302], 100, .85)}`;

  /* ── 소노펠리체 — 뾰족 지붕 타워 부채꼴 + 중앙 아치 유리 아트리움 ── */
  const felice = () => {
    const tower = (x, y, w, h) => `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.stone}"/>
      ${Array.from({ length: Math.floor(h / 9) }, (_, i) => `<rect x="${x}" y="${y + 8 + i * 9}" width="${w}" height="3" fill="${C.glassD}" opacity=".55"/>`).join('')}
      <path d="M${x - 4} ${y} L${x + w / 2} ${y - 15} L${x + w + 4} ${y} Z" fill="${C.teal}"/>
      <path d="M${x + w / 2} ${y - 15} L${x + w + 4} ${y} L${x + w / 2} ${y} Z" fill="${C.tealD}"/>`;
    return `${bg()}${ridge(64)}
    <g>
      ${tower(20, 74, 34, 50)}${tower(58, 62, 32, 62)}${tower(96, 50, 30, 74)}
      ${tower(194, 50, 30, 74)}${tower(230, 62, 32, 62)}${tower(266, 74, 34, 50)}
      <path d="M128 124 L128 88 A32 32 0 0 1 192 88 L192 124 Z" fill="${C.tealD}"/>
      <path d="M133 124 L133 90 A27 27 0 0 1 187 90 L187 124 Z" fill="${C.glass}"/>
      <g stroke="${C.tealD}" stroke-width="1.8" opacity=".65">
        <path d="M160 124 L139 82 M160 124 L150 74 M160 124 L160 72 M160 124 L170 74 M160 124 L181 82"/>
        <path d="M138 104 L182 104"/>
      </g>
      <rect x="120" y="112" width="80" height="12" rx="2" fill="${C.stoneD}"/>
    </g>
    ${lawn(120)}${trees([12, 108, 214, 308], 100, .9)}`;
  };

  /* ── 소노벨 D (호텔) — 중층 슬래브 + 지하 표시 ── */
  const hotel = () => `${bg()}${ridge(72)}
    <g>
      <rect x="92" y="44" width="136" height="80" fill="${C.cream}"/>
      <rect x="92" y="44" width="136" height="5" fill="${C.creamD}"/>
      ${grid(92, 52, 136, 60, 10, 8)}
      <rect x="92" y="112" width="136" height="12" fill="${C.stone}"/>
      <rect x="146" y="112" width="28" height="12" fill="${C.band}"/>
    </g>
    <g opacity=".92">
      <rect x="92" y="126" width="136" height="16" fill="${C.dark}" opacity=".28"/>
      <text x="160" y="138" font-size="10" font-weight="800" text-anchor="middle" fill="${C.dark}">B1 앤트월드</text>
    </g>
    ${trees([56, 264], 104, .8)}`;

  /* ── 소노펫 ── */
  const pet = () => `${bg()}${ridge(74)}
    <g>
      <rect x="76" y="62" width="168" height="62" fill="${C.tan}"/>${grid(76, 70, 168, 46, 12, 5)}
      <path d="M70 62 L160 38 L250 62 Z" fill="${C.roof}"/>
      <rect x="140" y="100" width="40" height="24" rx="3" fill="${C.dark}" opacity=".5"/>
    </g>
    <g fill="${C.roofD}" opacity=".9" transform="translate(40,92)">
      <ellipse cx="0" cy="6" rx="7" ry="6"/><circle cx="-7" cy="-3" r="2.6"/><circle cx="-2" cy="-6" r="2.6"/>
      <circle cx="3" cy="-6" r="2.6"/><circle cx="8" cy="-3" r="2.6"/>
    </g>
    ${lawn(120)}${trees([282, 300], 100, .8)}`;

  /* ── 오션월드 ── */
  const ocean = () => `${bg()}${ridge(66)}
    <g>
      <rect x="52" y="66" width="216" height="46" rx="6" fill="${C.stone}"/>
      <path d="M52 66 Q160 40 268 66 Z" fill="${C.stoneD}"/>
      <path d="M92 46 Q120 96 76 112" stroke="${C.warm}" stroke-width="9" fill="none" stroke-linecap="round"/>
      <path d="M124 40 Q158 96 116 112" stroke="${C.red}" stroke-width="9" fill="none" stroke-linecap="round"/>
      <path d="M196 42 Q230 96 188 112" stroke="${C.teal}" stroke-width="9" fill="none" stroke-linecap="round"/>
    </g>
    <path d="M0 112 Q40 104 80 112 T160 112 T240 112 T320 112 L320 ${H} L0 ${H} Z" fill="${C.water}"/>
    <path d="M0 124 Q40 116 80 124 T160 124 T240 124 T320 124 L320 ${H} L0 ${H} Z" fill="${C.water2}" opacity=".8"/>`;

  /* ── 메인센터 — 곤돌라 ── */
  const main = () => `${bg()}${ridge(60)}
    <g>
      <rect x="86" y="66" width="150" height="58" fill="${C.cream}"/>${grid(86, 74, 150, 42, 11, 4)}
      <path d="M80 66 L161 42 L242 66 Z" fill="${C.roof}"/>
      <rect x="140" y="102" width="42" height="22" rx="3" fill="${C.glassD}"/>
    </g>
    <path d="M8 30 L312 72" stroke="${C.dark}" stroke-width="1.8" opacity=".7"/>
    ${[70, 140, 210].map((x, i) => { const y = 30 + (x - 8) * (42 / 304); return `<g><rect x="${x - 1}" y="${y}" width="2" height="7" fill="${C.dark}"/><rect x="${x - 8}" y="${y + 6}" width="16" height="13" rx="3" fill="${[C.warm, C.teal, C.red][i]}"/></g>`; }).join('')}
    ${lawn(122)}`;

  /* ── 스노위랜드 ── */
  const snowy = () => `${bg()}
    <path d="M0 96 Q80 46 160 76 T320 60 L320 ${H} L0 ${H} Z" fill="${C.snow}"/>
    <path d="M0 116 Q90 84 180 106 T320 96 L320 ${H} L0 ${H} Z" fill="#e8f1f7"/>
    <g>
      <rect x="120" y="58" width="80" height="34" fill="${C.tan}"/><path d="M114 58 L160 38 L206 58 Z" fill="${C.roof}"/>
      ${grid(120, 64, 80, 24, 6, 2)}
    </g>
    <g fill="#fff" stroke="${C.stoneD}" stroke-width="1.2">
      <circle cx="52" cy="116" r="9"/><circle cx="52" cy="103" r="6.5"/>
      <circle cx="262" cy="120" r="8"/><circle cx="262" cy="108" r="6"/>
    </g>
    ${trees([22, 296], 74, .8)}`;

  /* ── 비바 플렉스 몰 ── */
  const flex = () => `${bg()}${ridge(74)}
    <g>
      <rect x="46" y="52" width="228" height="72" rx="5" fill="${C.cream}"/>
      <rect x="46" y="52" width="228" height="16" rx="5" fill="${C.warm}"/>
      ${grid(52, 74, 216, 30, 14, 2, '.35')}
      <rect x="118" y="98" width="84" height="26" rx="3" fill="${C.glassD}"/>
      <rect x="60" y="98" width="44" height="26" rx="3" fill="${C.stone}"/>
      <rect x="216" y="98" width="44" height="26" rx="3" fill="${C.stone}"/>
    </g>
    <g transform="translate(160,60)"><circle cx="0" cy="0" r="0"/></g>
    <g fill="#fff" opacity=".92" transform="translate(150,54)">
      ${[0, 12, 24].map((d) => `<ellipse cx="${d}" cy="6" rx="3.4" ry="5.4"/>`).join('')}
    </g>
    ${lawn(122)}`;

  /* ── 슬로프 ── */
  const slope = () => `${bg()}${ridge(104)}
    <path d="M0 132 L120 30 L206 132 Z" fill="${C.snow}"/>
    <path d="M120 30 L206 132 L120 132 Z" fill="#e6f0f6"/>
    <path d="M186 132 L292 46 L320 132 Z" fill="${C.snow}" opacity=".95"/>
    <path d="M120 40 q-16 40 -34 88 M132 44 q14 42 30 86" stroke="#dbe7ef" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M24 122 L246 44" stroke="${C.dark}" stroke-width="1.6" opacity=".7"/>
    ${[80, 140, 200].map((x) => { const y = 122 - (x - 24) * (78 / 222); return `<g><rect x="${x - 1}" y="${y}" width="2" height="6" fill="${C.dark}"/><rect x="${x - 5}" y="${y + 5}" width="10" height="9" rx="2" fill="${C.warm}"/></g>`; }).join('')}
    ${trees([30, 288, 306], 100, .75)}`;

  /* ── 그 밖의 시설 ── */
  const simple = (body, ridgeY = 76) => `${bg()}${ridge(ridgeY)}${body}${lawn(122)}`;
  const box = (x, y, w, h, fill, roof) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>${roof ? `<path d="M${x - 5} ${y} L${x + w / 2} ${y - 18} L${x + w + 5} ${y} Z" fill="${roof}"/>` : ''}`;

  const bbq = () => simple(`${box(96, 74, 128, 50, C.tan, C.roof)}${grid(96, 82, 128, 34, 8, 3)}
    <g stroke="${C.dark}" stroke-width="2.4" fill="none" opacity=".7"><path d="M52 122 v-18 M44 104 h16 M60 122 v-18"/></g>
    <path d="M240 118 q6 -14 0 -22 q-8 8 0 22" fill="${C.warm}" opacity=".8"/>`);
  const food = () => simple(`${box(94, 70, 132, 54, C.tan, C.roof)}${grid(94, 78, 132, 38, 8, 3)}
    <g transform="translate(50,92)" stroke="${C.dark}" stroke-width="2.2" fill="none"><path d="M0 0v22M-5 0v9a5 5 0 0 0 10 0V0"/></g>
    <g transform="translate(268,92)" stroke="${C.dark}" stroke-width="2.2" fill="none"><path d="M0 0v22M0 0a5 7 0 0 1 0 14"/></g>`);
  const clinic = () => simple(`${box(100, 70, 120, 54, C.cream)}${grid(100, 78, 120, 38, 7, 3)}
    <rect x="146" y="46" width="28" height="20" rx="3" fill="#fff" stroke="${C.stoneD}"/>
    <path d="M160 50v12M154 56h12" stroke="${C.red}" stroke-width="3.4" stroke-linecap="round"/>`);
  const golf = () => `${bg()}${ridge(70)}
    <path d="M0 92 Q120 66 320 88 L320 ${H} L0 ${H} Z" fill="${C.lawn}"/>
    <path d="M0 116 Q140 98 320 112 L320 ${H} L0 ${H} Z" fill="${C.lawn2}"/>
    <ellipse cx="196" cy="104" rx="34" ry="10" fill="#8cb862"/>
    <path d="M196 104 V72" stroke="${C.dark}" stroke-width="2"/><path d="M196 72 l20 6 -20 6z" fill="${C.red}"/>
    ${trees([44, 92, 288], 78, .95)}`;
  const forest = () => `${bg()}${ridge(60)}
    <path d="M0 108 Q160 92 320 106 L320 ${H} L0 ${H} Z" fill="${C.lawn2}"/>
    ${trees([36, 66, 100, 140, 186, 226, 264, 296], 78, 1.15)}
    <path d="M20 132 Q120 118 300 126" stroke="${C.tan}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  const horse = () => simple(`${box(102, 76, 116, 48, C.tan, C.roof)}
    <path d="M0 118 h320" stroke="${C.roofD}" stroke-width="2.4"/>
    <g stroke="${C.roofD}" stroke-width="2.4">${[30, 62, 258, 290].map((x) => `<path d="M${x} 108v18"/>`).join('')}</g>`);
  const summit = () => `${bg()}
    <path d="M0 136 L110 40 L210 136 Z" fill="${C.snow}"/><path d="M110 40 L210 136 L110 136 Z" fill="#e4eef5"/>
    ${simple(box(196, 82, 92, 42, C.tan, C.roof), 104)}`;
  const ticket = () => simple(`${box(112, 72, 96, 52, C.cream)}${grid(112, 80, 96, 24, 5, 1)}
    <rect x="124" y="104" width="72" height="18" rx="4" fill="${C.warm}"/>
    <path d="M124 113 h72" stroke="#fff" stroke-width="2" stroke-dasharray="4 4"/>`);
  const bus = () => simple(`<rect x="84" y="72" width="152" height="44" rx="8" fill="${C.warm}"/>
    ${grid(92, 78, 136, 20, 6, 1, '.45')}
    <circle cx="116" cy="118" r="9" fill="${C.dark}"/><circle cx="204" cy="118" r="9" fill="${C.dark}"/>`, 82);
  const parking = () => simple(`<rect x="106" y="56" width="108" height="68" rx="10" fill="${C.stone}"/>
    <text x="160" y="106" font-size="52" font-weight="800" text-anchor="middle" fill="#fff">P</text>`, 84);
  const ev = () => simple(`<rect x="122" y="52" width="76" height="72" rx="10" fill="${C.ridge2}"/>
    <path d="M166 66 l-18 30h14l-4 22 20-32h-14z" fill="${C.snow}"/>`, 84);
  const smoke = () => simple(`<rect x="112" y="60" width="96" height="64" rx="6" fill="${C.stone}" opacity=".9"/>
    <rect x="128" y="96" width="56" height="8" rx="4" fill="#fff"/>
    <path d="M136 84 q6 -10 0 -18 M152 84 q6 -10 0 -18" stroke="${C.stoneD}" stroke-width="2.4" fill="none"/>`, 84);
  const bmw = () => `${bg()}${ridge(74)}
    <path d="M0 106 Q160 88 320 104 L320 ${H} L0 ${H} Z" fill="${C.stone}"/>
    <path d="M20 128 Q160 108 300 126" stroke="#fff" stroke-width="2" stroke-dasharray="9 9" fill="none"/>
    <g transform="translate(150,92)"><rect x="-24" y="-8" width="48" height="14" rx="6" fill="${C.red}"/>
      <circle cx="-13" cy="8" r="6" fill="${C.dark}"/><circle cx="13" cy="8" r="6" fill="${C.dark}"/></g>`;
  const village = () => `${bg()}${ridge(62)}
    <path d="M0 98 Q120 74 320 94 L320 ${H} L0 ${H} Z" fill="${C.lawn}"/>
    ${[[36, 82], [104, 74], [176, 78], [244, 70]].map(([x, y]) => `${box(x, y, 58, 34, C.stone, C.teal)}${grid(x, y + 6, 58, 24, 4, 2)}`).join('')}
    <path d="M0 126 Q160 112 320 124 L320 ${H} L0 ${H} Z" fill="${C.lawn2}"/>
    <path d="M196 112 V96" stroke="${C.dark}" stroke-width="1.8"/><path d="M196 96 l14 4 -14 4z" fill="${C.red}"/>`;
  const youth = () => simple(`${box(88, 66, 144, 58, C.cream, C.roof)}${grid(88, 74, 144, 42, 9, 4)}
    <rect x="146" y="100" width="28" height="24" rx="2" fill="${C.roofD}"/>`);

  const MAP = { belle, calm, felice, hotel, pet, ocean, main, snowy, flex, slope, bbq, food, clinic, golf, forest, horse, summit, ticket, bus, parking, ev, smoke, bmw, village, youth };

  function svg(id) {
    const f = MAP[id]; if (!f) return '';
    // xmlns가 있어야 data: URL·다운로드 등 독립 이미지로도 쓸 수 있다
    return `<svg xmlns="http://www.w3.org/2000/svg" class="ilart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">
      <defs><linearGradient id="ilSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${C.sky1}"/><stop offset="1" stop-color="${C.sky2}"/>
      </linearGradient></defs>${f()}</svg>`;
  }
  return { svg, has: (id) => !!MAP[id] };
})();
