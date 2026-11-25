import type { Layout } from './layout';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const m = (mm: number) => `${(mm / 1000).toFixed(2).replace(/\.?0+$/, '')} m`;

/**
 * The layout as an SVG drawing with dimensions and clearances. Always carries "Indicative — subject to site survey".
 * Drawn in millimetres: the roof's top edge is the ridge and the bottom edge the eaves.
 */
export function layoutSvg(l: Layout, roofWidthMm: number, roofHeightMm: number, opts: { title?: string; panelLabel?: string; kwp?: number | null } = {}): string {
  const pad = 700;
  const top = 900;
  const bottom = 1100;
  const W = roofWidthMm + pad * 2;
  const H = roofHeightMm + top + bottom;
  const ox = pad;
  const oy = top;
  const u = l.usable;
  const dim = (x1: number, y1: number, x2: number, y2: number, label: string, vertical = false) =>
    `<g stroke="#555" stroke-width="12" fill="none"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` +
    (vertical ? `<line x1="${x1 - 60}" y1="${y1}" x2="${x1 + 60}" y2="${y1}"/><line x1="${x2 - 60}" y1="${y2}" x2="${x2 + 60}" y2="${y2}"/>` : `<line x1="${x1}" y1="${y1 - 60}" x2="${x1}" y2="${y1 + 60}"/><line x1="${x2}" y1="${y2 - 60}" x2="${x2}" y2="${y2 + 60}"/>`) +
    `</g><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2}" font-size="190" text-anchor="middle" fill="#222" ${vertical ? `transform="rotate(-90 ${(x1 + x2) / 2 - 90} ${(y1 + y2) / 2})" dx="0" dy="-90"` : 'dy="-90"'}>${esc(label)}</text>`;

  const panels = l.panels
    .map((p) => `<rect x="${ox + p.x}" y="${oy + p.y}" width="${p.w}" height="${p.h}" fill="#1f3a5f" stroke="#9fc1ea" stroke-width="10" rx="20"><title>${p.orientation} ${p.w}x${p.h} mm</title></rect>`)
    .join('');
  const title = opts.title ?? 'Indicative panel layout';
  const summary = `${l.count} panels${opts.panelLabel ? ` · ${opts.panelLabel}` : ''}${opts.kwp != null ? ` · ${opts.kwp.toFixed(2)} kWp` : ''} · ${l.kind}`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${Math.round(W / 4)}" height="${Math.round(H / 4)}" font-family="Arial, Helvetica, sans-serif">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/>` +
    `<text x="${pad}" y="330" font-size="260" font-weight="700" fill="#211f18">${esc(title)}</text>` +
    `<text x="${pad}" y="620" font-size="200" fill="#444">${esc(summary)}</text>` +
    `<rect x="${ox}" y="${oy}" width="${roofWidthMm}" height="${roofHeightMm}" fill="#efe8d8" stroke="#211f18" stroke-width="20"/>` +
    `<rect x="${ox + u.x}" y="${oy + u.y}" width="${u.w}" height="${u.h}" fill="none" stroke="#c77f04" stroke-width="10" stroke-dasharray="60 40"/>` +
    panels +
    dim(ox, oy + roofHeightMm + 330, ox + roofWidthMm, oy + roofHeightMm + 330, `${m(roofWidthMm)} (eaves)`) +
    dim(ox - 330, oy, ox - 330, oy + roofHeightMm, `${m(roofHeightMm)} (up the slope)`, true) +
    `<text x="${ox + roofWidthMm / 2}" y="${oy + roofHeightMm + 760}" font-size="170" text-anchor="middle" fill="#6e6a5e">Edge clearance ${l.params.edgeMm} mm (dashed) · gaps ${l.params.gapXMm} / ${l.params.gapYMm} mm</text>` +
    `<text x="${W / 2}" y="${H - 120}" font-size="210" font-weight="700" text-anchor="middle" fill="#b3261e">Indicative — subject to site survey</text>` +
    `</svg>`
  );
}
