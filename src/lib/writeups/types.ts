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
export type BreakBlock = { id: string; type: 'break' };
export type Block = TextBlock | SectionBlock | TitleBlock | ImageBlock | TableBlock | QuoteBlock | BreakBlock;
export type BlockType = Block['type'];

export type WriteupContent = { blocks: Block[]; /** Words under the title on the first page ("Tender for …"). */ subtitle: string };

export const BLOCK_LABEL: Record<BlockType, string> = {
  section: 'Section',
  title: 'Title',
  text: 'Text',
  image: 'Picture',
  table: 'Table',
  quote: 'Quote table',
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
      case 'break':
        blocks.push({ id, type: 'break' });
        break;
    }
  }
  return { blocks, subtitle: s(raw.subtitle, LIMITS.heading).replace(/\n/g, ' ') };
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
