import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { priceJob, type PriceBookItem, type PricingSettings } from '@/lib/pricing/price';
import { draftQuoteContent, INDICATIVE_QUOTE, OFF_GRID_BODY, quoteTitle, unsupportedVat } from '@/lib/quotes/from-design';
import { DEFAULT_TERMS, totalsOf } from '@/lib/quotes/types';

const item = (o: Partial<PriceBookItem> & { sku: string }): PriceBookItem => ({ category: 'solar', make: 'Acme', model: o.sku, unit: 'each', costPence: 8000, sellPence: 10000, active: true, ...o });
const BOOK = new Map([item({ sku: 'PANEL' }), item({ sku: 'INV', category: 'inverter', sellPence: 120000, costPence: 90000 }), item({ sku: 'NOPRICE', sellPence: null, costPence: null })].map((i) => [i.sku, i]));
const SETTINGS: PricingSettings = {
  markupPct: null,
  minMarginPct: 20,
  labourSellDayPence: 45000,
  labourCostDayPence: 30000,
  scaffolding: { fixedFeePence: null, ratePerM2Pence: null, minChargePence: null, topLiftM: null, endReturnM: null, storeyHeightM: null },
  vat: { domestic: { default: 20, byCategory: { solar: 0, inverter: 0 } }, commercial: { default: 20 } },
};
const priced = (items: { sku: string; qty: number }[]) => priceJob({ items, installDays: 2, customerType: 'domestic' }, BOOK, SETTINGS);
const base = { customerFirstName: 'Henry', systemType: 'off-grid' as const, scope: 'Supply and install the panels, inverter and battery, with all electrics.', panelCount: 10, kwp: 4, designIssues: [], surveyLinked: false };

describe('draft quote content', () => {
  it('puts the priced lines in the quote with the same totals the pricing gave', () => {
    const p = priced([{ sku: 'PANEL', qty: 10 }, { sku: 'INV', qty: 1 }]);
    const c = draftQuoteContent({ ...base, priced: p });
    expect(totalsOf(c).gross).toBe(p.totals.gross);
    expect(totalsOf(c).net).toBe(p.totals.net);
    const items = c.blocks.find((b) => b.type === 'items');
    expect(items?.type === 'items' && items.lines.map((l) => l.description)).toEqual(['Acme PANEL', 'Acme INV', 'Installation labour']);
  });
  it('keeps the fixed legal terms exactly as they are', () => {
    expect(draftQuoteContent({ ...base, priced: priced([{ sku: 'PANEL', qty: 1 }]) }).terms).toBe(DEFAULT_TERMS);
  });
  it('says indicative until a survey is linked, then drops it', () => {
    const p = priced([{ sku: 'PANEL', qty: 1 }]);
    expect(draftQuoteContent({ ...base, priced: p }).blocks[0]).toMatchObject({ type: 'text', heading: INDICATIVE_QUOTE });
    expect(draftQuoteContent({ ...base, priced: p, surveyLinked: true }).blocks.some((b) => b.type === 'text' && b.heading === INDICATIVE_QUOTE)).toBe(false);
  });
  it('states the non-MCS facts for off-grid, and not for grid-tied', () => {
    const p = priced([{ sku: 'PANEL', qty: 1 }]);
    const off = draftQuoteContent({ ...base, priced: p }).blocks.find((b) => b.type === 'text' && b.heading === 'Off-grid installation');
    expect(off?.type === 'text' && off.body).toBe(OFF_GRID_BODY);
    expect(OFF_GRID_BODY).toMatch(/no MCS certificate and no Insurance-Backed Guarantee/);
    expect(draftQuoteContent({ ...base, systemType: 'grid-tied', priced: p }).blocks.some((b) => b.type === 'text' && b.heading === 'Off-grid installation')).toBe(false);
  });
  it('keeps a PRICE REQUIRED line and says the quote must not be sent', () => {
    const p = priced([{ sku: 'PANEL', qty: 1 }, { sku: 'NOPRICE', qty: 1 }]);
    const c = draftQuoteContent({ ...base, priced: p });
    const lines = c.blocks.flatMap((b) => (b.type === 'items' ? b.lines : []));
    expect(lines.some((l) => /^PRICE REQUIRED/.test(l.description))).toBe(true);
    const inc = c.blocks.find((b) => b.type === 'text' && b.heading === 'What is included');
    expect(inc?.type === 'text' && inc.body).toMatch(/must not be sent/);
  });
  it('puts every design warning and problem in the quote, but not the notes', () => {
    const c = draftQuoteContent({ ...base, priced: priced([{ sku: 'PANEL', qty: 1 }]), designIssues: [{ severity: 'warn', message: 'DC/AC ratio is low.' }, { severity: 'error', message: 'No string plan.' }, { severity: 'info', message: 'Parallel strings.' }] });
    const d = c.blocks.find((b) => b.type === 'text' && b.heading === 'System design (indicative)');
    expect(d?.type === 'text' && d.body).toMatch(/DC\/AC ratio is low\./);
    expect(d?.type === 'text' && d.body).toMatch(/No string plan\./);
    expect(d?.type === 'text' && d.body).not.toMatch(/Parallel strings/);
  });
  it('is never sent: it is made as plain content with no status or send fields', () => {
    const c = draftQuoteContent({ ...base, priced: priced([{ sku: 'PANEL', qty: 1 }]) });
    expect(JSON.stringify(c)).not.toMatch(/"status"|sent_at/);
  });
  it('refuses a VAT rate the quote builder would silently zero', () => {
    const s = { ...SETTINGS, vat: { domestic: { default: 17.5 }, commercial: { default: 20 } } };
    const p = priceJob({ items: [{ sku: 'NOPRICE', qty: 1 }], installDays: 1, customerType: 'domestic' }, BOOK, s);
    expect(unsupportedVat(p)).toEqual([17.5]);
    expect(unsupportedVat(priced([{ sku: 'PANEL', qty: 1 }]))).toEqual([]);
  });
  it('titles the quote with the customer and the system', () => {
    expect(quoteTitle({ systemType: 'off-grid', kwp: 4 }, 'Henry Price')).toBe('Henry Price: 4 kWp off-grid solar PV and battery system');
  });
});

describe('quote and design tools: drafts only, never sent', () => {
  const root = path.resolve(__dirname, '../..');
  const src = readFileSync(path.join(root, 'src/lib/assistant/quote-tools.ts'), 'utf8');
  it('never import or call a sender, and never set a quote to sent', () => {
    expect(src).not.toMatch(/resend|ms365|sendMail|whatsapp\/send|send-quote|send-document|sendQuoteForSigning|sendManual|sendSms/);
    expect(src).not.toMatch(/status:\s*'(sent|accepted)'/);
    expect(src).not.toMatch(/sent_at/);
  });
  it('write only to the quote, document and settings tables Metis is allowed to', () => {
    const writes = [...src.matchAll(/\.from\('([a-z_]+)'\)\s*\.(insert|update|upsert|delete)\(/g)].map((m) => `${m[1]}.${m[2]}`);
    expect(new Set(writes)).toEqual(new Set(['crm_quotes.insert', 'crm_quotes.update', 'pv_settings.upsert']));
    expect(src).not.toMatch(/\.delete\(/);
  });
  it('saving a kit is admin only', () => {
    const kit = src.slice(src.indexOf("case 'save_accessory_kit'"));
    expect(kit).toMatch(/prof\?\.role !== 'admin'/);
  });
  it('the send route refuses a quote with a PRICE REQUIRED line', () => {
    const send = readFileSync(path.join(root, 'src/app/api/crm/quotes/[id]/send/route.ts'), 'utf8');
    expect(send).toMatch(/PRICE REQUIRED/);
    expect(send.indexOf('PRICE REQUIRED')).toBeLessThan(send.indexOf('renderQuote(q)'));
  });
  it('the desktop file route needs a desktop sign-in', () => {
    const route = readFileSync(path.join(root, 'src/app/api/desktop/documents/[id]/route.ts'), 'utf8');
    expect(route).toMatch(/desktopSession\(req\)/);
    expect(route.indexOf('desktopSession')).toBeLessThan(route.indexOf('download('));
  });
});
