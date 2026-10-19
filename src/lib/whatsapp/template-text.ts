import 'server-only';
import { fetchTemplates } from './templates';
import { fillTemplate, parseTemplateNote } from './template-fill';
import type { WaTemplate } from './templates-shared';

// Every send looks a template up, and smart replies and chasers send them too: ask Meta at most
// every 5 minutes. A failed look-up isn't kept, so the next send tries again.
const TTL_MS = 5 * 60_000;
let cache: { at: number; items: WaTemplate[] } | null = null;
// One look-up at a time: a chat with several old template lines asks once, not once per line.
let pending: Promise<WaTemplate[]> | null = null;

function templates(): Promise<WaTemplate[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.items);
  pending ??= fetchTemplates()
    .then((r) => {
      if (!r.ok) return cache?.items ?? [];
      cache = { at: Date.now(), items: r.items };
      return r.items;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** The template's wording as the customer saw it, or null if Meta doesn't list it (any more). */
export async function templateText(name: string, lang: string | null, params: string[]): Promise<string | null> {
  const all = (await templates().catch(() => [])).filter((t) => t.name === name);
  const t = all.find((x) => x.language === lang) ?? all.find((x) => x.status === 'APPROVED') ?? all[0];
  return t ? fillTemplate(t, params) : null;
}

/**
 * A chat line saved before the wording was kept ("Template “name” (Nikki, Callum)"), as the
 * customer saw it. Null when it isn't one, the template is gone, or its blanks can't be told apart.
 */
export async function wordingForNote(body: string | null): Promise<string | null> {
  const note = parseTemplateNote(body);
  if (!note) return null;
  const named = (await templates().catch(() => [])).filter((x) => x.name === note.name);
  const t = named.find((x) => x.status === 'APPROVED') ?? named[0];
  if (!t) return null;
  // The note joined the blanks with ", ": only safe to split back when that gives the right count.
  const params = t.params <= 1 ? (note.raw ? [note.raw] : []) : note.raw.split(', ');
  if (params.length !== t.params) return null;
  return fillTemplate(t, params);
}
