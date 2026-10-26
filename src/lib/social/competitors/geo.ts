/**
 * AI-answer tracking (docs/social-monitoring/09 §6). Each local question is asked several times; the answer is
 * searched for the businesses we track, and a business's share is the fraction of answers that name it.
 * Pure parts here; the model call and saving are in geo-run.ts.
 */

export type Named = { id: string; name: string; website: string | null };

const clean = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const domainOf = (url: string | null) => {
  if (!url) return '';
  try {
    const h = new URL(/^https?:/.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
    return h.includes('.') ? h : '';
  } catch {
    return '';
  }
};

/** Which tracked businesses an answer names, by name or by a cited website. */
export function mentionedIn(answer: string, citedDomains: string[], businesses: Named[]): string[] {
  const text = ` ${clean(answer)} `;
  const domains = citedDomains.map((d) => d.replace(/^www\./, '').toLowerCase());
  return businesses
    .filter((b) => {
      const name = clean(b.name);
      if (name.length >= 4 && text.includes(` ${name} `)) return true;
      const d = domainOf(b.website);
      return !!d && (domains.includes(d) || text.includes(` ${clean(d)} `));
    })
    .map((b) => b.id);
}

export type Sample = { prompt_id: number; mentioned_ids: string[] };

/** Share of answers naming each business, with how many answers it is based on. */
export function geoShares(samples: Sample[], ids: string[]): { shares: Record<string, number>; answers: number } {
  const answers = samples.length;
  const shares: Record<string, number> = {};
  for (const id of ids) {
    const n = samples.filter((s) => s.mentioned_ids.includes(id)).length;
    shares[id] = answers ? Math.round((n / answers) * 1000) / 10 : 0;
  }
  return { shares, answers };
}

/** The domains an answer cited, from the search results and citations the model returned. */
export function domainsFrom(urls: string[]): string[] {
  return [...new Set(urls.map((u) => domainOf(u)).filter(Boolean))];
}
