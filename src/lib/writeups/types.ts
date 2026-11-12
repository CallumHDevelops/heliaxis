/**
 * Documents built in the app (CRM › Documents): a tender, a letter, a report. A document is a list of blocks: a section heading, a sub-title,
 * text, a picture with text beside it (left or right) or on its own, a table you fill in, a table from one of the customer's quotes, or a
 * page break. Pure: the editor, the PDF and the Word file all read the same blocks.
 */

export type TextBlock = { id: string; type: 'text'; body: string };
export type SectionBlock = { id: string; type: 'section'; text: string };
export type TitleBlock = { id: string; type: 'title'; text: string };
export type ImageBlock = { id: string; type: 'image'; side: 'left' | 'right' | 'full'; path: string; caption: string; body: string };
export type TableBlock = { id: string; type: 'table'; caption: string; headers: string[]; rows: string[][] };
export type QuoteBlock = { id: string; type: 'quote'; quote_id: string; caption: string };
/** A video the reader scans a QR code to watch. `path` is the file in storage, `caption` the sub-title printed beside the code. */
export type VideoBlock = { id: string; type: 'video'; side: 'left' | 'right' | 'full'; path: string; name: string; caption: string; /** The picture shown for the video (a frame taken when it was uploaded, or one chosen); a picture path like an image block's. */ thumb: string };
/** Signature lines to sign by hand on the printed page: each label (Signature, Date, Name…) sits under its own ruled line. */
export type SignatureBlock = { id: string; type: 'signature'; lines: string[]; /** What is typed on each line (a name, a date), printed above it; same order as `lines`, empty to sign by hand. */ values?: string[]; /** The person's signature picture (a PNG in storage), printed above the first line. Empty: left to sign by hand. */ path: string };
export type BreakBlock = { id: string; type: 'break' };
export type Block = TextBlock | SectionBlock | TitleBlock | ImageBlock | TableBlock | QuoteBlock | VideoBlock | SignatureBlock | BreakBlock;
export type BlockType = Block['type'];

export type WriteupContent = { blocks: Block[]; /** Words under the title on the first page ("Tender for …"). */ subtitle: string; /** The date printed in the header, YYYY-MM-DD. Empty or missing: the day the document is made or opened. */ date?: string };

export const BLOCK_LABEL: Record<BlockType, string> = {
  section: 'Section',
  title: 'Title',
  text: 'Text',
  image: 'Picture',
  table: 'Table',
  quote: 'Quote table',
  video: 'Video with QR code',
  signature: 'Signature',
  break: 'Page break',
};

export const LIMITS = { text: 20_000, heading: 200, caption: 300, cell: 400, rows: 60, cols: 6, blocks: 200 } as const;

export const newId = () => Math.random().toString(36).slice(2, 10);

const s = (v: unknown, max: number) => String(v ?? '').replace(/\r/g, '').slice(0, max);
const uuid = (v: unknown) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? '')) ? String(v) : '');

/** A new block of a kind, with sensible starting words. */
export function newBlock(type: BlockType, side?: 'left' | 'right' | 'full'): Block {
  const id = newId();
  switch (type) {
    case 'section':
      return { id, type, text: '' };
    case 'title':
      return { id, type, text: '' };
    case 'text':
      return { id, type, body: '' };
    case 'image':
      return { id, type, side: side ?? 'right', path: '', caption: '', body: '' };
    case 'table':
      return { id, type, caption: '', headers: ['Item', 'Detail'], rows: [['', '']] };
    case 'quote':
      return { id, type, quote_id: '', caption: '' };
    case 'video':
      return { id, type, side: side ?? 'right', path: '', name: '', caption: '', thumb: '' };
    case 'signature':
      return { id, type, lines: ['Signature', 'Date'], path: '' };
    default:
      return { id, type: 'break' };
  }
}

/** Whatever was saved, made safe: unknown blocks dropped, text trimmed to its limit, tables kept rectangular. */
export function cleanContent(v: unknown): WriteupContent {
  const raw = (v && typeof v === 'object' ? v : {}) as { blocks?: unknown; subtitle?: unknown };
  const blocks: Block[] = [];
  for (const b of Array.isArray(raw.blocks) ? raw.blocks.slice(0, LIMITS.blocks) : []) {
    if (!b || typeof b !== 'object') continue;
    const r = b as Record<string, unknown>;
    const id = s(r.id, 16).replace(/[^\w-]/g, '') || newId();
    switch (r.type) {
      case 'section':
      case 'title':
        blocks.push({ id, type: r.type, text: s(r.text, LIMITS.heading).replace(/\n/g, ' ') });
        break;
      case 'text':
        blocks.push({ id, type: 'text', body: s(r.body, LIMITS.text) });
        break;
      case 'image': {
        const side = r.side === 'left' || r.side === 'full' ? r.side : 'right';
        blocks.push({ id, type: 'image', side, path: s(r.path, 300).replace(/[^\w./-]/g, ''), caption: s(r.caption, LIMITS.caption), body: s(r.body, LIMITS.text) });
        break;
      }
      case 'table': {
        const headers = (Array.isArray(r.headers) ? r.headers : []).slice(0, LIMITS.cols).map((h) => s(h, LIMITS.cell));
        const cols = Math.max(1, headers.length);
        while (headers.length < cols) headers.push('');
        const rows = (Array.isArray(r.rows) ? r.rows : []).slice(0, LIMITS.rows).map((row) => {
          const cells = (Array.isArray(row) ? row : []).slice(0, cols).map((c) => s(c, LIMITS.cell));
          while (cells.length < cols) cells.push('');
          return cells;
        });
        blocks.push({ id, type: 'table', caption: s(r.caption, LIMITS.caption), headers, rows });
        break;
      }
      case 'quote':
        blocks.push({ id, type: 'quote', quote_id: uuid(r.quote_id), caption: s(r.caption, LIMITS.caption) });
        break;
      case 'video':
        blocks.push({ id, type: 'video', side: r.side === 'left' || r.side === 'full' ? r.side : 'right', thumb: s(r.thumb, 300).replace(/[^\w./-]/g, ''), path: s(r.path, 300).replace(/[^\w./-]/g, ''), name: s(r.name, 120).replace(/\n/g, ' '), caption: s(r.caption, LIMITS.caption) });
        break;
      case 'signature': {
        const lines = (Array.isArray(r.lines) ? r.lines : []).slice(0, 8).map((l) => s(l, 60).replace(/\n/g, ' '));
        const vals = (Array.isArray(r.values) ? r.values : []).slice(0, lines.length).map((v) => s(v, 80).replace(/\n/g, ' '));
        blocks.push({ id, type: 'signature', lines: lines.length ? lines : ['Signature'], ...(vals.some((v) => v.trim()) ? { values: lines.map((_, i) => vals[i] ?? '') } : {}), path: s(r.path, 300).replace(/[^\w./-]/g, '') });
        break;
      }
      case 'break':
        blocks.push({ id, type: 'break' });
        break;
    }
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String((raw as { date?: unknown }).date ?? '')) ? String((raw as { date?: unknown }).date) : '';
  return { blocks, subtitle: s(raw.subtitle, LIMITS.heading).replace(/\n/g, ' '), ...(date ? { date } : {}) };
}

/* ── Text: a little formatting, written plainly ─────────────────────────────────────────────── */

/** A run of words: bold and/or italic. */
export type Run = { text: string; bold?: boolean; italic?: boolean };
/** A paragraph of runs, or a bullet (`- item`) or numbered (`1. item`) line. */
export type Para = { kind: 'p' | 'bullet' | 'number'; n?: number; runs: Run[] };

/** "**bold**" and "*italic*" into runs. Unmatched markers are left as typed. */
export function runsOf(line: string): Run[] {
  const out: Run[] = [];
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: line.slice(last, i) });
    const t = m[0];
    if (t.startsWith('**')) out.push({ text: t.slice(2, -2), bold: true });
    else out.push({ text: t.slice(1, -1), italic: true });
    last = i + t.length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out.length ? out : [{ text: '' }];
}

/** Blank lines separate paragraphs; "- " starts a bullet and "1. " a numbered point. */
export function parasOf(body: string): Para[] {
  const out: Para[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) out.push({ kind: 'p', runs: runsOf(buf.join(' ')) });
    buf = [];
  };
  for (const raw of String(body ?? '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
    const num = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      out.push({ kind: 'bullet', runs: runsOf(bullet[1]) });
    } else if (num) {
      flush();
      out.push({ kind: 'number', n: Number(num[1]), runs: runsOf(num[2]) });
    } else buf.push(line.trim());
  }
  flush();
  return out;
}

export const plainOf = (runs: Run[]) => runs.map((r) => r.text).join('');
