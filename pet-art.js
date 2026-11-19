/* 顺势神兽形象：立体光影 + 山海经特征。
   由 student.js 的 petSVG() 调用；每个形象使用独立的渐变 id，避免同页多只宠物串色。 */
(function () {
  'use strict';

  let seq = 0;

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function mix(hex, target, ratio) {
    const parse = (value, fallback) => {
      const raw = String(value || '').replace('#', '');
      const full = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw.padEnd(6, '0').slice(0, 6);
      const num = parseInt(full, 16);
      return Number.isNaN(num) ? fallback : [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    };
    const a = parse(hex, [136, 136, 136]);
    const b = parse(target, [255, 255, 255]);
    const t = clamp01(ratio);
    const out = a.map((value, index) => Math.round(value + (b[index] - value) * t));
    return `#${((1 << 24) + (out[0] << 16) + (out[1] << 8) + out[2]).toString(16).slice(1)}`;
  }

  function star(x, y, radius, fill, opacity) {
    const r = Number(radius) || 4;
    const points = [
      [x, y - r], [x + r * 0.28, y - r * 0.28], [x + r, y], [x + r * 0.28, y + r * 0.28],
      [x, y + r], [x - r * 0.28, y + r * 0.28], [x - r, y], [x - r * 0.28, y - r * 0.28]
    ].map((point) => point.map((n) => n.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${points}" fill="${fill}" opacity="${opacity == null ? 1 : opacity}"/>`;
  }

  function cloud(x, y, scale, color, opacity) {
    return `<g transform="translate(${x} ${y}) scale(${scale})" opacity="${opacity == null ? 0.5 : opacity}">` +
      `<path d="M0 6c2-7 9-10 15-6 3-8 14-10 19-3 7-4 16 1 16 8 6-2 12 1 12 7H0Z" fill="${color}"/>` +
      `<path d="M8 8c4-3 9-2 12 1" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/>` +
    `</g>`;
  }

  function eye(x, y, rx, ry, accent, opts) {
    const o = opts || {};
    const rot = Number(o.rot) || 0;
    const look = Number(o.look) || 0;
    const dark = o.dark || '#203d43';
    const iris = o.iris || '';
    return `<g transform="rotate(${rot} ${x} ${y})">` +
      `<ellipse class="pet-eye" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${dark}"/>` +
      (iris ? `<ellipse cx="${x + look}" cy="${y + ry * 0.12}" rx="${rx * 0.62}" ry="${ry * 0.7}" fill="${iris}" opacity=".85"/>` : '') +
      `<ellipse cx="${x + look}" cy="${y - ry * 0.2}" rx="${rx * 0.42}" ry="${ry * 0.56}" fill="#050d10" opacity=".9"/>` +
      `<circle cx="${x + rx * 0.3 + look}" cy="${y - ry * 0.42}" r="${Math.max(1.1, rx * 0.26)}" fill="#fff" opacity=".95"/>` +
      `<circle cx="${x - rx * 0.34}" cy="${y + ry * 0.4}" r="${Math.max(0.7, rx * 0.15)}" fill="${accent}" opacity=".7"/>` +
      `<path d="M${x - rx} ${y - ry * 0.84}q${rx} ${-ry * 0.5} ${rx * 2} 0" fill="none" stroke="${o.lid || '#203d43'}" stroke-width="${Math.max(1, rx * 0.2)}" stroke-linecap="round" opacity=".55"/>` +
    `</g>`;
  }

  function almondEye(x, y, rx, ry, accent, rot) {
    return `<g transform="rotate(${rot || 0} ${x} ${y})">` +
      `<path class="pet-eye" d="M${x - rx} ${y}c${rx * 0.45} ${-ry} ${rx * 1.55} ${-ry} ${rx * 2} 0c-${rx * 0.45} ${ry} -${rx * 1.55} ${ry} -${rx * 2} 0Z" fill="#203d43"/>` +
      `<ellipse cx="${x + rx * 0.15}" cy="${y - ry * 0.1}" rx="${rx * 0.36}" ry="${ry * 0.55}" fill="#071114"/>` +
      `<circle cx="${x + rx * 0.42}" cy="${y - ry * 0.42}" r="${Math.max(1.1, rx * 0.18)}" fill="#fff"/>` +
      `<circle cx="${x - rx * 0.35}" cy="${y + ry * 0.25}" r="${Math.max(0.7, rx * 0.12)}" fill="${accent}" opacity=".75"/>` +
      `<path d="M${x - rx * 1.05} ${y - ry * 1.1}q${rx} ${-ry * 0.7} ${rx * 2.1} 0" fill="none" stroke="#2a4a4d" stroke-width="1.5" stroke-linecap="round" opacity=".55"/>` +
    `</g>`;
  }

  function hoof(x, y, color, width) {
    const w = width || 11;
    return `<path d="M${x - w / 2} ${y}c0 ${w * 0.5} ${w * 0.18} ${w * 0.7} ${w / 2} ${w * 0.7}s${w / 2} ${-w * 0.2} ${w / 2} ${-w * 0.7}Z" fill="${color}"/>` +
      `<path d="M${x - w * 0.18} ${y + w * 0.2}v${w * 0.42}M${x + w * 0.18} ${y + w * 0.2}v${w * 0.42}" stroke="#fff" stroke-opacity=".28" stroke-width="1"/>`;
  }

  function scaleArc(x, y, width, color, opacity) {
    return `<path d="M${x - width / 2} ${y}c${width * 0.18} ${width * 0.38} ${width * 0.82} ${width * 0.38} ${width} 0" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round" opacity="${opacity == null ? 0.35 : opacity}"/>`;
  }

  function rimPath(d, color, width, opacity) {
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width || 2.4}" stroke-linecap="round" opacity="${opacity == null ? 0.45 : opacity}"/>`;
  }

  function petDefs(uid, p, fused) {
    const light = mix(p.body, '#ffffff', fused ? 0.68 : 0.58);
    const mid = mix(p.body, '#ffffff', 0.18);
    const dark = mix(p.ear, '#0d2026', 0.34);
    const deep = mix(p.ear, '#071317', 0.52);
    const bellyLight = mix(p.belly, '#ffffff', 0.55);
    const bellyShade = mix(p.belly, p.ear, 0.28);
    const accentLight = mix(p.accent, '#ffffff', 0.5);
    const accentDark = mix(p.accent, '#5a3410', 0.38);
    const maneLight = mix(p.ear, '#ffffff', 0.32);
    const maneDark = mix(p.ear, '#071317', 0.22);
    const g = (name) => `${uid}-${name}`;
    return `<defs>` +
      `<radialGradient id="${g('body')}" cx="30%" cy="18%" r="96%"><stop offset="0" stop-color="${light}"/><stop offset=".3" stop-color="${mid}"/><stop offset=".7" stop-color="${p.body}"/><stop offset=".92" stop-color="${dark}"/><stop offset="1" stop-color="${deep}"/></radialGradient>` +
      `<radialGradient id="${g('head')}" cx="30%" cy="18%" r="92%"><stop offset="0" stop-color="${mix(p.body, '#ffffff', 0.7)}"/><stop offset=".42" stop-color="${mid}"/><stop offset=".8" stop-color="${mix(p.body, p.ear, 0.5)}"/><stop offset="1" stop-color="${dark}"/></radialGradient>` +
      `<linearGradient id="${g('belly')}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${bellyLight}"/><stop offset=".62" stop-color="${p.belly}"/><stop offset="1" stop-color="${bellyShade}"/></linearGradient>` +
      `<linearGradient id="${g('accent')}" x1="0" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="${accentLight}"/><stop offset=".42" stop-color="${p.accent}"/><stop offset=".78" stop-color="${mix(p.accent, p.ear, 0.28)}"/><stop offset="1" stop-color="${accentDark}"/></linearGradient>` +
      `<linearGradient id="${g('mane')}" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="${maneLight}"/><stop offset=".55" stop-color="${p.ear}"/><stop offset="1" stop-color="${maneDark}"/></linearGradient>` +
      `<radialGradient id="${g('glow')}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${accentLight}" stop-opacity=".6"/><stop offset=".55" stop-color="${p.accent}" stop-opacity=".2"/><stop offset="1" stop-color="${p.accent}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="${g('orb')}" cx="34%" cy="28%" r="72%"><stop offset="0" stop-color="#fffbe8"/><stop offset=".4" stop-color="${accentLight}"/><stop offset="1" stop-color="${accentDark}"/></radialGradient>` +
      `<filter id="${g('blur')}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>` +
      `<filter id="${g('soft')}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.4"/></filter>` +
      `<filter id="${g('glowf')}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `</defs>`;
  }

  function backdrop(species, s, p, fused, ids) {
    const water = ['otter', 'whale', 'xuanwu', 'fuzhu', 'kun'].indexOf(species) >= 0;
    const fire = ['jinwu', 'suanni'].indexOf(species) >= 0;
    const moon = ['yutu', 'mengdie'].indexOf(species) >= 0;
    const wind = ['qingniao', 'xianhe', 'yinglong'].indexOf(species) >= 0;
    const metal = species === 'baihu';
    const gold = species === 'jinchan';
    const wood = species === 'lingyuan';
    const mythic = ['baize', 'qilin', 'zhulong', 'jinwu', 'yutu', 'mengdie', 'qingniao', 'suanni', 'baihu', 'xianhe', 'lingyuan', 'jinchan', 'yinglong'].indexOf(species) >= 0;
    const aura = s >= 4
      ? `<g class="pet-aura"><circle cx="130" cy="112" r="102" fill="url(#${ids.glow})"/>` +
        `<circle cx="130" cy="112" r="94" fill="none" stroke="${p.accent}" stroke-opacity=".32" stroke-width="5"/>` +
        `<circle cx="130" cy="112" r="82" fill="none" stroke="${p.accent}" stroke-opacity=".26" stroke-width="1.6" stroke-dasharray="2 8"/>` +
        (mythic ? `<circle cx="130" cy="112" r="72" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1"/>` : '') +
      `</g>`
      : s >= 3
        ? `<g class="pet-aura is-soft"><circle cx="130" cy="116" r="86" fill="url(#${ids.glow})" opacity=".72"/></g>`
        : '';
    const fusion = fused
      ? `<g class="pet-fusion-aura"><circle cx="130" cy="108" r="106" fill="none" stroke="#f0c987" stroke-opacity=".45" stroke-width="2.6" stroke-dasharray="4 9"/>` +
        `<circle cx="130" cy="108" r="90" fill="none" stroke="#8ed9c9" stroke-opacity=".36" stroke-width="5"/></g>`
      : '';
    const shadow = `<ellipse cx="130" cy="191" rx="62" ry="9" fill="#102b32" opacity=".2" filter="url(#${ids.blur})"/>` +
      `<ellipse cx="130" cy="188" rx="40" ry="5" fill="#102b32" opacity=".18" filter="url(#${ids.soft})"/>`;
    let ground = '';
    if (fire) {
      ground = `<g class="pet-embers"><ellipse cx="130" cy="184" rx="88" ry="12" fill="${p.accent}" opacity=".13"/>` +
        `<path d="M30 181c16-7 32-7 48 0s32 7 48 0 32-7 48 0 30 6 44 0" fill="none" stroke="${p.accent}" stroke-opacity=".4" stroke-width="1.8" stroke-linecap="round"/>` +
        `<path d="M60 174c-6-9-4-16 2-22 1 7 5 11 11 14-1-9 3-15 9-19 0 9 3 16 8 21Z" fill="${p.accent}" opacity=".24"/>` +
        `<path d="M184 178c-5-8-3-14 2-19 1 6 4 9 9 12-1-8 3-13 8-16 0 8 2 14 6 18Z" fill="${p.accent}" opacity=".2"/>` +
        star(46, 112, 3.2, p.accent, 0.6) + star(214, 88, 2.6, '#fff', 0.5) +
      `</g>`;
    } else if (moon) {
      ground = `<g class="pet-moon-ground"><path d="M196 56a26 26 0 1 0 18 44 22 22 0 0 1-18-44Z" fill="${p.accent}" opacity=".22"/>` +
        star(42, 74, 3.4, '#fff', 0.65) + star(214, 132, 2.8, p.accent, 0.5) + star(70, 48, 2.2, p.accent, 0.55) +
        `<path d="M34 180c16-6 32-6 48 0s32 6 48 0 32-6 48 0 30 5 44 0" fill="none" stroke="${p.accent}" stroke-opacity=".26" stroke-width="1.5" stroke-linecap="round"/>` +
      `</g>`;
    } else if (wind) {
      ground = `<g class="pet-wind"><path d="M22 116c28-16 50-16 76 0s46 16 70 2" fill="none" stroke="${p.accent}" stroke-opacity=".36" stroke-width="2" stroke-linecap="round"/>` +
        `<path d="M36 138c22-11 40-11 60 0s38 11 58 1" fill="none" stroke="${p.accent}" stroke-opacity=".24" stroke-width="1.5" stroke-linecap="round"/>` +
        `<path d="M168 70c12-7 22-7 34 0m-28 10c9-5 17-5 26 0" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1.6" stroke-linecap="round"/>` +
        `<path d="M32 181c16-6 32-6 48 0s32 6 48 0 32-6 48 0 30 5 44 0" fill="none" stroke="${p.accent}" stroke-opacity=".23" stroke-width="1.5" stroke-linecap="round"/>` +
      `</g>`;
    } else if (metal) {
      ground = `<g class="pet-sparks"><path d="M32 180c16-6 32-6 48 0s32 6 48 0 32-6 48 0 30 5 44 0" fill="none" stroke="${p.accent}" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round"/>` +
        star(46, 92, 4.2, p.accent, 0.55) + star(212, 64, 3.2, '#fff', 0.7) + star(218, 132, 2.4, p.accent, 0.5) +
        `<path d="M36 112l5 8-5 8-5-8Zm186 26 4 7-4 7-4-7Z" fill="${p.accent}" opacity=".45"/>` +
      `</g>`;
    } else if (gold) {
      ground = `<g class="pet-coins"><path d="M34 180c16-6 32-6 48 0s32 6 48 0 32-6 48 0 30 5 44 0" fill="none" stroke="${p.accent}" stroke-opacity=".35" stroke-width="1.7" stroke-linecap="round"/>` +
        `<g opacity=".55"><circle cx="54" cy="172" r="9" fill="${p.accent}"/><rect x="50" y="168" width="8" height="8" rx="1" fill="${p.belly}"/>` +
        `<circle cx="206" cy="176" r="8" fill="${p.accent}"/><rect x="202.5" y="172.5" width="7" height="7" rx="1" fill="${p.belly}"/></g>` +
        star(64, 100, 3, '#fff', 0.55) + star(202, 82, 2.6, p.accent, 0.6) +
      `</g>`;
    } else if (wood) {
      ground = `<g class="pet-grass"><path d="M40 184c2-12 6-20 12-26m-4 26c-1-9 1-16 6-22m70 22c2-12 6-20 12-26m-4 26c-1-9 1-16 6-22m34 22c2-12 6-20 12-26m-4 26c-1-9 1-16 6-22" fill="none" stroke="${p.accent}" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>` +
        `<path d="M34 181c16-6 32-6 48 0s32 6 48 0 32-6 48 0 30 5 44 0" fill="none" stroke="${p.accent}" stroke-opacity=".25" stroke-width="1.5" stroke-linecap="round"/>` +
        `<ellipse cx="44" cy="152" rx="7" ry="3.4" fill="${p.accent}" opacity=".3" transform="rotate(-24 44 152)"/>` +
        `<ellipse cx="212" cy="126" rx="6" ry="3" fill="${p.accent}" opacity=".28" transform="rotate(28 212 126)"/>` +
      `</g>`;
    } else if (water) {
      ground = `<g class="pet-water"><ellipse cx="130" cy="184" rx="96" ry="13" fill="${p.accent}" opacity=".12"/>` +
        `<path d="M28 184c17-6 34-6 51 0s34 6 51 0 34-6 51 0 34 6 51 0" fill="none" stroke="${p.accent}" stroke-opacity=".36" stroke-width="1.8" stroke-linecap="round"/>` +
        `<path d="M54 190c14-4 28-4 42 0s28 4 42 0 28-4 42 0" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.2" stroke-linecap="round"/>` +
      `</g>`;
    } else if (mythic) {
      ground = `<g class="pet-clouds">` +
        cloud(20, 172, 1.1, p.belly, 0.5) + cloud(174, 166, 1.25, p.belly, 0.44) + cloud(82, 181, 0.8, p.belly, 0.36) +
        `<path d="M24 184c18-6 34-6 50 0s34 6 50 0 34-6 50 0 30 5 44 0" fill="none" stroke="${p.accent}" stroke-opacity=".22" stroke-width="1.6" stroke-linecap="round"/>` +
      `</g>`;
    } else {
      ground = `<g class="pet-sparks">` +
        `<path d="M34 178c16-6 32-6 48 0s32 6 48 0 32-6 48 0 30 5 44 0" fill="none" stroke="${p.accent}" stroke-opacity=".24" stroke-width="1.5" stroke-linecap="round"/>` +
        star(48, 88, 3.6, p.accent, 0.5) + star(210, 102, 4.2, p.accent, 0.42) + star(202, 52, 2.8, '#fff', 0.5) +
      `</g>`;
    }
    const bubbles = `<g class="pet-bubbles"><circle class="pet-bubble b1" cx="46" cy="100" r="3.4" fill="${p.accent}" opacity=".38"/>` +
      `<circle class="pet-bubble b2" cx="208" cy="72" r="4.4" fill="${p.accent}" opacity=".32"/>` +
      `<circle class="pet-bubble b3" cx="216" cy="126" r="2.6" fill="${p.accent}" opacity=".36"/></g>`;
    return { aura, fusion, shadow, ground, bubbles };
  }

  function otterArt(s, p, ids) {
    const outline = mix(p.ear, '#0a1c22', 0.4);
    const tail = `<path class="pet-tail" d="M94 154C72 170 42 180 26 168c-12-9-3-24 14-23 17 1 33 9 50 4Z" fill="url(#${ids.body})" stroke="${outline}" stroke-opacity=".24" stroke-width="1.6"/>` +
      rimPath('M38 156c14-2 28 3 42 5', '#fff', 2.2, 0.34);
    const body = `<ellipse cx="130" cy="146" rx="49" ry="35" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="153" rx="32" ry="23" fill="url(#${ids.belly})"/>`;
    const feet = `<ellipse cx="106" cy="181" rx="14" ry="6.5" fill="${p.ear}"/><ellipse cx="154" cy="181" rx="14" ry="6.5" fill="${p.ear}"/>` +
      `<path d="M97 181h5m-2-2 2 2-2 2m48-2h5m-2-2 2 2-2 2" stroke="${mix(p.ear, '#ffffff', 0.25)}" stroke-width="1.2" stroke-linecap="round"/>`;
    const paws = `<ellipse cx="101" cy="146" rx="10" ry="7" fill="${p.ear}" transform="rotate(-20 101 146)"/>` +
      `<ellipse cx="159" cy="146" rx="10" ry="7" fill="${p.ear}" transform="rotate(20 159 146)"/>` +
      `<path d="M96 148l-3 3m7-2-2 3m60-4 3 3m-7-2 2 3" stroke="#fff" stroke-opacity=".35" stroke-width="1.2" stroke-linecap="round"/>`;
    const head = `<ellipse cx="130" cy="92" rx="34" ry="30" fill="url(#${ids.head})"/>` +
      `<circle cx="100" cy="67" r="9.5" fill="${p.ear}"/><circle cx="160" cy="67" r="9.5" fill="${p.ear}"/>` +
      `<circle cx="100" cy="67" r="4.6" fill="${mix(p.ear, '#e8a08a', 0.55)}" opacity=".8"/><circle cx="160" cy="67" r="4.6" fill="${mix(p.ear, '#e8a08a', 0.55)}" opacity=".8"/>` +
      `<ellipse cx="130" cy="107" rx="21" ry="15" fill="url(#${ids.belly})"/>` +
      eye(116, 89, 4.8, 6, p.accent) + eye(144, 89, 4.8, 6, p.accent) +
      `<path d="M124 99h12l-6 5Z" fill="${outline}"/><path d="M130 104v2m0 0c-2.4 2.2-5.6 2.2-7.8 0m7.8 0c2.4 2.2 5.6 2.2 7.8 0" fill="none" stroke="${outline}" stroke-width="1.3" stroke-linecap="round"/>` +
      `<path d="M110 99 95 96m15 8-15 4m58-11 15-3m-15 8 15 4" stroke="#6f8584" stroke-width="1" stroke-linecap="round" opacity=".7"/>` +
      rimPath('M103 75c5-12 16-19 29-20', '#fff', 2.8, 0.42);
    const accessory = s >= 4
      ? `<g class="pet-orb"><circle cx="182" cy="52" r="20" fill="url(#${ids.glow})"/><circle cx="182" cy="52" r="7" fill="url(#${ids.orb})"/><circle cx="180" cy="50" r="2.2" fill="#fff" opacity=".9"/></g>` +
        `<path d="M104 62c6-9 17-13 26-13 9 0 20 4 26 13-9-2-17-1-26 3-9-4-17-5-26-3Z" fill="url(#${ids.accent})" opacity=".9"/>`
      : s >= 3
        ? `<path d="M106 64c3-11 12-18 24-19 12 1 21 8 24 19-8-4-16-5-24-2-8-3-16-2-24 2Z" fill="url(#${ids.accent})" opacity=".34"/>` +
          `<path d="M108 91c-8-1-13 2-16 7m16-1c-7 1-11 4-13 8m60-14c8-1 13 2 16 7m-16-1c7 1 11 4 13 8" stroke="${p.accent}" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>`
        : '';
    const pendant = s >= 2
      ? `<g class="pet-shell"><circle cx="130" cy="132" r="8.4" fill="url(#${ids.accent})" stroke="${mix(p.accent, '#6a4218', 0.4)}" stroke-width="1"/>` +
        `<path d="M130 126c5 1 7 5 5 9-2 4-7 4-9 1-2-3 0-7 4-10Z" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.1"/></g>`
      : '';
    return tail + body + feet + paws + head + accessory + pendant +
      `<ellipse cx="111" cy="80" rx="10" ry="5" fill="#fff" opacity=".16" transform="rotate(-30 111 80)"/>` +
      `<ellipse cx="118" cy="140" rx="15" ry="7" fill="#fff" opacity=".1" transform="rotate(-18 118 140)"/>`;
  }

  function foxArt(s, p, ids) {
    const outline = mix(p.ear, '#2a170d', 0.42);
    const count = s >= 4 ? 9 : s >= 3 ? 3 : 1;
    const tails = Array.from({ length: count }, (_, i) => {
      const spread = count === 1 ? 0 : (i / (count - 1) - 0.5) * (count === 3 ? 76 : 128);
      const tip = `<circle cx="211" cy="95" r="${5.5 + (i % 3) * 1.3}" fill="url(#${ids.mane})"/>` +
        `<circle cx="211" cy="95" r="${2.6 + (i % 2)}" fill="${p.accent}" opacity=".9"/>` +
        star(211, 95, s >= 4 ? 3.4 : 2.6, '#fff', 0.8);
      return `<g transform="rotate(${spread} 150 151)">` +
        `<path class="pet-tail" d="M150 151c35-6 57-30 61-61-13 17-31 29-56 34-8 2-10 16-5 27Z" fill="url(#${ids.mane})" stroke="${outline}" stroke-opacity=".16" stroke-width="1.4"/>` +
        `<path d="M165 143c17-9 28-24 34-40" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2.2" stroke-linecap="round"/>` +
        tip +
      `</g>`;
    }).join('');
    const body = `<ellipse cx="128" cy="146" rx="45" ry="32" fill="url(#${ids.body})"/>` +
      `<ellipse cx="128" cy="152" rx="28" ry="21" fill="url(#${ids.belly})"/>`;
    const legs = `<path d="M104 164c-2 8-2 14 0 18m48-18c2 6 2 12 0 18" stroke="${p.ear}" stroke-width="9" stroke-linecap="round"/>` +
      `<ellipse cx="103" cy="183" rx="9" ry="4.6" fill="${p.ear}"/><ellipse cx="153" cy="183" rx="9" ry="4.6" fill="${p.ear}"/>`;
    const head = `<path d="M99 92c0-20 13-34 31-34s31 14 31 34c0 18-13 31-31 31S99 110 99 92Z" fill="url(#${ids.head})"/>` +
      `<path d="M101 70 93 28l33 17Z" fill="url(#${ids.body})"/><path d="M159 70l8-42-33 17Z" fill="url(#${ids.body})"/>` +
      `<path d="M100 63 96 40l19 11Z" fill="#d9947d" opacity=".7"/><path d="M160 63l4-23-19 11Z" fill="#d9947d" opacity=".7"/>` +
      `<path d="M118 96c4-5 20-5 24 0-4 9-7 14-12 14s-8-5-12-14Z" fill="url(#${ids.belly})"/>` +
      `<path d="M126 104h8l-4 4Z" fill="${outline}"/><path d="M130 108v2m0 0c-2.2 2.2-5.4 2.2-7.4 0m7.4 0c2.2 2.2 5.4 2.2 7.4 0" fill="none" stroke="${outline}" stroke-width="1.3" stroke-linecap="round"/>` +
      almondEye(114, 88, 8.5, 4.4, p.accent, -6) + almondEye(146, 88, 8.5, 4.4, p.accent, 6) +
      `<path d="M110 99 96 96m14 7-14 4m58-10 14-3m-14 7 14 4" stroke="#7a5a4a" stroke-width="1" stroke-linecap="round" opacity=".65"/>` +
      rimPath('M104 74c4-11 13-18 25-19', '#fff', 2.6, 0.4);
    const forehead = s >= 3
      ? `<circle cx="130" cy="64" r="7" fill="none" stroke="${p.accent}" stroke-width="1.6" opacity=".85"/><path d="M126 64a4 4 0 1 0 8 0 4 4 0 1 0-8 0" fill="${p.accent}" opacity=".42"/>`
      : s >= 2
        ? star(130, 64, 4.4, p.accent, 0.9)
        : '';
    const chest = s >= 2
      ? `<path d="M108 132c8-4 14-4 22 0m22 0c-8-4-14-4-22 0" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>`
      : '';
    const crown = s >= 4
      ? `<g class="pet-crown"><path d="M108 58c7-7 15-9 22-9 7 0 15 2 22 9" fill="none" stroke="#f0c987" stroke-width="2.6" stroke-linecap="round"/>` +
        `<path d="M116 55l-2-8m14 6V45m14 10 2-8" stroke="#f6d99a" stroke-width="2.2" stroke-linecap="round"/></g>`
      : '';
    const moon = s >= 4
      ? `<circle cx="130" cy="24" r="17" fill="none" stroke="${p.accent}" stroke-width="1.2" opacity=".4"/><circle cx="130" cy="24" r="11" fill="url(#${ids.glow})" opacity=".6"/>`
      : '';
    return tails + body + legs + head + forehead + chest + crown + moon +
      `<ellipse cx="112" cy="76" rx="11" ry="5" fill="#fff" opacity=".14" transform="rotate(-28 112 76)"/>`;
  }

  function whaleArt(s, p, ids) {
    const outline = mix(p.ear, '#0b2233', 0.4);
    const tail = `<path class="pet-tail" d="M184 132c20-2 36-12 45-28 2 16-4 30-18 38 12 3 22 11 27 22-19-1-34-8-46-20Z" fill="url(#${ids.body})" stroke="${outline}" stroke-opacity=".18" stroke-width="1.4"/>` +
      `<path d="M198 122c12-4 21-12 27-22" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2" stroke-linecap="round"/>`;
    const body = `<path d="M70 142c-12-24 6-48 42-54 38-6 72 8 82 34 8 22-10 40-46 43-34 3-66-3-78-23Z" fill="url(#${ids.body})"/>` +
      `<path d="M84 152c14-9 34-12 54-10 18 2 34 7 46 15-14 11-36 16-58 14-18-1-32-7-42-19Z" fill="url(#${ids.belly})"/>` +
      `<path d="M100 156c12-4 24-5 36-3m-42 6c10-2 19-2 28 0" fill="none" stroke="${mix(p.ear, '#ffffff', 0.35)}" stroke-opacity=".5" stroke-width="1.3" stroke-linecap="round"/>`;
    const fin = `<path d="M118 158c-9 10-14 19-12 27 9-4 17-12 24-23Z" fill="${p.ear}"/>` +
      `<path d="M119 161c-5 7-8 13-8 18" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round"/>`;
    const head = `<ellipse cx="100" cy="124" rx="32" ry="28" fill="url(#${ids.head})"/>` +
      `<ellipse cx="94" cy="140" rx="19" ry="11" fill="url(#${ids.belly})"/>` +
      eye(102, 118, 5.4, 6.4, p.accent) + eye(126, 118, 4.8, 5.8, p.accent) +
      `<path d="M82 140c8 6 19 7 28 2" fill="none" stroke="${outline}" stroke-width="1.7" stroke-linecap="round"/>` +
      `<path d="M88 130c-6 1-10 4-13 8m13-3c-5 1-8 4-10 7" stroke="${p.accent}" stroke-width="1.1" stroke-linecap="round" opacity=".6"/>` +
      rimPath('M78 108c5-9 14-14 25-16', '#fff', 2.6, 0.42);
    const blow = s >= 2
      ? `<g class="pet-spout"><path d="M140 94c-3-12 0-21 6-27m-6 27c-2-9-6-15-12-19m12 19c4-7 9-11 15-12" fill="none" stroke="${p.accent}" stroke-width="2.8" stroke-linecap="round" opacity=".8"/>` +
        `<ellipse cx="147" cy="63" rx="2.6" ry="4" fill="${mix(p.accent, '#ffffff', 0.32)}" opacity=".75" transform="rotate(24 147 63)"/>` +
        `<ellipse cx="125" cy="72" rx="2" ry="3.2" fill="${mix(p.accent, '#ffffff', 0.32)}" opacity=".65" transform="rotate(-22 125 72)"/>` +
        `<circle cx="141" cy="55" r="1.6" fill="${p.accent}" opacity=".5"/></g>`
      : `<path d="M140 94c-2-6 0-10 3-13" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`;
    const marks = s >= 3
      ? `<g class="pet-stars">` +
        `<path d="M112 106c12-10 30-14 48-10 10 2 18 7 24 13" fill="none" stroke="${p.accent}" stroke-width="1.1" stroke-dasharray="2 5" opacity=".55"/>` +
        star(128, 100, 2.4, '#fff', 0.75) + star(158, 96, 1.8, '#fff', 0.6) + star(176, 108, 2.6, p.accent, 0.7) +
      `</g>`
      : '';
    const crown = s >= 4
      ? `<g class="pet-aura"><circle cx="130" cy="78" r="55" fill="none" stroke="${p.accent}" stroke-width="1.2" stroke-dasharray="3 8" opacity=".5"/>` +
        `<path d="M104 56c7-7 16-10 26-10s19 3 26 10" fill="none" stroke="#f0c987" stroke-width="1.8" stroke-linecap="round" opacity=".55"/></g>` +
        star(112, 40, 3, '#fff', 0.7) + star(150, 34, 2.4, '#fff', 0.6)
      : '';
    return tail + body + fin + head + blow + marks + crown +
      `<ellipse cx="112" cy="108" rx="18" ry="7" fill="#fff" opacity=".13" transform="rotate(-18 112 108)"/>`;
  }

  function birdArt(s, p, ids) {
    const outline = mix(p.ear, '#3a140d', 0.4);
    const tailCount = s >= 3 ? 3 : 2;
    const tails = Array.from({ length: tailCount }, (_, i) => {
      const x = 116 + i * (s >= 3 ? 14 : 18);
      return `<path class="pet-tail" d="M${x} 166c-8 14-10 24-7 34 8-7 13-17 15-29Z" fill="url(#${ids.accent})" opacity="${0.9 - i * 0.08}"/>` +
        `<path d="M${x + 2} 172c-4 8-5 15-4 22" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.4" stroke-linecap="round"/>`;
    }).join('');
    const wings = `<path d="M104 130C82 122 63 102 56 76c20 8 38 23 52 43Z" fill="url(#${ids.mane})" stroke="${outline}" stroke-opacity=".16" stroke-width="1.2"/>` +
      `<path d="M156 130c22-8 41-28 48-54-20 8-38 23-52 43Z" fill="url(#${ids.mane})" stroke="${outline}" stroke-opacity=".16" stroke-width="1.2"/>` +
      `<path d="M72 92c10 9 19 20 26 31m-12-37c9 8 17 17 23 27m72-21c-10 9-19 20-26 31m12-37c-9 8-17 17-23 27" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.5" stroke-linecap="round"/>`;
    const body = `<ellipse cx="130" cy="142" rx="34" ry="38" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="150" rx="21" ry="24" fill="url(#${ids.belly})"/>`;
    const feet = `<path d="M118 176v8m-5 0h10m-8 3 3-3 3 3m12-11v8m-5 0h10m-8 3 3-3 3 3" stroke="${p.ear}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
    const head = `<circle cx="130" cy="88" r="29" fill="url(#${ids.head})"/>` +
      `<path d="M122 100h16l-8 12Z" fill="url(#${ids.accent})"/>` +
      eye(118, 84, 4.6, 5.8, p.accent) + eye(142, 84, 4.6, 5.8, p.accent) +
      `<path d="M104 94c-8 0-13 3-16 7m16-1c-6 1-10 4-12 7m54-13c8 0 13 3 16 7m-16-1c6 1 10 4 12 7" stroke="${p.accent}" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>` +
      rimPath('M108 72c5-9 13-14 22-15', '#fff', 2.4, 0.42);
    const crest = s >= 2
      ? `<path d="M122 60c-2-10 2-17 9-21-1 9 2 15 7 19m-2 0c3-8 8-12 14-12-4 7-4 13-2 18" fill="url(#${ids.accent})" opacity=".92"/>`
      : '';
    const flames = s >= 3
      ? `<path d="M98 140c-11-8-17-19-18-32 9 5 16 12 21 21Zm64 0c11-8 17-19 18-32-9 5-16 12-21 21Z" fill="${p.accent}" opacity=".35"/>`
      : '';
    const halo = s >= 4
      ? `<g class="pet-aura"><circle cx="130" cy="78" r="47" fill="none" stroke="${p.accent}" stroke-width="1.4" stroke-dasharray="3 7" opacity=".6"/>` +
        `<circle cx="130" cy="78" r="40" fill="url(#${ids.glow})" opacity=".55"/></g>` +
        `<path d="M92 62c8-18 22-29 38-34 16 5 30 16 38 34-14-8-27-11-38-7-11-4-24-1-38 7Z" fill="url(#${ids.accent})" opacity=".55"/>`
      : '';
    return tails + wings + body + feet + head + crest + flames + halo +
      `<ellipse cx="113" cy="75" rx="9" ry="4.4" fill="#fff" opacity=".18" transform="rotate(-28 113 75)"/>`;
  }

  function baizeArt(s, p, ids) {
    const outline = mix(p.ear, '#4a412c', 0.42);
    const maneCount = s >= 4 ? 21 : s >= 3 ? 18 : 15;
    const mane = Array.from({ length: maneCount }, (_, i) => {
      const angle = Math.PI * 0.86 + (i / (maneCount - 1)) * Math.PI * 1.28;
      const cx = 130 + Math.cos(angle) * 46;
      const cy = 94 + Math.sin(angle) * 39;
      const rot = (angle * 180) / Math.PI + 90;
      return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${9 + (i % 3)}" ry="${15 + (i % 4) * 1.4}" transform="rotate(${rot.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})" fill="url(#${ids.mane})" stroke="${outline}" stroke-opacity=".1" stroke-width="1"/>`;
    }).join('');
    const tail = `<path class="pet-tail" d="M84 148c-28 8-46-3-52-24 16 8 30 10 43 4 8-4 13 2 13 9Z" fill="url(#${ids.body})"/>` +
      cloud(24, 112, 0.8, p.belly, 0.55) + cloud(42, 140, 0.55, p.belly, 0.42);
    const body = `<ellipse cx="130" cy="150" rx="54" ry="36" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="156" rx="38" ry="25" fill="url(#${ids.belly})"/>`;
    const legs = `<path d="M100 166l-2 16m62-16 2 16" stroke="${p.ear}" stroke-width="10" stroke-linecap="round"/>` +
      `<path d="M92 166l-1 15m78-15 1 15" stroke="${mix(p.ear, p.body, 0.4)}" stroke-width="8" stroke-linecap="round" opacity=".65"/>` +
      hoof(97, 181, p.accent, 13) + hoof(163, 181, p.accent, 13) +
      hoof(91, 181, mix(p.accent, p.ear, 0.3), 10) + hoof(169, 181, mix(p.accent, p.ear, 0.3), 10);
    const head = `<ellipse cx="130" cy="91" rx="32" ry="33" fill="url(#${ids.head})"/>` +
      `<ellipse cx="130" cy="107" rx="21" ry="15" fill="url(#${ids.belly})"/>` +
      eye(115, 87, 5, 6.2, p.accent) + eye(145, 87, 5, 6.2, p.accent) +
      `<ellipse cx="130" cy="101" rx="5.4" ry="3.5" fill="${outline}"/><ellipse cx="128" cy="100.4" rx="1.5" ry="1" fill="#fff" opacity=".35"/>` +
      `<path d="M130 105v2m0 0c-2.3 2.2-5.5 2.2-7.7 0m7.7 0c2.3 2.2 5.5 2.2 7.7 0" fill="none" stroke="${outline}" stroke-width="1.3" stroke-linecap="round"/>` +
      `<path d="M130 121c-2.5 4-2.5 7 0 10 2.5-3 2.5-6 0-10Z" fill="url(#${ids.belly})" stroke="${outline}" stroke-opacity=".18" stroke-width="1"/>` +
      `<path d="M109 99 94 96m15 8-15 4m59-11 15-3m-15 8 15 4" stroke="#827a68" stroke-width="1.1" stroke-linecap="round" opacity=".62"/>` +
      rimPath('M103 73c5-11 15-18 27-19', '#fff', 2.6, 0.4);
    const horns = s >= 4
      ? `<path d="M112 66C98 52 96 34 104 18c0 13 6 24 17 33M148 66c14-14 16-32 8-48 0 13-6 24-17 33" fill="url(#${ids.accent})" stroke="${mix(p.accent, '#6a4a1c', 0.4)}" stroke-width="1"/>` +
        `<path d="M104 18c-8 2-14 0-18-6m18 6c-1-8 3-14 9-18m43 18c8 2 14 0 18-6m-18 6c1-8-3-14-9-18" fill="none" stroke="${p.accent}" stroke-width="2.4" stroke-linecap="round"/>`
      : s >= 2
        ? `<path d="M112 66C102 54 101 42 106 30c1 10 5 18 13 25M148 66c10-12 11-24 6-36-1 10-5 18-13 25" fill="url(#${ids.accent})" stroke="${mix(p.accent, '#6a4a1c', 0.4)}" stroke-width="1"/>`
        : `<path d="M116 64c-5-7-6-13-3-19 1 6 4 11 9 15m28 4c5-7 6-13 3-19-1 6-4 11-9 15" fill="${p.accent}" opacity=".8"/>`;
    const thirdEye = s >= 3
      ? `<ellipse cx="130" cy="63" rx="4.4" ry="7" fill="url(#${ids.accent})" stroke="${mix(p.accent, '#6a4a1c', 0.35)}" stroke-width="1"/>` +
        `<ellipse cx="130" cy="63" rx="1.5" ry="4.4" fill="#203d43"/><circle cx="131" cy="60" r="1" fill="#fff" opacity=".9"/>`
      : s >= 2
        ? `<path d="M126 64c2-3 6-3 8 0" fill="none" stroke="${p.accent}" stroke-width="1.8" stroke-linecap="round"/>`
        : `<path d="M127 64h6" stroke="${p.accent}" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>`;
    const clouds = `<path d="M104 138c8-5 16-6 24-2m26 2c-8-5-16-6-24-2" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2.2" stroke-linecap="round"/>` +
      `<path d="M110 158c6-4 12-4 18 0m28 0c-6-4-12-4-18 0" fill="none" stroke="${p.accent}" stroke-opacity=".3" stroke-width="1.4" stroke-linecap="round"/>` +
      cloud(86, 116, 0.6, p.belly, 0.35) + cloud(164, 120, 0.5, p.belly, 0.3);
    const halo = s >= 4
      ? `<circle cx="130" cy="58" r="49" fill="none" stroke="${p.accent}" stroke-width="1.2" stroke-dasharray="3 8" opacity=".5"/>` +
        `<circle cx="130" cy="58" r="43" fill="url(#${ids.glow})" opacity=".45"/>`
      : '';
    return mane + tail + body + legs + head + horns + thirdEye + clouds + halo +
      `<ellipse cx="112" cy="76" rx="11" ry="5" fill="#fff" opacity=".16" transform="rotate(-28 112 76)"/>`;
  }

  function qilinArt(s, p, ids) {
    const outline = mix(p.ear, '#17362a', 0.42);
    const maneCount = 8;
    const mane = Array.from({ length: maneCount }, (_, i) => {
      const angle = Math.PI * 0.12 + (i / (maneCount - 1)) * Math.PI * 0.76;
      const x = 130 + Math.cos(angle) * 35;
      const y = 98 + Math.sin(angle) * 25;
      const len = 17 + (i % 3) * 5;
      return `<path d="M${x.toFixed(1)} ${y.toFixed(1)}c${(Math.cos(angle) * len * 0.55).toFixed(1)} ${(Math.sin(angle) * len * 0.55).toFixed(1)} ${(Math.cos(angle) * len).toFixed(1)} ${(Math.sin(angle) * len).toFixed(1)} ${(Math.cos(angle) * len * 1.35).toFixed(1)} ${(Math.sin(angle) * len * 1.1).toFixed(1)}" fill="none" stroke="url(#${ids.accent})" stroke-width="9" stroke-linecap="round" opacity=".8"/>`;
    }).join('');
    const tail = `<path class="pet-tail" d="M84 150C56 154 40 138 42 114c10 14 23 20 40 20 5 0 7 9 2 16Z" fill="url(#${ids.accent})" opacity=".9"/>` +
      `<path d="M48 118c-4-10 1-17 8-22-1 9 2 15 6 20Z" fill="${mix(p.accent, '#ffffff', 0.25)}" opacity=".8"/>`;
    const body = `<ellipse cx="130" cy="148" rx="52" ry="35" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="155" rx="35" ry="23" fill="url(#${ids.belly})"/>`;
    const scales = Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 5 }, (_, col) =>
        scaleArc(104 + col * 13 + (row % 2) * 6, 137 + row * 7, 12, mix(p.ear, '#123326', 0.35), 0.3)
      ).join('')
    ).join('');
    const legs = `<path d="M104 164l-4 17m56-17 4 17" stroke="${p.ear}" stroke-width="10" stroke-linecap="round"/>` +
      `<path d="M94 164l-2 16m74-16 2 16" stroke="${mix(p.ear, p.body, 0.4)}" stroke-width="8" stroke-linecap="round" opacity=".6"/>` +
      hoof(100, 181, p.accent, 13) + hoof(160, 181, p.accent, 13) +
      hoof(92, 181, mix(p.accent, p.ear, 0.3), 10) + hoof(168, 181, mix(p.accent, p.ear, 0.3), 10);
    const head = `<circle cx="130" cy="88" r="32" fill="url(#${ids.head})"/>` +
      `<path d="M112 101c6 9 30 9 36 0 1 10-7 16-18 16s-19-6-18-16Z" fill="url(#${ids.belly})"/>` +
      eye(115, 84, 4.8, 6, p.accent) + eye(145, 84, 4.8, 6, p.accent) +
      `<ellipse cx="124" cy="103" rx="1.7" ry="1.2" fill="${outline}"/><ellipse cx="136" cy="103" rx="1.7" ry="1.2" fill="${outline}"/>` +
      `<path d="M130 104v3m0 0c-2.5 2.4-5.8 2.4-8 0m8 0c2.5 2.4 5.8 2.4 8 0" fill="none" stroke="${outline}" stroke-width="1.3" stroke-linecap="round"/>` +
      `<path d="M129 118c-2 4-2 7 1 10 3-3 3-6 1-10Z" fill="url(#${ids.belly})" stroke="${outline}" stroke-opacity=".2" stroke-width="1"/>` +
      `<path d="M109 92c-10 3-18 3-26 0m26 6c-9 4-16 6-23 5m65-11c10 3 18 3 26 0m-26 6c9 4 16 6 23 5" stroke="#6f8b79" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>` +
      rimPath('M105 70c5-10 14-16 25-17', '#fff', 2.5, 0.4);
    const antlers = s >= 4
      ? `<path d="M113 64C101 48 101 30 110 16c0 13 7 23 17 31m20 17c12-16 12-34 3-48 0 13-7 23-17 31" fill="none" stroke="url(#${ids.accent})" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M110 16c-8 1-14-2-17-9m17 9c-2-8 1-14 7-18m33 18c8 1 14-2 17-9m-17 9c2-8-1-14-7-18" fill="none" stroke="${p.accent}" stroke-width="2.4" stroke-linecap="round"/>`
      : s >= 2
        ? `<path d="M114 64C105 51 105 37 112 26c1 11 6 20 14 26m20 12c9-13 9-27 2-38-1 11-6 20-14 26" fill="none" stroke="url(#${ids.accent})" stroke-width="4.4" stroke-linecap="round"/>`
        : `<path d="M117 62c-5-7-5-14-1-20 0 6 3 11 8 15m28 5c5-7 5-14 1-20 0 6-3 11-8 15" fill="none" stroke="${p.accent}" stroke-width="3.2" stroke-linecap="round"/>`;
    const horn = s >= 3
      ? `<path d="M127 58c-2-9 0-15 4-19-1 7 1 12 4 15Z" fill="url(#${ids.accent})"/>`
      : '';
    const halo = s >= 4
      ? `<circle cx="130" cy="52" r="45" fill="none" stroke="${p.accent}" stroke-width="1.2" stroke-dasharray="3 8" opacity=".55"/>` +
        `<circle cx="130" cy="52" r="38" fill="url(#${ids.glow})" opacity=".45"/>`
      : '';
    const fires = s >= 3
      ? `<path d="M96 138c-12-8-19-19-20-33 10 5 18 13 23 23Zm68 0c12-8 19-19 20-33-10 5-18 13-23 23Z" fill="${p.accent}" opacity=".3"/>`
      : '';
    return mane + tail + body + scales + legs + head + antlers + horn + fires + halo +
      `<ellipse cx="113" cy="73" rx="10" ry="4.6" fill="#fff" opacity=".16" transform="rotate(-28 113 73)"/>`;
  }

  function zhulongArt(s, p, ids) {
    const outline = mix(p.ear, '#3a0e08', 0.42);
    const coil = `<path class="pet-tail" d="M118 132C92 154 54 150 38 124c-14-24 6-46 32-40 22 5 24 32 6 42" fill="none" stroke="url(#${ids.body})" stroke-width="30" stroke-linecap="round" stroke-opacity=".98"/>` +
      `<path d="M118 132C92 154 54 150 38 124" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M60 92c11-4 20-1 27 7M53 112c12-2 22 2 28 10M68 134c10 1 19 6 24 14" fill="none" stroke="${mix(p.ear, '#000000', 0.18)}" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>` +
      `<path d="M46 84c-7-6-9-13-6-20 5 4 9 7 14 8Z" fill="url(#${ids.accent})"/>` +
      `<path d="M52 78c-4-6-4-11-1-15 3 4 6 6 10 7Z" fill="${mix(p.accent, '#ffffff', 0.3)}" opacity=".8"/>`;
    const body = `<ellipse cx="130" cy="146" rx="44" ry="33" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="153" rx="29" ry="21" fill="url(#${ids.belly})"/>`;
    const claws = `<path d="M104 168l-12 11m46-11 12 11" stroke="${p.ear}" stroke-width="8" stroke-linecap="round"/>` +
      `<path d="M90 179l-1 5m5-6 1 5m62-4-1 5m-3-6-1 5" stroke="${p.accent}" stroke-width="1.6" stroke-linecap="round"/>`;
    const scales = Array.from({ length: 3 }, (_, row) =>
      Array.from({ length: 4 }, (_, col) =>
        scaleArc(106 + col * 15 + (row % 2) * 7, 137 + row * 8, 13, mix(p.ear, '#260703', 0.35), 0.3)
      ).join('')
    ).join('');
    const head = `<path d="M101 89c0-18 13-31 29-31s29 13 29 31c0 8-3 15-9 20l-4 12h-32l-4-12c-6-5-9-12-9-20Z" fill="url(#${ids.head})"/>` +
      `<ellipse cx="130" cy="108" rx="19" ry="14" fill="url(#${ids.belly})"/>` +
      eye(116, 84, 4.8, 6, p.accent, { iris: p.accent }) + eye(144, 84, 4.8, 6, p.accent, { iris: p.accent }) +
      `<ellipse cx="123" cy="105" rx="1.8" ry="1.2" fill="${outline}"/><ellipse cx="137" cy="105" rx="1.8" ry="1.2" fill="${outline}"/>` +
      `<path d="M130 107v3m0 0c-2.6 2.5-6 2.5-8.2 0m8.2 0c2.6 2.5 6 2.5 8.2 0" fill="none" stroke="${outline}" stroke-width="1.3" stroke-linecap="round"/>` +
      `<path d="M124 110l-2 6 4-4m8-2 2 6-4-4" fill="#fff" stroke="${outline}" stroke-opacity=".2" stroke-width="1"/>` +
      `<path d="M108 94c-12 2-20 8-25 17m25-11c-11 3-18 9-22 17m70-23c12 2 20 8 25 17m-25-11c11 3 18 9 22 17" fill="none" stroke="${p.accent}" stroke-width="1.4" stroke-linecap="round" opacity=".72"/>` +
      rimPath('M106 70c5-10 14-16 25-17', '#fff', 2.5, 0.4);
    const horns = s >= 3
      ? `<path d="M117 62C108 46 94 34 78 30c9 10 14 21 16 33m49-1c9-16 23-28 39-32-9 10-14 21-16 33" fill="none" stroke="url(#${ids.accent})" stroke-width="7" stroke-linecap="round"/>` +
        `<path d="M78 30c-2-7-7-11-13-12m13 12c1-7-2-13-7-17m141 17c2-7 7-11 13-12m-13 12c-1-7 2-13 7-17" fill="none" stroke="${p.accent}" stroke-width="2.4" stroke-linecap="round"/>`
      : s >= 2
        ? `<path d="M118 62C110 49 98 40 84 38c7 8 11 16 13 25m47-1c8-13 20-22 34-24-7 8-11 16-13 25" fill="none" stroke="url(#${ids.accent})" stroke-width="5.2" stroke-linecap="round"/>`
        : `<path d="M119 64c-6-7-13-11-21-12 5 5 8 10 9 16m32-4c6-7 13-11 21-12-5 5-8 10-9 16" fill="none" stroke="${p.accent}" stroke-width="3.4" stroke-linecap="round"/>`;
    const maneCount = 7;
    const mane = Array.from({ length: maneCount }, (_, i) => {
      const angle = Math.PI * 0.16 + (i / (maneCount - 1)) * Math.PI * 0.68;
      const x = 130 + Math.cos(angle) * 33;
      const y = 96 + Math.sin(angle) * 23;
      const len = 15 + (i % 3) * 5;
      return `<path d="M${x.toFixed(1)} ${y.toFixed(1)}c${(Math.cos(angle) * len * 0.6).toFixed(1)} ${(Math.sin(angle) * len * 0.6).toFixed(1)} ${(Math.cos(angle) * len).toFixed(1)} ${(Math.sin(angle) * len).toFixed(1)} ${(Math.cos(angle) * len * 1.3).toFixed(1)} ${(Math.sin(angle) * len * 1.05).toFixed(1)}" fill="none" stroke="url(#${ids.accent})" stroke-width="8" stroke-linecap="round" opacity=".62"/>`;
    }).join('');
    const orb = s >= 2
      ? `<g class="pet-orb"><circle cx="182" cy="52" r="${s >= 4 ? 26 : 19}" fill="url(#${ids.glow})"/>` +
        `<circle cx="182" cy="52" r="${s >= 4 ? 10 : 7}" fill="url(#${ids.orb})" filter="url(#${ids.glowf})"/>` +
        `<circle cx="179" cy="49" r="2.4" fill="#fff" opacity=".9"/>` +
        (s >= 4 ? `<path d="M182 26v-8m0 66v-8m-24-25h-8m66 0h-8m-45-17-6-6m51 51 6 6m-51 0 6-6m39-39 6-6" stroke="${p.accent}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>` : '') +
      `</g>`
      : '';
    const crown = s >= 4
      ? `<g class="pet-crown"><path d="M108 56c6-7 14-10 22-10s16 3 22 10" fill="none" stroke="#f0c987" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M118 52l-3-9m15 7V40m15 12 3-9" stroke="#f6d99a" stroke-width="2" stroke-linecap="round"/></g>`
      : '';
    return coil + mane + body + scales + claws + head + horns + orb + crown +
      `<ellipse cx="115" cy="73" rx="9" ry="4.2" fill="#fff" opacity=".16" transform="rotate(-28 115 73)"/>`;
  }

  function xuanwuArt(s, p, ids) {
    const outline = mix(p.ear, '#0c2422', 0.42);
    const shellDark = mix(p.ear, '#123a36', 0.32);
    const scutes = `<path d="M130 120l16 9v19l-16 9-16-9v-19Z" fill="none" stroke="${shellDark}" stroke-width="1.5" opacity=".55"/>` +
      `<path d="M98 130l13 8v16l-13 8-13-8v-16Zm64 0 13 8v16l-13 8-13-8v-16Z" fill="none" stroke="${shellDark}" stroke-width="1.4" opacity=".45"/>` +
      `<path d="M113 157l13 8v14l-13 8-13-8v-14Zm34 0 13 8v14l-13 8-13-8v-14Z" fill="none" stroke="${shellDark}" stroke-width="1.3" opacity=".4"/>` +
      scaleArc(130, 132, 34, shellDark, 0.35) + scaleArc(130, 151, 42, shellDark, 0.28);
    const legs = `<path d="M96 166c-12 3-19 11-16 18 9 3 19-3 26-11Z" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M164 166c12 3 19 11 16 18-9 3-19-3-26-11Z" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M86 174c-10 2-16 8-14 14 8 2 16-2 22-8Z" fill="url(#${ids.body})" opacity=".8"/>` +
      `<path d="M174 174c10 2 16 8 14 14-8 2-16-2-22-8Z" fill="url(#${ids.body})" opacity=".8"/>` +
      `<path d="M89 184l-2 4m15-7 1 4m58-4 2 4m-16-4-1 4" stroke="${p.accent}" stroke-width="1.5" stroke-linecap="round"/>`;
    const tail = `<path class="pet-tail" d="M188 156c12 3 18 10 16 17-4 2-9 0-13-4Z" fill="url(#${ids.body})" opacity=".85"/>`;
    const shell = `<ellipse cx="130" cy="147" rx="67" ry="44" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="152" rx="60" ry="37" fill="none" stroke="${mix(p.belly, p.ear, 0.22)}" stroke-width="7" opacity=".55"/>` +
      `<ellipse cx="130" cy="140" rx="50" ry="30" fill="url(#${ids.belly})" opacity=".22"/>` +
      scutes +
      rimPath('M74 132c8-16 26-26 47-28', '#fff', 3, 0.3);
    const neck = `<path d="M116 128v-22h28v22Z" fill="url(#${ids.body})"/>`;
    const head = `<ellipse cx="130" cy="98" rx="25" ry="23" fill="url(#${ids.head})"/>` +
      `<ellipse cx="130" cy="109" rx="16" ry="9" fill="url(#${ids.belly})" opacity=".9"/>` +
      eye(120, 95, 4.6, 5.8, p.accent) + eye(140, 95, 4.6, 5.8, p.accent) +
      `<ellipse cx="124" cy="108" rx="1.5" ry="1" fill="${outline}"/><ellipse cx="136" cy="108" rx="1.5" ry="1" fill="${outline}"/>` +
      `<path d="M130 109v2m0 0c-2.2 2.2-5.4 2.2-7.6 0m7.6 0c2.2 2.2 5.4 2.2 7.6 0" fill="none" stroke="${outline}" stroke-width="1.2" stroke-linecap="round"/>` +
      `<path d="M112 99c-8 1-14 0-19-3m19 8c-7 3-13 4-18 3m56-8c8 1 14 0 19-3m-19 8c7 3 13 4 18 3" stroke="${p.accent}" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>` +
      rimPath('M113 85c4-8 11-13 20-14', '#fff', 2.2, 0.35);
    const snake = s >= 2
      ? `<g class="pet-snake"><path class="pet-tail" d="M178 148c26-3 34-25 23-43-8-14-4-25 9-31" fill="none" stroke="${outline}" stroke-width="12" stroke-linecap="round"/>` +
        `<path d="M178 148c26-3 34-25 23-43-8-14-4-25 9-31" fill="none" stroke="url(#${ids.body})" stroke-width="8" stroke-linecap="round"/>` +
        `<path d="M178 148c26-3 34-25 23-43" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2.4" stroke-linecap="round"/>` +
        `<circle cx="211" cy="73" r="10" fill="url(#${ids.head})" stroke="${outline}" stroke-width="1"/>` +
        `<circle cx="208" cy="71" r="1.8" fill="#fff"/><circle cx="215" cy="75" r="1.6" fill="#fff"/>` +
        `<path d="M219 78l7 2m-7 1 6 4" stroke="${p.accent}" stroke-width="1.3" stroke-linecap="round"/></g>`
      : '';
    const crest = s >= 3
      ? `<path d="M111 80c-5-7-6-14-2-20 1 7 5 12 11 16m31 4c5-7 6-14 2-20-1 7-5 12-11 16" fill="none" stroke="url(#${ids.accent})" stroke-width="4" stroke-linecap="round"/>`
      : '';
    const horns = s >= 4
      ? `<path d="M116 79c-8-6-12-14-11-23 5 8 11 13 19 16m26 7c8-6 12-14 11-23-5 8-11 13-19 16" fill="none" stroke="${p.accent}" stroke-width="3.4" stroke-linecap="round"/>` +
        `<circle cx="130" cy="52" r="2.6" fill="${p.accent}" opacity=".85"/>`
      : '';
    return legs + tail + snake + shell + neck + head + crest + horns;
  }

  function fuzhuArt(s, p, ids) {
    const outline = mix(p.ear, '#315b6b', 0.42);
    const legs = [104, 122, 140, 158].map((x) => {
      const drift = x < 130 ? -2 : 2;
      return `<path d="M${x} 164l${drift} 21" stroke="${mix(p.ear, p.body, 0.15)}" stroke-width="5.5" stroke-linecap="round"/>` +
        hoof(x + drift, 186, p.accent, 8);
    }).join('');
    const tail = `<path class="pet-tail" d="M88 146c-12 2-18 9-17 17 6 2 13-1 19-7Z" fill="url(#${ids.belly})" stroke="${outline}" stroke-width="1" opacity=".9"/>` +
      cloud(70, 130, 0.42, p.belly, 0.42);
    const body = `<ellipse cx="130" cy="151" rx="47" ry="30" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="157" rx="32" ry="20" fill="url(#${ids.belly})" opacity=".85"/>`;
    const neck = `<path d="M112 141c-1-22 4-36 18-42 14 6 19 20 18 42Z" fill="url(#${ids.body})"/>` +
      `<path d="M122 142c0-18 3-29 8-34 5 5 8 16 8 34Z" fill="url(#${ids.belly})" opacity=".5"/>`;
    const ears = `<ellipse cx="105" cy="70" rx="8" ry="17" transform="rotate(-37 105 70)" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
      `<ellipse cx="105" cy="70" rx="3.6" ry="11" transform="rotate(-37 105 70)" fill="url(#${ids.belly})" opacity=".8"/>` +
      `<ellipse cx="155" cy="70" rx="8" ry="17" transform="rotate(37 155 70)" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
      `<ellipse cx="155" cy="70" rx="3.6" ry="11" transform="rotate(37 155 70)" fill="url(#${ids.belly})" opacity=".8"/>`;
    const head = `<ellipse cx="130" cy="89" rx="27" ry="25" fill="url(#${ids.head})"/>` +
      `<ellipse cx="130" cy="103" rx="16" ry="11" fill="url(#${ids.belly})"/>` +
      eye(118, 85, 4.6, 5.8, p.accent) + eye(142, 85, 4.6, 5.8, p.accent) +
      `<ellipse cx="130" cy="101" rx="4" ry="2.6" fill="${mix(p.ear, '#24434f', 0.3)}"/>` +
      `<path d="M130 104v2m0 0c-2 2-5 2-7 0m7 0c2 2 5 2 7 0" fill="none" stroke="${outline}" stroke-width="1.2" stroke-linecap="round"/>` +
      `<path d="M112 98c-7 2-12 2-17 1m17 5c-6 2-11 2-15 1m53-7c7 2 12 2 17 1m-17 5c6 2 11 2 15 1" stroke="${p.accent}" stroke-width="1.1" stroke-linecap="round" opacity=".5"/>` +
      rimPath('M114 76c4-7 11-11 19-12', '#fff', 2.2, 0.36);
    const antlers = `<path d="M118 67C106 52 102 34 108 17m0 0c-5 0-9-3-11-7m11 7c4-2 7-6 8-11" fill="none" stroke="url(#${ids.accent})" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M142 67c12-15 16-33 10-50m0 0c5 0 9-3 11-7m-11 7c-4-2-7-6-8-11" fill="none" stroke="url(#${ids.accent})" stroke-width="4" stroke-linecap="round"/>` +
      (s >= 2 ? `<path d="M111 48c-6-2-10-6-12-11m52 11c6-2 10-6 12-11" fill="none" stroke="${p.accent}" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>` : '') +
      (s >= 3 ? `<circle cx="108" cy="16" r="4.2" fill="url(#${ids.orb})" filter="url(#${ids.glowf})"/>` +
        `<circle cx="152" cy="16" r="4.2" fill="url(#${ids.orb})" filter="url(#${ids.glowf})"/>` : '') +
      (s >= 4 ? `<circle cx="108" cy="16" r="10" fill="url(#${ids.glow})"/><circle cx="152" cy="16" r="10" fill="url(#${ids.glow})"/>` : '');
    const dew = s >= 3
      ? `<path d="M96 118c-4 6-4 10 0 13 4-3 4-7 0-13Zm68 12c-3 5-3 8 0 11 3-3 3-6 0-11Z" fill="${p.accent}" opacity=".55"/>`
      : '';
    return legs + tail + body + neck +
      `<g transform="translate(0 -8)">${ears}${head}${antlers}${dew}` +
      `<ellipse cx="113" cy="74" rx="8" ry="3.6" fill="#fff" opacity=".2" transform="rotate(-30 113 74)"/></g>`;
  }

  function jinwuArt(s, p, ids) {
    const outline = mix(p.ear, '#1a1018', 0.4);
    const disc = s >= 2
      ? `<g class="pet-sun-disc"><circle cx="130" cy="108" r="${s >= 4 ? 66 : s >= 3 ? 58 : 48}" fill="url(#${ids.glow})" opacity="${s >= 3 ? 0.95 : 0.7}"/>` +
        `<circle cx="130" cy="108" r="${s >= 4 ? 48 : 40}" fill="none" stroke="${p.accent}" stroke-opacity=".45" stroke-width="1.4" stroke-dasharray="2 7"/></g>`
      : '';
    const rays = s >= 3
      ? Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const r1 = s >= 4 ? 52 : 44;
          const r2 = s >= 4 ? 66 : 58;
          return `<path d="M${(130 + Math.cos(a) * r1).toFixed(1)} ${(108 + Math.sin(a) * r1).toFixed(1)}L${(130 + Math.cos(a) * r2).toFixed(1)} ${(108 + Math.sin(a) * r2).toFixed(1)}" stroke="${p.accent}" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>`;
        }).join('')
      : '';
    const wings = `<g class="pet-wing pet-wing-l"><path d="M112 138C92 118 64 116 38 136c22 2 42 9 58 21Z" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
        `<path d="M112 138C92 118 64 116 38 136" fill="none" stroke="${p.accent}" stroke-width="2.2" stroke-linecap="round" opacity=".72"/>` +
        `<path d="M110 134C92 122 72 119 52 128m52 10c-16-8-32-9-46-4m48 12c-12-5-25-5-36-1" fill="none" stroke="${p.accent}" stroke-width="1.5" stroke-linecap="round" opacity=".62"/>` +
        `<path d="M40 138c-3 6-5 12-4 18m14-23c-3 6-4 12-3 18m14-23c-3 6-4 12-3 18" fill="none" stroke="${p.accent}" stroke-width="1.8" stroke-linecap="round" opacity=".65"/></g>` +
      `<g class="pet-wing pet-wing-r"><path d="M148 138c20-20 48-22 74-2-22 2-42 9-58 21Z" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
        `<path d="M148 138c20-20 48-22 74-2" fill="none" stroke="${p.accent}" stroke-width="2.2" stroke-linecap="round" opacity=".72"/>` +
        `<path d="M150 134c18-12 38-15 58-6m-52 10c16-8 32-9 46-4m-48 12c12-5 25-5 36-1" fill="none" stroke="${p.accent}" stroke-width="1.5" stroke-linecap="round" opacity=".62"/>` +
        `<path d="M220 138c3 6 5 12 4 18m-14-23c3 6 4 12 3 18m-14-23c3 6 4 12 3 18" fill="none" stroke="${p.accent}" stroke-width="1.8" stroke-linecap="round" opacity=".65"/></g>`;
    const tail = `<path class="pet-tail" d="M114 170c-10 9-20 14-30 15 8 6 20 5 30-2Zm32 0c10 9 20 14 30 15-8 6-20 5-30-2Z" fill="url(#${ids.accent})" opacity=".8"/>`;
    const body = `<ellipse cx="130" cy="150" rx="31" ry="33" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="158" rx="20" ry="21" fill="url(#${ids.belly})" opacity=".82"/>` +
      `<path d="M112 142c5 8 11 12 18 13m18-13c-5 8-11 12-18 13" fill="none" stroke="${p.accent}" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>`;
    const head = `<circle cx="130" cy="105" r="26" fill="url(#${ids.head})"/>` +
      `<path d="M130 110c-10 0-18 4-23 10 8 2 16 1 23-3Z" fill="url(#${ids.accent})" stroke="${mix(p.accent, '#5b3408', 0.35)}" stroke-width=".8"/>` +
      `<path d="M108 112c7 1 13 0 18-3" fill="none" stroke="${outline}" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>` +
      eye(119, 99, 4.8, 6, p.accent, { dark: '#180f16' }) + eye(141, 99, 4.8, 6, p.accent, { dark: '#180f16' }) +
      rimPath('M112 91c5-7 11-11 19-12', '#fff', 2, 0.28);
    const crest = s >= 2
      ? `<path d="M118 82c-5-8-5-15-1-21 1 7 4 12 9 16m26 5c5-8 5-15 1-21-1 7-4 12-9 16" fill="none" stroke="url(#${ids.accent})" stroke-width="3.4" stroke-linecap="round"/>`
      : `<path d="M122 84c-3-6-2-11 1-15 1 5 3 8 7 11m16 4c3-6 2-11-1-15-1 5-3 8-7 11" fill="none" stroke="${p.accent}" stroke-width="2.6" stroke-linecap="round"/>`;
    const legs = `<path d="M121 180v8m18-8v8" stroke="${p.accent}" stroke-width="2.6" stroke-linecap="round"/>` +
      (s >= 2 ? `<path d="M130 181v9" stroke="${p.accent}" stroke-width="2.6" stroke-linecap="round"/>` : '') +
      `<path d="M117 190h8m10 0h8${s >= 2 ? 'm-17 0h8' : ''}" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>`;
    const crown = s >= 4
      ? `<path d="M114 80c5-8 11-12 16-12s11 4 16 12" fill="none" stroke="#f6d99a" stroke-width="2" stroke-linecap="round"/>` +
        `<path d="M121 77l-2-7m11 5V65m11 12 2-7" stroke="#f6d99a" stroke-width="1.8" stroke-linecap="round"/>`
      : '';
    return disc + rays + wings + tail + body + head + crest + legs + crown;
  }

  function yutuArt(s, p, ids) {
    const outline = mix(p.ear, '#5f6d8d', 0.42);
    const crescent = s >= 4
      ? `<path d="M204 58a29 29 0 1 0 17 50 24 24 0 0 1-17-50Z" fill="${p.accent}" opacity=".25"/>` +
        `<circle cx="130" cy="104" r="74" fill="none" stroke="${p.accent}" stroke-opacity=".3" stroke-width="1.2" stroke-dasharray="2 8"/>`
      : '';
    const ears = `<g class="pet-ear pet-ear-l"><ellipse cx="114" cy="60" rx="11" ry="35" transform="rotate(-8 114 60)" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
      `<ellipse cx="114" cy="63" rx="5.4" ry="26" transform="rotate(-8 114 63)" fill="url(#${ids.accent})" opacity=".38"/></g>` +
      `<g class="pet-ear pet-ear-r"><ellipse cx="146" cy="60" rx="11" ry="35" transform="rotate(8 146 60)" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
      `<ellipse cx="146" cy="63" rx="5.4" ry="26" transform="rotate(8 146 63)" fill="url(#${ids.accent})" opacity=".38"/></g>`;
    const tail = `<circle class="pet-tail" cx="94" cy="166" r="13" fill="url(#${ids.belly})" stroke="${outline}" stroke-width="1"/>` +
      `<circle cx="91" cy="163" r="5" fill="#fff" opacity=".55"/>`;
    const feet = `<ellipse cx="108" cy="184" rx="16" ry="8" fill="url(#${ids.belly})" stroke="${outline}" stroke-width="1"/>` +
      `<ellipse cx="152" cy="184" rx="16" ry="8" fill="url(#${ids.belly})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M104 184v3m5-3v3m5-3v3m32-3v3m5-3v3m5-3v3" stroke="${outline}" stroke-width=".9" opacity=".45"/>`;
    const body = `<ellipse cx="130" cy="158" rx="38" ry="30" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="164" rx="26" ry="19" fill="url(#${ids.belly})" opacity=".9"/>`;
    const arms = `<path d="M106 148c-8 6-11 13-8 19 4 1 8-2 11-6" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M154 148c8 6 11 13 8 19-4 1-8-2-11-6" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>`;
    const head = `<circle cx="130" cy="112" r="30" fill="url(#${ids.head})"/>` +
      `<ellipse cx="130" cy="123" rx="18" ry="13" fill="url(#${ids.belly})" opacity=".9"/>` +
      eye(119, 108, 4.6, 6, p.accent) + eye(141, 108, 4.6, 6, p.accent) +
      `<path d="M130 118l-4 4h8Z" fill="${mix(p.accent, '#b06a6a', 0.35)}"/>` +
      `<path d="M130 122v2m0 0c-2.2 2-5.2 2-7.4 0m7.4 0c2.2 2 5.2 2 7.4 0" fill="none" stroke="${outline}" stroke-width="1.2" stroke-linecap="round"/>` +
      `<path d="M112 120l-14-2m14 8-14 2m50-8 14-2m-14 8 14 2" stroke="${outline}" stroke-width="1" stroke-linecap="round" opacity=".4"/>` +
      rimPath('M114 98c5-7 12-11 20-12', '#fff', 2.2, 0.36);
    const mortar = s >= 2
      ? `<g class="pet-mortar"><path d="M172 166h30l-5 19h-20Z" fill="url(#${ids.belly})" stroke="${outline}" stroke-width="1.2"/>` +
        `<path d="M176 166c4-4 22-4 26 0" fill="none" stroke="${p.accent}" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M192 161l7-24" stroke="${p.accent}" stroke-width="4" stroke-linecap="round"/>` +
        `<circle cx="200" cy="135" r="4" fill="url(#${ids.orb})"/>` +
        star(206, 156, 2.6, p.accent, 0.65) + star(168, 146, 2, '#fff', 0.6) + `</g>`
      : '';
    const tuft = s >= 3
      ? `<path d="M124 84c1-8 4-13 8-16 1 7 3 12 7 16" fill="none" stroke="url(#${ids.accent})" stroke-width="3" stroke-linecap="round"/>`
      : '';
    return crescent + ears + tail + feet + body + arms + head + mortar + tuft +
      `<ellipse cx="115" cy="99" rx="8" ry="3.6" fill="#fff" opacity=".3" transform="rotate(-30 115 99)"/>`;
  }

  function mengdieArt(s, p, ids) {
    const outline = mix(p.ear, '#3f2a63', 0.4);
    const k = [0.9, 0.96, 1.02, 1.08][s - 1];
    const upper = `M124 118C108 82 72 58 48 74 30 87 42 120 72 134 94 144 114 138 124 126Z`;
    const lower = `M122 130C102 144 80 166 90 184 102 199 120 178 126 154Z`;
    const left = `<g class="pet-wing pet-wing-l"><path d="${upper}" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1.2"/>` +
      `<path d="${lower}" fill="url(#${ids.accent})" stroke="${outline}" stroke-width="1.2" opacity=".9"/>` +
      `<circle cx="76" cy="94" r="12" fill="url(#${ids.accent})" opacity=".8"/><circle cx="76" cy="94" r="6" fill="${p.ear}" opacity=".55"/>` +
      `<circle cx="96" cy="120" r="6" fill="${p.belly}" opacity=".6"/>` +
      `<circle cx="101" cy="160" r="8" fill="${p.belly}" opacity=".55"/><circle cx="101" cy="160" r="3.6" fill="${p.accent}"/>` +
      (s >= 3 ? `<path d="M54 84c10-8 20-11 30-9m-36 24c8-4 16-5 24-3" fill="none" stroke="${p.belly}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>` : '') +
      `</g>`;
    const right = `<g class="pet-wing pet-wing-r" transform="translate(260 0) scale(-1 1)">` +
      `<path d="${upper}" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1.2"/>` +
      `<path d="${lower}" fill="url(#${ids.accent})" stroke="${outline}" stroke-width="1.2" opacity=".9"/>` +
      `<circle cx="76" cy="94" r="12" fill="url(#${ids.accent})" opacity=".8"/><circle cx="76" cy="94" r="6" fill="${p.ear}" opacity=".55"/>` +
      `<circle cx="96" cy="120" r="6" fill="${p.belly}" opacity=".6"/>` +
      `<circle cx="101" cy="160" r="8" fill="${p.belly}" opacity=".55"/><circle cx="101" cy="160" r="3.6" fill="${p.accent}"/>` +
      (s >= 3 ? `<path d="M54 84c10-8 20-11 30-9m-36 24c8-4 16-5 24-3" fill="none" stroke="${p.belly}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>` : '') +
      `</g>`;
    const body = `<ellipse cx="130" cy="136" rx="9" ry="38" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="140" rx="5" ry="26" fill="url(#${ids.belly})" opacity=".6"/>`;
    const head = `<circle cx="130" cy="96" r="15" fill="url(#${ids.head})"/>` +
      eye(125, 93, 3.2, 4.2, p.accent, { dark: '#2a1c3a' }) + eye(135, 93, 3.2, 4.2, p.accent, { dark: '#2a1c3a' }) +
      rimPath('M122 88c3-5 8-7 13-7', '#fff', 1.8, 0.35);
    const antennae = `<path d="M124 84c-6-9-12-13-19-14m31 14c6-9 12-13 19-14" fill="none" stroke="${p.ear}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<circle cx="105" cy="70" r="2.4" fill="${p.accent}"/><circle cx="155" cy="70" r="2.4" fill="${p.accent}"/>`;
    const legs = `<path d="M126 170v8m8-8v8" stroke="${p.ear}" stroke-width="1.4" stroke-linecap="round"/>`;
    const sparks = s >= 3
      ? star(42, 132, 3.4, p.accent, 0.6) + star(218, 142, 3, '#fff', 0.65) + star(206, 56, 2.4, p.accent, 0.55) +
        `<circle cx="60" cy="52" r="2" fill="${p.accent}" opacity=".55"/><circle cx="190" cy="172" r="2.4" fill="${p.accent}" opacity=".5"/>`
      : '';
    const crown = s >= 4
      ? `<circle cx="130" cy="96" r="24" fill="none" stroke="${p.accent}" stroke-opacity=".45" stroke-width="1" stroke-dasharray="2 6"/>`
      : '';
    return `<g transform="translate(130 130) scale(${k}) translate(-130 -130)">` + left + right + body + head + antennae + legs + sparks + crown + `</g>`;
  }

  function qingniaoArt(s, p, ids) {
    const outline = mix(p.ear, '#1f4f70', 0.4);
    const tail = `<path class="pet-tail" d="M104 148C80 160 62 180 42 178c16 13 40 5 58-11" fill="none" stroke="${outline}" stroke-width="8" stroke-linecap="round"/>` +
      `<path d="M104 148C80 160 62 180 42 178c16 13 40 5 58-11" fill="none" stroke="url(#${ids.accent})" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="M106 156C86 172 76 191 58 192c18 9 40-1 52-17" fill="none" stroke="url(#${ids.body})" stroke-width="6" stroke-linecap="round" opacity=".8"/>` +
      `<path d="M108 142C90 144 72 152 58 164" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.8" stroke-linecap="round"/>`;
    const body = `<ellipse cx="124" cy="140" rx="27" ry="22" fill="url(#${ids.body})"/>` +
      `<ellipse cx="124" cy="146" rx="18" ry="14" fill="url(#${ids.belly})" opacity=".9"/>`;
    const wing = `<g class="pet-wing pet-wing-l"><path d="M112 132C98 116 82 118 72 132c13 1 24 7 32 16Z" fill="url(#${ids.accent})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M110 132c-10-10-20-14-30-13" fill="none" stroke="${p.belly}" stroke-width="1.6" stroke-linecap="round" opacity=".65"/></g>` +
      (s >= 3 ? `<g class="pet-wing pet-wing-r"><path d="M132 132c10-12 22-14 30-6-8 4-14 10-18 17Z" fill="url(#${ids.accent})" opacity=".8" stroke="${outline}" stroke-width="1"/></g>` : '');
    const neck = `<path d="M138 128c4-10 8-16 12-18" fill="none" stroke="${outline}" stroke-width="16" stroke-linecap="round"/>` +
      `<path d="M138 128c4-10 8-16 12-18" fill="none" stroke="url(#${ids.body})" stroke-width="13" stroke-linecap="round"/>`;
    const head = `<circle cx="150" cy="107" r="18" fill="url(#${ids.head})"/>` +
      `<path d="M165 106l19 4-19 7Z" fill="url(#${ids.accent})" stroke="${mix(p.accent, '#5b3a10', 0.35)}" stroke-width=".8"/>` +
      eye(151, 103, 4, 5, p.accent, { dark: '#123448' }) +
      rimPath('M140 96c3-5 8-8 14-9', '#fff', 1.8, 0.35);
    const crest = `<path d="M143 91c-4-7-4-13-1-18 2 6 5 10 10 13m12 5c4-7 4-13 1-18-2 6-5 10-10 13" fill="none" stroke="url(#${ids.accent})" stroke-width="3" stroke-linecap="round"/>`;
    const legs = `<path d="M118 160l-3 19m22-19 4 19" stroke="${p.accent}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<path d="M110 180h11m8 0h12" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>`;
    const cloudTail = s >= 3 ? cloud(70, 168, 0.55, p.belly, 0.5) + cloud(178, 156, 0.48, p.belly, 0.42) : '';
    const halo = s >= 4
      ? `<circle cx="150" cy="107" r="34" fill="none" stroke="${p.accent}" stroke-opacity=".4" stroke-width="1" stroke-dasharray="2 7"/>`
      : '';
    return tail + body + wing + neck + head + crest + legs + cloudTail + halo +
      `<ellipse cx="118" cy="134" rx="8" ry="3.4" fill="#fff" opacity=".24" transform="rotate(-26 118 134)"/>`;
  }

  function suanniArt(s, p, ids) {
    const outline = mix(p.ear, '#4b2812', 0.42);
    const mane = Array.from({ length: s >= 3 ? 16 : 13 }, (_, i) => {
      const count = s >= 3 ? 16 : 13;
      const angle = (i / count) * Math.PI * 2;
      const radius = 40 + (i % 3) * 3;
      const cx = 130 + Math.cos(angle) * radius;
      const cy = 100 + Math.sin(angle) * radius * 0.92;
      const r = 11 + (i % 3) * 1.6;
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#${ids.mane})" stroke="${outline}" stroke-opacity=".12" stroke-width="1"/>`;
    }).join('');
    const tail = `<path class="pet-tail" d="M174 150c20 2 30-10 28-26 8 16 4 34-12 42-7 4-13 1-16-5Z" fill="url(#${ids.body})"/>` +
      `<circle cx="202" cy="124" r="10" fill="url(#${ids.mane})"/><circle cx="206" cy="118" r="6" fill="url(#${ids.accent})" opacity=".8"/>`;
    const body = `<ellipse cx="130" cy="154" rx="46" ry="31" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="160" rx="31" ry="21" fill="url(#${ids.belly})" opacity=".9"/>` +
      `<path d="M106 144c8 5 16 7 24 7s16-2 24-7" fill="none" stroke="${p.accent}" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>`;
    const legs = `<path d="M106 170c-2 7-1 12 2 15 5 1 9-3 10-8m26-7c2 7 1 12-2 15-5 1-9-3-10-8" fill="url(#${ids.belly})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M104 184h10m34 0h10" stroke="${p.accent}" stroke-width="1.8" stroke-linecap="round"/>` +
      `<path d="M90 164c-8 3-12 9-10 14 5 2 11-1 15-6m54-8c8 3 12 9 10 14-5 2-11-1-15-6" fill="url(#${ids.body})" opacity=".7"/>`;
    const head = `<circle cx="130" cy="100" r="30" fill="url(#${ids.head})"/>` +
      `<ellipse cx="130" cy="112" rx="19" ry="14" fill="url(#${ids.belly})"/>` +
      eye(119, 95, 5, 6.4, p.accent) + eye(141, 95, 5, 6.4, p.accent) +
      `<path d="M130 106l-5 4h10Z" fill="${mix(p.ear, '#3a1e0c', 0.3)}"/>` +
      `<path d="M130 111v2m0 0c-2.4 2.2-5.6 2.2-7.8 0m7.8 0c2.4 2.2 5.6 2.2 7.8 0" fill="none" stroke="${outline}" stroke-width="1.2" stroke-linecap="round"/>` +
      `<path d="M116 80c3-4 7-5 11-3m15 0c4-2 8-1 11 3" fill="none" stroke="${p.accent}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>` +
      rimPath('M113 88c5-7 12-11 20-12', '#fff', 2.2, 0.32);
    const smoke = s >= 2
      ? `<g class="pet-smoke"><path d="M92 132c-14-8-18-20-10-30 4 8 10 13 18 16" fill="none" stroke="${p.accent}" stroke-width="3" stroke-linecap="round" opacity=".38"/>` +
        `<path d="M168 128c14-10 16-22 8-32-3 9-8 15-16 19" fill="none" stroke="${p.accent}" stroke-width="2.6" stroke-linecap="round" opacity=".32"/></g>`
      : '';
    const crown = s >= 4
      ? `<path d="M112 72c5-8 12-12 18-12s13 4 18 12" fill="none" stroke="#f6d99a" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M120 69l-2-8m12 6V56m12 13 2-8" stroke="#f6d99a" stroke-width="1.8" stroke-linecap="round"/>`
      : '';
    return tail + body + legs + mane + head + smoke + crown +
      `<ellipse cx="114" cy="84" rx="9" ry="4" fill="#fff" opacity=".2" transform="rotate(-28 114 84)"/>`;
  }

  function baihuArt(s, p, ids) {
    const outline = mix(p.ear, '#3b4a59', 0.42);
    const stripe = mix(p.ear, '#1b2633', 0.78);
    const tail = `<path class="pet-tail" d="M174 150c18-2 24-16 18-32 12 5 18 19 12 32-5 11-18 16-30 8Z" fill="url(#${ids.body})"/>` +
      `<path d="M191 132c-3 4-4 8-3 12m8-8c-3 3-4 7-3 11m4-18c-3 3-5 7-4 11" stroke="${stripe}" stroke-width="3" stroke-linecap="round" opacity=".85"/>`;
    const body = `<ellipse cx="130" cy="152" rx="51" ry="31" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="159" rx="34" ry="21" fill="url(#${ids.belly})" opacity=".92"/>` +
      `<path d="M88 136c-7 6-9 13-6 20m33-23c-6 6-8 13-6 19m57-20c6 6 8 13 6 19m-25-17c6 6 8 12 6 18" fill="none" stroke="${stripe}" stroke-width="3.6" stroke-linecap="round" opacity=".9"/>` +
      `<path d="M98 146c-5 3-7 7-6 11m74-8c5 3 7 7 6 11" fill="none" stroke="${stripe}" stroke-width="2.8" stroke-linecap="round" opacity=".8"/>`;
    const legs = `<path d="M104 170c-2 7-1 12 2 15 5 1 9-3 10-8m24-7c2 7 1 12-2 15-5 1-9-3-10-8" fill="url(#${ids.belly})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M100 184h12m36 0h12" stroke="${stripe}" stroke-width="2" stroke-linecap="round" opacity=".7"/>` +
      `<path d="M102 184l-2 4m7-4-1 4m52-4 2 4m-7-4 1 4" stroke="${p.accent}" stroke-width="1.4" stroke-linecap="round"/>`;
    const ears = `<circle cx="104" cy="81" r="14" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1.2"/>` +
      `<circle cx="156" cy="81" r="14" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1.2"/>` +
      `<circle cx="104" cy="81" r="7" fill="${mix(p.accent, p.ear, 0.35)}" opacity=".55"/>` +
      `<circle cx="156" cy="81" r="7" fill="${mix(p.accent, p.ear, 0.35)}" opacity=".55"/>`;
    const head = `<circle cx="130" cy="103" r="34" fill="url(#${ids.head})"/>` +
      `<ellipse cx="130" cy="116" rx="21" ry="14" fill="url(#${ids.belly})"/>` +
      almondEye(118, 98, 6, 5, p.accent, -6) + almondEye(142, 98, 6, 5, p.accent, 6) +
      `<path d="M130 110l-5 4h10Z" fill="${mix(p.ear, '#3b3038', 0.3)}"/>` +
      `<path d="M130 114v2m0 0c-2.4 2.2-5.6 2.2-7.8 0m7.8 0c2.4 2.2 5.6 2.2 7.8 0" fill="none" stroke="${outline}" stroke-width="1.2" stroke-linecap="round"/>` +
      `<path d="M122 84h16m-19 6h22m-18 6h14m-8-15v17" fill="none" stroke="${stripe}" stroke-width="2.8" stroke-linecap="round" opacity=".92"/>` +
      `<path d="M112 96l-2 9m11-11-1 9m31-7 2 9m-11-11 1 9m-46-1-10-3m10 8-10 2m76-7 10-3m-10 8 10 2" fill="none" stroke="${stripe}" stroke-width="2.8" stroke-linecap="round" opacity=".88"/>` +
      `<path d="M118 111c-3 1-6 1-9 0m33 0c-3 1-6 1-9 0" fill="none" stroke="${outline}" stroke-width="1" stroke-linecap="round" opacity=".35"/>` +
      rimPath('M111 89c5-8 13-12 22-13', '#fff', 2.2, 0.4);
    const armor = s >= 3
      ? `<path d="M100 136c8-4 16-4 24 0m14 0c8-4 16-4 24 0" fill="none" stroke="${p.accent}" stroke-width="1.6" stroke-linecap="round" opacity=".65"/>` +
        `<path d="M94 148c6-3 12-3 18 0m28 0c6-3 12-3 18 0" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>`
      : '';
    const crown = s >= 4
      ? `<path d="M118 72c4-7 8-10 12-10s8 3 12 10" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>` +
        `<circle cx="130" cy="62" r="3" fill="${p.accent}" filter="url(#${ids.glowf})"/>` +
        `<path d="M76 62l4 7-4 7-4-7Zm108 8 3.6 6-3.6 6-3.6-6Z" fill="${p.accent}" opacity=".5"/>`
      : '';
    return tail + body + legs + ears + head + armor + crown +
      `<ellipse cx="113" cy="86" rx="9" ry="4" fill="#fff" opacity=".3" transform="rotate(-28 113 86)"/>`;
  }

  function kunArt(s, p, ids) {
    const outline = mix(p.ear, '#163a5c', 0.42);
    const tail = `<path class="pet-tail" d="M190 138c15-12 26-24 32-37 8 22 8 46 0 68-6-13-17-24-32-31Z" fill="url(#${ids.accent})" stroke="${outline}" stroke-width="1.2"/>` +
      `<path d="M196 140c10-10 18-21 22-30m-22 44c10-10 18-21 22-30" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.6" stroke-linecap="round"/>`;
    const dorsal = `<path d="M112 104c8-16 22-24 38-24-4 12-12 21-24 26Z" fill="url(#${ids.accent})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M118 103c7-9 16-15 26-18" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.4" stroke-linecap="round"/>`;
    const body = `<path d="M68 142C72 112 100 94 136 97c34 3 53 22 57 44-4 23-23 41-57 44-36 3-64-14-68-43Z" fill="url(#${ids.body})"/>` +
      `<path d="M76 150c8 17 26 26 52 27 28 1 48-9 57-27-5 23-24 38-55 40-31 2-51-13-54-40Z" fill="url(#${ids.belly})" opacity=".8"/>`;
    const scales = Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 6 }, (_, col) =>
        scaleArc(98 + col * 14 + (row % 2) * 7, 118 + row * 10, 13, mix(p.ear, '#12314d', 0.3), 0.4)
      ).join('')
    ).join('');
    const fin = `<g class="pet-wing pet-wing-l"><path d="M112 158c-12 2-20 10-20 20 10-1 18-6 24-14Z" fill="url(#${ids.accent})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M110 160c-8 2-13 7-15 13" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/></g>`;
    const head = `<circle cx="92" cy="128" r="8.4" fill="#f7fdff" stroke="${outline}" stroke-width="1"/>` +
      `<circle cx="91" cy="128" r="5" fill="#203d43"/><circle cx="89.6" cy="126" r="1.8" fill="#fff"/>` +
      `<path d="M68 146c7 2 13 2 18 0" fill="none" stroke="${outline}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M82 118c-2 6-2 13 1 19m9-21c-1 7 0 14 3 20m9-18c0 6 2 11 5 15" fill="none" stroke="${p.accent}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>`;
    const whiskers = s >= 3
      ? `<path d="M66 150c-14 2-24 8-30 18m32-12c-12 4-20 11-24 20" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round" opacity=".7"/>`
      : '';
    const wings = s >= 4
      ? `<path d="M124 120c-8-18-2-34 12-44-2 14 2 26 12 36Z" fill="url(#${ids.belly})" opacity=".55" stroke="${outline}" stroke-width="1"/>`
      : '';
    const glow = s >= 4
      ? `<circle cx="130" cy="140" r="82" fill="url(#${ids.glow})" opacity=".4"/>`
      : '';
    return glow + tail + dorsal + body + scales + fin + head + whiskers + wings;
  }

  function xianheArt(s, p, ids) {
    const outline = mix(p.ear, '#8d8270', 0.4);
    const legs = `<path d="M126 162l-5 22m27-22 7 22" stroke="${p.accent}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<path d="M118 184c-4 2-8 5-9 8m9-8c0 3 1 6 3 8m37-8c4 2 8 5 9 8m-9-8c0 3-1 6-3 8" fill="none" stroke="${p.accent}" stroke-width="1.8" stroke-linecap="round"/>` +
      `<circle cx="121" cy="174" r="2" fill="${p.accent}"/><circle cx="156" cy="174" r="2" fill="${p.accent}"/>`;
    const tail = `<path class="pet-tail" d="M172 144c16-2 24-10 26-22 4 14 0 26-12 32-6 3-11 1-14-3Z" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M174 148c10-2 17-7 21-14m-19 20c8-2 14-7 18-13" fill="none" stroke="${p.accent}" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>`;
    const body = `<ellipse cx="140" cy="146" rx="40" ry="27" fill="url(#${ids.body})"/>` +
      `<ellipse cx="140" cy="152" rx="27" ry="18" fill="url(#${ids.belly})" opacity=".9"/>`;
    const wing = `<g class="pet-wing pet-wing-l"><path d="M130 134C112 116 92 116 80 130c14 2 26 10 34 22Z" fill="url(#${ids.accent})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M126 134c-12-13-26-18-38-16m40 24c-10-10-21-14-31-13" fill="none" stroke="${p.belly}" stroke-width="1.7" stroke-linecap="round" opacity=".7"/></g>` +
      (s >= 3 ? `<g class="pet-wing pet-wing-r"><path d="M152 130c14-14 28-16 38-8-10 5-18 13-23 22Z" fill="url(#${ids.accent})" opacity=".86" stroke="${outline}" stroke-width="1"/></g>` : '');
    const neck = `<path d="M118 138c-12-18-12-38-6-54" fill="none" stroke="${outline}" stroke-width="16" stroke-linecap="round"/>` +
      `<path d="M118 138c-12-18-12-38-6-54" fill="none" stroke="url(#${ids.body})" stroke-width="12" stroke-linecap="round"/>`;
    const head = `<circle cx="112" cy="80" r="16" fill="url(#${ids.head})"/>` +
      `<path d="M99 78L68 84l31 8Z" fill="url(#${ids.accent})" stroke="${mix(p.accent, '#5b3a10', 0.35)}" stroke-width=".8"/>` +
      `<path d="M70 84l-2 2 2 2" fill="none" stroke="${outline}" stroke-width=".9"/>` +
      eye(113, 76, 3.6, 4.4, p.accent, { dark: '#2b2a26' }) +
      `<ellipse cx="107" cy="66" rx="8" ry="4" fill="${p.accent}" opacity=".9"/>` +
      rimPath('M101 70c3-4 8-6 13-6', '#fff', 1.6, 0.4);
    const cloudFeet = s >= 3
      ? cloud(76, 176, 0.75, p.belly, 0.55) + cloud(154, 182, 0.65, p.belly, 0.45)
      : '';
    const halo = s >= 4
      ? `<circle cx="112" cy="80" r="31" fill="none" stroke="${p.accent}" stroke-opacity=".45" stroke-width="1.1" stroke-dasharray="2 7"/>` +
        `<path d="M50 62c10-6 20-6 30 0m104 12c10-6 20-6 30 0" fill="none" stroke="${p.accent}" stroke-width="1.8" stroke-linecap="round" opacity=".45"/>`
      : '';
    return tail + body + wing + legs + neck + head + cloudFeet + halo +
      `<ellipse cx="132" cy="138" rx="8" ry="3.4" fill="#fff" opacity=".3" transform="rotate(-24 132 138)"/>`;
  }

  function lingyuanArt(s, p, ids) {
    const outline = mix(p.ear, '#3f2a18', 0.42);
    const tail = `<path class="pet-tail" d="M158 158c26-2 38-20 30-38-6-13-18-14-22-4-3 8 5 14 12 10" fill="none" stroke="${outline}" stroke-width="11" stroke-linecap="round"/>` +
      `<path d="M158 158c26-2 38-20 30-38-6-13-18-14-22-4-3 8 5 14 12 10" fill="none" stroke="url(#${ids.body})" stroke-width="8" stroke-linecap="round"/>`;
    const body = `<ellipse cx="130" cy="152" rx="36" ry="34" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="158" rx="24" ry="22" fill="url(#${ids.belly})" opacity=".9"/>`;
    const legs = `<path d="M108 174c-2 6-1 10 2 13 4 1 8-2 9-7m24-6c2 6 1 10-2 13-4 1-8-2-9-7" fill="url(#${ids.belly})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M104 186h12m28 0h12" stroke="${p.accent}" stroke-width="1.7" stroke-linecap="round"/>`;
    const arms = `<path d="M102 140c-14 6-20 18-16 28 4 2 8 0 12-4m48-24c14 6 20 18 16 28-4 2-8 0-12-4" fill="none" stroke="${outline}" stroke-width="11" stroke-linecap="round"/>` +
      `<path d="M102 140c-14 6-20 18-16 28 4 2 8 0 12-4m48-24c14 6 20 18 16 28-4 2-8 0-12-4" fill="none" stroke="url(#${ids.body})" stroke-width="8" stroke-linecap="round"/>` +
      `<circle cx="92" cy="170" r="6" fill="url(#${ids.belly})"/><circle cx="168" cy="170" r="6" fill="url(#${ids.belly})"/>`;
    const ears = `<circle cx="99" cy="104" r="14" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
      `<circle cx="99" cy="104" r="8" fill="url(#${ids.belly})" opacity=".8"/>` +
      `<circle cx="161" cy="104" r="14" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
      `<circle cx="161" cy="104" r="8" fill="url(#${ids.belly})" opacity=".8"/>`;
    const head = `<circle cx="130" cy="108" r="31" fill="url(#${ids.head})"/>` +
      `<path d="M130 82c-14 0-23 10-23 23 0 14 10 25 23 25s23-11 23-25c0-13-9-23-23-23Z" fill="url(#${ids.belly})" opacity=".92"/>` +
      eye(120, 105, 4.4, 5.6, p.accent, { dark: '#2b2118' }) + eye(140, 105, 4.4, 5.6, p.accent, { dark: '#2b2118' }) +
      `<path d="M126 115c2-2 6-2 8 0" fill="none" stroke="${outline}" stroke-width="1.4" stroke-linecap="round"/>` +
      `<path d="M130 117v2m0 0c-2 1.8-4.6 1.8-6.4 0m6.4 0c2 1.8 4.6 1.8 6.4 0" fill="none" stroke="${outline}" stroke-width="1.1" stroke-linecap="round"/>` +
      `<path d="M117 94c4-4 9-5 13-3m13 0c4-2 9-1 13 3" fill="none" stroke="${p.ear}" stroke-width="1.5" stroke-linecap="round" opacity=".55"/>` +
      rimPath('M113 92c4-7 10-10 17-11', '#fff', 2, 0.3);
    const peach = s >= 2
      ? `<g class="pet-peach"><circle cx="174" cy="172" r="11" fill="${mix(p.accent, '#e88a9a', 0.55)}" stroke="${outline}" stroke-width="1"/>` +
        `<path d="M174 162c-1-5 1-8 5-10-1 4 0 7 2 9" fill="none" stroke="#6f9e55" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M170 166c2-3 6-4 9-2" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.4" stroke-linecap="round"/></g>`
      : '';
    const crown = s >= 4
      ? `<path d="M118 80c4-7 8-10 12-10s8 3 12 10" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>` +
        `<ellipse cx="86" cy="118" rx="7" ry="3.4" fill="#7fae5a" opacity=".65" transform="rotate(-28 86 118)"/>` +
        `<ellipse cx="174" cy="120" rx="7" ry="3.4" fill="#7fae5a" opacity=".65" transform="rotate(28 174 120)"/>`
      : '';
    return tail + body + legs + arms + ears + head + peach + crown;
  }

  function jinchanArt(s, p, ids) {
    const outline = mix(p.ear, '#5a3c0a', 0.42);
    const coins = `<g class="pet-coins">` +
      [[78, 182], [96, 186], [166, 182], [184, 186]].map(([x, y], i) =>
        `<circle cx="${x}" cy="${y}" r="${7 + (i % 2)}" fill="${p.accent}" stroke="${outline}" stroke-width=".8"/>` +
        `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" rx="1" fill="${p.belly}"/>`
      ).join('') + `</g>`;
    const body = `<ellipse cx="130" cy="156" rx="57" ry="36" fill="url(#${ids.body})"/>` +
      `<ellipse cx="130" cy="165" rx="38" ry="22" fill="url(#${ids.belly})" opacity=".9"/>`;
    const spots = `<circle cx="94" cy="144" r="5" fill="${p.ear}" opacity=".32"/><circle cx="108" cy="158" r="3.6" fill="${p.ear}" opacity=".3"/>` +
      `<circle cx="166" cy="144" r="5" fill="${p.ear}" opacity=".32"/><circle cx="154" cy="158" r="3.6" fill="${p.ear}" opacity=".3"/>` +
      `<path d="M104 170c6 4 12 5 18 4m16 0c6 1 12 0 18-4" fill="none" stroke="${p.accent}" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>`;
    const legs = `<path d="M86 166c-12 4-18 12-14 19 8 2 16-4 21-12m57-7c12 4 18 12 14 19-8 2-16-4-21-12" fill="url(#${ids.body})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M92 178c-5 2-9 6-10 10m1-10-2 9m63-9c5 2 9 6 10 10m-1-10 2 9" fill="none" stroke="${p.accent}" stroke-width="1.6" stroke-linecap="round"/>`;
    const eyes = `<circle cx="103" cy="120" r="15" fill="url(#${ids.belly})" stroke="${outline}" stroke-width="1.2"/>` +
      `<circle cx="157" cy="120" r="15" fill="url(#${ids.belly})" stroke="${outline}" stroke-width="1.2"/>` +
      `<ellipse class="pet-eye" cx="103" cy="121" rx="6" ry="8" fill="#2b2412"/>` +
      `<ellipse class="pet-eye" cx="157" cy="121" rx="6" ry="8" fill="#2b2412"/>` +
      `<circle cx="101" cy="117" r="2.4" fill="#fff"/><circle cx="155" cy="117" r="2.4" fill="#fff"/>` +
      `<path d="M88 111c5-4 11-4 16-1m40 1c5-3 11-3 16 1" fill="none" stroke="${p.ear}" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>`;
    const mouth = `<path d="M106 140c8 7 40 7 48 0" fill="none" stroke="${outline}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`;
    const coin = s >= 2
      ? `<g class="pet-coin-mouth"><circle cx="130" cy="148" r="11" fill="url(#${ids.accent})" stroke="${outline}" stroke-width="1.2"/>` +
        `<rect x="125.5" y="143.5" width="9" height="9" rx="1.4" fill="${p.belly}"/>` +
        `<circle cx="126" cy="144" r="1.4" fill="#fff" opacity=".7"/></g>`
      : '';
    const crown = s >= 4
      ? `<path d="M112 92c6-9 12-13 18-13s12 4 18 13" fill="none" stroke="#f6d99a" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M120 88l-2-9m12 7V75m12 13 2-9" stroke="#f6d99a" stroke-width="1.8" stroke-linecap="round"/>` +
        `<circle cx="130" cy="66" r="3.4" fill="${p.accent}" filter="url(#${ids.glowf})"/>`
      : '';
    return coins + body + spots + legs + eyes + mouth + coin + crown;
  }

  function yinglongArt(s, p, ids) {
    const outline = mix(p.ear, '#124450', 0.42);
    const bodyPath = 'M78 182C54 160 60 130 88 118c26-11 54-6 64-26 6-12 2-24-10-32';
    const tail = `<path d="${bodyPath}" fill="none" stroke="${outline}" stroke-width="29" stroke-linecap="round"/>` +
      `<path d="${bodyPath}" fill="none" stroke="url(#${ids.body})" stroke-width="24" stroke-linecap="round"/>` +
      `<path d="M78 182C54 160 60 130 88 118c26-11 54-6 64-26" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M64 158c10-2 19 1 26 9m-32 8c12 0 22 4 29 12" fill="none" stroke="${outline}" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>`;
    const wings = `<g class="pet-wing pet-wing-l"><path d="M114 128C94 100 66 92 40 104c20 9 34 22 44 40Z" fill="url(#${ids.accent})" stroke="${outline}" stroke-width="1.1"/>` +
      `<path d="M110 126c-16-20-36-30-58-30m56 40c-14-15-30-23-46-25m46 36c-10-9-21-14-32-16" fill="none" stroke="${p.belly}" stroke-width="1.7" stroke-linecap="round" opacity=".62"/></g>` +
      `<g class="pet-wing pet-wing-r"><path d="M138 124c18-26 44-34 68-24-18 10-31 24-40 42Z" fill="url(#${ids.accent})" stroke="${outline}" stroke-width="1.1"/>` +
      `<path d="M142 122c14-18 32-27 52-28m-48 38c12-13 27-21 42-23m-40 34c9-8 19-13 29-15" fill="none" stroke="${p.belly}" stroke-width="1.7" stroke-linecap="round" opacity=".62"/></g>`;
    const chest = `<ellipse cx="112" cy="148" rx="24" ry="26" fill="url(#${ids.body})"/>` +
      `<ellipse cx="112" cy="152" rx="15" ry="17" fill="url(#${ids.belly})" opacity=".8"/>` +
      scaleArc(112, 140, 24, outline, 0.35) + scaleArc(112, 149, 28, outline, 0.3);
    const claws = `<path d="M92 164c-10 4-16 10-14 17 6 2 12-2 17-8m33 0c8 4 13 10 11 16-5 1-10-2-15-7" fill="url(#${ids.belly})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M78 181l-1 4m5-5 1 4m68-3-1 4m-3-5-1 4" stroke="${p.accent}" stroke-width="1.4" stroke-linecap="round"/>`;
    const head = `<circle cx="150" cy="90" r="25" fill="url(#${ids.head})"/>` +
      `<path d="M162 86c12-2 22 2 28 10-8 6-18 8-29 4Z" fill="url(#${ids.head})" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M188 92c6 1 10 4 12 8-4 3-9 3-14 1" fill="url(#${ids.belly})" opacity=".8"/>` +
      eye(154, 84, 4.6, 6, p.accent, { dark: '#0d2328', iris: p.accent }) +
      `<ellipse cx="174" cy="96" rx="1.6" ry="1" fill="${outline}"/>` +
      `<path d="M170 100c5 3 10 3 14 1" fill="none" stroke="${outline}" stroke-width="1.2" stroke-linecap="round"/>` +
      `<path d="M152 102c-5 4-10 6-16 6" fill="none" stroke="${p.accent}" stroke-width="1.6" stroke-linecap="round" opacity=".65"/>` +
      rimPath('M136 76c4-7 10-11 18-12', '#fff', 2.2, 0.35);
    const horns = `<path d="M138 70C128 54 114 44 98 42c9 10 14 21 16 33" fill="none" stroke="url(#${ids.accent})" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M98 42c-2-7-7-11-13-12m13 12c1-7-2-13-7-17" fill="none" stroke="${p.accent}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<path d="M154 67c4-9 11-15 20-17-4 7-6 14-6 21" fill="none" stroke="url(#${ids.accent})" stroke-width="4.6" stroke-linecap="round"/>`;
    const whiskers = `<path d="M186 98c10 6 16 14 18 24m-22-16c8 7 12 15 13 24" fill="none" stroke="${p.accent}" stroke-width="1.8" stroke-linecap="round" opacity=".68"/>`;
    const lightning = s >= 2
      ? `<g class="pet-lightning"><path d="M46 66l12 20-10 4 16 26-4-22 10-2-14-24Z" fill="${p.accent}" opacity=".72"/>` +
        `<path d="M212 134l-10 17 8 3-13 22 3-18-8-2 12-20Z" fill="${p.accent}" opacity=".62"/>` +
        (s >= 3 ? `<path d="M58 128l8 13-7 3 10 16-2-14 7-1-9-15Z" fill="#fff" opacity=".55"/>` : '') + `</g>`
      : '';
    const halo = s >= 4
      ? `<circle cx="132" cy="112" r="90" fill="none" stroke="${p.accent}" stroke-opacity=".36" stroke-width="1.4" stroke-dasharray="3 9"/>` +
        `<circle cx="132" cy="112" r="78" fill="url(#${ids.glow})" opacity=".5"/>`
      : '';
    const crown = s >= 3
      ? `<path d="M126 62c5-8 12-12 19-12s14 4 19 12" fill="none" stroke="#f6d99a" stroke-width="2" stroke-linecap="round"/>`
      : '';
    return halo + wings + tail + chest + claws + head + horns + whiskers + lightning + crown +
      `<ellipse cx="146" cy="78" rx="8" ry="3.6" fill="#fff" opacity=".18" transform="rotate(-28 146 78)"/>`;
  }

  function render(opts) {
    const o = opts || {};
    const allowed = ['otter', 'fox', 'whale', 'bird', 'baize', 'qilin', 'zhulong', 'xuanwu', 'fuzhu', 'jinwu', 'yutu', 'mengdie', 'qingniao', 'suanni', 'baihu', 'kun', 'xianhe', 'lingyuan', 'jinchan', 'yinglong'];
    const species = allowed.indexOf(o.species) >= 0 ? o.species : 'otter';
    const s = Math.max(1, Math.min(4, Number(o.stage) || 1));
    const p = {
      body: o.colors.body,
      ear: o.colors.ear,
      belly: o.colors.belly,
      accent: o.colors.accent
    };
    if (o.fused) {
      p.body = '#9fdfd2';
      p.ear = '#4f8f8b';
      p.accent = '#f0c987';
      p.belly = '#fff8e9';
    }
    const uid = `petart${++seq}`;
    const ids = {
      body: `${uid}-body`, head: `${uid}-head`, belly: `${uid}-belly`, accent: `${uid}-accent`,
      mane: `${uid}-mane`, glow: `${uid}-glow`, orb: `${uid}-orb`,
      blur: `${uid}-blur`, soft: `${uid}-soft`, glowf: `${uid}-glowf`
    };
    const bg = backdrop(species, s, p, o.fused, ids);
    let art = '';
    if (species === 'otter') art = otterArt(s, p, ids);
    else if (species === 'fox') art = foxArt(s, p, ids);
    else if (species === 'whale') art = whaleArt(s, p, ids);
    else if (species === 'bird') art = birdArt(s, p, ids);
    else if (species === 'baize') art = baizeArt(s, p, ids);
    else if (species === 'qilin') art = qilinArt(s, p, ids);
    else if (species === 'zhulong') art = zhulongArt(s, p, ids);
    else if (species === 'xuanwu') art = xuanwuArt(s, p, ids);
    else if (species === 'fuzhu') art = fuzhuArt(s, p, ids);
    else if (species === 'jinwu') art = jinwuArt(s, p, ids);
    else if (species === 'yutu') art = yutuArt(s, p, ids);
    else if (species === 'mengdie') art = mengdieArt(s, p, ids);
    else if (species === 'qingniao') art = qingniaoArt(s, p, ids);
    else if (species === 'suanni') art = suanniArt(s, p, ids);
    else if (species === 'baihu') art = baihuArt(s, p, ids);
    else if (species === 'kun') art = kunArt(s, p, ids);
    else if (species === 'xianhe') art = xianheArt(s, p, ids);
    else if (species === 'lingyuan') art = lingyuanArt(s, p, ids);
    else if (species === 'jinchan') art = jinchanArt(s, p, ids);
    else if (species === 'yinglong') art = yinglongArt(s, p, ids);
    else art = otterArt(s, p, ids);
    const grow = [0.86, 0.93, 1, 1.07][s - 1];
    const motion = ['water', 'fire', 'wind', 'earth', 'moon', 'dream', 'metal', 'wood', 'storm', 'sun', 'gold'].indexOf(o.motion) >= 0 ? o.motion : 'earth';
    return `<svg class="pet-svg pet-stage-${s} pet-motion-${motion}${o.fused ? ' is-fused' : ''}" viewBox="0 0 260 210" role="img" aria-label="${o.label || '神兽'}">` +
      petDefs(uid, p, o.fused) + bg.fusion + bg.aura + bg.ground + bg.bubbles + bg.shadow +
      `<g class="pet-body-group"><g class="pet-art" transform="translate(130 190) scale(${grow}) translate(-130 -190)">${art}</g></g>` +
    `</svg>`;
  }

  window.ShunshiPetArt = { render };
})();
