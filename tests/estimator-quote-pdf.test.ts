import { writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { cleanSettings, DEFAULT_SETTINGS, type Inputs } from '@/lib/estimator/calc';
import { buildQuoteFacts } from '@/lib/estimator/quote-facts';
import { quoteEmail } from '@/lib/estimator/quote-email';
import { makeEstimatePdf } from '@/lib/estimator/quote-pdf';
import { validUnsubscribe, unsubscribeToken } from '@/lib/estimator/unsubscribe';

const inputs: Inputs = { who: 'home', yieldKwhPerKwp: 950, shade: 'none', usage: { kind: 'kwh', value: 4200 }, daytime: 'some', battery: true, batteryKwh: 5, ev: false, heatpump: false };
const args = { reference: 'HX-EST-ABC234', customerName: 'Sam Example', address: '1 Test Street, Newport', postcode: 'NP20 1AA', inputs, now: new Date('2026-11-21T10:00:00Z') };

describe('the PDF quote’s figures', () => {
  it('groups the lines so they add up exactly to the headline mid price when prices are shown', () => {
    const settings = { ...DEFAULT_SETTINGS, pdfShowLinePrices: true };
    const f = buildQuoteFacts({ ...args, settings });
    expect(f.lines).not.toBeNull();
    expect(f.lines!.reduce((a, b) => a + b.price, 0)).toBe(f.lineTotal);
    // The mid price sits inside the range shown.
    expect(f.lineTotal!).toBeGreaterThan(f.priceLow);
    expect(f.lineTotal!).toBeLessThan(f.priceHigh);
  });
  it('shows ticks only by default: no grouped prices', () => {
    const f = buildQuoteFacts({ ...args, settings: DEFAULT_SETTINGS });
    expect(f.lines).toBeNull();
    expect(f.included.length).toBeGreaterThan(5);
  });
  it('never carries a cost: the facts hold only what a customer sees', () => {
    const f = buildQuoteFacts({ ...args, settings: { ...DEFAULT_SETTINGS, pdfShowLinePrices: true } });
    const json = JSON.stringify(f);
    expect(json).not.toMatch(/markup|"cost"|labourPerDay|ancillar/i);
    // No fitted line equals one of our raw costs (the placeholder inverter and battery).
    expect((f.lines ?? []).map((l) => l.price)).not.toContain(900);
  });
  it('rounds the range to £50 and labels it with the VAT position', () => {
    const f = buildQuoteFacts({ ...args, settings: DEFAULT_SETTINGS });
    expect(f.priceLow % 50).toBe(0);
    expect(f.priceHigh % 50).toBe(0);
    expect(f.vatLabel).toBe('fitted, 0% VAT');
    expect(buildQuoteFacts({ ...args, inputs: { ...inputs, who: 'business', daytime: 'office', battery: false }, settings: DEFAULT_SETTINGS }).vatLabel).toBe('fitted, plus VAT');
  });
  it('is valid for 30 days', () => {
    const f = buildQuoteFacts({ ...args, settings: DEFAULT_SETTINGS });
    expect(f.issued).toBe('2026-11-21');
    expect(f.validUntil).toBe('2026-12-21');
  });
  it('leaves the award out unless it is on, and names no warranty term unless one is set', () => {
    expect(buildQuoteFacts({ ...args, settings: DEFAULT_SETTINGS }).award).toBeNull();
    const on = cleanSettings({ award: { on: true, title: 'T', wording: 'W' }, workmanshipYears: 10 });
    const f = buildQuoteFacts({ ...args, settings: on });
    expect(f.award?.wording).toBe('W');
    expect(f.included).toContain('10-year workmanship warranty');
    expect(buildQuoteFacts({ ...args, settings: DEFAULT_SETTINGS }).included.some((x) => /-year/.test(x))).toBe(false);
  });
});

describe('the PDF and the email', () => {
  it('makes a real A4 PDF of several pages, with the small print on its own page', async () => {
    const f = buildQuoteFacts({ ...args, settings: { ...DEFAULT_SETTINGS, pdfShowLinePrices: true } });
    const bytes = await makeEstimatePdf(f);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
    if (process.env.EST_PDF_OUT) writeFileSync(process.env.EST_PDF_OUT, bytes);
  });
  it('the email has the reference in the subject, the headline figures, the survey link and an unsubscribe link', () => {
    const f = buildQuoteFacts({ ...args, settings: DEFAULT_SETTINGS });
    const m = quoteEmail(f, { unsubscribeUrl: 'https://heliaxis.co.uk/api/estimator/unsubscribe?r=X&t=Y', name: 'Sam Example' });
    expect(m.subject).toBe('Your Heliaxis solar estimate — HX-EST-ABC234');
    expect(m.html).toContain('book-a-survey');
    expect(m.html).toContain('ref=HX-EST-ABC234');
    expect(m.html).toContain('Unsubscribe');
    expect(m.text).toContain('Unsubscribe from follow-ups');
    expect(m.html).not.toMatch(/markup/i);
  });
  it('unsubscribe links are signed per reference', () => {
    const t = unsubscribeToken('HX-EST-ABC234');
    expect(validUnsubscribe('HX-EST-ABC234', t)).toBe(true);
    expect(validUnsubscribe('HX-EST-ABC235', t)).toBe(false);
    expect(validUnsubscribe('HX-EST-ABC234', 'nope')).toBe(false);
  });
});
