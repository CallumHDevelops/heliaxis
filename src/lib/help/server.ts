import 'server-only';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { loadHelp } from './load';
import { buildHelpIndex, prepareIndex, searchLibrary } from './library';
import type { HelpLibrary } from './parse';
import { searchPrepared, type HelpHit, type PreparedEntry } from './search';

/**
 * The Help content (src/content/help), read once per server in production and on every request in
 * development (so an edited article shows on reload). next.config.ts bundles the files with the pages
 * under /admin/help, the search box's index (/api/help/search-index) and /api/assistant (Metis's
 * search_help tool).
 */

const ROOT = path.join(process.cwd(), 'src', 'content', 'help');

type Loaded = { lib: HelpLibrary; prepared: PreparedEntry[]; json: string; version: string };
let loaded: Loaded | null = null;
let warned = false;

function load(): Loaded {
  if (loaded && process.env.NODE_ENV === 'production') return loaded;
  const lib = loadHelp(ROOT);
  if (lib.problems.length && !warned) {
    warned = true;
    console.warn(`Help content: ${lib.problems.length} problem(s) — run node scripts/test-help.mjs\n  ${lib.problems.slice(0, 10).join('\n  ')}`);
  }
  const index = buildHelpIndex(lib);
  const json = JSON.stringify(index);
  // Changes when the content does: the search box asks for /api/help/search-index?v=<this>, kept for good.
  const version = createHash('sha256').update(json).digest('base64url').slice(0, 16);
  loaded = { lib, prepared: prepareIndex(index), json, version };
  return loaded;
}

export const getHelp = () => load().lib;
/** The search box's index as sent (/api/help/search-index), and its version. */
export function getHelpIndexFile() {
  const { json, version } = load();
  return { json, version };
}

/** A result without the article's words: what a page needs to show it. */
const slim = (h: HelpHit): HelpHit => ({ ...h, entry: { ...h.entry, words: '', headings: [] } });

/**
 * The search box's results for a search in the address (?q=), worked out here so they show before the
 * index has come: every word (up to 30), or when none has them all, the closest 5.
 */
export function searchHelpPage(q: string): { hits: HelpHit[]; close: HelpHit[] } {
  if (!q.trim()) return { hits: [], close: [] };
  const { prepared } = load();
  const hits = searchPrepared(prepared, q, { limit: 30 });
  const close = hits.length ? [] : searchPrepared(prepared, q, { mode: 'any', limit: 5 });
  return { hits: hits.map(slim), close: close.map(slim) };
}

/** For Metis: the best 3 articles for a question, with their links and the passages that answer it. */
export function searchHelp(q: string, n = 3) {
  const { lib, prepared } = load();
  return searchLibrary(lib, prepared, q, n);
}
