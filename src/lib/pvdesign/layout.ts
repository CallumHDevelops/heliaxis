/**
 * Panel layout on one flat roof face. Pure and deterministic: the same roof and panel always give the same answer.
 * All sizes are whole millimetres. The roof is `roofWidthMm` along the eaves by `roofHeightMm` up the slope.
 * Metis calls this as a tool; she never counts panels herself.
 */

export type PanelSize = { widthMm: number; heightMm: number }; // heightMm is the long side
export type Orientation = 'portrait' | 'landscape';

/** Defaults, used only when HAP's settings (pv_settings design.layout) don't say otherwise. */
export const DEFAULT_EDGE_MM = 300;
export const DEFAULT_GAP_MM = 20;

export type LayoutParams = { roofWidthMm: number; roofHeightMm: number; panel: PanelSize; edgeMm?: number; gapXMm?: number; gapYMm?: number };
export type Placed = { x: number; y: number; w: number; h: number; orientation: Orientation };
export type Layout = {
  count: number;
  /** 'portrait' | 'landscape' when every panel is the same way, 'mixed' when the roof is split into bands. */
  kind: Orientation | 'mixed';
  panels: Placed[];
  usable: { x: number; y: number; w: number; h: number };
  params: { edgeMm: number; gapXMm: number; gapYMm: number };
};
export type LayoutResult = { best: Layout; options: { kind: Layout['kind']; count: number }[] };

/** How many items of `size` fit along `avail`, with `gap` between them. */
export const fit = (avail: number, size: number, gap: number) => (size > 0 && avail >= size ? Math.floor((avail + gap) / (size + gap)) : 0);

const dims = (p: PanelSize, o: Orientation) => (o === 'portrait' ? { w: p.widthMm, h: p.heightMm } : { w: p.heightMm, h: p.widthMm });
const other = (o: Orientation): Orientation => (o === 'portrait' ? 'landscape' : 'portrait');

type Band = { orientation: Orientation; rows: number; cols: number };

/** Place bands (each a block of rows) top to bottom, each centred across the width. */
function placeRows(bands: Band[], p: PanelSize, u: Layout['usable'], gapX: number, gapY: number): Placed[] {
  const out: Placed[] = [];
  let y = u.y;
  for (const b of bands) {
    if (!b.rows || !b.cols) continue;
    const d = dims(p, b.orientation);
    const rowW = b.cols * d.w + (b.cols - 1) * gapX;
    const x0 = u.x + Math.floor((u.w - rowW) / 2);
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) out.push({ x: x0 + c * (d.w + gapX), y, w: d.w, h: d.h, orientation: b.orientation });
      y += d.h + gapY;
    }
  }
  return out;
}

/** Same, but bands are blocks of columns placed left to right, each centred up the height. */
function placeCols(bands: { orientation: Orientation; cols: number; rows: number }[], p: PanelSize, u: Layout['usable'], gapX: number, gapY: number): Placed[] {
  const out: Placed[] = [];
  let x = u.x;
  for (const b of bands) {
    if (!b.rows || !b.cols) continue;
    const d = dims(p, b.orientation);
    const colH = b.rows * d.h + (b.rows - 1) * gapY;
    const y0 = u.y + Math.floor((u.h - colH) / 2);
    for (let c = 0; c < b.cols; c++) {
      for (let r = 0; r < b.rows; r++) out.push({ x, y: y0 + r * (d.h + gapY), w: d.w, h: d.h, orientation: b.orientation });
      x += d.w + gapX;
    }
  }
  return out;
}

const kindOf = (panels: Placed[]): Layout['kind'] => {
  const o = new Set(panels.map((p) => p.orientation));
  return o.size === 1 ? [...o][0] : 'mixed';
};

/**
 * Tries every panel one way (portrait, landscape) and every split of the roof into two bands of different
 * orientation (rows stacked up the slope, or columns side by side), and returns the layout with the most panels.
 * On a tie the simpler layout wins: all one way before mixed, portrait before landscape.
 */
export function layoutPanels(params: LayoutParams): LayoutResult {
  const edge = Math.max(0, Math.round(params.edgeMm ?? DEFAULT_EDGE_MM));
  const gapX = Math.max(0, Math.round(params.gapXMm ?? DEFAULT_GAP_MM));
  const gapY = Math.max(0, Math.round(params.gapYMm ?? DEFAULT_GAP_MM));
  const p = params.panel;
  const u = { x: edge, y: edge, w: Math.round(params.roofWidthMm) - 2 * edge, h: Math.round(params.roofHeightMm) - 2 * edge };
  const meta = { edgeMm: edge, gapXMm: gapX, gapYMm: gapY };
  const empty: Layout = { count: 0, kind: 'portrait', panels: [], usable: u, params: meta };
  if (!(p.widthMm > 0 && p.heightMm > 0) || u.w <= 0 || u.h <= 0) return { best: empty, options: [] };

  const cands: { rank: number; panels: Placed[] }[] = [];
  const add = (rank: number, panels: Placed[]) => panels.length && cands.push({ rank, panels });

  for (const [i, o] of (['portrait', 'landscape'] as Orientation[]).entries()) {
    const d = dims(p, o);
    add(i, placeRows([{ orientation: o, rows: fit(u.h, d.h, gapY), cols: fit(u.w, d.w, gapX) }], p, u, gapX, gapY));
  }

  // Mixed: k rows of A across the top, the rest of the height in B (and the same split by columns).
  for (const [i, a] of (['portrait', 'landscape'] as Orientation[]).entries()) {
    const b = other(a);
    const da = dims(p, a);
    const db = dims(p, b);
    const maxRows = fit(u.h, da.h, gapY);
    for (let k = 1; k <= maxRows; k++) {
      const used = k * da.h + (k - 1) * gapY;
      const rowsB = fit(u.h - used - gapY, db.h, gapY);
      if (rowsB > 0) add(2 + i, placeRows([{ orientation: a, rows: k, cols: fit(u.w, da.w, gapX) }, { orientation: b, rows: rowsB, cols: fit(u.w, db.w, gapX) }], p, u, gapX, gapY));
    }
    const maxCols = fit(u.w, da.w, gapX);
    for (let k = 1; k <= maxCols; k++) {
      const used = k * da.w + (k - 1) * gapX;
      const colsB = fit(u.w - used - gapX, db.w, gapX);
      if (colsB > 0) add(4 + i, placeCols([{ orientation: a, cols: k, rows: fit(u.h, da.h, gapY) }, { orientation: b, cols: colsB, rows: fit(u.h, db.h, gapY) }], p, u, gapX, gapY));
    }
  }

  if (!cands.length) return { best: empty, options: [] };
  cands.sort((x, y) => y.panels.length - x.panels.length || x.rank - y.rank);
  const best = cands[0].panels;
  const bestOf = (k: Layout['kind']) => Math.max(0, ...cands.filter((c) => kindOf(c.panels) === k).map((c) => c.panels.length));
  return {
    best: { count: best.length, kind: kindOf(best), panels: best, usable: u, params: meta },
    options: (['portrait', 'landscape', 'mixed'] as const).map((k) => ({ kind: k, count: bestOf(k) })),
  };
}

/** True if no two panels overlap and all sit inside the usable area (used by the tests and as a self-check). */
export function layoutIsValid(l: Layout): boolean {
  const { x, y, w, h } = l.usable;
  const inside = l.panels.every((p) => p.x >= x && p.y >= y && p.x + p.w <= x + w && p.y + p.h <= y + h);
  const gx = l.params.gapXMm;
  const gy = l.params.gapYMm;
  for (let i = 0; i < l.panels.length; i++) {
    for (let j = i + 1; j < l.panels.length; j++) {
      const a = l.panels[i];
      const b = l.panels[j];
      const sepX = a.x + a.w + gx <= b.x || b.x + b.w + gx <= a.x;
      const sepY = a.y + a.h + gy <= b.y || b.y + b.h + gy <= a.y;
      if (!sepX && !sepY) return false;
    }
  }
  return inside;
}
