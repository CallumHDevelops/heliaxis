import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { checkDesign } from '@/lib/pvdesign/check';
import { layoutPanels } from '@/lib/pvdesign/layout';
import { loadBook, loadSettings, searchBook, type BookRow } from '@/lib/pvdesign/server';
import { toBatterySpec, toInverterSpec, toPanelSize, toPanelSpec } from '@/lib/pvdesign/specs';
import { priceJob } from '@/lib/pricing/price';

/**
 * The calculating tools. Metis decides what to ask for; these do the arithmetic (panel layout, string sizing, prices,
 * VAT, totals) in tested code from the price book and HAP's settings. They never write anything and never invent a
 * figure: a missing spec or price comes back as such.
 */

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
const nullable = (description: string, type: 'string' | 'number' = 'string') => ({ type: [type, 'null'], description }) as const;
const obj = (properties: Record<string, unknown>) => ({ type: 'object' as const, properties, required: Object.keys(properties), additionalProperties: false });
const CATS = ['panel', 'inverter', 'battery', 'mounting', 'cable', 'isolator', 'comms', 'meter', 'accessory', 'labour', 'other'];

export const DESIGN_TOOLS: Anthropic.Tool[] = [
  {
    name: 'find_product',
    description: 'Search the Heliaxis price book for a product by make, model or SKU (optionally within a category). Returns SKUs to use with the design and pricing tools, and whether each has the datasheet figures and a price. Never state a product, spec or price that this does not return.',
    input_schema: obj({ query: str, category: { type: ['string', 'null'], enum: [...CATS, null] } }),
  },
  {
    name: 'layout_panels',
    description: 'Lay solar panels out on one roof face: tries portrait, landscape and mixed and returns the most panels that fit, with kWp. Use the real panel from the price book. Results are indicative and subject to site survey. Never count panels yourself.',
    input_schema: obj({ roof_width_m: { ...num, description: 'Usable roof width along the eaves, metres.' }, roof_height_m: { ...num, description: 'Roof height up the slope, metres.' }, panel_sku: nullable('A panel SKU, or null for the default panel in settings.') }),
  },
  {
    name: 'check_design',
    description: 'Check an electrical design: string sizing against the inverter MPPT window (cold Voc, hot Vmp), DC/AC ratio, battery limits, and for off-grid whether the inverter supports island operation, generator input and days of autonomy. Report every issue it returns plainly; never hide a warning.',
    input_schema: obj({
      panel_sku: str,
      panel_count: { type: 'integer' },
      inverter_sku: str,
      battery_sku: nullable('Battery SKU, or null.'),
      battery_count: { type: 'integer', description: 'Number of battery units/modules (1 if none).' },
      system_type: { type: 'string', enum: ['grid-tied', 'off-grid'] },
      daily_load_kwh: nullable('Off-grid: the customer’s daily use in kWh, or null if unknown.', 'number'),
      peak_load_kw: nullable('Off-grid: the peak load in kW, or null.', 'number'),
      generator_backup: { type: 'boolean' },
    }),
  },
  {
    name: 'price_quote',
    description: 'Price a job from the price book: items, installation labour and scaffolding, with VAT from HAP’s settings and the totals. Anything without a price comes back as PRICE REQUIRED. Quote only the figures this returns; never do the sums yourself. Does not create a quote.',
    input_schema: obj({
      items: { type: 'array', items: obj({ sku: str, qty: num }) },
      install_days: num,
      customer_type: { type: 'string', enum: ['domestic', 'commercial'] },
      scaffolding_width_m: nullable('Width of the scaffolded elevation in metres, or null if no scaffolding.', 'number'),
      scaffolding_storeys: { type: ['integer', 'null'], description: 'Storeys to scaffold, or null if none.' },
    }),
  },
];

export const DESIGN_NAMES = new Set(DESIGN_TOOLS.map((t) => t.name));

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const gbp = (pence: number) => `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function product(rows: Map<string, BookRow>, sku: string, category: BookRow['category']): BookRow | string {
  const r = rows.get(sku);
  if (!r) return `${sku} is not in the price book. Use find_product to get a valid SKU.`;
  if (r.category !== category) return `${sku} is a ${r.category}, not a ${category}.`;
  return r;
}

export async function runDesignTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'find_product': {
      const r = await searchBook(s(input.query), s(input.category) || null);
      if ('error' in r) return r.error;
      if (!r.rows.length) return 'No matching products in the price book. Say so: do not guess a product or price.';
      return JSON.stringify(
        r.rows.map((p) => ({
          sku: p.sku,
          category: p.category,
          make: p.make,
          model: p.model,
          specs: p.specs,
          has_price: p.sellPence != null,
          sell_price: p.sellPence != null ? gbp(p.sellPence) : null,
          datasheet: p.datasheetUrl,
        }))
      );
    }

    case 'layout_panels': {
      const w = n(input.roof_width_m);
      const h = n(input.roof_height_m);
      if (w == null || h == null || w <= 0 || h <= 0) return 'roof_width_m and roof_height_m must be positive numbers (metres).';
      const { design } = await loadSettings();
      const sku = s(input.panel_sku) || design.defaultPanelSku;
      if (!sku) return 'No panel was named and no default panel is set in HAP settings (design.layout.default_panel_sku). Ask which panel to use.';
      const book = await loadBook([sku]);
      if ('error' in book) return book.error;
      const p = product(book.rows, sku, 'panel');
      if (typeof p === 'string') return p;
      const size = toPanelSize(p.specs);
      if (!size) return `${p.make} ${p.model} has no panel dimensions (width_mm, height_mm) in the price book, so it can't be laid out.`;
      const wp = toPanelSpec(p.specs).wp;
      const r = layoutPanels({ roofWidthMm: Math.round(w * 1000), roofHeightMm: Math.round(h * 1000), panel: size, edgeMm: design.edgeMm, gapXMm: design.gapMm, gapYMm: design.gapMm });
      return JSON.stringify({
        panel: `${p.make} ${p.model}`,
        panel_sku: sku,
        panel_count: r.best.count,
        layout: r.best.kind,
        kwp: wp != null ? Math.round(wp * r.best.count) / 1000 : null,
        by_orientation: r.options,
        edge_clearance_mm: r.best.params.edgeMm,
        gap_mm: r.best.params.gapXMm,
        note: 'Indicative — subject to site survey.',
        ...(wp == null ? { warning: 'The panel’s rated power (wp) is missing from the price book, so kWp is unknown.' } : {}),
      });
    }

    case 'check_design': {
      const panelSku = s(input.panel_sku);
      const invSku = s(input.inverter_sku);
      const batSku = s(input.battery_sku);
      const book = await loadBook([panelSku, invSku, batSku]);
      if ('error' in book) return book.error;
      const panel = product(book.rows, panelSku, 'panel');
      if (typeof panel === 'string') return panel;
      const inv = product(book.rows, invSku, 'inverter');
      if (typeof inv === 'string') return inv;
      let bat: BookRow | null = null;
      if (batSku) {
        const b = product(book.rows, batSku, 'battery');
        if (typeof b === 'string') return b;
        bat = b;
      }
      const { design } = await loadSettings();
      const r = checkDesign({
        panel: toPanelSpec(panel.specs),
        panelCount: Math.max(0, Math.round(n(input.panel_count) ?? 0)),
        inverter: toInverterSpec(inv.specs),
        battery: bat ? toBatterySpec(bat.specs) : null,
        batteryCount: Math.max(1, Math.round(n(input.battery_count) ?? 1)),
        systemType: input.system_type === 'off-grid' ? 'off-grid' : 'grid-tied',
        dailyLoadKwh: n(input.daily_load_kwh),
        peakLoadKw: n(input.peak_load_kw),
        generatorBackup: input.generator_backup === true,
        minTempC: design.minTempC,
      });
      return JSON.stringify({ ...r, note: 'Indicative — subject to site survey. Report every issue, including warnings.' });
    }

    case 'price_quote': {
      const raw = Array.isArray(input.items) ? input.items : [];
      const items = raw.map((i) => ({ sku: s((i as Record<string, unknown>)?.sku), qty: n((i as Record<string, unknown>)?.qty) ?? 0 })).filter((i) => i.sku && i.qty > 0);
      const book = await loadBook(items.map((i) => i.sku));
      if ('error' in book) return book.error;
      const { pricing } = await loadSettings();
      const w = n(input.scaffolding_width_m);
      const st = n(input.scaffolding_storeys);
      const r = priceJob(
        { items, installDays: Math.max(0, n(input.install_days) ?? 0), customerType: input.customer_type === 'commercial' ? 'commercial' : 'domestic', scaffolding: w != null && w > 0 && st != null && st > 0 ? { widthM: w, storeys: st } : null },
        book.rows,
        pricing
      );
      return JSON.stringify({
        complete: r.complete,
        lines: r.lines.map((l) => ({ description: l.description, sku: l.detail ?? null, qty: l.qty, unit_price: l.priceRequired ? 'PRICE REQUIRED' : gbp(l.unit_pence), vat_percent: l.vat_rate })),
        net: gbp(r.totals.net),
        vat: gbp(r.totals.vat),
        total_inc_vat: gbp(r.totals.gross),
        margin_percent: r.marginPct,
        needs: r.needs,
        warnings: r.warnings,
        note: r.complete ? undefined : 'Tell the user exactly what is missing. Do not fill a gap with a guess.',
      });
    }
  }
  return `Unknown tool ${name}`;
}
