import { centroid, dot, makeProjector, northLocal, type Camera, type House, type PolyKind, type V3 } from './house3d';

/**
 * Draws a House as a scene of flat-shaded polygons (painter's algorithm), as an SVG or into the PDF. The same scene feeds both.
 * Back faces are not drawn; ground first, then walls, windows, roof slopes and finally the panels.
 */

export type ScenePoly = { kind: PolyKind | 'arrow'; pts: [number, number][]; fill: string; stroke?: string; strokeW?: number };
export type SceneLine = { a: [number, number]; b: [number, number]; stroke: string; w: number };
export type SceneLabel = { text: string; x: number; y: number; size: number; color: string; anchor?: 'middle' | 'start' };
export type Scene = { width: number; height: number; polys: ScenePoly[]; lines: SceneLine[]; labels: SceneLabel[] };

const BASE: Record<PolyKind, string> = { ground: '#dfe6d3', wall: '#efe6d0', gable: '#e6dcc4', window: '#8fb3cf', door: '#6b4a2f', roof: '#55555c', panel: '#1f3a5f' };
const LIGHT = norm3({ x: -0.5, y: -0.7, z: 0.6 });
function norm3(a: V3): V3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
/** Scale a colour's brightness by `k`. */
export const shade = (c: string, k: number) => toHex(hex(c).map((x) => x * k));
export const hexToRgb01 = (c: string): [number, number, number] => hex(c).map((x) => x / 255) as [number, number, number];

const ORDER: PolyKind[] = ['ground', 'wall', 'gable', 'window', 'door', 'roof', 'panel'];

export type SceneOptions = { camera: Camera; faceAzimuthDeg: number; width?: number; height?: number; title?: string };

export function buildScene(h: House, o: SceneOptions): Scene {
  const W = o.width ?? 1000;
  const H = o.height ?? 600;
  const cam = makeProjector(h, o.camera);
  type Raw = { kind: PolyKind | 'arrow'; pts: { x: number; y: number }[]; fill: string; depth: number; stroke?: string; strokeW?: number };
  const raw: Raw[] = [];
  for (const p of h.polys) {
    const c = centroid(p.pts);
    const toCam = { x: cam.pos.x - c.x, y: cam.pos.y - c.y, z: cam.pos.z - c.z };
    if (dot(p.n, toCam) <= 0) continue; // facing away
    const pr = p.pts.map((q) => cam.project(q));
    if (pr.some((q) => q.depth <= 0.2)) continue;
    const lambert = Math.max(0, dot(p.n, LIGHT));
    const k = p.kind === 'ground' ? 1 : p.kind === 'window' ? 0.95 + lambert * 0.1 : p.kind === 'panel' ? 0.62 + lambert * 0.3 : 0.55 + lambert * 0.6;
    raw.push({ kind: p.kind, pts: pr, fill: shade(BASE[p.kind], k), depth: Math.hypot(toCam.x, toCam.y, toCam.z), stroke: p.kind === 'panel' ? '#8fb2dc' : p.kind === 'roof' ? shade('#55555c', 0.7) : p.kind === 'ground' ? undefined : shade('#8a826e', 0.8), strokeW: p.kind === 'panel' ? 0.7 : p.kind === 'roof' ? 1.2 : 1.1 });
  }
  // North arrow on the ground beside the house.
  const north = northLocal(o.faceAzimuthDeg);
  const base = { x: h.lengthM + 2.2, y: -2.2, z: 0.02 };
  const tip = { x: base.x + north.x * 2.6, y: base.y + north.y * 2.6, z: 0.02 };
  const side = { x: -north.y * 0.5, y: north.x * 0.5 };
  const arrow = [tip, { x: base.x + side.x, y: base.y + side.y, z: 0.02 }, { x: base.x - side.x, y: base.y - side.y, z: 0.02 }].map((q) => cam.project(q));
  const lines: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  for (const l of h.lines) {
    const a = cam.project(l.a);
    const b = cam.project(l.b);
    if (a.depth > 0.2 && b.depth > 0.2) lines.push({ a, b });
  }
  // Painter's order: by kind, then far to near.
  raw.sort((a, b) => ORDER.indexOf(a.kind as PolyKind) - ORDER.indexOf(b.kind as PolyKind) || b.depth - a.depth);

  // Fit everything but the ground into the frame.
  const fitPts = raw.flatMap((r) => r.pts).concat(arrow);
  const xs = fitPts.map((p) => p.x);
  const ys = fitPts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 40;
  const s = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad - 40) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * s) / 2 - minX * s;
  const oy = pad + 10 + ((H - 2 * pad - 40) - (maxY - minY) * s) / 2 - minY * s;
  const T = (p: { x: number; y: number }): [number, number] => [p.x * s + ox, p.y * s + oy];

  const polys: ScenePoly[] = raw.map((r) => ({ kind: r.kind, pts: r.pts.map(T), fill: r.fill, stroke: r.stroke, strokeW: r.strokeW }));
  polys.push({ kind: 'arrow', pts: arrow.map(T), fill: '#211f18' });
  const labels: SceneLabel[] = [];
  const tipP = T(arrow[0]);
  labels.push({ text: 'N', x: tipP[0], y: tipP[1] - 6, size: 14, color: '#211f18', anchor: 'middle' });
  return {
    width: W,
    height: H,
    polys,
    lines: lines.map((l) => ({ a: T(l.a), b: T(l.b), stroke: '#6f93c2', w: 0.35 })),
    labels,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f = (n: number) => n.toFixed(1);

export function sceneSvg(sc: Scene, o: { caption?: string; indicative?: boolean } = {}): string {
  const body = sc.polys.map((p) => `<polygon points="${p.pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${p.fill}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${f(p.strokeW ?? 0.6)}" stroke-linejoin="round"` : ''}/>`).join('');
  const lines = sc.lines.map((l) => `<line x1="${f(l.a[0])}" y1="${f(l.a[1])}" x2="${f(l.b[0])}" y2="${f(l.b[1])}" stroke="${l.stroke}" stroke-width="${f(l.w)}"/>`).join('');
  const labels = sc.labels.map((t) => `<text x="${f(t.x)}" y="${f(t.y)}" font-size="${t.size}" font-weight="700" text-anchor="${t.anchor ?? 'start'}" fill="${t.color}">${esc(t.text)}</text>`).join('');
  const cap = o.caption ? `<text x="${sc.width / 2}" y="${sc.height - 18}" font-size="14" text-anchor="middle" fill="#3b382e">${esc(o.caption)}</text>` : '';
  const ind = o.indicative === false ? '' : `<text x="${sc.width / 2}" y="${sc.height - 38}" font-size="15" font-weight="700" text-anchor="middle" fill="#b3261e">Indicative — subject to site survey</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sc.width} ${sc.height}" font-family="Arial, Helvetica, sans-serif"><rect width="${sc.width}" height="${sc.height}" fill="#f4f1e8"/>${body}${lines}${labels}${ind}${cap}</svg>`;
}
