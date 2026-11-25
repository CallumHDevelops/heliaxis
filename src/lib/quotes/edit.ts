import { cleanContent, lineNet, money, totalsOf, type QuoteBlock, type QuoteContent, type QuoteLine } from './types';

/**
 * Conversational edits to a draft quote ("swap to 10 panels", "add bird mesh", "knock 5% off", "make it a 2-day
 * install"), as pure operations on the quote's lines. Metis chooses the operations; this applies them and does the
 * sums. Nothing here saves anything: the caller saves the result as a new version and never overwrites the old one.
 * A discount is kept as a percentage and worked out again after every other change, so it never goes stale.
 */

export type EditOp =
  | { op: 'set_qty'; line: string; qty: number }
  | { op: 'add_line'; description: string; qty: number; unitPence: number; costPence: number | null; vatRate: number; sku?: string | null }
  | { op: 'remove_line'; line: string }
  | { op: 'set_unit_price'; line: string; unitPence: number }
  | { op: 'set_labour_days'; days: number }
  | { op: 'set_discount_percent'; percent: number };

export const MAX_DISCOUNT_PERCENT = 50;
const DISCOUNT_ID = 'disc';
const isDiscount = (l: QuoteLine) => l.id.startsWith(DISCOUNT_ID);
const LABOUR = /^installation labour/i;
const DISCOUNT_PCT = /\((\d+(?:\.\d+)?)%\)/;

export type EditResult = { ok: true; content: QuoteContent; /** True when the change removes, replaces or lowers something already there: the user must confirm it first. */ overwrites: boolean } | { ok: false; error: string };

const firstItems = (c: QuoteContent): Extract<QuoteBlock, { type: 'items' }> | null => (c.blocks.find((b) => b.type === 'items') as Extract<QuoteBlock, { type: 'items' }> | undefined) ?? null;

/** The one line a reference means: its id, its SKU, or words from its description. */
export function findLine(lines: QuoteLine[], ref: string): QuoteLine | { error: string } {
  const r = ref.trim().toLowerCase();
  if (!r) return { error: 'Say which line.' };
  const exact = lines.find((l) => l.id.toLowerCase() === r || (l.detail ?? '').toLowerCase() === r);
  if (exact) return exact;
  const hits = lines.filter((l) => !isDiscount(l) && l.description.toLowerCase().includes(r));
  if (hits.length === 1) return hits[0];
  if (!hits.length) return { error: `No line matches "${ref}".` };
  return { error: `"${ref}" matches ${hits.length} lines (${hits.map((h) => h.description).join('; ')}). Say which one.` };
}

const discountPercentOf = (lines: QuoteLine[]): number => {
  const l = lines.find(isDiscount);
  const m = l ? DISCOUNT_PCT.exec(l.description) : null;
  return m ? Number(m[1]) : 0;
};

/** Discount lines worked out again from the other lines: one per VAT rate, so the VAT comes off in proportion. */
function withDiscount(lines: QuoteLine[], percent: number): QuoteLine[] {
  const base = lines.filter((l) => !isDiscount(l));
  if (!(percent > 0)) return base;
  const byRate = new Map<number, number>();
  for (const l of base) byRate.set(l.vat_rate, (byRate.get(l.vat_rate) ?? 0) + lineNet(l));
  const out: QuoteLine[] = [...base];
  for (const [rate, net] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
    const off = Math.round((net * percent) / 100);
    if (off <= 0) continue;
    out.push({ id: `${DISCOUNT_ID}${rate}`, description: `Discount (${percent}%)`, detail: byRate.size > 1 ? `On items at ${rate}% VAT` : undefined, qty: 1, unit_pence: -off, vat_rate: rate, cost_pence: 0, mode: 'manual', markup: 0 });
  }
  return out;
}

let counter = 0;
const newLineId = () => `e${Date.now().toString(36)}${(counter++).toString(36)}`;

export function applyEdits(content: QuoteContent, ops: EditOp[]): EditResult {
  const block = firstItems(content);
  if (!block) return { ok: false, error: 'This quote has no list of items to change.' };
  if (!ops.length) return { ok: false, error: 'No changes were given.' };
  let lines = block.lines.map((l) => ({ ...l }));
  let percent = discountPercentOf(lines);
  let overwrites = false;

  for (const op of ops) {
    switch (op.op) {
      case 'set_qty': {
        const l = findLine(lines, op.line);
        if ('error' in l) return { ok: false, error: l.error };
        if (!(op.qty >= 0) || !Number.isFinite(op.qty)) return { ok: false, error: 'A quantity must be zero or more.' };
        if (op.qty === 0) return { ok: false, error: `To take ${l.description} off, remove the line instead of setting it to 0.` };
        if (op.qty < l.qty) overwrites = true;
        l.qty = op.qty;
        break;
      }
      case 'add_line': {
        if (!op.description.trim() || !(op.qty > 0) || !(op.unitPence >= 0)) return { ok: false, error: 'A new line needs a description, a quantity and a price.' };
        lines.push({ id: newLineId(), description: op.description.trim(), detail: op.sku || undefined, qty: op.qty, unit_pence: Math.round(op.unitPence), vat_rate: op.vatRate, cost_pence: Math.max(0, Math.round(op.costPence ?? 0)), mode: 'manual', markup: 0 });
        break;
      }
      case 'remove_line': {
        const l = findLine(lines, op.line);
        if ('error' in l) return { ok: false, error: l.error };
        if (isDiscount(l)) return { ok: false, error: 'To take the discount off, set the discount to 0%.' };
        lines = lines.filter((x) => x !== l);
        overwrites = true;
        break;
      }
      case 'set_unit_price': {
        const l = findLine(lines, op.line);
        if ('error' in l) return { ok: false, error: l.error };
        if (!(op.unitPence >= 0)) return { ok: false, error: 'A price cannot be negative.' };
        if (Math.round(op.unitPence) !== l.unit_pence) overwrites = true;
        l.unit_pence = Math.round(op.unitPence);
        break;
      }
      case 'set_labour_days': {
        const l = lines.find((x) => LABOUR.test(x.description));
        if (!l) return { ok: false, error: 'There is no installation labour line to change.' };
        if (!(op.days > 0)) return { ok: false, error: 'Install days must be more than zero.' };
        if (op.days < l.qty) overwrites = true;
        l.qty = op.days;
        l.detail = `${op.days} day${op.days === 1 ? '' : 's'}`;
        break;
      }
      case 'set_discount_percent': {
        if (!(op.percent >= 0) || op.percent > MAX_DISCOUNT_PERCENT) return { ok: false, error: `A discount must be between 0% and ${MAX_DISCOUNT_PERCENT}%.` };
        if (percent !== op.percent) overwrites = true;
        percent = op.percent;
        break;
      }
    }
  }
  lines = withDiscount(lines, percent);
  const blocks = content.blocks.map((b) => (b === block ? { ...block, lines } : b));
  return { ok: true, content: cleanContent({ ...content, blocks }), overwrites };
}

const itemsOf = (c: QuoteContent) => c.blocks.flatMap((b) => (b.type === 'items' ? b.lines : []));
const lineText = (l: QuoteLine) => `${l.description} ${l.qty} × ${money(l.unit_pence)}`;

/** The exact change between two versions, in words, with the totals either side. */
export function diffQuote(before: QuoteContent, after: QuoteContent): { lines: string[]; totalBefore: number; totalAfter: number; changed: boolean } {
  const a = itemsOf(before);
  const b = itemsOf(after);
  const byId = new Map(a.map((l) => [l.id, l]));
  const out: string[] = [];
  for (const l of b) {
    const old = byId.get(l.id);
    if (!old) out.push(`Added: ${lineText(l)}`);
    else {
      if (old.qty !== l.qty) out.push(`${l.description}: quantity ${old.qty} → ${l.qty}`);
      if (old.unit_pence !== l.unit_pence) out.push(`${l.description}: price ${money(old.unit_pence)} → ${money(l.unit_pence)} each`);
    }
  }
  const keep = new Set(b.map((l) => l.id));
  for (const l of a) if (!keep.has(l.id)) out.push(`Removed: ${lineText(l)}`);
  const totalBefore = totalsOf(before).gross;
  const totalAfter = totalsOf(after).gross;
  if (totalBefore !== totalAfter) out.push(`Total inc VAT: ${money(totalBefore)} → ${money(totalAfter)}`);
  return { lines: out, totalBefore, totalAfter, changed: out.length > 0 };
}

/** What Metis sends: every field present, the ones that don't apply null. */
export type RawEdit = { op?: unknown; line?: unknown; qty?: unknown; description?: unknown; unit_price_gbp?: unknown; cost_gbp?: unknown; vat_percent?: unknown; sku?: unknown; days?: unknown; percent?: unknown };
/** A product from the price book to add: the caller prices it (price, cost and VAT come from the book and HAP's settings). */
export type ProductAdd = { op: 'add_product'; sku: string; qty: number };

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pence = (v: unknown): number | null => (num(v) != null && (num(v) as number) >= 0 ? Math.round((num(v) as number) * 100) : null);

/** Metis's edits as operations, or what is missing. Pounds become pence here. Never guesses a number. */
export function parseEditInput(raw: unknown): { ok: true; ops: (EditOp | ProductAdd)[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: 'No changes were given.' };
  const ops: (EditOp | ProductAdd)[] = [];
  for (const r of raw as RawEdit[]) {
    const op = str(r.op);
    if (op === 'set_qty') {
      if (!str(r.line) || num(r.qty) == null) return { ok: false, error: 'set_qty needs the line and the new quantity.' };
      ops.push({ op, line: str(r.line), qty: num(r.qty) as number });
    } else if (op === 'remove_line') {
      if (!str(r.line)) return { ok: false, error: 'remove_line needs the line.' };
      ops.push({ op, line: str(r.line) });
    } else if (op === 'set_unit_price') {
      if (!str(r.line) || pence(r.unit_price_gbp) == null) return { ok: false, error: 'set_unit_price needs the line and the new price in pounds.' };
      ops.push({ op, line: str(r.line), unitPence: pence(r.unit_price_gbp) as number });
    } else if (op === 'set_labour_days') {
      if (num(r.days) == null) return { ok: false, error: 'set_labour_days needs the number of days.' };
      ops.push({ op, days: num(r.days) as number });
    } else if (op === 'set_discount_percent') {
      if (num(r.percent) == null) return { ok: false, error: 'set_discount_percent needs the percentage (0 removes the discount).' };
      ops.push({ op, percent: num(r.percent) as number });
    } else if (op === 'add_product') {
      if (!str(r.sku) || !(num(r.qty) != null && (num(r.qty) as number) > 0)) return { ok: false, error: 'add_product needs the SKU from the price book and a quantity.' };
      ops.push({ op, sku: str(r.sku), qty: num(r.qty) as number });
    } else if (op === 'add_line') {
      if (!str(r.description) || !(num(r.qty) != null && (num(r.qty) as number) > 0) || pence(r.unit_price_gbp) == null) return { ok: false, error: 'add_line needs a description, a quantity and a price the user gave you. If the item is in the price book use add_product.' };
      const vat = num(r.vat_percent);
      if (vat == null) return { ok: false, error: 'add_line needs the VAT rate. Ask the user, or use add_product for a price-book item.' };
      ops.push({ op, description: str(r.description), qty: num(r.qty) as number, unitPence: pence(r.unit_price_gbp) as number, costPence: pence(r.cost_gbp), vatRate: vat, sku: str(r.sku) || null });
    } else return { ok: false, error: `Unknown change "${op}".` };
  }
  return { ok: true, ops };
}
