import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { cleanContent, newBlock, parasOf, runsOf } from '@/lib/writeups/types';
import { writeupPdf } from '@/lib/writeups/pdf';
import { writeupDocx } from '@/lib/writeups/docx';
import type { WriteupFacts } from '@/lib/writeups/pdf';

const facts = (blocks: unknown[]): WriteupFacts => ({
  number: 'DOC-0001',
  title: 'Tender for Pedal Power',
  issued: '2026-11-10',
  content: cleanContent({ subtitle: 'Solar PV and battery storage', blocks }),
  who: { kind: 'organisation', id: 'x', name: 'Pedal Power', address: 'Fields Park Road, Cardiff, CF11 9LB', ref: null },
  images: new Map(),
  quotes: new Map([['11111111-2222-4333-8444-555555555555', { number: 'Q-0009', title: 'Your quote', headers: ['Item', 'Qty', 'Price', 'Total'], rows: [['Solar panels\n18 x 460 W', '18', '£260.00', '£4,680.00']], totals: [['Total before VAT', '£4,680.00'], ['VAT', '£0.00'], ['Total to pay', '£4,680.00']] }]]),
});

const BLOCKS = [
  { id: 'a', type: 'section', text: 'Our approach' },
  { id: 'b', type: 'text', body: 'We design **every** system for the roof and the *customer*.\n\n- Survey first\n- Fixed price\n\n1. Design\n2. Install' },
  { id: 'c', type: 'title', text: 'Why Heliaxis' },
  { id: 'd', type: 'image', side: 'left', path: '', caption: '', body: 'No picture was uploaded, so this text stands alone.' },
  { id: 'e', type: 'table', caption: 'Timeline', headers: ['Stage', 'When'], rows: [['Survey', 'Week 1'], ['Install', 'Week 4']] },
  { id: 'f', type: 'quote', quote_id: '11111111-2222-4333-8444-555555555555', caption: '' },
  { id: 'g', type: 'break' },
  { id: 'h', type: 'section', text: 'Terms' },
];

describe('documents (tenders)', () => {
  it('cleans what was saved and keeps tables rectangular', () => {
    const c = cleanContent({ blocks: [{ type: 'table', headers: ['A', 'B', 'C'], rows: [['1'], ['1', '2', '3', '4']] }, { type: 'nonsense' }, { type: 'image', side: 'sideways', path: 'a b/../x.png' }] });
    expect(c.blocks).toHaveLength(2);
    const t = c.blocks[0];
    if (t.type !== 'table') throw new Error('table');
    expect(t.rows.every((r) => r.length === 3)).toBe(true);
    const i = c.blocks[1];
    if (i.type !== 'image') throw new Error('image');
    expect(i.side).toBe('right');
  });

  it('reads bold, italic, bullets and numbered points', () => {
    expect(runsOf('a **b** *c*')).toEqual([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', italic: true }]);
    const p = parasOf('Hello\nthere\n\n- one\n- two\n\n1. first');
    expect(p.map((x) => x.kind)).toEqual(['p', 'bullet', 'bullet', 'number']);
    expect(p[0].runs[0].text).toBe('Hello there');
  });

  it('gives each new block a kind', () => {
    expect(newBlock('image', 'left')).toMatchObject({ type: 'image', side: 'left' });
  });

  it('makes a PDF', async () => {
    const bytes = await writeupPdf(facts(BLOCKS));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
  });

  it('makes a Word file', async () => {
    const bytes = await writeupDocx(facts(BLOCKS));
    expect(Buffer.from(bytes.slice(0, 2)).toString()).toBe('PK');
    expect(bytes.length).toBeGreaterThan(3000);
  });
});

import { readFileSync } from 'node:fs';
import { standardSections } from '@/lib/writeups/standard';

describe('the section library', () => {
  it('has the ready-made sections, all valid, using only the site’s own wording and pictures', () => {
    const std = standardSections();
    expect(std.map((s) => s.key)).toEqual(['about', 'accreditations', 'company', 'survey', 'terms', 'outline']);
    for (const s of std) {
      expect(s.blocks.length).toBeGreaterThan(0);
      expect(cleanContent({ blocks: s.blocks }).blocks).toHaveLength(s.blocks.length);
    }
    const paths = std.flatMap((s) => s.blocks.flatMap((b) => (b.type === 'image' ? [b.path] : [])));
    expect(paths).toEqual(['assets/heliaxis-about-callum.jpg', 'assets/heliaxis-accreditations.png']);
    const about = std[0].blocks.find((b) => b.type === 'image');
    expect(about && about.type === 'image' && about.body).toMatch(/family-owned/);
  });

  it('makes a PDF and a Word file out of every standard section together', async () => {
    const blocks = standardSections().flatMap((s) => s.blocks);
    const images = new Map(['assets/heliaxis-about-callum.jpg', 'assets/heliaxis-accreditations.png'].map((p) => [p, { bytes: new Uint8Array(readFileSync(`public/${p}`)), mime: p.endsWith('.png') ? 'image/png' : 'image/jpeg' }]));
    const f = { ...facts([]), content: cleanContent({ subtitle: '', blocks }), images };
    const pdf = await writeupPdf(f);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(20000);
    const docx = await writeupDocx(f);
    expect(Buffer.from(docx.slice(0, 2)).toString()).toBe('PK');
  }, 30000);
});
