import 'server-only';
import { clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb } from 'pdf-lib';
import { AMBER, INK, LABEL, LINE, MUTED, SOLAR, type Drawing, type Kit } from '@/lib/documents/pdf-kit';
import type { ProposalOption } from './types';

/**
 * The pages lifted from a design proposal, in Heliaxis's own style: figures on white cards with the brand's cross-hatch fade, the
 * roof design, "Your Solar Setup" as wide product cards with warranty badges, expected performance (generation against the
 * customer's own use), and, when allowed, what it could save, with a payback chart and the footprint. Every figure is the proposal's own.
 */
const WHITE = rgb(1, 1, 1);
const GREY = rgb(0.78, 0.76, 0.72);
const TRACK = rgb(0.92, 0.9, 0.85);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const n0 = (x: number) => Math.round(x).toLocaleString('en-GB');
const gbp = (x: number) => `${x < 0 ? '−' : ''}£${n0(Math.abs(x))}`;
const kw = (x: number) => `${Math.round(x * 100) / 100}`;

type Pics = Map<string, { bytes: Uint8Array; mime: string }>;

/**
 * The brand's card fill (brand-kit/heliaxis-card-fills.css) in a PDF: a cross-hatch of fine lines that fades from the top left to
 * nothing at 80% of the way to the bottom right, and a warm glow at the top right. `dark` is the ink version.
 */
export function cardFill(d: Drawing, x: number, y: number, w: number, h: number, dark = false, step = 14) {
  d.rect(x, y, w, h, { fill: dark ? INK : WHITE });
  const page = d.page;
  page.pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath());
  // The glow: a few soft gold discs, biggest and faintest first.
  for (let i = 0; i < 7; i++) page.drawCircle({ x: x + w * 0.9, y: y + h * 1.05, size: (h * 1.15 * (7 - i)) / 7 + 6, color: SOLAR, opacity: dark ? 0.035 : 0.022 });
  // The hatch: CSS gives it a 150-degree mask (opaque at the start, clear at 80%), so each short piece of line is drawn at that strength.
  const dx = 0.5;
  const dy = 0.866;
  const span = w * dx + h * dy;
  const alpha = (px: number, py: number) => Math.max(0, 1 - ((px - x) * dx + (y + h - py) * dy) / span / 0.8);
  const ink = dark ? rgb(0.97, 0.95, 0.9) : INK;
  const peak = dark ? 0.16 : 0.13;
  const piece = 5;
  for (let gx = x + step; gx < x + w; gx += step) for (let py = y; py < y + h; py += piece) {
    const a = alpha(gx, py + piece / 2) * peak;
    if (a > 0.01) page.drawLine({ start: { x: gx, y: py }, end: { x: gx, y: Math.min(py + piece, y + h) }, thickness: 0.4, color: ink, opacity: a });
  }
  for (let gy = y + h - step; gy > y; gy -= step) for (let px = x; px < x + w; px += piece) {
    const a = alpha(px + piece / 2, gy) * peak;
    if (a > 0.01) page.drawLine({ start: { x: px, y: gy }, end: { x: Math.min(px + piece, x + w), y: gy }, thickness: 0.4, color: ink, opacity: a });
  }
  page.pushOperators(popGraphicsState());
  d.rect(x, y, w, h, { border: dark ? undefined : LINE, line: 0.6 });
}

type Tile = { v: string; l: string };
function tiles(kit: Kit, items: Tile[]) {
  if (!items.length) return;
  kit.block(72, (d) => {
    const gap = 8;
    const w = (d.width - gap * (items.length - 1)) / items.length;
    items.forEach((t, i) => {
      const x = d.x + i * (w + gap);
      cardFill(d, x, d.top - 66, w, 66);
      d.rect(x, d.top - 66, 3, 66, { fill: SOLAR });
      const size = d.widthOf(t.v, 15, 'display' as unknown as boolean) > w - 22 ? 12 : 15;
      d.text(t.v, x + 12, d.top - 32, size, { style: 'display', color: INK });
      d.text(t.l.toUpperCase(), x + 12, d.top - 51, 6.2, { style: 'mono', color: MUTED });
    });
  });
}

function panelGraphic(d: Drawing, x: number, y: number, w: number, h: number) {
  d.rect(x, y, w, h, { fill: rgb(0.13, 0.17, 0.27), border: rgb(0.55, 0.55, 0.55), line: 0.8 });
  for (let i = 1; i < 4; i++) d.line(x + (w * i) / 4, y, x + (w * i) / 4, y + h, { color: rgb(0.35, 0.4, 0.5), t: 0.4 });
  for (let i = 1; i < 6; i++) d.line(x, y + (h * i) / 6, x + w, y + (h * i) / 6, { color: rgb(0.35, 0.4, 0.5), t: 0.4 });
}

type Product = { kind: string; title: string; specs: string[]; warranty: string; img?: Awaited<ReturnType<Kit['embed']>> };
/** One wide card per product: its picture, name and key specs, and the warranty as a dark badge. */
function productRows(kit: Kit, items: Product[]) {
  for (const p of items) {
    kit.block(98, (d) => {
      const y0 = d.top - 92;
      cardFill(d, d.x, y0, d.width, 92);
      d.rect(d.x, y0, d.width, 3, { fill: SOLAR });
      d.rect(d.x + 1, y0 + 3, 112, 88, { fill: rgb(0.975, 0.965, 0.94) });
      if (p.img) {
        const r = p.img.width / p.img.height;
        const ih = 80;
        const iw = Math.min(100, ih * r);
        d.image(p.img, d.x + 57 - iw / 2, y0 + 9, iw, ih);
      } else panelGraphic(d, d.x + 25, y0 + 12, 64, 72);
      const x = d.x + 128;
      d.text(p.kind.toUpperCase(), x, d.top - 20, 6.4, { style: 'mono', color: AMBER });
      d.lines(p.title, 10.5, d.width - 128 - 160, false).slice(0, 2).forEach((l, k) => d.text(l, x, d.top - 35 - k * 12, 10.5, { style: 'display' }));
      p.specs.slice(0, 3).forEach((s, k) => d.text(s, x, d.top - 62 - k * 10, 7.8, { color: LABEL }));
      if (p.warranty) {
        d.rect(d.x + d.width - 150, y0 + 14, 136, 22, { fill: INK });
        d.text(p.warranty.toUpperCase(), d.x + d.width - 143, y0 + 22, 6, { style: 'mono', color: SOLAR });
      }
    });
  }
}

/** Monthly generation as bars, and the customer's own use as an ink line over them. */
function generationChart(kit: Kit, gen: number[], use?: number[]) {
  const H = 170;
  kit.block(H, (d) => {
    const top = d.top - 20;
    const base = d.top - H + 18;
    const max = Math.max(...gen, ...(use ?? []), 1);
    const colW = d.width / 12;
    const bw = colW * 0.6;
    const yOf = (v: number) => base + ((top - base) * v) / max;
    // Legend.
    d.rect(d.x, d.top - 8, 8, 6, { fill: SOLAR });
    d.text('Generated by your system', d.x + 12, d.top - 8, 7, { color: LABEL });
    if (use) {
      d.line(d.x + 140, d.top - 5, d.x + 154, d.top - 5, { color: INK, t: 1.4 });
      d.text('Your electricity use', d.x + 158, d.top - 8, 7, { color: LABEL });
    }
    d.line(d.x, base, d.x + d.width, base, { color: LINE, t: 0.6 });
    gen.forEach((v, i) => {
      const x = d.x + i * colW + (colW - bw) / 2;
      d.rect(x, base, bw, Math.max(1, yOf(v) - base), { fill: SOLAR });
      const s = n0(v);
      if (!use || v >= (use[i] ?? 0)) d.text(s, x + bw / 2 - d.widthOf(s, 6.4) / 2, yOf(v) + 3, 6.4, { color: LABEL });
      d.text(MONTHS[i], x + bw / 2 - d.widthOf(MONTHS[i], 6.8) / 2, base - 10, 6.8, { color: MUTED });
    });
    if (use) {
      use.forEach((v, i) => {
        const cx = d.x + i * colW + colW / 2;
        if (i) d.line(d.x + (i - 1) * colW + colW / 2, yOf(use[i - 1]), cx, yOf(v), { color: INK, t: 1.4 });
      });
      use.forEach((v, i) => {
        const cx = d.x + i * colW + colW / 2;
        d.rect(cx - 2, yOf(v) - 2, 4, 4, { fill: INK });
        if (gen[i] < v) {
          const s = n0(v);
          d.text(s, cx - d.widthOf(s, 6.4) / 2, yOf(v) + 4, 6.4, { color: INK });
        }
      });
    }
  });
}

/** How much of your electricity it covers: a bar each for the panels alone and with the battery. */
function coverBar(kit: Kit, label: string, pct: number, strong: boolean) {
  kit.block(26, (d) => {
    d.text(label, d.x, d.top - 9, 8, { bold: true });
    d.right(`${Math.round(pct * 10) / 10}%`, d.x + d.width, d.top - 9, 8, { bold: true });
    d.rect(d.x, d.top - 20, d.width, 7, { fill: TRACK });
    d.rect(d.x, d.top - 20, (d.width * Math.min(100, pct)) / 100, 7, { fill: strong ? SOLAR : GREY });
  });
}

/** Year by year: where you are against what you paid. The axis, the zero line, the first and last figures and the payback point are marked. */
function paybackChart(kit: Kit, cum: number[], firstYear: number, paybackText?: string) {
  const H = 196;
  kit.block(H, (d) => {
    const left = d.x + 34;
    const w = d.x + d.width - left;
    const top = d.top - 34;
    const bottom = d.top - H + 24;
    const max = Math.max(...cum, 0);
    const min = Math.min(...cum, 0);
    const nice = (v: number) => Math.pow(10, Math.floor(Math.log10(Math.max(1, Math.abs(v))))) * (Math.abs(v) / Math.pow(10, Math.floor(Math.log10(Math.max(1, Math.abs(v))))) > 5 ? 10 : Math.abs(v) / Math.pow(10, Math.floor(Math.log10(Math.max(1, Math.abs(v))))) > 2 ? 5 : 2);
    const step = nice((max - min) / 4);
    const hi = Math.ceil(max / step) * step;
    const lo = Math.floor(min / step) * step;
    const yOf = (v: number) => bottom + ((top - bottom) * (v - lo)) / (hi - lo || 1);
    d.text('Cumulative net saving, year by year', d.x, d.top - 8, 8, { bold: true });
    d.text('Bars below the line: still paying back the price. Above: money in your pocket.', d.x, d.top - 18, 6.6, { color: MUTED });
    for (let v = lo; v <= hi + 1; v += step) {
      const y = yOf(v);
      d.line(left, y, d.x + d.width, y, { color: v === 0 ? INK : LINE, t: v === 0 ? 0.8 : 0.4 });
      const s = `${v < 0 ? '−' : ''}£${n0(Math.abs(v) / 1000)}k`;
      d.text(v === 0 ? '£0' : s, d.x + 28 - d.widthOf(v === 0 ? '£0' : s, 6.4), y - 2, 6.4, { color: MUTED });
    }
    const colW = w / cum.length;
    const bw = colW * 0.66;
    const zero = yOf(0);
    cum.forEach((v, i) => {
      const x = left + i * colW + (colW - bw) / 2;
      const y = yOf(v);
      d.rect(x, Math.min(y, zero), bw, Math.max(1, Math.abs(y - zero)), { fill: v >= 0 ? SOLAR : GREY });
      const yr = String(firstYear + i);
      if (i % 2 === 0 || i === cum.length - 1) d.text(yr, x + bw / 2 - d.widthOf(yr, 6.2) / 2, bottom - 11, 6.2, { color: MUTED });
    });
    // The first and the last figure, over their bars.
    const lab = (i: number) => {
      const s = gbp(cum[i]);
      const x = left + i * colW + colW / 2;
      d.text(s, Math.min(Math.max(x - d.widthOf(s, 6.6, true) / 2, left), d.x + d.width - d.widthOf(s, 6.6, true)), cum[i] >= 0 ? yOf(cum[i]) + 3 : yOf(cum[i]) - 9, 6.6, { bold: true });
    };
    lab(0);
    lab(cum.length - 1);
    // Payback: where the running total crosses zero.
    const k = cum.findIndex((v) => v >= 0);
    if (k > 0) {
      const frac = -cum[k - 1] / (cum[k] - cum[k - 1]);
      const px = left + (k - 1 + frac) * colW + colW / 2;
      d.line(px, bottom, px, top - 4, { color: AMBER, t: 0.9, dash: [3, 2] });
      const t = `Payback${paybackText ? `: ${paybackText}` : ''}`;
      d.text(t, Math.min(px + 4, d.x + d.width - d.widthOf(t, 7, true)), top - 12, 7, { bold: true, color: AMBER });
    }
  });
}

export async function designPages(kit: Kit, o: ProposalOption, pics: Pics, financials: boolean, glance: { label: string; value: string }[]): Promise<boolean> {
  const pic = (kind: 'roof' | 'inverter' | 'battery' | 'sunpath') => (o.images?.[kind] ? pics.get(o.images[kind]!) : undefined);
  const roof = await kit.embed(pic('roof')?.bytes);
  const inverter = await kit.embed(pic('inverter')?.bytes);
  const battery = await kit.embed(pic('battery')?.bytes);
  const sunpath = await kit.embed(pic('sunpath')?.bytes);
  const gen = o.monthlyKwh?.length === 12 ? o.monthlyKwh : null;
  const use = o.monthlyUseKwh?.length === 12 ? o.monthlyUseKwh : undefined;
  const hasSetup = !!(o.panelCount || o.inverterModel || o.batteryModel || o.batteryUsableKwh);
  const hasPerformance = !!(gen || o.selfSufficiencyPct || o.selfSufficiencyPvOnlyPct || sunpath || o.solarSharePct || o.co2TonnesYear);
  const green: Tile[] = [
    ...(o.solarSharePct ? [{ v: `${Math.round(o.solarSharePct)}%`, l: 'Of your use generated' }] : []),
    ...(o.co2TonnesYear ? [{ v: `${o.co2TonnesYear} tonne${o.co2TonnesYear === 1 ? '' : 's'}`, l: 'CO₂ avoided a year' }] : []),
    ...(o.carKm ? [{ v: `${n0(o.carKm)} km`, l: 'Car travel avoided' }] : []),
    ...(o.trees ? [{ v: n0(o.trees), l: 'Trees’ worth of carbon' }] : []),
  ];

  const cum = financials && o.cumulativeGbp && o.cumulativeGbp.length >= 2 ? o.cumulativeGbp : null;
  const hasMoney = financials && !!(o.annualSavingsGbp || o.paybackText || cum || o.netSavingsGbp);
  if (!roof && !hasSetup && !hasPerformance && !hasMoney) return false;

  // The headline figures.
  const key: Tile[] = [
    ...(o.systemKwp ? [{ v: `${kw(o.systemKwp)} kWp`, l: 'System size' }] : []),
    ...(o.annualGenerationKwh ? [{ v: `${n0(o.annualGenerationKwh)} kWh`, l: 'Generated a year' }] : []),
    ...(o.batteryUsableKwh ? [{ v: `${kw(o.batteryUsableKwh)} kWh`, l: 'Battery storage' }] : []),
    ...(o.selfSufficiencyPct || o.selfSufficiencyPvOnlyPct ? [{ v: `${Math.round(o.selfSufficiencyPct ?? o.selfSufficiencyPvOnlyPct ?? 0)}%`, l: o.selfSufficiencyPct ? 'Self-sufficient' : 'Self-sufficient (panels only)' }] : []),
  ];

  kit.newPage({ continued: true });
  kit.section('Your system design', { keep: 280 });
  tiles(kit, key);
  if (roof) {
    const ratio = roof.height / roof.width;
    kit.block(Math.min(200, 480 * ratio) + 22, (d) => {
      const h = Math.min(200, d.width * ratio);
      const w = h / ratio;
      d.rect(d.x, d.top - h, d.width, h, { fill: WHITE, border: LINE, line: 0.5 });
      d.image(roof, d.x + (d.width - w) / 2, d.top - h, w, h);
      d.text('Your roof with the proposed panels. Indicative: the final layout is confirmed at survey.', d.x, d.top - h - 12, 7, { color: MUTED });
    });
  }
  if (hasSetup) {
    kit.section('Your Solar Setup', { keep: 120 });
    const products: Product[] = [];
    if (o.panelCount || o.panelModel)
      products.push({
        kind: 'Solar panels',
        title: [o.panelBrand, o.panelModel].filter(Boolean).join(' ') || 'Solar panels',
        specs: [`${o.panelCount ?? ''}${o.panelCount && o.panelWatts ? ' × ' : ''}${o.panelWatts ? `${o.panelWatts} W` : ''}${o.systemKwp ? `  =  ${kw(o.systemKwp)} kWp` : ''}`, o.annualGenerationKwh ? `${n0(o.annualGenerationKwh)} kWh a year` : ''].filter(Boolean),
        warranty: [o.panelProductWarrantyYears ? `${o.panelProductWarrantyYears}-yr product` : '', o.panelPerformanceWarrantyYears ? `${o.panelPerformanceWarrantyYears}-yr output` : ''].filter(Boolean).join(' · '),
      });
    if (o.inverterModel || o.inverterBrand)
      products.push({ kind: 'Inverter', title: [o.inverterBrand, o.inverterModel].filter(Boolean).join(' '), specs: [o.inverterKw ? `${kw(o.inverterKw)} kW inverter power` : '', o.inverterCount && o.inverterCount > 1 ? `${o.inverterCount} units` : ''].filter(Boolean), warranty: o.inverterWarrantyYears ? `${o.inverterWarrantyYears}-year warranty` : '', img: inverter });
    if (o.batteryModel || o.batteryUsableKwh)
      products.push({ kind: 'Battery storage', title: [o.batteryModules && o.batteryModules > 1 ? `${o.batteryModules} ×` : '', o.batteryBrand, o.batteryModel].filter(Boolean).join(' '), specs: [o.batteryUsableKwh ? `${kw(o.batteryUsableKwh)} kWh usable capacity` : ''].filter(Boolean), warranty: o.batteryWarrantyYears ? `${o.batteryWarrantyYears}-year warranty` : '', img: battery });
    productRows(kit, products);
  } else if (glance.length) kit.rows(glance.map((r) => ({ label: r.label, value: r.value })));

  if (hasPerformance) {
    kit.newPage({ continued: true });
    kit.section('Expected performance', { intro: 'Estimated by the MCS method from your roof, its direction and shading, against how much electricity you use. A guide, not a guarantee.', keep: 250 });
    if (gen) generationChart(kit, gen, use);
    if (o.selfSufficiencyPvOnlyPct || o.selfSufficiencyPct) {
      kit.section('How much of your electricity it covers', { keep: 80 });
      if (o.selfSufficiencyPvOnlyPct) coverBar(kit, 'Panels only', o.selfSufficiencyPvOnlyPct, false);
      if (o.selfSufficiencyPct) coverBar(kit, 'Panels with the battery', o.selfSufficiencyPct, true);
    }
    const rows = [
      ...(o.consumptionKwh ? [{ label: 'Assumed use a year', value: `${n0(o.consumptionKwh)} kWh` }] : []),
      ...(o.kwhPerKwp ? [{ label: 'MCS yield', value: `${n0(o.kwhPerKwp)} kWh per kWp${o.shadeFactor ? `, shade factor ${o.shadeFactor}` : ''}${o.tiltDeg ? `, ${Math.round(o.tiltDeg)}° tilt` : ''}` }] : []),
    ];
    if (rows.length) kit.rows(rows);
    if (green.length) {
      kit.section('A cleaner footprint', { keep: 110 });
      tiles(kit, green);
    }
    if (sunpath) {
      const ratio = sunpath.height / sunpath.width;
      kit.section('Sun path and shading', { keep: 190 });
      kit.block(Math.min(165, 460 * ratio) + 20, (d) => {
        const h = Math.min(165, d.width * ratio);
        const w = h / ratio;
        d.image(sunpath, d.x + (d.width - w) / 2, d.top - h, w, h);
        d.text('Where the sun travels over the year, with shading marked at the middle of the array.', d.x, d.top - h - 12, 6.8, { color: MUTED });
      });
    }
  }

  if (hasMoney) {
    kit.newPage({ continued: true });
    kit.section('What it could save you', { intro: 'The design proposal’s own estimates, using today’s tariff and a yearly rise in energy prices. Prices can go down as well as up.', keep: 300 });
    tiles(kit, [
      ...(o.annualSavingsGbp ? [{ v: gbp(o.annualSavingsGbp), l: 'Saved in year one' }] : []),
      ...(o.paybackText ? [{ v: o.paybackText.replace(/years?/i, 'yrs').replace(/months?/i, 'mths'), l: 'Payback' }] : []),
      ...(o.netSavingsGbp ? [{ v: gbp(o.netSavingsGbp), l: `Net saving over ${cum?.length ?? 20} years` }] : []),
      ...(o.rateOfReturnPct ? [{ v: `${o.rateOfReturnPct}%`, l: 'Rate of return' }] : []),
    ]);
    if (cum) paybackChart(kit, cum, o.firstYear ?? new Date().getFullYear(), o.paybackText);
    if (o.billBeforeGbp?.length === 12 && o.billAfterGbp?.length === 12) {
      kit.grid({
        columns: ['Month', 'Solar (kWh)', 'Your use (kWh)', 'Bill before', 'Bill after', 'Saving'],
        widths: [0.9, 1.2, 1.3, 1.2, 1.2, 1.2],
        rows: MONTHS.map((m, i) => [m, gen ? n0(gen[i]) : '–', use ? n0(use[i]) : '–', gbp(o.billBeforeGbp![i]), gbp(o.billAfterGbp![i]), gbp(o.billBeforeGbp![i] - o.billAfterGbp![i])]),
      });
    }
  }

  // Where these figures came from, and that the quote's terms apply to all of it.
  kit.note('This system has been designed in third-party design software (OpenSolar). The key data points in this proposal have been extracted from that design and presented fairly. Figures are estimates, not guarantees. This quote, including these pages, is subject to the terms and conditions at the end of this document.');
  return true;
}
