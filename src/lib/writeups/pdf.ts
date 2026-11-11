import 'server-only';
import { issueOf } from '@/lib/documents/issue';
import { INK, longDate, MUTED, newDocument, SOLAR, type Kit } from '@/lib/documents/pdf-kit';
import { parasOf, plainOf, type Block, type Para, type Run, type WriteupContent } from './types';
import { drawQr } from '@/lib/quotes/qr';
import type { QuoteTable, WriteupFor } from './server';
import { watchUrl } from './video';

/** A document as a branded PDF (the document kit): the header, who it is for, then each block in order. */
export type WriteupFacts = {
  number: string;
  title: string;
  issued: string; // YYYY-MM-DD
  content: WriteupContent;
  who: WriteupFor;
  images: Map<string, { bytes: Uint8Array; mime: string }>;
  quotes: Map<string, QuoteTable>;
  /** The document's own id: a video element's QR code leads to a page made from it. */
  id?: string;
};

const SIZE = 9.6;
const LEAD = 13;

type Word = { text: string; bold: boolean; italic: boolean; w: number };

/** Runs wrapped to a width: lines of words, each measured in the document's own font. */
function wrapRuns(kit: Kit, runs: Run[], max: number): Word[][] {
  const words: Word[] = [];
  for (const r of runs) {
    for (const t of r.text.split(/(\s+)/)) {
      if (!t) continue;
      if (/^\s+$/.test(t)) {
        words.push({ text: ' ', bold: !!r.bold, italic: !!r.italic, w: kit.widthOf(' ', SIZE, !!r.bold) });
        continue;
      }
      words.push({ text: t, bold: !!r.bold, italic: !!r.italic, w: kit.widthOf(t, SIZE, !!r.bold) });
    }
  }
  const lines: Word[][] = [];
  let cur: Word[] = [];
  let w = 0;
  for (const word of words) {
    const space = word.text === ' ';
    if (!space && w + word.w > max && cur.some((x) => x.text !== ' ')) {
      while (cur.length && cur[cur.length - 1].text === ' ') cur.pop();
      lines.push(cur);
      cur = [];
      w = 0;
    }
    if (space && !cur.length) continue;
    cur.push(word);
    w += word.w;
  }
  while (cur.length && cur[cur.length - 1].text === ' ') cur.pop();
  if (cur.length) lines.push(cur);
  return lines.length ? lines : [[]];
}

type Draw = Parameters<Parameters<Kit['block']>[1]>[0];

function drawLine(d: Draw, line: Word[], x: number, y: number) {
  let cx = x;
  for (const w of line) {
    if (w.text !== ' ') d.text(w.text, cx, y, SIZE, { bold: w.bold, italic: w.italic });
    cx += w.w;
  }
}

/** One paragraph, bullet or numbered point, in pieces that fit the page (a long one runs over). */
function paragraph(kit: Kit, p: Para) {
  const indent = p.kind === 'p' ? 0 : 16;
  const lines = wrapRuns(kit, p.runs, kit.width - indent);
  let i = 0;
  while (i < lines.length) {
    const fit = Math.max(2, Math.floor((kit.room() - 8) / LEAD));
    const chunk = lines.slice(i, i + fit);
    const first = i === 0;
    kit.block(chunk.length * LEAD + (i + chunk.length >= lines.length ? 6 : 0), (d) => {
      chunk.forEach((line, k) => drawLine(d, line, d.x + indent, d.top - 10 - k * LEAD));
      if (first && p.kind === 'bullet') d.rect(d.x + 4, d.top - 9.4, 3, 3, { fill: INK });
      if (first && p.kind === 'number') d.text(`${p.n}.`, d.x, d.top - 10, SIZE, { bold: true });
    });
    i += chunk.length;
  }
}

function textBlock(kit: Kit, body: string) {
  for (const p of parasOf(body)) paragraph(kit, p);
}

function caption(kit: Kit, text: string) {
  if (!text.trim()) return;
  kit.block(14, (d) => d.text(text, d.x, d.top - 9, 8, { color: MUTED }));
}

async function imageBlock(kit: Kit, b: Extract<Block, { type: 'image' }>, f: WriteupFacts) {
  const file = b.path ? f.images.get(b.path) : null;
  const img = file ? await kit.embed(file.bytes) : null;
  if (!img) {
    if (b.body.trim()) textBlock(kit, b.body);
    return;
  }
  const full = b.side === 'full';
  const imgW = full ? Math.min(kit.width, 440) : 190;
  const imgH = Math.min((img.height / img.width) * imgW, full ? 300 : 260);
  const w = Math.min(imgW, (img.width / img.height) * imgH);
  const gap = 16;
  if (full) {
    kit.block(imgH + 8, (d) => d.image(img, d.x, d.top - imgH, w, imgH));
    caption(kit, b.caption);
    if (b.body.trim()) textBlock(kit, b.body);
    return;
  }
  const colW = kit.width - imgW - gap;
  const paras = parasOf(b.body);
  const laid = paras.map((p) => ({ p, lines: wrapRuns(kit, p.runs, colW - (p.kind === 'p' ? 0 : 16)) }));
  const textH = laid.reduce((a, x) => a + x.lines.length * LEAD + 6, 0);
  const capH = b.caption.trim() ? 14 : 0;
  const h = Math.max(imgH + capH, textH) + 6;
  kit.block(h, (d) => {
    const imgX = b.side === 'left' ? d.x : d.x + d.width - imgW;
    const textX = b.side === 'left' ? d.x + imgW + gap : d.x;
    d.image(img, imgX, d.top - imgH, w, imgH);
    if (capH) d.text(b.caption, imgX, d.top - imgH - 10, 8, { color: MUTED });
    let y = d.top - 10;
    for (const { p, lines } of laid) {
      const indent = p.kind === 'p' ? 0 : 16;
      lines.forEach((line, k) => drawLine(d, line, textX + indent, y - k * LEAD));
      if (p.kind === 'bullet') d.rect(textX + 4, y - 0.6, 3, 3, { fill: INK });
      if (p.kind === 'number') d.text(`${p.n}.`, textX, y, SIZE, { bold: true });
      y -= lines.length * LEAD + 6;
    }
  });
}

/** A video: its picture (half the width, left or right, or the full width) with a play mark, and a small QR code to watch it. */
async function videoBlock(kit: Kit, b: Extract<Block, { type: 'video' }>, f: WriteupFacts) {
  if (!f.id || !b.path) return;
  const url = watchUrl(f.id, b.id);
  const file = b.thumb ? f.images.get(b.thumb) : null;
  const img = file ? await kit.embed(file.bytes) : null;
  const cap = b.caption.trim();
  const play = (d: Parameters<Parameters<Kit['block']>[1]>[0], x: number, y: number, w: number, h: number) => {
    const cx = x + w / 2;
    const cy = y + h / 2;
    d.rect(cx - 17, cy - 12, 34, 24, { fill: INK });
    for (let k = 0; k < 12; k++) d.line(cx - 4, cy - 6 + k, cx - 4 + Math.max(1, 11 - Math.abs(k - 5.5) * 2), cy - 6 + k, { color: SOLAR, t: 1.3 });
  };
  const q = 64;
  if (!img || b.side === 'full') {
    const imgW = Math.min(kit.width, 420);
    const imgH = img ? Math.min((img.height / img.width) * imgW, 240) : 0;
    const w = img ? Math.min(imgW, (img.width / img.height) * imgH) : 0;
    if (img) kit.block(imgH + 8, (d) => { d.image(img, d.x, d.top - imgH, w, imgH); play(d, d.x, d.top - imgH, w, imgH); });
    kit.block(q + 12, (d) => {
      drawQr(d, url, d.x, d.top - q - 4, q);
      d.text('Watch the video', d.x + q + 14, d.top - 20, 11.5, { bold: true });
      let y = d.top - 35;
      if (cap) for (const line of d.lines(cap, 10, d.width - q - 14).slice(0, 3)) { d.text(line, d.x + q + 14, y, 10); y -= 13; }
      d.text('Point your phone camera at the code.', d.x + q + 14, y - 3, 8.5, { color: MUTED });
    });
    kit.gap(6);
    return;
  }
  const imgW = 230;
  const gap = 16;
  const imgH = Math.min((img.height / img.width) * imgW, 230);
  const w = Math.min(imgW, (img.width / img.height) * imgH);
  const colW = kit.width - imgW - gap;
  const textH = 22 + (cap ? Math.min(3, Math.ceil(cap.length / Math.max(10, colW / 5))) * 13 : 0) + 18 + q + 8;
  kit.block(Math.max(imgH, textH) + 8, (d) => {
    const imgX = b.side === 'left' ? d.x : d.x + d.width - imgW;
    const textX = b.side === 'left' ? d.x + imgW + gap : d.x;
    d.image(img, imgX, d.top - imgH, w, imgH);
    play(d, imgX, d.top - imgH, w, imgH);
    d.text('Watch the video', textX, d.top - 12, 11.5, { bold: true });
    let y = d.top - 27;
    if (cap) for (const line of d.lines(cap, 10, colW).slice(0, 4)) { d.text(line, textX, y, 10); y -= 13; }
    drawQr(d, url, textX, y - q - 6, q);
    d.text('Point your phone camera at the code.', textX + q + 10, y - q / 2 - 2, 8.5, { color: MUTED });
  });
  kit.gap(6);
}

export async function writeupPdf(f: WriteupFacts): Promise<Uint8Array> {
  const code = 'HX-DOC-01';
  const kit = await newDocument({ code, title: f.title || 'Document', revision: issueOf(code), jobRef: f.who.ref, refLabel: 'Customer', issued: f.issued, accreditations: true });
  kit.header({ meta: [['Document', f.number], ['Date', longDate(f.issued)]] });
  const pairs: [string, string | null][] = [];
  if (f.who.name) pairs.push(['Prepared for', f.who.name]);
  if (f.who.address) pairs.push(['Address', f.who.address]);
  if (pairs.length) kit.idGrid(pairs);
  if (f.content.subtitle.trim()) kit.paragraph(f.content.subtitle.trim(), { bold: true });

  for (const b of f.content.blocks) {
    switch (b.type) {
      case 'section':
        if (b.text.trim()) kit.section(b.text.trim(), { keep: 70 });
        break;
      case 'title':
        if (b.text.trim()) {
          kit.block(24, (d) => {
            d.text(b.text.trim(), d.x, d.top - 14, 11.5, { bold: true });
            d.line(d.x, d.top - 19, d.x + 36, d.top - 19, { color: SOLAR, t: 2 });
          });
        }
        break;
      case 'text':
        textBlock(kit, b.body);
        break;
      case 'image':
        await imageBlock(kit, b, f);
        break;
      case 'table': {
        if (b.caption.trim()) kit.paragraph(b.caption.trim(), { bold: true });
        const used = b.headers.map((h, i) => h.trim() || b.rows.some((r) => (r[i] ?? '').trim()));
        const idx = used.map((u, i) => (u ? i : -1)).filter((i) => i >= 0);
        if (idx.length) kit.grid({ columns: idx.map((i) => b.headers[i] || ' '), rows: b.rows.map((r) => idx.map((i) => (r[i] ?? '').replace(/\n/g, ' · '))) });
        kit.gap(6);
        break;
      }
      case 'quote': {
        const q = f.quotes.get(b.quote_id);
        if (!q) break;
        kit.paragraph(b.caption.trim() || `Quote ${q.number}: ${q.title}`, { bold: true });
        kit.grid({ columns: q.headers, rows: q.rows.map((r) => r.map((c) => c.replace(/\n/g, ' · '))), widths: [6, 1, 1.6, 1.8] });
        kit.rows(q.totals.map(([label, value], i) => ({ label, value, strong: i === q.totals.length - 1 })));
        kit.gap(6);
        break;
      }
      case 'video':
        await videoBlock(kit, b, f);
        break;
      case 'break':
        kit.newPage({ continued: true });
        break;
    }
  }
  void plainOf;
  return kit.save();
}
