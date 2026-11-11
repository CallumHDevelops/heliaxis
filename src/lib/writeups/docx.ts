import 'server-only';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  PageBreak,
  type FileChild,
} from 'docx';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import { watchUrl } from './video';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { longDate } from '@/lib/documents/pdf-kit';
import { parasOf, type Block, type Para } from './types';
import type { WriteupFacts } from './pdf';

/** A document as a Word file (.docx): headings, text with bold and italic, pictures beside text, tables and quote tables. Opens and edits in Word. */

const FONT = 'Arial';
const INK = '211F18';
const GOLD = 'F8BC1E';
const PAPER = 'EFE8D8';
const LINE = 'D9D4CA';
const PAGE_W = 9360; // text width in twips for A4 with 2 cm side margins
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const hair = { style: BorderStyle.SINGLE, size: 4, color: LINE } as const;

async function sizeOf(file: { bytes: Uint8Array; mime: string }): Promise<{ w: number; h: number } | null> {
  try {
    const d = await PDFDocument.create();
    const im = file.mime === 'image/png' ? await d.embedPng(file.bytes) : await d.embedJpg(file.bytes);
    return { w: im.width, h: im.height };
  } catch {
    return null;
  }
}

function runs(p: Para, size = 21): TextRun[] {
  return p.runs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, font: FONT, size, color: INK }));
}

function paragraphs(body: string): Paragraph[] {
  return parasOf(body).map((p) =>
    p.kind === 'bullet'
      ? new Paragraph({ children: runs(p), bullet: { level: 0 }, spacing: { after: 80 } })
      : p.kind === 'number'
        ? new Paragraph({ children: [new TextRun({ text: `${p.n}.\t`, bold: true, font: FONT, size: 21 }), ...runs(p)], indent: { left: 360, hanging: 360 }, spacing: { after: 80 } })
        : new Paragraph({ children: runs(p), spacing: { after: 140, line: 300 } })
  );
}

function cell(text: string, o: { width: number; header?: boolean; right?: boolean; bold?: boolean; span?: number }): TableCell {
  return new TableCell({
    columnSpan: o.span,
    width: { size: o.width, type: WidthType.DXA },
    shading: o.header ? { type: ShadingType.CLEAR, fill: PAPER, color: 'auto' } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    borders: { top: hair, bottom: hair, left: hair, right: hair },
    children: String(text)
      .split('\n')
      .map((line, i) => new Paragraph({ alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: line, bold: o.header || o.bold || undefined, size: i ? 18 : 20, font: FONT, color: i ? '6E6A5E' : INK })] })),
  });
}

function grid(headers: string[], rows: string[][], widths?: number[], rightFrom = Infinity): Table {
  const n = headers.length;
  const share = widths ?? headers.map(() => 1);
  const total = share.reduce((a, b) => a + b, 0);
  const ws = share.map((s) => Math.round((s / total) * PAGE_W));
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: ws,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { width: ws[i], header: true, right: i >= rightFrom })) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: Array.from({ length: n }, (_, i) => cell(r[i] ?? '', { width: ws[i], right: i >= rightFrom })) })),
    ],
  });
}

const gap = () => new Paragraph({ spacing: { after: 120 }, children: [] });

export async function writeupDocx(f: WriteupFacts): Promise<Uint8Array> {
  const body: FileChild[] = [];
  body.push(new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [new TextRun({ text: f.title || 'Document', bold: true, font: FONT, size: 44, color: INK })] }));
  if (f.content.subtitle.trim()) body.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: f.content.subtitle.trim(), font: FONT, size: 26, color: '6E6A5E' })] }));
  const meta: [string, string][] = [];
  if (f.who.name) meta.push(['Prepared for', f.who.name]);
  if (f.who.address) meta.push(['Address', f.who.address]);
  meta.push(['Reference', f.number], ['Date', longDate(f.issued)]);
  for (const [k, v] of meta) body.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${k}: `, bold: true, font: FONT, size: 20 }), new TextRun({ text: v, font: FONT, size: 20 })] }));
  body.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 6 } }, spacing: { after: 240 }, children: [] }));

  for (const b of f.content.blocks as Block[]) {
    switch (b.type) {
      case 'section':
        if (b.text.trim()) body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 140 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: INK, space: 4 } }, children: [new TextRun({ text: b.text.trim(), bold: true, font: FONT, size: 32, color: INK })] }));
        break;
      case 'title':
        if (b.text.trim()) body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 }, children: [new TextRun({ text: b.text.trim(), bold: true, font: FONT, size: 26, color: INK })] }));
        break;
      case 'text':
        body.push(...paragraphs(b.body));
        break;
      case 'image': {
        const file = b.path ? f.images.get(b.path) : null;
        const dim = file ? await sizeOf(file) : null;
        if (!file || !dim) {
          body.push(...paragraphs(b.body));
          break;
        }
        const full = b.side === 'full';
        const maxW = full ? 520 : 230;
        const w = Math.min(maxW, dim.w);
        const h = Math.round((dim.h / dim.w) * w);
        const pic = new Paragraph({ children: [new ImageRun({ type: file.mime === 'image/png' ? 'png' : 'jpg', data: file.bytes, transformation: { width: w, height: h } })] });
        const cap = b.caption.trim() ? [new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: b.caption.trim(), italics: true, font: FONT, size: 16, color: '6E6A5E' })] })] : [];
        if (full) {
          body.push(pic, ...cap, ...paragraphs(b.body), gap());
          break;
        }
        const picCell = new TableCell({ width: { size: 3600, type: WidthType.DXA }, borders: { top: none, bottom: none, left: none, right: none }, margins: { right: 160, left: 160 }, children: [pic, ...cap] });
        const textCell = new TableCell({ width: { size: PAGE_W - 3600, type: WidthType.DXA }, borders: { top: none, bottom: none, left: none, right: none }, margins: { right: 160, left: 160 }, children: paragraphs(b.body).length ? paragraphs(b.body) : [new Paragraph({ children: [] })] });
        body.push(
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: b.side === 'left' ? [3600, PAGE_W - 3600] : [PAGE_W - 3600, 3600],
            borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
            rows: [new TableRow({ cantSplit: true, children: b.side === 'left' ? [picCell, textCell] : [textCell, picCell] })],
          }),
          gap()
        );
        break;
      }
      case 'table': {
        if (b.caption.trim()) body.push(new Paragraph({ spacing: { before: 120, after: 80 }, children: [new TextRun({ text: b.caption.trim(), bold: true, font: FONT, size: 21 })] }));
        const idx = b.headers.map((h, i) => (h.trim() || b.rows.some((r) => (r[i] ?? '').trim()) ? i : -1)).filter((i) => i >= 0);
        if (idx.length) body.push(grid(idx.map((i) => b.headers[i]), b.rows.map((r) => idx.map((i) => r[i] ?? ''))), gap());
        break;
      }
      case 'quote': {
        const q = f.quotes.get(b.quote_id);
        if (!q) break;
        body.push(new Paragraph({ spacing: { before: 120, after: 80 }, children: [new TextRun({ text: b.caption.trim() || `Quote ${q.number}: ${q.title}`, bold: true, font: FONT, size: 21 })] }));
        const widths = [6, 1, 1.6, 1.8];
        const total = widths.reduce((a, c) => a + c, 0);
        const ws = widths.map((s) => Math.round((s / total) * PAGE_W));
        body.push(
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: ws,
            rows: [
              new TableRow({ tableHeader: true, children: q.headers.map((h, i) => cell(h, { width: ws[i], header: true, right: i > 0 })) }),
              ...q.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, { width: ws[i], right: i > 0 })) })),
              ...q.totals.map(
                ([label, value], i) =>
                  new TableRow({
                    children: [cell(label, { width: ws[0] + ws[1] + ws[2], span: 3, bold: i === q.totals.length - 1, right: true }), cell(value, { width: ws[3], bold: i === q.totals.length - 1, right: true })],
                  })
              ),
            ],
          }),
          gap()
        );
        break;
      }
      case 'video': {
        if (!f.id || !b.path) break;
        const url = watchUrl(f.id, b.id);
        const png = await QRCode.toBuffer(url, { errorCorrectionLevel: 'M', margin: 2, width: 300 });
        body.push(
          new Paragraph({ spacing: { before: 120 }, children: [new ImageRun({ type: 'png', data: png, transformation: { width: 110, height: 110 } })] }),
          new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: 'Watch the video', bold: true, font: FONT, size: 24 })] }),
          ...(b.caption.trim() ? [new Paragraph({ children: [new TextRun({ text: b.caption.trim(), font: FONT, size: 20 })] })] : []),
          new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: 'Point your phone camera at the code, or open ', font: FONT, size: 16, color: '6E6A5E' }), new TextRun({ text: url, font: FONT, size: 16, color: '6E6A5E' })] }),
        );
        break;
      }
      case 'break':
        body.push(new Paragraph({ children: [new PageBreak()] }));
        break;
    }
  }

  const doc = new Document({
    creator: HELIAXIS_COMPANY.tradingName,
    title: f.title,
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1200, left: 1273, right: 1273 } } },
        headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: `${HELIAXIS_COMPANY.tradingName} · ${f.number}`, font: FONT, size: 16, color: '6E6A5E' })] })] }) },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `${HELIAXIS_COMPANY.tradingName} · ${HELIAXIS_COMPANY.phone} · ${HELIAXIS_COMPANY.email}    Page `, font: FONT, size: 16, color: '6E6A5E' }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '6E6A5E' }),
                  new TextRun({ text: ' of ', font: FONT, size: 16, color: '6E6A5E' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: '6E6A5E' }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
