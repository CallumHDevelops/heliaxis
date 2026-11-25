import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_EDGE_MM, DEFAULT_GAP_MM } from './layout';
import { DEFAULT_MIN_TEMP_C } from './check';
import type { PriceBookItem, PricingSettings, VatRule } from '@/lib/pricing/price';

/** The price book and the design/pricing settings, read from the database. Never writes. */

export type BookRow = PriceBookItem & { specs: Record<string, unknown>; datasheetUrl: string | null };

type Row = { sku: string; category: string; make: string; model: string; specs: Record<string, unknown> | null; cost_pence: number | null; sell_pence: number | null; unit: string; active: boolean; datasheet_url: string | null };
const rowOf = (r: Row): BookRow => ({ sku: r.sku, category: r.category, make: r.make, model: r.model, unit: r.unit, costPence: r.cost_pence, sellPence: r.sell_pence, active: r.active, specs: r.specs ?? {}, datasheetUrl: r.datasheet_url });

export const BOOK_NOT_READY = 'The price book isn’t set up yet: supabase/price-book.sql needs running in Supabase, then products added to it.';
const COLS = 'sku, category, make, model, specs, cost_pence, sell_pence, unit, active, datasheet_url';
const missingTable = (e: { message: string; code?: string }) => e.code === '42P01' || /does not exist|schema cache|PGRST205/i.test(e.message);

export async function loadBook(skus: string[]): Promise<{ rows: Map<string, BookRow> } | { error: string }> {
  const wanted = [...new Set(skus.filter(Boolean))];
  if (!wanted.length) return { rows: new Map() };
  const { data, error } = await createAdminClient().from('price_book').select(COLS).in('sku', wanted);
  if (error) return { error: missingTable(error) ? BOOK_NOT_READY : `Couldn't read the price book: ${error.message}` };
  return { rows: new Map((data as Row[]).map((r) => [r.sku, rowOf(r)])) };
}

/** Search active products by words in the make, model or SKU, optionally within one category. */
export async function searchBook(query: string, category: string | null): Promise<{ rows: BookRow[] } | { error: string }> {
  const q = query.replace(/[,()%*]/g, ' ').trim();
  let req = createAdminClient().from('price_book').select(COLS).eq('active', true).order('make').limit(25);
  if (category) req = req.eq('category', category);
  for (const w of q.split(/\s+/).filter(Boolean)) req = req.or(`sku.ilike.%${w}%,make.ilike.%${w}%,model.ilike.%${w}%`);
  const { data, error } = await req;
  if (error) return { error: missingTable(error) ? BOOK_NOT_READY : `Couldn't read the price book: ${error.message}` };
  return { rows: (data as Row[]).map(rowOf) };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pence = (gbp: unknown) => (num(gbp) == null ? null : Math.round((gbp as number) * 100));

function vatRule(v: unknown): VatRule {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const by = (o.by_category && typeof o.by_category === 'object' ? o.by_category : {}) as Record<string, unknown>;
  return { default: num(o.default), byCategory: Object.fromEntries(Object.entries(by).filter(([, x]) => num(x) != null).map(([k, x]) => [k, x as number])) };
}

export type DesignSettings = { edgeMm: number; gapMm: number; minTempC: number; defaultPanelSku: string | null };

/** pv_settings keys: design.layout, pricing, scaffolding. Unset values stay null: nothing is invented. */
export async function loadSettings(): Promise<{ design: DesignSettings; pricing: PricingSettings }> {
  const { data } = await createAdminClient().from('pv_settings').select('key, value').in('key', ['design.layout', 'pricing', 'scaffolding']);
  const by = new Map((data ?? []).map((r) => [r.key as string, (r.value ?? {}) as Record<string, unknown>]));
  const d = by.get('design.layout') ?? {};
  const p = by.get('pricing') ?? {};
  const s = by.get('scaffolding') ?? {};
  const vat = (p.vat && typeof p.vat === 'object' ? p.vat : {}) as Record<string, unknown>;
  return {
    design: { edgeMm: num(d.edge_mm) ?? DEFAULT_EDGE_MM, gapMm: num(d.gap_mm) ?? DEFAULT_GAP_MM, minTempC: num(d.min_temp_c) ?? DEFAULT_MIN_TEMP_C, defaultPanelSku: typeof d.default_panel_sku === 'string' ? d.default_panel_sku : null },
    pricing: {
      markupPct: num(p.markup_pct),
      minMarginPct: num(p.min_margin_pct),
      labourSellDayPence: pence(p.labour_sell_day_gbp),
      labourCostDayPence: pence(p.labour_cost_day_gbp),
      scaffolding: { fixedFeePence: pence(s.fixed_fee_gbp), ratePerM2Pence: pence(s.rate_per_m2_gbp), minChargePence: pence(s.min_charge_gbp), topLiftM: num(s.top_lift_m), endReturnM: num(s.end_return_m), storeyHeightM: num(s.storey_height_m) },
      vat: { domestic: vatRule(vat.domestic), commercial: vatRule(vat.commercial) },
    },
  };
}
