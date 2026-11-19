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
    const mythic = species === 'baize' || species === 'qilin' || species === 'zhulong';
    const water = species === 'otter' || species === 'whale';
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
    if (mythic) {
      ground = `<g class="pet-clouds">` +
        cloud(20, 172, 1.1, p.belly, 0.5) + cloud(174, 166, 1.25, p.belly, 0.44) + cloud(82, 181, 0.8, p.belly, 0.36) +
        `<path d="M24 184c18-6 34-6 50 0s34 6 50 0 34-6 50 0 30 5 44 0" fill="none" stroke="${p.accent}" stroke-opacity=".22" stroke-width="1.6" stroke-linecap="round"/>` +
      `</g>`;
    } else if (water) {
      ground = `<g class="pet-water"><ellipse cx="130" cy="184" rx="96" ry="13" fill="${p.accent}" opacity=".12"/>` +
        `<path d="M28 184c17-6 34-6 51 0s34 6 51 0 34-6 51 0 34 6 51 0" fill="none" stroke="${p.accent}" stroke-opacity=".36" stroke-width="1.8" stroke-linecap="round"/>` +
        `<path d="M54 190c14-4 28-4 42 0s28 4 42 0 28-4 42 0" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.2" stroke-linecap="round"/>` +
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

  function render(opts) {
    const o = opts || {};
    const species = ['otter', 'fox', 'whale', 'bird', 'baize', 'qilin', 'zhulong'].includes(o.species) ? o.species : 'otter';
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
    else art = zhulongArt(s, p, ids);
    const grow = [0.86, 0.93, 1, 1.07][s - 1];
    return `<svg class="pet-svg pet-stage-${s}${o.fused ? ' is-fused' : ''}" viewBox="0 0 260 210" role="img" aria-label="${o.label || '神兽'}">` +
      petDefs(uid, p, o.fused) + bg.fusion + bg.aura + bg.ground + bg.bubbles + bg.shadow +
      `<g class="pet-body-group"><g class="pet-art" transform="translate(130 190) scale(${grow}) translate(-130 -190)">${art}</g></g>` +
    `</svg>`;
  }

  window.ShunshiPetArt = { render };
})();
