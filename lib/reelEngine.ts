// Heliaxis Reel engine — animated, on-brand scene rendering for 9:16 reels.
import { C, RAY } from './postEngine';

export type ReelTheme = 'dark' | 'light' | 'gold';
export type ReelAnim = 'up' | 'fade' | 'left';

export interface Scene {
  id: string;
  bg: string | null; // image data URL, or null for a branded gradient
  theme: ReelTheme;
  eyebrow: string;
  headline: string; // supports *word* -> gold
  sub: string;
  seconds: number;
  anim: ReelAnim;
}

export interface ReelFonts {
  display: string;
  body: string;
  mono: string;
}

export const REEL_W = 1080;
export const REEL_H = 1920;
export const TRANS = 0.45; // cross-fade duration (s)

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

export function totalDuration(scenes: Scene[]) {
  return scenes.reduce((a, s) => a + Math.max(0.2, s.seconds), 0);
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

// wrap into lines of coloured words, honouring *accent* segments
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

// offset for an element's entrance, based on the scene's anim style
function entrOffset(anim: ReelAnim, e: number): [number, number] {
  const k = (1 - e) * 46;
  if (anim === 'fade') return [0, 0];
  if (anim === 'left') return [k, 0];
  return [0, k]; // up
}

export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  lt: number,
  fam: ReelFonts,
  img: HTMLImageElement | null,
  alpha: number
) {
  const W = REEL_W;
  const H = REEL_H;
  const dur = Math.max(0.2, scene.seconds);
  const isDark = scene.theme === 'dark';
  const isGold = scene.theme === 'gold';
  const bg = isGold ? C.solar : isDark ? C.ink : C.paper;
  let fg = isGold ? C.ink : isDark ? C.paper : C.ink;
  let subCol = isGold ? 'rgba(33,31,24,.72)' : isDark ? C.mutedD : C.muted;
  let accent = isGold ? C.ink : C.solar;
  const eyeCol = accent;

  ctx.save();
  ctx.globalAlpha = alpha;

  // background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (img && img.complete && img.naturalWidth) {
    const p = clamp01(lt / dur);
    const scale = 1.06 + 0.14 * p; // Ken Burns zoom
    const ir = img.naturalWidth / img.naturalHeight;
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
    const dx = (W - dw) / 2 - (dw - W) * 0.12 * p;
    const dy = (H - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    const og = ctx.createLinearGradient(0, 0, 0, H);
    og.addColorStop(0, 'rgba(20,18,14,.5)');
    og.addColorStop(1, 'rgba(20,18,14,.92)');
    ctx.fillStyle = og;
    ctx.fillRect(0, 0, W, H);
    fg = C.paper;
    subCol = C.mutedD;
    accent = C.solar;
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
  }

  const pad = Math.round(W * 0.09);
  drawSpark(ctx, W - pad - 12, pad + 22, 44, accent);

  // text block, lower third-ish
  const x = pad;
  let cy = H * 0.46;

  if (scene.eyebrow) {
    const e = ease((lt - 0.0) / 0.5);
    const [ox, oy] = entrOffset(scene.anim, e);
    ctx.globalAlpha = alpha * e;
    ctx.font = `600 30px ${fam.mono}, monospace`;
    ctx.fillStyle = eyeCol;
    ctx.fillText(scene.eyebrow.toUpperCase(), x + ox, cy + oy);
    cy += 70;
  }

  if (scene.headline) {
    const e = ease((lt - 0.12) / 0.55);
    const [ox, oy] = entrOffset(scene.anim, e);
    ctx.globalAlpha = alpha * e;
    ctx.font = `900 98px ${fam.display}, sans-serif`;
    const lines = wrapRich(ctx, scene.headline, W - pad * 2, fg, accent);
    cy = fillRich(ctx, lines, x + ox, cy + 96 + oy, 112);
  }

  if (scene.sub) {
    const e = ease((lt - 0.28) / 0.55);
    const [ox, oy] = entrOffset(scene.anim, e);
    ctx.globalAlpha = alpha * e;
    ctx.font = `400 42px ${fam.body}, sans-serif`;
    ctx.fillStyle = subCol;
    let yy = cy + 60 + oy;
    for (const l of wrapPlain(ctx, scene.sub, (W - pad * 2) * 0.96)) {
      ctx.fillText(l, x + ox, yy);
      yy += 58;
    }
  }

  // footer
  ctx.globalAlpha = alpha;
  ctx.font = `500 24px ${fam.mono}, monospace`;
  ctx.fillStyle = subCol;
  ctx.fillText('HELIAXIS.CO.UK · 01633 965205', pad, H - pad);

  ctx.restore();
}

// Render the whole reel at absolute time t (seconds). imgFor resolves a scene's image.
export function renderReel(
  ctx: CanvasRenderingContext2D,
  scenes: Scene[],
  t: number,
  imgFor: (s: Scene) => HTMLImageElement | null,
  fam: ReelFonts
) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, REEL_W, REEL_H);
  if (!scenes.length) return;

  const durs = scenes.map((s) => Math.max(0.2, s.seconds));
  let start = 0;
  let i = 0;
  for (; i < scenes.length; i++) {
    if (t < start + durs[i]) break;
    start += durs[i];
  }
  if (i >= scenes.length) {
    i = scenes.length - 1;
    start = totalDuration(scenes) - durs[i];
  }
  const lt = t - start;

  if (lt < TRANS && i > 0) {
    drawSceneFrame(ctx, scenes[i - 1], durs[i - 1], fam, imgFor(scenes[i - 1]), 1);
    drawSceneFrame(ctx, scenes[i], lt, fam, imgFor(scenes[i]), ease(lt / TRANS));
  } else {
    drawSceneFrame(ctx, scenes[i], lt, fam, imgFor(scenes[i]), 1);
  }
}
