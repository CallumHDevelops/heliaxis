import { Lexer, type Token, type Tokens } from 'marked';

/**
 * An article's words without the Markdown: for the search index (src/lib/help/search.ts) and the passages
 * Metis is given (src/lib/help/server.ts). Server and scripts only (it brings in the Markdown lexer).
 */

export type HelpChunk = { heading: string | null; depth: number; text: string };

const lex = (md: string) => Lexer.lex(md, { gfm: true });

function inline(tokens: Token[] | undefined, links: boolean): string {
  let out = '';
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'image':
        break;
      case 'br':
        out += ' ';
        break;
      case 'link': {
        const l = t as Tokens.Link;
        const text = inline(l.tokens, links);
        // Metis is given the links to other pages (so it can point to them); the index isn't.
        out += links && /^\/admin\//.test(l.href) ? `${text} (${l.href})` : text;
        break;
      }
      case 'strong':
      case 'em':
      case 'del':
        out += inline((t as Tokens.Strong).tokens, links);
        break;
      case 'html':
        out += (t as Tokens.HTML).text.replace(/<[^>]*>/g, '');
        break;
      default:
        out += 'tokens' in t && Array.isArray(t.tokens) ? inline(t.tokens, links) : 'text' in t ? String(t.text) : '';
    }
  }
  return out;
}

function block(t: Token, links: boolean): string {
  switch (t.type) {
    case 'space':
    case 'hr':
    case 'def':
      return '';
    case 'code':
      return (t as Tokens.Code).text;
    case 'list':
      return (t as Tokens.List).items.map((item, i) => `${(t as Tokens.List).ordered ? `${i + 1}.` : '-'} ${item.tokens.map((x) => block(x, links)).filter(Boolean).join(' ')}`).join('\n');
    case 'blockquote':
      return (t as Tokens.Blockquote).tokens.map((x) => block(x, links)).filter(Boolean).join('\n');
    case 'table': {
      const tb = t as Tokens.Table;
      const row = (cells: Tokens.TableCell[]) => cells.map((c) => inline(c.tokens, links).trim()).join(' | ');
      return [row(tb.header), ...tb.rows.map(row)].join('\n');
    }
    case 'html':
      return (t as Tokens.HTML).text.replace(/<[^>]*>/g, '').trim();
    default:
      return 'tokens' in t && Array.isArray(t.tokens) ? inline(t.tokens, links) : 'text' in t ? String(t.text) : '';
  }
}

/** The article in parts: what comes before the first heading, then each ## or ### part. */
export function articleChunks(md: string, { links = false }: { links?: boolean } = {}): HelpChunk[] {
  const chunks: HelpChunk[] = [{ heading: null, depth: 0, text: '' }];
  for (const t of lex(md)) {
    if (t.type === 'heading' && (t as Tokens.Heading).depth <= 3) {
      chunks.push({ heading: inline((t as Tokens.Heading).tokens, false).trim(), depth: (t as Tokens.Heading).depth, text: '' });
      continue;
    }
    const text = block(t, links).trim();
    if (!text) continue;
    const c = chunks[chunks.length - 1];
    c.text += (c.text ? '\n' : '') + text;
  }
  return chunks.filter((c) => c.heading || c.text);
}

/** The ## and ### headings, as text. */
export const headingsOf = (md: string) => articleChunks(md).filter((c) => c.heading).map((c) => ({ depth: c.depth, text: c.heading as string }));

/** The whole article as plain text. */
export const plainText = (md: string) =>
  articleChunks(md)
    .map((c) => [c.heading, c.text].filter(Boolean).join('\n'))
    .join('\n');
