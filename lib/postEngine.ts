// Heliaxis Post Studio — rendering engine.
// Framework-agnostic: renderPost(canvas, state, images) paints a post.

import { getIconPaths } from './icons';

export const RAY = 'M11 9.6 L13 9.6 L13 0.8 L11 3 Z';

export interface Badge {
  icon: string; // icon id, e.g. "ic-shield"
  label: string;
}

export const C = {
  ink: '#211F18',
  ink2: '#2c2820',
  solar: '#F8BC1E',
  amber: '#E39A0C',
  amber2: '#C77F04',
  paper: '#F7F2E7',
  paper2: '#EFE8D8',
  card: '#FFFDF8',
  muted: '#6E6A5E',
  mutedD: '#A69F8E',
};

export type SizeKey = 'square' | 'portrait' | 'landscape' | 'story';
export const SIZES: Record<SizeKey, { w: number; h: number; label: string; note: string; use: string }> = {
  square: { w: 1080, h: 1080, label: 'Square', note: '1080 × 1080', use: 'Instagram, Facebook, LinkedIn feed' },
  portrait: { w: 1080, h: 1350, label: 'Portrait', note: '1080 × 1350', use: 'Instagram — most feed space' },
  landscape: { w: 1200, h: 628, label: 'Landscape', note: '1200 × 628', use: 'LinkedIn & Facebook links' },
  story: { w: 1080, h: 1920, label: 'Story', note: '1080 × 1920', use: 'Instagram / Facebook stories' },
};

export type ThemeKey = 'dark' | 'light' | 'gold';
export const THEMES: Record<ThemeKey, string> = { dark: 'Dark', light: 'Light', gold: 'Gold' };

export type TemplateKey =
  | 'statement'
  | 'stat'
  | 'offer'
  | 'quote'
  | 'question'
  | 'list'
  | 'tool'
  | 'announce';

export interface Template {
  name: string;
  desc: string;
  fields: string[];
  defaults: Record<string, string>;
  caption: (d: Record<string, string>) => string;
  tags: string[];
}

export const TEMPLATES: Record<TemplateKey, Template> = {
  statement: {
    name: 'Statement',
    desc: 'Headline + support',
    fields: ['eyebrow', 'headline', 'sub', 'footer'],
    defaults: {
      eyebrow: 'MCS-CERTIFIED · SOUTH WALES',
      headline: 'Energy that revolves around *you.*',
      sub: 'Solar, battery, heating and EV charging — designed around how you actually use energy.',
      footer: 'heliaxis.co.uk · 01633 965205',
    },
    caption: (d) =>
      d.headline.split('*').join('') +
      '\n\n' +
      d.sub +
      '\n\nBook a free, no-obligation survey — we survey before we quote, and we show the assumptions behind every number.\n\n📞 01633 965205\n🔗 heliaxis.co.uk',
    tags: ['#SolarPV', '#RenewableEnergy', '#SouthWales', '#SolarPanels', '#EnergyBills'],
  },
  stat: {
    name: 'Stat / proof',
    desc: 'One big number',
    fields: ['eyebrow', 'stat', 'statlabel', 'sub', 'footer'],
    defaults: {
      eyebrow: 'CUSTOMER STORY · CARDIFF',
      stat: '£1,400',
      statlabel: 'saved every year.',
      sub: 'A 4-bed home fitted with 6.4 kWp of solar and a 10 kWh battery.',
      footer: 'heliaxis.co.uk · 01633 965205',
    },
    caption: (d) =>
      d.stat +
      ' ' +
      d.statlabel +
      '\n\n' +
      d.sub +
      '\n\nEvery figure we publish is one we can evidence — and we show the assumptions behind it so you can check them.\n\nWant to know what your roof could do? Free survey, no obligation.\n\n📞 01633 965205',
    tags: ['#SolarSavings', '#EnergyBills', '#SolarPV', '#SouthWales', '#CaseStudy'],
  },
  offer: {
    name: 'Offer',
    desc: 'Deadline / urgency',
    fields: ['eyebrow', 'headline', 'sub', 'badge', 'cta', 'footer'],
    defaults: {
      eyebrow: 'LIMITED-TIME SAVING',
      headline: '0% VAT on *home solar*',
      sub: 'Qualifying residential installations carry no VAT — until the scheme ends.',
      badge: 'ENDS MARCH 2027',
      cta: 'Get a free quote',
      footer: 'heliaxis.co.uk · 01633 965205',
    },
    caption: (d) =>
      d.headline.split('*').join('') +
      ' — ' +
      d.badge.toLowerCase() +
      '.\n\n' +
      d.sub +
      '\n\nCheck the current rules apply to your property — we will tell you straight whether you qualify.\n\n📞 01633 965205\n🔗 heliaxis.co.uk',
    tags: ['#SolarPanels', '#0PercentVAT', '#HomeEnergy', '#SouthWales', '#SolarPV'],
  },
  quote: {
    name: 'Testimonial',
    desc: 'Customer words',
    fields: ['quote', 'name', 'location', 'stars', 'footer'],
    defaults: {
      quote: 'From survey to switch-on it was faultless. Bills dropped straight away.',
      name: 'The Jones family',
      location: 'Cardiff',
      stars: '5',
      footer: 'heliaxis.co.uk · 01633 965205',
    },
    caption: (d) =>
      '"' +
      d.quote +
      '"\n— ' +
      d.name +
      ', ' +
      d.location +
      '\n\nThank you. Reviews like this are the only marketing that really counts.\n\nThinking about solar or battery storage? Free survey, honest figures, no pushy sales.\n\n📞 01633 965205',
    tags: ['#CustomerReview', '#SolarPV', '#SouthWales', '#Testimonial', '#RenewableEnergy'],
  },
  question: {
    name: 'Myth / Q&A',
    desc: 'Question + answer',
    fields: ['eyebrow', 'headline', 'sub', 'footer'],
    defaults: {
      eyebrow: 'STRAIGHT ANSWERS',
      headline: 'Does solar actually work in *Wales?*',
      sub: 'Yes. Panels generate from daylight, not heat — and they run more efficiently in cooler temperatures than in a heatwave. What matters is orientation and shading, not sunshine.',
      footer: 'heliaxis.co.uk · 01633 965205',
    },
    caption: (d) =>
      d.headline.split('*').join('') +
      '\n\n' +
      d.sub +
      '\n\nIt is the question we get asked more than any other — so here is the honest answer.\n\nGot a question of your own? Ask away.\n\n🔗 heliaxis.co.uk',
    tags: ['#SolarPV', '#SolarMyths', '#SouthWales', '#RenewableEnergy', '#EnergyAdvice'],
  },
  list: {
    name: 'Tips / list',
    desc: '3 points',
    fields: ['eyebrow', 'headline', 'item1', 'item2', 'item3', 'footer'],
    defaults: {
      eyebrow: 'BEFORE YOU BUY',
      headline: 'Three things to check in *any solar quote*',
      item1: 'The assumed annual yield — and whether it is stated at all',
      item2: 'The import and export rates the savings are based on',
      item3: 'Whether the installer is MCS-certified',
      footer: 'heliaxis.co.uk · 01633 965205',
    },
    caption: (d) =>
      d.headline.split('*').join('') +
      '\n\n1. ' +
      d.item1 +
      '\n2. ' +
      d.item2 +
      '\n3. ' +
      d.item3 +
      '\n\nIf a quote will not show you its assumptions, that tells you something.\n\nWe show ours as standard — check them against anyone else\u2019s.\n\n📞 01633 965205',
    tags: ['#SolarAdvice', '#SolarPanels', '#EnergyTips', '#SouthWales', '#MCS'],
  },
  tool: {
    name: 'Tool / CTA',
    desc: 'Drive to estimator',
    fields: ['eyebrow', 'headline', 'sub', 'cta', 'footer'],
    defaults: {
      eyebrow: 'FREE ONLINE TOOL',
      headline: 'Draw your roof.\nSee your *savings.*',
      sub: 'In 20 seconds. No forms, no email wall.',
      cta: 'Try the estimator',
      footer: 'heliaxis.co.uk · 01633 965205',
    },
    caption: (d) =>
      d.headline.split('*').join('').split('\n').join(' ') +
      '\n\n' +
      d.sub +
      '\n\nIt is an estimate, not a quote — but we show you the assumptions behind it, which is more than most.\n\n🔗 heliaxis.co.uk',
    tags: ['#SolarCalculator', '#SolarPV', '#SouthWales', '#EnergySavings', '#FreeTool'],
  },
  announce: {
    name: 'Announcement',
    desc: 'News / grant',
    fields: ['eyebrow', 'headline', 'sub', 'footer'],
    defaults: {
      eyebrow: 'FUNDING NEWS',
      headline: 'Grant funding for *Newport SMEs*',
      sub: 'Match funding is available toward energy efficiency and renewable generation for eligible local businesses. We will check whether you qualify.',
      footer: 'heliaxis.co.uk · 01633 965205',
    },
    caption: (d) =>
      d.headline.split('*').join('') +
      '\n\n' +
      d.sub +
      '\n\nGrant rounds are time-limited and often oversubscribed — worth checking early.\n\nWe will give you a straight answer on eligibility, free of charge.\n\n📞 01633 965205',
    tags: ['#BusinessGrants', '#Newport', '#NetZero', '#CommercialSolar', '#SouthWales'],
  },
};

export const FIELD_LABELS: Record<string, string> = {
  eyebrow: 'Eyebrow (small caps)',
  headline: 'Headline — wrap *words* in asterisks for gold',
  sub: 'Supporting text',
  footer: 'Footer / contact',
  stat: 'The number',
  statlabel: 'What it means',
  badge: 'Badge / deadline',
  cta: 'Button text',
  quote: 'Quote',
  name: 'Name',
  location: 'Town',
  stars: 'Stars (1–5)',
  item1: 'Point 1',
  item2: 'Point 2',
  item3: 'Point 3',
};

export interface PostState {
  tpl: TemplateKey;
  size: SizeKey;
  theme: ThemeKey;
  hatch: boolean;
  data: Record<string, string>;
  badges?: Badge[];
  photoShade?: number; // 0..~0.9 dark overlay strength on photo backgrounds
  brands?: string[]; // brand-logo ids shown bottom-right ("Trusted installers of")
}

export interface ClickZone {
  f: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderImages {
  light?: HTMLImageElement | null;
  dark?: HTMLImageElement | null;
  black?: HTMLImageElement | null;
  photo?: HTMLImageElement | null;
  brands?: HTMLImageElement[];
}

export interface Fonts {
  display: string; // e.g. Ezra family name from next/font
  body: string;
  mono: string;
}

// Returns the click zones so the UI can map canvas clicks to fields.
export function renderPost(
  canvas: HTMLCanvasElement,
  S: PostState,
  imgs: RenderImages,
  fam: Fonts
): ClickZone[] {
  const ctx = canvas.getContext('2d')!;
  const sz = SIZES[S.size];
  const W = sz.w;
  const H = sz.h;
  canvas.width = W;
  canvas.height = H;
  const zones: ClickZone[] = [];
  const zone = (f: string, x: number, y: number, w: number, hh: number) =>
    zones.push({ f, x, y, w, h: hh });

  const d = S.data;
  const tpl = S.tpl;
  const isDark = S.theme === 'dark';
  const isGold = S.theme === 'gold';
  let bg = isGold ? C.solar : isDark ? C.ink : C.paper;
  let fg = isGold ? C.ink : isDark ? C.paper : C.ink;
  let sub = isGold ? 'rgba(33,31,24,.72)' : isDark ? C.mutedD : C.muted;
  let accent = isGold ? C.ink : C.solar;
  let eyeCol = isGold ? 'rgba(33,31,24,.78)' : isDark ? C.solar : C.amber2;

  const setFont = (weight: string | number, size: number) =>
    (ctx.font = weight + ' ' + size + 'px ' + fam.display + ', sans-serif');
  const setMono = (size: number, weight: number = 500) =>
    (ctx.font = weight + ' ' + size + 'px ' + fam.mono + ', monospace');
  const setBody = (size: number, weight: number = 400) =>
    (ctx.font = weight + ' ' + size + 'px ' + fam.body + ', system-ui, sans-serif');

  function sparkPath(cx: number, cy: number, size: number, fill: string) {
    const s = size / 24;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-12, -12);
    ctx.fillStyle = fill;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(12, 12);
      ctx.rotate((i * Math.PI) / 2);
      ctx.translate(-12, -12);
      ctx.fill(new Path2D(RAY));
      ctx.restore();
    }
    ctx.restore();
  }
  function grid(col: string, step: number, fadeFrom: number) {
    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = H;
    const tc = tmp.getContext('2d')!;
    tc.strokeStyle = col;
    tc.lineWidth = 1;
    for (let x = 0; x < W; x += step) {
      tc.beginPath();
      tc.moveTo(x + 0.5, 0);
      tc.lineTo(x + 0.5, H);
      tc.stroke();
    }
    for (let y = 0; y < H; y += step) {
      tc.beginPath();
      tc.moveTo(0, y + 0.5);
      tc.lineTo(W, y + 0.5);
      tc.stroke();
    }
    const g = ctx.createLinearGradient(0, 0, W * 0.9, H);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(fadeFrom, 'rgba(255,255,255,0)');
    tc.globalCompositeOperation = 'destination-in';
    tc.fillStyle = g;
    tc.fillRect(0, 0, W, H);
    ctx.drawImage(tmp, 0, 0);
  }
  function glow(x: number, y: number, r: number, rgb: string, alpha: number) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // Average perceptual luminance (0=black … 1=white) of a region of the
  // already-composited canvas, so text colour can adapt to what's behind it.
  function avgLuminance(x: number, y: number, w: number, h: number) {
    x = Math.max(0, Math.min(W - 1, x));
    y = Math.max(0, Math.min(H - 1, y));
    w = Math.max(1, Math.min(W - x, w));
    h = Math.max(1, Math.min(H - y, h));
    try {
      const data = ctx.getImageData(x, y, w, h).data;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 40) {
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        n++;
      }
      return n ? sum / n / 255 : 0;
    } catch {
      return 0; // tainted canvas — assume dark, use light text
    }
  }
  function wrap(text: string, maxW: number) {
    const lines: string[] = [];
    text.split('\n').forEach((para) => {
      const words = para.split(' ');
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && line) {
          lines.push(line);
          line = w;
        } else line = t;
      }
      lines.push(line);
    });
    return lines;
  }
  function drawRich(
    text: string,
    x: number,
    y: number,
    maxW: number,
    lh: number,
    baseCol: string,
    accentCol: string
  ) {
    let yy = y;
    text.split('\n').forEach((para) => {
      const segs = para.split('*');
      const words: { t: string; c: string }[] = [];
      segs.forEach((seg, i) => {
        const col = i % 2 === 1 ? accentCol : baseCol;
        seg.split(' ').forEach((w) => {
          if (w !== '') words.push({ t: w, c: col });
        });
      });
      const space = ctx.measureText(' ').width;
      let line: { t: string; c: string }[] = [];
      let lineW = 0;
      const flush = () => {
        if (!line.length) return;
        let cx = x;
        line.forEach((wd) => {
          ctx.fillStyle = wd.c;
          ctx.fillText(wd.t, cx, yy);
          cx += ctx.measureText(wd.t).width + space;
        });
        yy += lh;
        line = [];
        lineW = 0;
      };
      words.forEach((wd) => {
        const w = ctx.measureText(wd.t).width;
        const nw = lineW ? lineW + space + w : w;
        if (nw > maxW && line.length) {
          flush();
          lineW = w;
          line = [wd];
        } else {
          lineW = nw;
          line.push(wd);
        }
      });
      flush();
    });
    return yy;
  }
  function drawLines(text: string, x: number, y: number, maxW: number, lh: number, col: string) {
    ctx.fillStyle = col;
    let yy = y;
    wrap(text, maxW).forEach((l) => {
      ctx.fillText(l, x, yy);
      yy += lh;
    });
    return yy;
  }
  function tracked(text: string, x: number, y: number, tracking: number, col: string) {
    ctx.fillStyle = col;
    let cx = x;
    for (const ch of text) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + tracking;
    }
  }
  function roundRectPath(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // draw a 24x24 icon (by id) scaled into a box at (x,y)
  function drawIcon(id: string, x: number, y: number, size: number, strokeCol: string, fillCol: string) {
    const paths = getIconPaths(id);
    if (!paths.length) return;
    const sc = size / 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.lineWidth = 1.7;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const p of paths) {
      const pth = new Path2D(p.d);
      if (p.fill) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = fillCol;
        ctx.fill(pth);
        ctx.restore();
      } else {
        ctx.strokeStyle = strokeCol;
        ctx.stroke(pth);
      }
    }
    ctx.restore();
  }

  // ---- background ----
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (imgs.photo) {
    const ir = imgs.photo.width / imgs.photo.height;
    const cr = W / H;
    let dw, dh, dx, dy;
    if (ir > cr) {
      dh = H;
      dw = H * ir;
      dx = (W - dw) / 2;
      dy = 0;
    } else {
      dw = W;
      dh = W / ir;
      dx = 0;
      dy = (H - dh) / 2;
    }
    ctx.drawImage(imgs.photo, dx, dy, dw, dh);
    const shade = typeof S.photoShade === 'number' ? S.photoShade : 0.62;
    const og = ctx.createLinearGradient(0, 0, 0, H);
    og.addColorStop(0, `rgba(20,18,14,${shade})`);
    og.addColorStop(1, `rgba(20,18,14,${Math.min(0.98, shade + 0.28)})`);
    ctx.fillStyle = og;
    ctx.fillRect(0, 0, W, H);
    if (S.hatch) grid('rgba(247,242,231,.06)', Math.round(W / 17), 0.72);
    glow(W * 0.82, H * 0.12, W * 0.55, '248,188,30', 0.14);
    // pick readable colours from the actual composited background where text sits
    const lum = avgLuminance(
      Math.round(W * 0.08),
      Math.round(H * 0.14),
      Math.round(W * 0.7),
      Math.round(H * 0.62)
    );
    const lightText = lum < 0.58;
    fg = lightText ? C.paper : C.ink;
    sub = lightText ? 'rgba(247,242,231,0.92)' : 'rgba(33,31,24,0.82)';
    accent = lightText ? C.solar : C.amber2;
    eyeCol = accent;
  } else {
    if (!isGold) {
      const gr = ctx.createLinearGradient(0, 0, W, H);
      if (isDark) {
        gr.addColorStop(0, C.ink);
        gr.addColorStop(1, C.ink2);
      } else {
        gr.addColorStop(0, C.paper);
        gr.addColorStop(1, C.paper2);
      }
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
    if (S.hatch)
      grid(
        isGold ? 'rgba(33,31,24,.07)' : isDark ? 'rgba(247,242,231,.05)' : 'rgba(33,31,24,.05)',
        Math.round(W / 17),
        0.82
      );
    if (!isGold) glow(W * 0.82, H * 0.12, W * 0.62, '248,188,30', isDark ? 0.26 : 0.1);
  }

  const pad = Math.round(W * 0.085);
  const maxW = W - pad * 2;
  const u = W / 1080;

  // logo top-left
  const lg = isDark || imgs.photo ? imgs.light : isGold && imgs.black ? imgs.black : imgs.dark;
  if (lg && lg.complete && lg.naturalWidth) {
    const lh2 = Math.round(46 * u);
    const lw = lh2 * (lg.naturalWidth / lg.naturalHeight);
    ctx.drawImage(lg, pad, pad, lw, lh2);
  }
  sparkPath(W - pad - Math.round(20 * u), pad + Math.round(22 * u), Math.round(40 * u), accent);

  // over a photo, drop a soft shadow behind all text for guaranteed legibility
  if (imgs.photo) {
    ctx.shadowColor = fg === C.paper ? 'rgba(0,0,0,0.55)' : 'rgba(247,242,231,0.6)';
    ctx.shadowBlur = Math.round(12 * u);
    ctx.shadowOffsetY = Math.round(2 * u);
  }

  // footer
  if (d.footer) {
    setMono(Math.round(19 * u), 500);
    ctx.fillStyle = sub;
    const fy = H - pad + Math.round(6 * u);
    ctx.fillText(d.footer.toUpperCase(), pad, fy);
    zone('footer', pad - 10, fy - Math.round(30 * u), maxW, Math.round(48 * u));
  }

  // brand / "trusted installers of" logos — bottom-right, on a light backing
  const brandImgs = (imgs.brands || []).filter((im) => im && im.complete && im.naturalWidth);
  if (brandImgs.length) {
    const logoH = Math.round((S.size === 'landscape' ? 32 : 48) * u);
    const gapX = Math.round(16 * u);
    const dims = brandImgs.map((im) => ({
      im,
      w: logoH * (im.naturalWidth / Math.max(1, im.naturalHeight)),
    }));
    const rowW = dims.reduce((a, dd) => a + dd.w, 0) + gapX * Math.max(0, dims.length - 1);
    const rightX = W - pad;
    const rowBottom = H - pad + Math.round(2 * u);
    const rowTop = rowBottom - logoH;
    const padB = Math.round(10 * u);
    roundRectPath(rightX - rowW - padB, rowTop - padB, rowW + padB * 2, logoH + padB * 2, Math.round(8 * u));
    ctx.fillStyle = 'rgba(247,242,231,0.94)';
    ctx.fill();
    setMono(Math.round(15 * u), 600);
    ctx.fillStyle = sub;
    ctx.textAlign = 'right';
    ctx.fillText('TRUSTED INSTALLERS OF', rightX, rowTop - padB - Math.round(12 * u));
    ctx.textAlign = 'left';
    let bxr = rightX - rowW;
    for (const dd of dims) {
      ctx.drawImage(dd.im, bxr, rowTop, dd.w, logoH);
      bxr += dd.w + gapX;
    }
  }


  const top = pad + Math.round((S.size === 'landscape' ? 64 : 120) * u);
  let cy = top;
  const eyebrow = (txt: string, y: number) => {
    if (!txt) return y;
    setMono(Math.round(21 * u), 600);
    sparkPath(pad + Math.round(9 * u), y - Math.round(7 * u), Math.round(20 * u), eyeCol);
    tracked(txt.toUpperCase(), pad + Math.round(30 * u), y, Math.round(3.4 * u), eyeCol);
    zone('eyebrow', pad - 10, y - Math.round(34 * u), maxW, Math.round(52 * u));
    return y + Math.round(66 * u);
  };

  if (tpl === 'stat') {
    cy = eyebrow(d.eyebrow, top);
    // auto-fit the big number so long figures (e.g. "4,200 kWh") never overflow
    let statSize = 200;
    setFont(900, Math.round(statSize * u));
    while (statSize > 64 && ctx.measureText(d.stat).width > maxW) {
      statSize -= 6;
      setFont(900, Math.round(statSize * u));
    }
    ctx.fillStyle = accent;
    const statBase = cy + Math.round(statSize * 0.75 * u);
    ctx.fillText(d.stat, pad, statBase);
    zone('stat', pad - 10, cy, maxW, Math.round(statSize * u));
    cy = statBase + Math.round(60 * u);
    setFont(800, Math.round(64 * u));
    const sl = cy;
    cy = drawLines(d.statlabel, pad, cy, maxW, Math.round(70 * u), fg);
    zone('statlabel', pad - 10, sl - Math.round(60 * u), maxW, cy - sl + Math.round(20 * u));
    if (d.sub) {
      setBody(Math.round(34 * u), 400);
      cy += Math.round(24 * u);
      const ss = cy;
      cy = drawLines(d.sub, pad, cy, maxW * 0.92, Math.round(46 * u), sub);
      zone('sub', pad - 10, ss - Math.round(30 * u), maxW, cy - ss + Math.round(10 * u));
    }
  } else if (tpl === 'quote') {
    ctx.fillStyle = accent;
    setFont(900, Math.round(150 * u));
    ctx.fillText('\u201C', pad, top + Math.round(90 * u));
    cy = top + Math.round(150 * u);
    setFont(800, Math.round(56 * u));
    const qs = cy;
    cy = drawLines(d.quote, pad, cy, maxW, Math.round(70 * u), fg);
    zone('quote', pad - 10, qs - Math.round(56 * u), maxW, cy - qs + Math.round(20 * u));
    cy += Math.round(40 * u);
    const n = Math.max(1, Math.min(5, parseInt(d.stars || '5', 10)));
    setBody(Math.round(34 * u), 600);
    ctx.fillStyle = accent;
    let stars = '';
    for (let i = 0; i < n; i++) stars += '\u2605 ';
    ctx.fillText(stars.trim(), pad, cy);
    cy += Math.round(46 * u);
    setMono(Math.round(24 * u), 500);
    ctx.fillStyle = sub;
    ctx.fillText((d.name + ' \u00b7 ' + d.location).toUpperCase(), pad, cy);
    zone('name', pad - 10, cy - Math.round(28 * u), maxW, Math.round(44 * u));
  } else if (tpl === 'list') {
    cy = eyebrow(d.eyebrow, top);
    setFont(900, Math.round(74 * u));
    const hs = cy + Math.round(34 * u);
    cy = drawRich(d.headline, pad, hs, maxW, Math.round(84 * u), fg, accent);
    zone('headline', pad - 10, hs - Math.round(74 * u), maxW, cy - hs + Math.round(30 * u));
    cy += Math.round(40 * u);
    const items = [d.item1, d.item2, d.item3];
    items.forEach((it, i) => {
      if (!it) return;
      setMono(Math.round(30 * u), 600);
      ctx.fillStyle = accent;
      ctx.fillText('0' + (i + 1), pad, cy);
      setBody(Math.round(34 * u), 500);
      const ny = drawLines(
        it,
        pad + Math.round(74 * u),
        cy,
        maxW - Math.round(74 * u),
        Math.round(44 * u),
        fg
      );
      zone('item' + (i + 1), pad - 10, cy - Math.round(30 * u), maxW, ny - cy + Math.round(20 * u));
      ctx.strokeStyle = isDark ? 'rgba(247,242,231,.14)' : 'rgba(33,31,24,.12)';
      ctx.beginPath();
      ctx.moveTo(pad, ny + Math.round(14 * u));
      ctx.lineTo(W - pad, ny + Math.round(14 * u));
      ctx.stroke();
      cy = ny + Math.round(48 * u);
    });
  } else {
    // statement / offer / question / tool / announce
    cy = eyebrow(d.eyebrow, top);
    const hsz = S.size === 'landscape' ? 62 : 82;
    setFont(900, Math.round(hsz * u));
    const hStart = cy + Math.round(40 * u);
    cy = drawRich(d.headline, pad, hStart, maxW, Math.round(hsz * 1.12 * u), fg, accent);
    zone('headline', pad - 10, hStart - Math.round(hsz * u), maxW, cy - hStart + Math.round(hsz * 0.4 * u));
    if (d.sub) {
      const subSz = S.size === 'landscape' ? 30 : 36;
      const subLh = S.size === 'landscape' ? 42 : 50;
      setBody(Math.round(subSz * u), 400);
      cy += Math.round((S.size === 'landscape' ? 16 : 26) * u);
      const ss = cy;
      cy = drawLines(d.sub, pad, cy, maxW * 0.95, Math.round(subLh * u), sub);
      zone('sub', pad - 10, ss - Math.round(34 * u), maxW, cy - ss + Math.round(10 * u));
    }
    if (d.badge) {
      cy += Math.round(34 * u);
      setMono(Math.round(24 * u), 600);
      const bw = ctx.measureText(d.badge.toUpperCase()).width + Math.round(40 * u);
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1, Math.round(2 * u));
      ctx.strokeRect(pad, cy - Math.round(30 * u), bw, Math.round(52 * u));
      ctx.fillStyle = accent;
      ctx.fillText(d.badge.toUpperCase(), pad + Math.round(20 * u), cy + Math.round(2 * u));
      zone('badge', pad - 10, cy - Math.round(34 * u), maxW, Math.round(60 * u));
      cy += Math.round(60 * u);
    }
    if (d.cta) {
      cy += Math.round(24 * u);
      setFont(700, Math.round(34 * u));
      const cw = ctx.measureText(d.cta + '  \u2192').width + Math.round(56 * u);
      ctx.fillStyle = accent;
      ctx.fillRect(pad, cy - Math.round(38 * u), cw, Math.round(64 * u));
      ctx.fillStyle = isGold ? C.paper : C.ink;
      ctx.fillText(d.cta + '  \u2192', pad + Math.round(28 * u), cy);
      zone('cta', pad - 10, cy - Math.round(42 * u), cw + 20, Math.round(72 * u));
    }
  }

  // accreditations strip
  const badges = S.badges || [];
  if (badges.length) {
    const land = S.size === 'landscape';
    const iconSz = Math.round((land ? 22 : 32) * u);
    const padIn = Math.round((land ? 9 : 12) * u);
    const gap = Math.round((land ? 7 : 10) * u);
    const lblSz = Math.round((land ? 15 : 20) * u);
    const pillH = Math.round((land ? 34 : 50) * u);

    const widthOf = (label: string) => {
      setMono(lblSz, 600);
      const lblW = label ? ctx.measureText(label).width : 0;
      return padIn + iconSz + (label ? Math.round(8 * u) + lblW : 0) + padIn;
    };
    const drawPill = (bx: number, by: number, pillW: number, bd: Badge, label: string) => {
      roundRectPath(bx, by - pillH / 2, pillW, pillH, Math.round(7 * u));
      ctx.strokeStyle = sub;
      ctx.lineWidth = Math.max(1, Math.round(1.4 * u));
      ctx.stroke();
      drawIcon(bd.icon, bx + padIn, by - iconSz / 2, iconSz, fg, accent);
      if (label) {
        setMono(lblSz, 600);
        ctx.fillStyle = fg;
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + padIn + iconSz + Math.round(8 * u), by);
        ctx.textBaseline = 'alphabetic';
      }
    };

    if (land) {
      // landscape is short & wide — sit the badges on the footer row, bottom-right
      const items = badges.map((bd) => {
        const label = (bd.label || '').toUpperCase();
        return { bd, label, w: widthOf(label) };
      });
      const totalW = items.reduce((a, it) => a + it.w, 0) + gap * Math.max(0, items.length - 1);
      let bx = W - pad - totalW;
      const by = H - pad - Math.round(4 * u);
      for (const it of items) {
        drawPill(bx, by, it.w, it.bd, it.label);
        bx += it.w + gap;
      }
    } else {
      // stacked just above the footer; extra rows wrap upward
      let bx = pad;
      let by = H - pad - Math.round(56 * u);
      for (const bd of badges) {
        const label = (bd.label || '').toUpperCase();
        const w = widthOf(label);
        if (bx + w > W - pad && bx > pad) {
          bx = pad;
          by -= pillH + gap;
        }
        drawPill(bx, by, w, bd, label);
        bx += w + gap;
      }
    }
  }

  return zones;
}
