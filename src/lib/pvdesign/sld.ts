/**
 * A simple single-line diagram of a PV system: array, DC isolation, inverter, optional battery and generator, AC
 * isolation, consumer unit, and (grid-tied only) the grid supply, with earthing. Pure: one model, drawn as an SVG or
 * into the Heliaxis PDF. It is a schematic to explain the design, not an installation drawing; it is always marked
 * "Indicative — subject to site survey".
 */

export type NodeKind = 'source' | 'protection' | 'device' | 'store' | 'load' | 'grid' | 'gen' | 'earth';
export type SldNode = { id: string; label: string; sub?: string; kind: NodeKind; x: number; y: number; w: number; h: number };
export type LinkKind = 'dc' | 'ac' | 'batt' | 'earth';
export type SldLink = { from: string; to: string; kind: LinkKind; label?: string };
export type Sld = { width: number; height: number; nodes: SldNode[]; links: SldLink[]; notes: string[] };

export type SldInput = {
  systemType: 'grid-tied' | 'off-grid';
  panelCount: number;
  panelLabel: string;
  kwp: number | null;
  /** Panels per string, e.g. [8, 8]. */
  panelsPerString: number[];
  inverterLabel: string;
  batteryLabel?: string | null;
  batteryCount?: number;
  generator?: boolean;
};

export function buildSld(i: SldInput): Sld {
  const grid = i.systemType === 'grid-tied';
  const strings = i.panelsPerString.length ? `${i.panelsPerString.length} string${i.panelsPerString.length === 1 ? '' : 's'}: ${i.panelsPerString.join(' + ')} panels` : 'strings to be confirmed';
  const nodes: SldNode[] = [
    { id: 'array', label: 'PV array', sub: `${i.panelCount} × ${i.panelLabel}${i.kwp != null ? ` · ${i.kwp} kWp` : ''} · ${strings}`, kind: 'source', x: 20, y: 190, w: 180, h: 110 },
    { id: 'dcIso', label: 'DC isolator', sub: 'Rated for the string voltage and current', kind: 'protection', x: 235, y: 205, w: 135, h: 80 },
    { id: 'inv', label: 'Inverter', sub: i.inverterLabel, kind: 'device', x: 405, y: 170, w: 210, h: 150 },
    { id: 'acIso', label: 'AC isolator', sub: 'Isolation and protection', kind: 'protection', x: 650, y: 205, w: 120, h: 80 },
    { id: 'cu', label: 'Consumer unit', sub: 'Protected circuit(s) for the property', kind: 'load', x: 805, y: 170, w: 175, h: 150 },
  ];
  const links: SldLink[] = [
    { from: 'array', to: 'dcIso', kind: 'dc', label: 'DC' },
    { from: 'dcIso', to: 'inv', kind: 'dc', label: 'DC' },
    { from: 'inv', to: 'acIso', kind: 'ac', label: 'AC' },
    { from: 'acIso', to: 'cu', kind: 'ac', label: 'AC' },
  ];
  if (i.batteryLabel) {
    nodes.push({ id: 'bat', label: 'Battery storage', sub: `${i.batteryCount && i.batteryCount > 1 ? `${i.batteryCount} × ` : ''}${i.batteryLabel}`, kind: 'store', x: 405, y: 370, w: 210, h: 80 });
    links.push({ from: 'inv', to: 'bat', kind: 'batt', label: 'Battery DC, with isolator' });
  }
  if (i.generator) {
    nodes.push({ id: 'gen', label: 'Generator input', sub: 'Backup generator via changeover and isolator', kind: 'gen', x: 405, y: 20, w: 210, h: 80 });
    links.push({ from: 'gen', to: 'inv', kind: 'ac', label: 'Generator AC' });
  }
  if (grid) {
    nodes.push({ id: 'grid', label: 'Grid supply', sub: 'Meter and cut-out (DNO)', kind: 'grid', x: 805, y: 20, w: 175, h: 80 });
    links.push({ from: 'grid', to: 'cu', kind: 'ac', label: 'AC' });
  }
  nodes.push({ id: 'earth', label: 'Earthing and bonding', sub: 'Array frame, inverter, battery enclosure and consumer unit bonded to the main earthing terminal', kind: 'earth', x: 20, y: 480, w: 960, h: 50 });
  const notes = [grid ? 'Grid-connected: the distribution network operator must be notified or approve the connection before commissioning.' : 'Off-grid: there is no connection to the grid. This is not an MCS installation.', 'Schematic only. Cable sizes, protective devices and labelling are specified at design sign-off.'];
  return { width: 1000, height: 545, nodes, links, notes };
}

type Pt = { x: number; y: number };
/** Where a link meets its two boxes: sides facing each other, centred. */
export function anchors(a: SldNode, b: SldNode): [Pt, Pt] {
  const cx = (n: SldNode) => n.x + n.w / 2;
  const cy = (n: SldNode) => n.y + n.h / 2;
  if (a.x + a.w <= b.x) return [{ x: a.x + a.w, y: cy(a) }, { x: b.x, y: cy(b) }];
  if (b.x + b.w <= a.x) return [{ x: a.x, y: cy(a) }, { x: b.x + b.w, y: cy(b) }];
  if (a.y + a.h <= b.y) return [{ x: cx(a), y: a.y + a.h }, { x: cx(b), y: b.y }];
  return [{ x: cx(a), y: a.y }, { x: cx(b), y: b.y + b.h }];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FILL: Record<NodeKind, string> = { source: '#efe8d8', protection: '#fffdf8', device: '#f8bc1e', store: '#efe8d8', load: '#fffdf8', grid: '#e8e4da', gen: '#e8e4da', earth: '#e6efe3' };
const STROKE: Record<LinkKind, { color: string; w: number; dash?: string }> = { dc: { color: '#c77f04', w: 3 }, ac: { color: '#211f18', w: 3 }, batt: { color: '#c77f04', w: 3, dash: '10 6' }, earth: { color: '#3f7d4e', w: 2, dash: '4 4' } };

/** Wrap text to about `max` characters a line (for the SVG, which has no text measuring). */
export function wrapChars(s: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

export function sldSvg(d: Sld, opts: { title?: string } = {}): string {
  const by = new Map(d.nodes.map((n) => [n.id, n]));
  const boxes = d.nodes
    .map((n) => {
      const sub = wrapChars(n.sub ?? '', Math.max(14, Math.floor(n.w / 7.2)));
      return (
        `<g><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" fill="${FILL[n.kind]}" stroke="#211f18" stroke-width="2"/>` +
        `<text x="${n.x + n.w / 2}" y="${n.y + 24}" font-size="16" font-weight="700" text-anchor="middle" fill="#211f18">${esc(n.label)}</text>` +
        sub.map((l, k) => `<text x="${n.x + n.w / 2}" y="${n.y + 44 + k * 14}" font-size="11.5" text-anchor="middle" fill="#3b382e">${esc(l)}</text>`).join('') +
        `</g>`
      );
    })
    .join('');
  const links = d.links
    .map((l) => {
      const a = by.get(l.from);
      const b = by.get(l.to);
      if (!a || !b) return '';
      const [p, q] = anchors(a, b);
      const st = STROKE[l.kind];
      return (
        `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${st.color}" stroke-width="${st.w}" ${st.dash ? `stroke-dasharray="${st.dash}"` : ''}/>` +
        (l.label ? `<text x="${(p.x + q.x) / 2}" y="${(p.y + q.y) / 2 - 6}" font-size="11" text-anchor="middle" fill="#211f18">${esc(l.label)}</text>` : '')
      );
    })
    .join('');
  const earthDrops = ['array', 'inv', 'cu'].map((id) => by.get(id)).filter(Boolean).map((n) => `<line x1="${n!.x + n!.w / 2}" y1="${n!.y + n!.h}" x2="${n!.x + n!.w / 2}" y2="480" stroke="#3f7d4e" stroke-width="2" stroke-dasharray="4 4"/>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height + 60}" font-family="Arial, Helvetica, sans-serif">` +
    `<rect width="${d.width}" height="${d.height + 60}" fill="#ffffff"/>${esc(opts.title ?? '') ? `<text x="20" y="14" font-size="13" fill="#6e6a5e">${esc(opts.title ?? '')}</text>` : ''}` +
    earthDrops + links + boxes +
    `<text x="${d.width / 2}" y="${d.height + 40}" font-size="15" font-weight="700" text-anchor="middle" fill="#b3261e">Indicative — subject to site survey</text>` +
    `</svg>`
  );
}
