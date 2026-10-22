import 'server-only';
import path from 'node:path';
import { loadHelp } from './load';
import { buildHelpIndex, prepareIndex, searchLibrary } from './library';
import type { HelpLibrary } from './parse';
import type { HelpIndexEntry, PreparedEntry } from './search';

/**
 * The Help content (src/content/help), read once per server in production and on every request in
 * development (so an edited article shows on reload). next.config.ts bundles the files with the pages
 * under /admin/help and with /api/assistant (Metis's search_help tool).
 */

const ROOT = path.join(process.cwd(), 'src', 'content', 'help');

type Loaded = { lib: HelpLibrary; index: HelpIndexEntry[]; prepared: PreparedEntry[] };
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
  loaded = { lib, index, prepared: prepareIndex(index) };
  return loaded;
}

export const getHelp = () => load().lib;
export const getHelpIndex = () => load().index;

/** For Metis: the best 3 articles for a question, with their links and the passages that answer it. */
export function searchHelp(q: string, n = 3) {
  const { lib, prepared } = load();
  return searchLibrary(lib, prepared, q, n);
}
