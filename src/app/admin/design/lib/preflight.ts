/* eslint-disable @typescript-eslint/no-explicit-any */
/** Brand + print checks for the current page. */
import { MM_PER_PT, PT_PER_MM } from '@/lib/design/types';
import { BRAND_FONTS, LOGO_RULES, familyChain, matchBrand } from './brand';
import { contrast, luminance, type StudioEngine } from './engine';

export type Issue = {
  level: 'error' | 'warn' | 'info';
  kind: 'print' | 'brand';
  message: string;
  objectId?: string;
};

const BAD_CHARS = /[✓✔✗✘★☆☑☐❤♥⭐]|\p{Extended_Pictographic}/u;

/** Topmost solid fill under a point (scene pt), else white paper. */
function fillUnder(engine: StudioEngine, o: any, x: number, y: number): string {
  const objs = engine.objects();
  const idx = objs.indexOf(o);
  for (let i = idx - 1; i >= 0; i--) {
    const u = objs[i];
    if (!u.visible || u.role === 'text' || engine.isText(u)) continue;
    const fill = u.type === 'brandbg' ? u.brandBg?.base : u.fill;
    if (typeof fill !== 'string' || !fill) continue;
    if (u.containsPoint?.({ x, y })) return fill;
  }
  return '#FFFFFF';
}

type Bounds = { left: number; top: number; width: number; height: number };

/** Where text actually sits (its line extents), not the textbox frame — a short line in a wide box is fine. */
function inkBounds(engine: StudioEngine, o: any): Bounds {
  const lines: unknown[] | undefined = o.textLines;
  if (!engine.isText(o) || !lines?.length) return o.getBoundingRect();
  let x0 = Infinity;
  let x1 = -Infinity;
  lines.forEach((_, i) => {
    const w = o.getLineWidth(i);
    if (!w) return;
    const l = o._getLineLeftOffset(i);
    x0 = Math.min(x0, l);
    x1 = Math.max(x1, l + w);
  });
  if (x0 === Infinity) return o.getBoundingRect();
  const m = o.calcTransformMatrix();
  const hw = o.width / 2;
  const hh = o.height / 2;
  const pts = [[x0 - hw, -hh], [x1 - hw, -hh], [x0 - hw, hh], [x1 - hw, hh]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

export function runPreflight(engine: StudioEngine, opts: { targetDpi: number; digital: boolean }): Issue[] {
  const out: Issue[] = [];
  const add = (level: Issue['level'], kind: Issue['kind'], message: string, o?: any) => out.push({ level, kind, message, objectId: o?.id });
  const g = engine.g;
  const tr = engine.trimPt();
  const sf = engine.safePt();
  const name = (o: any) => (o.name ? `“${o.name}”` : o.type);
  const offBrand = new Set<string>();

  for (const o of engine.objects()) {
    if (!o.visible) continue;
    const isText = engine.isText(o);
    const b = isText ? inkBounds(engine, o) : o.getBoundingRect();
    const important = isText || o.role === 'logo' || o.role === 'spark' || o.role === 'icon';

    // Anything wholly off the sheet isn't exported at all (boxes and photos included, not just text).
    if (b.left + b.width <= 0 || b.top + b.height <= 0 || b.left >= engine.W || b.top >= engine.H) {
      add(opts.digital ? 'warn' : 'error', 'print', `${name(o)} is off the page — it won’t be in your ${opts.digital ? 'image' : 'PDF'}. Move it back or delete it.`, o);
      continue;
    }

    // --- trim / safe / zones (print) ---
    if (!opts.digital && important) {
      const outsideTrim = b.left < tr.x - 0.5 || b.top < tr.y - 0.5 || b.left + b.width > tr.x + tr.w + 0.5 || b.top + b.height > tr.y + tr.h + 0.5;
      const outsideSafe = b.left < sf.x - 1 || b.top < sf.y - 1 || b.left + b.width > sf.x + sf.w + 1 || b.top + b.height > sf.y + sf.h + 1;
      if (outsideTrim) add('error', 'print', `${name(o)} crosses the cut line and will be trimmed.`, o);
      else if (outsideSafe) add('warn', 'print', `${name(o)} is outside the safe area — it may be trimmed or look cramped.`, o);
      for (const z of g.zones ?? []) {
        const zx = z.box.x * PT_PER_MM, zy = z.box.y * PT_PER_MM, zw = z.box.w * PT_PER_MM, zh = z.box.h * PT_PER_MM;
        const hit = b.left < zx + zw && b.left + b.width > zx && b.top < zy + zh && b.top + b.height > zy;
        if (hit && isText) add('warn', 'print', `${name(o)} sits in a ${z.kind === 'wrap' ? 'wrap-round' : 'no-go'} zone: ${z.label}.`, o);
      }
    }

    // --- backgrounds should run into the bleed ---
    if (!opts.digital && !important && g.trim.x > 0.01 && (o.type === 'rect' || o.type === 'brandbg' || o.type === 'image')) {
      const near = 1.5 * PT_PER_MM;
      const sides: string[] = [];
      if (Math.abs(b.left - tr.x) < near && b.left > 0.3) sides.push('left');
      if (Math.abs(b.top - tr.y) < near && b.top > 0.3) sides.push('top');
      if (Math.abs(b.left + b.width - (tr.x + tr.w)) < near && b.left + b.width < engine.W - 0.3) sides.push('right');
      if (Math.abs(b.top + b.height - (tr.y + tr.h)) < near && b.top + b.height < engine.H - 0.3) sides.push('bottom');
      if (sides.length) add('warn', 'print', `${name(o)} stops at the cut line (${sides.join(', ')}). Extend it to the bleed edge so no white sliver shows.`, o);
    }

    // --- images: effective resolution ---
    if (o.type === 'image' && !opts.digital) {
      // 1 canvas unit = 1 pt, so a source pixel drawn at scale s covers s pt → ppi = 72 / s.
      const m = o.calcTransformMatrix();
      const s = Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
      const ppi = s > 0 ? 72 / s : 0;
      if (ppi && ppi < opts.targetDpi * 0.5) add('error', 'print', `${name(o)} is only ${Math.round(ppi)} dpi at this size (aim for ${opts.targetDpi}). It will print soft — use a bigger photo or make it smaller.`, o);
      else if (ppi && ppi < opts.targetDpi * 0.8) add('warn', 'print', `${name(o)} is ${Math.round(ppi)} dpi at this size (aim for ${opts.targetDpi}).`, o);
    }
    if (o.role === 'photo-slot') add('error', 'print', 'An empty photo frame will print as a placeholder — add a photo or delete it.', o);

    // --- text ---
    if (isText) {
      const text = String(o.text || '');
      if (!text.trim()) add('info', 'print', 'An empty text box.', o);
      const sizePt = (o.fontSize || 0) * Math.abs(o.scaleY || 1);
      if (!opts.digital && sizePt < 6) add('warn', 'print', `${name(o)} is ${sizePt.toFixed(1)} pt — under 6 pt may not print legibly.`, o);
      if (BAD_CHARS.test(text)) add('warn', 'brand', `${name(o)} has emoji or symbols (✓ ★ …) the brand fonts can’t print — use a brand icon instead.`, o);
      const fam = familyChain(o.fontFamily)[0];
      if (fam && !BRAND_FONTS.includes(fam)) add('warn', 'brand', `${name(o)} uses ${fam}, which isn’t a brand font (it’ll print as an image).`, o);
      const fill = typeof o.fill === 'string' ? o.fill : '';
      const brand = matchBrand(fill);
      // Gold suits short accents (eyebrows, labels, stats, a headline word) — not running copy.
      const words = text.trim().split(/\s+/).length;
      const accentStyle = o.styleId === 'eyebrow' || o.styleId === 'label' || o.styleId === 'stat';
      if (brand?.id === 'solar' && sizePt < 14 && !accentStyle && words > 6) add('warn', 'brand', `${name(o)}: gold is an accent, never body text.`, o);
      if (fill) {
        const c = b.left + b.width / 2, m = b.top + b.height / 2;
        const bg = fillUnder(engine, o, c, m);
        const ratio = contrast(fill, bg);
        // Amber deep is the brand's own eyebrow/label colour on light (≈2.9:1) — that pairing is approved.
        const approved = brand?.id === 'amber2' && accentStyle;
        if (ratio < 3 && !approved) add('warn', 'brand', `${name(o)} is hard to read on its background (contrast ${ratio.toFixed(1)}:1).`, o);
      }
    }

    // --- logo rules ---
    if (o.role === 'logo' || o.role === 'spark') {
      if (Math.abs(Math.abs(o.scaleX) - Math.abs(o.scaleY)) / Math.abs(o.scaleX || 1) > 0.01) add('error', 'brand', 'The logo has been stretched — never distort it.', o);
      if (o.role === 'logo' && !opts.digital && b.width * MM_PER_PT < LOGO_RULES.minWidthMm) {
        add('warn', 'brand', `The logo is ${Math.round(b.width * MM_PER_PT)} mm wide — keep it at least ${LOGO_RULES.minWidthMm} mm (suggested minimum).`, o);
      }
      if (o.role === 'logo') {
        const bg = fillUnder(engine, o, b.left + b.width / 2, b.top + b.height / 2);
        const darkBg = luminance(bg) < 0.2;
        if (darkBg && o.logoId === 'logo') add('warn', 'brand', 'Use the reversed logo (“on dark”) on a dark background.', o);
        if (!darkBg && o.logoId === 'logo-light') add('warn', 'brand', 'Use the charcoal logo (“on light”) on a light background.', o);
      }
    }

    // --- colours ---
    const visit = (x: any) => {
      if (x.getObjects && !engine.isText(x)) x.getObjects().forEach(visit);
      for (const k of ['fill', 'stroke']) {
        const v = x[k];
        if (typeof v !== 'string' || !v || v === 'none' || v === 'transparent') continue;
        if (/^rgba?\(/i.test(v)) continue; // hairlines / tints
        const br = matchBrand(v);
        if (!br) offBrand.add(v.toUpperCase());
        else if (br.statusOnly) add('warn', 'brand', 'Green is for status only — not a brand colour.', o);
      }
    };
    // Photos and the logo artwork carry their own colours.
    if (o.role !== 'photo' && o.role !== 'logo' && o.role !== 'spark') visit(o);
  }

  if (offBrand.size) add('warn', 'brand', `Colours outside the brand palette: ${[...offBrand].slice(0, 6).join(', ')}.`);
  if (engine.template?.ref && !engine.template.ref.include) add('info', 'print', 'The printer template is a guide only — it won’t be in your PDF.');
  if (!out.some((i) => i.level !== 'info')) add('info', opts.digital ? 'brand' : 'print', opts.digital ? 'Looks good to go.' : 'Looks ready to print.');
  return out;
}
