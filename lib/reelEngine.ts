// Heliaxis Reel engine — animated, on-brand scene rendering (size-aware).
import { C, RAY } from './postEngine';

export type ReelTheme = 'dark' | 'light' | 'gold';
export type ReelAnim = 'up' | 'fade' | 'left';

export interface Scene {
  id: string;
  bg: string | null; // image data URL, or null for a branded gradient
  videoUrl?: string | null; // in-memory blob URL for a video clip (takes priority over bg)
  videoName?: string; // display label (video isn't persisted)
  videoStart?: number; // trim in-point (seconds)
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

// drawable media resolved by the host (image or video frame)
export interface SceneMedia {
  src: CanvasImageSource;
  w: number;
  h: number;
  kenBurns: boolean;
}

export const REEL_SIZES = {
  '9:16': { w: 1080, h: 1920, label: 'Reel 9:16' },
  '1:1': { w: 1080, h: 1080, label: 'Square 1:1' },
  '4:5': { w: 1080, h: 1350, label: 'Portrait 4:5' },
  '16:9': { w: 1920, h: 1080, label: 'Landscape 16:9' },
} as const;
export type ReelSizeKey = keyof typeof REEL_SIZES;

export const TRANS = 0.45; // cross-fade duration (s)

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

export function totalDuration(scenes: Scene[]) {
  return scenes.reduce((a, s) => a + Math.max(0.2, s.seconds), 0);
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
  H: number
) {
  const dur = Math.max(0.2, scene.seconds);
  const isDark = scene.theme === 'dark';
  const isGold = scene.theme === 'gold';
  const bg = isGold ? C.solar : isDark ? C.ink : C.paper;
  let fg = isGold ? C.ink : isDark ? C.paper : C.ink;
  let subCol = isGold ? 'rgba(33,31,24,.72)' : isDark ? C.mutedD : C.muted;
  let accent = isGold ? C.ink : C.solar;
  const hasMedia = !!(media && media.w && media.h);

  ctx.save();
  ctx.globalAlpha = alpha;

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

  const pad = Math.round(Math.min(W, H) * 0.09);
  drawSpark(ctx, W - pad - 12, pad + 22, 44, accent);

  const x = pad;
  let cy = H * (W >= H ? 0.4 : 0.46); // landscape: text a touch higher

  if (scene.eyebrow) {
    const e = ease(lt / 0.5);
    const [ox, oy] = entrOffset(scene.anim, e);
    ctx.globalAlpha = alpha * e;
    ctx.font = `600 30px ${fam.mono}, monospace`;
    ctx.fillStyle = accent;
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
) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  if (!scenes.length) return;

  const { i, lt } = sceneIndexAt(scenes, t);
  const durs = scenes.map((s) => Math.max(0.2, s.seconds));
  if (lt < TRANS && i > 0) {
    drawSceneFrame(ctx, scenes[i - 1], durs[i - 1], fam, mediaFor(scenes[i - 1]), 1, W, H);
    drawSceneFrame(ctx, scenes[i], lt, fam, mediaFor(scenes[i]), ease(lt / TRANS), W, H);
  } else {
    drawSceneFrame(ctx, scenes[i], lt, fam, mediaFor(scenes[i]), 1, W, H);
  }
}
