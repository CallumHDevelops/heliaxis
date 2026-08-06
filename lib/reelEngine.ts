// Heliaxis Reel engine — animated, on-brand, size-aware scene rendering.
import { C, RAY } from './postEngine';

export type ReelTheme = 'dark' | 'light' | 'gold';
export type ReelAnim = 'up' | 'fade' | 'left';
export type ReelTransition = 'fade' | 'slide';

export interface Scene {
  id: string;
  bg: string | null;
  videoUrl?: string | null;
  videoName?: string;
  videoStart?: number;
  theme: ReelTheme;
  eyebrow: string;
  headline: string; // supports *word* -> gold
  sub: string;
  cta?: string; // optional CTA button label
  seconds: number;
  anim: ReelAnim;
  transition?: ReelTransition; // how this scene enters
}

export interface ReelFonts {
  display: string;
  body: string;
  mono: string;
}

export interface SceneMedia {
  src: CanvasImageSource;
  w: number;
  h: number;
  kenBurns: boolean;
}

export interface ReelZone {
  f: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const REEL_SIZES = {
  '9:16': { w: 1080, h: 1920, label: 'Reel 9:16' },
  '1:1': { w: 1080, h: 1080, label: 'Square 1:1' },
  '4:5': { w: 1080, h: 1350, label: 'Portrait 4:5' },
  '16:9': { w: 1920, h: 1080, label: 'Landscape 16:9' },
} as const;
export type ReelSizeKey = keyof typeof REEL_SIZES;

export const TRANS = 0.5;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

export function totalDuration(scenes: Scene[]) {
  return scenes.reduce((a, s) => a + Math.max(0.2, s.seconds), 0);
}
export function sceneStart(scenes: Scene[], i: number) {
  let start = 0;
  for (let k = 0; k < i && k < scenes.length; k++) start += Math.max(0.2, scenes[k].seconds);
  return start;
}
export function sceneIndexAt(scenes: Scene[], t: number): { i: number; lt: number } {
  const durs = scenes.map((s) => Math.max(0.2, s.seconds));
  let start = 0;
  let i = 0;
  for (; i < scenes.length; i++) {
    if (t < start + durs[i]) break;
    start += durs[i];
  }
  if (i >= scenes.length) {
    i = Math.max(0, scenes.length - 1);
    start = totalDuration(scenes) - (durs[i] || 0);
  }
  return { i, lt: t - start };
}

function drawSpark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, fill: string) {
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

function grid(ctx: CanvasRenderingContext2D, W: number, H: number, col: string, step: number) {
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapRich(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  baseCol: string,
  accentCol: string
): { t: string; c: string }[][] {
  const lines: { t: string; c: string }[][] = [];
  text.split('\n').forEach((para) => {
    const words: { t: string; c: string }[] = [];
    para.split('*').forEach((seg, i) => {
      const col = i % 2 === 1 ? accentCol : baseCol;
      seg.split(' ').forEach((w) => {
        if (w !== '') words.push({ t: w, c: col });
      });
    });
    const space = ctx.measureText(' ').width;
    let line: { t: string; c: string }[] = [];
    let lineW = 0;
    words.forEach((wd) => {
      const w = ctx.measureText(wd.t).width;
      const nw = lineW ? lineW + space + w : w;
      if (nw > maxW && line.length) {
        lines.push(line);
        line = [wd];
        lineW = w;
      } else {
        line.push(wd);
        lineW = nw;
      }
    });
    if (line.length) lines.push(line);
  });
  return lines;
}

function fillRich(
  ctx: CanvasRenderingContext2D,
  lines: { t: string; c: string }[][],
  x: number,
  y: number,
  lh: number
) {
  const space = ctx.measureText(' ').width;
  let yy = y;
  for (const line of lines) {
    let cx = x;
    for (const wd of line) {
      ctx.fillStyle = wd.c;
      ctx.fillText(wd.t, cx, yy);
      cx += ctx.measureText(wd.t).width + space;
    }
    yy += lh;
  }
  return yy;
}

function wrapPlain(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  text.split('\n').forEach((para) => {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = t;
    }
    out.push(line);
  });
  return out;
}

function entrOffset(anim: ReelAnim, e: number): [number, number] {
  const k = (1 - e) * 46;
  if (anim === 'fade') return [0, 0];
  if (anim === 'left') return [k, 0];
  return [0, k];
}

export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  lt: number,
  fam: ReelFonts,
  media: SceneMedia | null,
  alpha: number,
  W: number,
  H: number,
  offsetX = 0,
  zones?: ReelZone[]
) {
  const dur = Math.max(0.2, scene.seconds);
  const isDark = scene.theme === 'dark';
  const isGold = scene.theme === 'gold';
  const bg = isGold ? C.solar : isDark ? C.ink : C.paper;
  let fg = isGold ? C.ink : isDark ? C.paper : C.ink;
  let subCol = isGold ? 'rgba(33,31,24,.72)' : isDark ? C.mutedD : C.muted;
  let accent = isGold ? C.ink : C.solar;
  const hasMedia = !!(media && media.w && media.h);
  const ox = offsetX;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(ox, 0);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (hasMedia && media) {
    const p = clamp01(lt / dur);
    const scale = media.kenBurns ? 1.06 + 0.14 * p : 1.0;
    const ir = media.w / media.h;
    const cr = W / H;
    let dw: number;
    let dh: number;
    if (ir > cr) {
      dh = H * scale;
      dw = dh * ir;
    } else {
      dw = W * scale;
      dh = dw / ir;
    }
    const dx = (W - dw) / 2 - (media.kenBurns ? (dw - W) * 0.12 * p : 0);
    const dy = (H - dh) / 2;
    try {
      ctx.drawImage(media.src, dx, dy, dw, dh);
    } catch {
      /* frame not ready */
    }
    const og = ctx.createLinearGradient(0, 0, 0, H);
    og.addColorStop(0, 'rgba(20,18,14,.5)');
    og.addColorStop(1, 'rgba(20,18,14,.92)');
    ctx.fillStyle = og;
    ctx.fillRect(0, 0, W, H);
    fg = C.paper;
    subCol = C.mutedD;
    accent = C.solar;
    grid(ctx, W, H, 'rgba(247,242,231,.06)', Math.round(W / 17));
  } else if (!isGold) {
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
    const g = ctx.createRadialGradient(W * 0.8, H * 0.16, 0, W * 0.8, H * 0.16, W * 0.75);
    g.addColorStop(0, `rgba(248,188,30,${isDark ? 0.22 : 0.1})`);
    g.addColorStop(1, 'rgba(248,188,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    grid(ctx, W, H, isDark ? 'rgba(247,242,231,.05)' : 'rgba(33,31,24,.05)', Math.round(W / 17));
  } else {
    grid(ctx, W, H, 'rgba(33,31,24,.07)', Math.round(W / 17));
  }

  const pad = Math.round(Math.min(W, H) * 0.09);
  drawSpark(ctx, W - pad - 12, pad + 22, 44, accent);

  const x = pad;
  let cy = H * (W >= H ? 0.36 : 0.44);
  const pushZone = (f: string, zy: number, zh: number) => {
    if (zones) zones.push({ f, x: pad - 14 + ox, y: zy, w: W - pad * 2 + 28, h: zh });
  };

  if (scene.eyebrow) {
    const e = ease(lt / 0.5);
    const [ex, ey] = entrOffset(scene.anim, e);
    ctx.globalAlpha = alpha * e;
    ctx.font = `600 30px ${fam.mono}, monospace`;
    ctx.fillStyle = accent;
    ctx.fillText(scene.eyebrow.toUpperCase(), x + ex, cy + ey);
    pushZone('eyebrow', cy - 30, 52);
    cy += 70;
  }
  if (scene.headline) {
    const e = ease((lt - 0.12) / 0.55);
    const [ex, ey] = entrOffset(scene.anim, e);
    ctx.globalAlpha = alpha * e;
    ctx.font = `900 98px ${fam.display}, sans-serif`;
    const lines = wrapRich(ctx, scene.headline, W - pad * 2, fg, accent);
    const hStart = cy + 96;
    cy = fillRich(ctx, lines, x + ex, hStart + ey, 112);
    pushZone('headline', hStart - 90, cy - hStart + 40);
  }
  if (scene.sub) {
    const e = ease((lt - 0.28) / 0.55);
    const [ex, ey] = entrOffset(scene.anim, e);
    ctx.globalAlpha = alpha * e;
    ctx.font = `400 42px ${fam.body}, sans-serif`;
    ctx.fillStyle = subCol;
    let yy = cy + 60;
    const sStart = yy;
    for (const l of wrapPlain(ctx, scene.sub, (W - pad * 2) * 0.96)) {
      ctx.fillText(l, x + ex, yy + ey);
      yy += 58;
    }
    pushZone('sub', sStart - 40, yy - sStart + 20);
    cy = yy;
  }
  if (scene.cta) {
    const e = ease((lt - 0.42) / 0.5);
    ctx.globalAlpha = alpha * e;
    ctx.font = `700 42px ${fam.display}, sans-serif`;
    const label = scene.cta + '  →';
    const tw = ctx.measureText(label).width;
    const bw = tw + 64;
    const bh = 88;
    const byp = cy + 44 + (1 - e) * 18;
    ctx.fillStyle = accent;
    roundRect(ctx, x, byp, bw, bh, 12);
    ctx.fill();
    ctx.fillStyle = isGold ? C.paper : C.ink;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 32, byp + bh / 2);
    ctx.textBaseline = 'alphabetic';
    if (zones) zones.push({ f: 'cta', x: x + ox, y: byp, w: bw, h: bh });
  }

  ctx.globalAlpha = alpha;
  ctx.font = `500 24px ${fam.mono}, monospace`;
  ctx.fillStyle = subCol;
  ctx.fillText('HELIAXIS.CO.UK · 01633 965205', pad, H - pad);

  ctx.restore();
}

export function renderReel(
  ctx: CanvasRenderingContext2D,
  scenes: Scene[],
  t: number,
  mediaFor: (s: Scene) => SceneMedia | null,
  fam: ReelFonts,
  W: number,
  H: number
): ReelZone[] {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  const zones: ReelZone[] = [];
  if (!scenes.length) return zones;

  const { i, lt } = sceneIndexAt(scenes, t);
  const durs = scenes.map((s) => Math.max(0.2, s.seconds));
  const incoming = scenes[i];

  if (lt < TRANS && i > 0) {
    const p = ease(lt / TRANS);
    const slide = (incoming.transition || 'fade') === 'slide';
    if (slide) {
      drawSceneFrame(ctx, scenes[i - 1], durs[i - 1], fam, mediaFor(scenes[i - 1]), 1, W, H, -W * p);
      drawSceneFrame(ctx, incoming, lt, fam, mediaFor(incoming), 1, W, H, W * (1 - p), zones);
    } else {
      drawSceneFrame(ctx, scenes[i - 1], durs[i - 1], fam, mediaFor(scenes[i - 1]), 1, W, H, 0);
      drawSceneFrame(ctx, incoming, lt, fam, mediaFor(incoming), p, W, H, 0, zones);
    }
  } else {
    drawSceneFrame(ctx, incoming, lt, fam, mediaFor(incoming), 1, W, H, 0, zones);
  }
  return zones;
}
