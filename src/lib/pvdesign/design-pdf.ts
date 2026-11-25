import { A4, AMBER, CARD, INK, LINE, MARGIN, MUTED, PAPER_2, RED, SOLAR, longDate, newDocument, type Drawing } from '@/lib/documents/pdf-kit';
import { issueOf } from '@/lib/documents/issue';
import type { CheckResult } from './check';
import type { Layout } from './layout';
import { rgb } from 'pdf-lib';
import { buildScene, hexToRgb01, type Scene } from './render3d';
import type { House } from './house3d';
import { anchors, wrapChars, type Sld, type SldNode } from './sld';

/**
 * The design pack as one branded PDF: the panel layout drawing, the checks (every warning), the single-line diagram and
 * a one-page specification. Drawn as vector in the Heliaxis document kit. Always says "Indicative — subject to site
 * survey" unless a survey is linked to the job.
 */

export const DESIGN_CODE = 'HX-DS-01';
export const INDICATIVE = 'Indicative — subject to site survey';

export type DesignPackInput = {
  jobRef: string | null;
  customerName: string;
  address: string | null;
  /** YYYY-MM-DD. */
  issued: string;
  systemType: 'grid-tied' | 'off-grid';
  layout: Layout;
  roofWidthMm: number;
  roofHeightMm: number;
  panelLabel: string;
  kwp: number | null;
  check: CheckResult;
  sld: Sld;
  spec: [string, string][];
  surveyLinked: boolean;
  /** The mock 3D house, the compass bearing its panel slope faces, and what was assumed to build it. */
  house?: { model: House; faceAzimuthDeg: number; assumptions: string[] };
};

const PAGE_W = A4[0] - MARGIN.l - MARGIN.r;
const mFmt = (mm: number) => `${(mm / 1000).toFixed(2).replace(/\.?0+$/, '')} m`;

function drawLayout(d: Drawing, i: DesignPackInput, h: number) {
  const dimSpace = 26;
  const availH = h - dimSpace - 10;
  const s = Math.min(d.width / i.roofWidthMm, availH / i.roofHeightMm);
  const rw = i.roofWidthMm * s;
  const rh = i.roofHeightMm * s;
  const x0 = d.x + (d.width - rw) / 2;
  const top = d.top - 4;
  d.rect(x0, top - rh, rw, rh, { fill: PAPER_2, border: INK, line: 1 });
  const u = i.layout.usable;
  d.rect(x0 + u.x * s, top - (u.y + u.h) * s, u.w * s, u.h * s, { border: AMBER, line: 0.6 });
  for (const p of i.layout.panels) d.rect(x0 + p.x * s, top - (p.y + p.h) * s, p.w * s, p.h * s, { fill: INK, border: SOLAR, line: 0.4 });
  const w = `${mFmt(i.roofWidthMm)} (eaves)`;
  d.line(x0, top - rh - 10, x0 + rw, top - rh - 10, { color: MUTED, t: 0.6 });
  d.text(w, x0 + rw / 2 - d.widthOf(w, 8) / 2, top - rh - 21, 8, { color: MUTED });
  const hh = `${mFmt(i.roofHeightMm)} up the slope`;
  d.text(hh, x0 + 2, top - rh - 21, 8, { color: MUTED });
  const cl = `Edge clearance ${i.layout.params.edgeMm} mm · gaps ${i.layout.params.gapXMm} mm`;
  d.text(cl, x0 + rw - d.widthOf(cl, 8), top - rh - 21, 8, { color: MUTED });
}

/** The 3D scene drawn as vector polygons into the PDF. */
function drawScene(d: Drawing, sc: Scene, w: number, h: number) {
  const k = Math.min(w / sc.width, h / sc.height);
  const left = d.x + (d.width - sc.width * k) / 2;
  const top = d.top;
  const path = (pts: [number, number][]) => `M ${pts.map(([x, y]) => `${(x * k).toFixed(2)} ${(y * k).toFixed(2)}`).join(' L ')} Z`;
  const col = (c: string) => {
    const [r, g, b] = hexToRgb01(c);
    return rgb(r, g, b);
  };
  d.rect(left, top - sc.height * k, sc.width * k, sc.height * k, { fill: col('#f4f1e8') });
  for (const p of sc.polys) d.page.drawSvgPath(path(p.pts), { x: left, y: top, color: col(p.fill), ...(p.stroke ? { borderColor: col(p.stroke), borderWidth: (p.strokeW ?? 0.6) * k * 0.9 } : {}) });
  for (const l of sc.lines) d.line(left + l.a[0] * k, top - l.a[1] * k, left + l.b[0] * k, top - l.b[1] * k, { color: col(l.stroke), t: Math.max(0.2, l.w * k) });
  for (const t of sc.labels) d.text(t.text, left + t.x * k - d.widthOf(t.text, t.size * k, true) / 2, top - t.y * k, t.size * k, { bold: true });
}

const KIND_FILL = { source: PAPER_2, protection: CARD, device: SOLAR, store: PAPER_2, load: CARD, grid: PAPER_2, gen: PAPER_2, earth: PAPER_2 } as const;

function drawSld(d: Drawing, sld: Sld, h: number) {
  const s = Math.min(d.width / sld.width, h / sld.height);
  const ox = d.x + (d.width - sld.width * s) / 2;
  const oy = d.top;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy - y * s;
  const by = new Map<string, SldNode>(sld.nodes.map((n) => [n.id, n]));
  // Earth drops first so boxes sit over them.
  for (const id of ['array', 'inv', 'cu']) {
    const n = by.get(id);
    if (n) d.line(X(n.x + n.w / 2), Y(n.y + n.h), X(n.x + n.w / 2), Y(480), { color: LINE, t: 0.8, dash: [3, 3] });
  }
  for (const l of sld.links) {
    const a = by.get(l.from);
    const b = by.get(l.to);
    if (!a || !b) continue;
    const [p, q] = anchors(a, b);
    d.line(X(p.x), Y(p.y), X(q.x), Y(q.y), { color: l.kind === 'ac' ? INK : AMBER, t: 1.6, ...(l.kind === 'batt' ? { dash: [5, 3] } : {}) });
    if (l.label) {
      const lx = X((p.x + q.x) / 2);
      d.text(l.label, lx - d.widthOf(l.label, 6.5) / 2, Y((p.y + q.y) / 2) + 3, 6.5, { color: MUTED });
    }
  }
  for (const n of sld.nodes) {
    d.rect(X(n.x), Y(n.y + n.h), n.w * s, n.h * s, { fill: KIND_FILL[n.kind], border: INK, line: 0.9 });
    const cx = X(n.x + n.w / 2);
    d.text(n.label, cx - d.widthOf(n.label, 8.5, true) / 2, Y(n.y) - 12, 8.5, { bold: true });
    const sub = d.lines(n.sub ?? '', 6.4, n.w * s - 8);
    sub.slice(0, 5).forEach((t, k) => d.text(t, cx - d.widthOf(t, 6.4) / 2, Y(n.y) - 22 - k * 8, 6.4, { color: MUTED }));
  }
}

export async function renderDesignPack(i: DesignPackInput): Promise<Uint8Array> {
  const kit = await newDocument({
    code: DESIGN_CODE,
    label: 'Design pack',
    title: 'Indicative system design',
    revision: issueOf(DESIGN_CODE),
    jobRef: i.jobRef,
    refLabel: 'Customer',
    issued: i.issued,
    ...(i.surveyLinked ? {} : { footer: { sub: INDICATIVE } }),
  });
  kit.header({ meta: [['Date', longDate(i.issued)]] });
  kit.idGrid([
    ['Prepared for', i.customerName],
    ['Site', i.address],
    ['System type', i.systemType === 'off-grid' ? 'Off-grid (not MCS)' : 'Grid-tied (MCS)'],
    ['Array', `${i.layout.count} panels${i.kwp != null ? ` · ${i.kwp} kWp` : ''}`],
  ]);
  if (!i.surveyLinked) kit.paragraph(`${INDICATIVE}. The layout, sizing and drawings below are a desktop design from the dimensions given, not a surveyed design.`, { bold: true, color: RED });

  kit.section('Panel layout', { intro: `${i.panelLabel}, ${i.layout.kind === 'mixed' ? 'portrait and landscape' : i.layout.kind}.`, keep: 200 });
  const layoutH = Math.min(260, (PAGE_W * i.roofHeightMm) / i.roofWidthMm + 40);
  kit.block(layoutH, (d) => drawLayout(d, i, layoutH));

  if (i.house) {
    const hs = i.house;
    kit.section('Mock-up of the roof (3D)', { intro: 'A simple model of the building with the panels on it, to show the idea. Not to scale for the walls and windows.', keep: 300 });
    const sc = buildScene(hs.model, { camera: { yawDeg: -32, elevDeg: 24 }, faceAzimuthDeg: hs.faceAzimuthDeg });
    const h3 = Math.round(PAGE_W * 0.6);
    kit.block(h3, (d) => drawScene(d, sc, d.width, h3));
    kit.note(hs.assumptions.join(' '));
  }

  kit.section('Design checks', { keep: 80 });
  if (!i.check.issues.length) kit.paragraph('The checks found no problems with this design.');
  else
    kit.list(
      i.check.issues.map((x) => `${x.severity === 'error' ? 'Problem' : x.severity === 'warn' ? 'Warning' : 'Note'}: ${x.message}${x.fix ? ` ${x.fix}` : ''}`)
    );
  if (i.check.assumptions.length) kit.note(i.check.assumptions.join(' '));

  kit.section('Single-line diagram', { intro: 'A schematic of the main components and how they connect.', keep: 300 });
  const sldH = 250;
  kit.block(sldH, (d) => drawSld(d, i.sld, sldH));
  kit.note(i.sld.notes.join(' '));

  kit.section('System specification', { keep: 160 });
  kit.grid({ columns: ['Item', 'Detail'], rows: i.spec.map(([a, b]) => [a, b]), widths: [2, 5] });
  return kit.save();
}

/** Used by tests: the text the single-line diagram will wrap a long label to. */
export const wrapLabel = wrapChars;
