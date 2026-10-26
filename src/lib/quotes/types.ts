/** The quote builder's content and its money. Pure: safe for the server, the browser and tests. Money is whole pence. */

export type QuoteLine = { id: string; description: string; detail?: string; qty: number; unit_pence: number; vat_rate: number };
export type QuoteImage = { path: string; caption: string };
export type QuoteFile = { library_id: string; name: string };

export type QuoteBlock =
  | { id: string; type: 'text'; heading: string; body: string }
  | { id: string; type: 'items'; heading: string; lines: QuoteLine[] }
  | { id: string; type: 'images'; heading: string; images: QuoteImage[] }
  | { id: string; type: 'datasheets'; heading: string; files: QuoteFile[] };

/** `terms` always print at the bottom of the quote, after everything else. */
export type QuoteContent = { intro: string; blocks: QuoteBlock[]; terms: string };

/** VAT rates the builder offers: 0% (domestic solar and batteries to 2027), 5% and 20%. */
export const VAT_RATES = [0, 5, 20] as const;

export const newId = () => 'b' + Math.random().toString(36).slice(2, 10);

export const emptyLine = (): QuoteLine => ({ id: newId(), description: '', qty: 1, unit_pence: 0, vat_rate: 0 });

export const lineNet = (l: Pick<QuoteLine, 'qty' | 'unit_pence'>) => Math.round((Number(l.qty) || 0) * (Number(l.unit_pence) || 0));
export const lineVat = (l: QuoteLine) => Math.round((lineNet(l) * (Number(l.vat_rate) || 0)) / 100);

export type Totals = { net: number; vat: number; gross: number; byRate: { rate: number; net: number; vat: number }[] };

export function totalsOf(content: QuoteContent): Totals {
  const byRate = new Map<number, { net: number; vat: number }>();
  for (const b of content.blocks) {
    if (b.type !== 'items') continue;
    for (const l of b.lines) {
      const r = Number(l.vat_rate) || 0;
      const cur = byRate.get(r) ?? { net: 0, vat: 0 };
      cur.net += lineNet(l);
      cur.vat += lineVat(l);
      byRate.set(r, cur);
    }
  }
  const rows = [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => ({ rate, ...v }));
  const net = rows.reduce((a, r) => a + r.net, 0);
  const vat = rows.reduce((a, r) => a + r.vat, 0);
  return { net, vat, gross: net + vat, byRate: rows };
}

export const money = (pence: number) => {
  const neg = pence < 0;
  const p = Math.abs(Math.round(pence));
  const s = `£${Math.floor(p / 100).toLocaleString('en-GB')}.${String(p % 100).padStart(2, '0')}`;
  return neg ? `−${s}` : s;
};

/** "1,250.5" or "£1,250" typed in a box → pence (0 if it isn't a number). */
export function penceFromText(s: string): number {
  const n = parseFloat(String(s).replace(/[£,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export const textFromPence = (p: number) => (p ? (p / 100).toFixed(2).replace(/\.00$/, '') : '');

export const DEFAULT_TERMS =
  'This quote is valid until the date shown above. Prices are shown with the VAT rate that applies to each item. If a deposit is shown, it is payable once you have accepted the quote. You can change your mind and cancel within 14 days of signing, free of charge. Final design and any extra work found on site will be agreed with you before we go ahead.';

/** What a new quote starts with: an intro to edit, one list of items, a "what's included" text and the terms. */
export function starterContent(first: string): QuoteContent {
  return {
    intro: `Hi ${first || 'there'}, thank you for the chance to quote. Here is what we propose for your property, with the price broken down below. If anything is unclear, just reply and we will talk it through.`,
    blocks: [
      { id: newId(), type: 'items', heading: 'Your quote', lines: [emptyLine()] },
      { id: newId(), type: 'text', heading: 'What is included', body: '' },
    ],
    terms: DEFAULT_TERMS,
  };
}

/** A content object from the database or a request, made safe to use (unknown shapes dropped). */
export function cleanContent(v: unknown): QuoteContent {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<QuoteContent>;
  const str = (x: unknown, max: number) => String(x ?? '').slice(0, max);
  const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const blocks: QuoteBlock[] = [];
  for (const raw of Array.isArray(o.blocks) ? o.blocks.slice(0, 40) : []) {
    const b = raw as Record<string, unknown>;
    const id = str(b.id, 24) || newId();
    const heading = str(b.heading, 120);
    if (b.type === 'text') blocks.push({ id, type: 'text', heading, body: str(b.body, 8000) });
    else if (b.type === 'items')
      blocks.push({
        id,
        type: 'items',
        heading,
        lines: (Array.isArray(b.lines) ? b.lines : []).slice(0, 80).map((l: Record<string, unknown>) => ({
          id: str(l.id, 24) || newId(),
          description: str(l.description, 300),
          detail: str(l.detail, 600) || undefined,
          qty: Math.max(0, Math.min(100000, num(l.qty))),
          unit_pence: Math.max(-100_000_000, Math.min(1_000_000_000, Math.round(num(l.unit_pence)))),
          vat_rate: (VAT_RATES as readonly number[]).includes(num(l.vat_rate)) ? num(l.vat_rate) : 0,
        })),
      });
    else if (b.type === 'images')
      blocks.push({
        id,
        type: 'images',
        heading,
        images: (Array.isArray(b.images) ? b.images : [])
          .slice(0, 12)
          .map((i: Record<string, unknown>) => ({ path: str(i.path, 300), caption: str(i.caption, 200) }))
          .filter((i) => i.path.startsWith('quotes/') && !i.path.includes('..')),
      });
    else if (b.type === 'datasheets')
      blocks.push({
        id,
        type: 'datasheets',
        heading,
        files: (Array.isArray(b.files) ? b.files : [])
          .slice(0, 20)
          .map((f: Record<string, unknown>) => ({ library_id: str(f.library_id, 40), name: str(f.name, 200) }))
          .filter((f) => /^[0-9a-f-]{36}$/i.test(f.library_id)),
      });
  }
  // A quote made before terms had their own place: its "Terms" text section moves to the bottom.
  let terms = typeof o.terms === 'string' ? str(o.terms, 8000) : null;
  if (terms === null) {
    const i = blocks.findIndex((b) => b.type === 'text' && /^terms/i.test(b.heading.trim()));
    if (i >= 0) {
      const b = blocks[i];
      terms = b.type === 'text' ? b.body : '';
      blocks.splice(i, 1);
    } else terms = DEFAULT_TERMS;
  }
  return { intro: str(o.intro, 4000), blocks, terms };
}
