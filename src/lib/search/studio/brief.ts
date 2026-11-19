import type { Brief, Intent, LinkSuggestion, OutlineItem, PageType } from './types';
import { normPath } from './text';

/**
 * The brief (spec §5 M4.1), built from stored rows only: the cluster (or one tracked search), the top 10 from the
 * latest SERP, the page facts of those URLs, the teardown when there is one, and our own pages. Pure.
 */

export type BriefTarget = Brief['target'];
export type SerpRow = { pos: number; domain: string | null; url: string | null; title: string | null };
export type FactsRow = { url: string; words: number | null; headings: { level?: number; text?: string }[] | null; questions: unknown[] | null; schema: string[] | null; page_type: string | null; prices_shown: boolean | null };
export type TeardownRow = { date: string; summary: { shared?: unknown[]; gaps?: unknown[]; outline?: unknown[] } | null; facts?: Record<string, unknown> | null } | null;
export type OurPage = { path: string; title: string };

export type BriefInput = {
  target: BriefTarget;
  serpDate: string | null;
  top10: SerpRow[];
  facts: FactsRow[];
  teardown: TeardownRow;
  paa: string[];
  ours: OurPage[];
  towns: string[];
  now?: Date;
};

const STOP = new Set(
  'a an and the of for to in on at by with from your you our we is are be can do does how what why when which who best near me my uk vs or it its this that these those top guide 2024 2025 2026 2027 heliaxis'.split(' '),
);

const SERVICE_WORDS: Record<string, string[]> = {
  solar: ['solar', 'panels', 'pv', 'photovoltaic'],
  battery: ['battery', 'batteries', 'storage'],
  heat_pump: ['heat', 'pump', 'pumps', 'air', 'source'],
  ev: ['ev', 'charger', 'chargers', 'charging', 'electric', 'car'],
  infrared: ['infrared', 'panel', 'heating', 'heaters'],
};

export function tokens(s: string, towns: string[] = []): string[] {
  const townWords = new Set(towns.flatMap((t) => t.toLowerCase().split(/[\s-]+/)));
  return (String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1 && !STOP.has(w) && !townWords.has(w)).map(stem);
}

/** A light stem so "installers" and "installer", "costs" and "cost" meet. */
const stem = (w: string) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const to50 = (n: number) => Math.max(300, Math.round(n / 50) * 50);

/** H2 subtopics the top 10 share: headings grouped by their words, kept when 3 or more pages (or 30%) have one. */
export function sharedSubtopics(facts: FactsRow[], towns: string[]): OutlineItem[] {
  type G = { key: string[]; texts: Map<string, number>; urls: Set<string> };
  const groups: G[] = [];
  for (const f of facts) {
    for (const h of f.headings ?? []) {
      if (!h?.text || (h.level && h.level > 3) || h.level === 1) continue;
      const t = tokens(h.text, towns);
      if (!t.length || t.length > 12) continue;
      let g = groups.find((x) => jaccard(x.key, t) >= 0.5);
      if (!g) {
        g = { key: t, texts: new Map(), urls: new Set() };
        groups.push(g);
      }
      g.urls.add(f.url);
      const clean = h.text.replace(/\s+/g, ' ').trim();
      g.texts.set(clean, (g.texts.get(clean) ?? 0) + 1);
    }
  }
  const pages = facts.length;
  const need = Math.max(2, Math.min(3, Math.ceil(pages * 0.3)));
  return groups
    .filter((g) => g.urls.size >= need)
    .sort((a, b) => b.urls.size - a.urls.size)
    .slice(0, 10)
    .map((g) => {
      // The label: the most used wording, shortest on a tie, with any town taken out so it reads for our page.
      const best = [...g.texts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
      return { h2: best, why: `${g.urls.size} of ${pages} top pages have a section on this`, source: 'shared' as const, count: g.urls.size };
    });
}

/** Topics in the top-10 titles when there are no page facts: the words most titles share. */
export function titleTopics(top10: SerpRow[], target: BriefTarget, towns: string[]): OutlineItem[] {
  const titles = top10.map((r) => r.title ?? '').filter(Boolean);
  if (!titles.length) return [];
  const count = new Map<string, number>();
  const primary = new Set(tokens(target.primary, towns));
  for (const t of titles) for (const w of new Set(tokens(t, towns))) if (!primary.has(w)) count.set(w, (count.get(w) ?? 0) + 1);
  const IDEAS: Record<string, string> = {
    cost: 'What it costs, and what changes the price',
    price: 'What it costs, and what changes the price',
    grant: 'Grants and funding you may qualify for',
    funding: 'Grants and funding you may qualify for',
    finance: 'Paying for it: finance options',
    installer: 'Choosing an installer: what to check',
    review: 'What customers say',
    battery: 'Adding a battery',
    worth: 'Is it worth it? A worked example',
    saving: 'What you could save: a worked example',
    payback: 'Payback: a worked example',
    commercial: 'For businesses',
    business: 'For businesses',
    planning: 'Planning permission and the network operator',
    mcs: 'MCS certification and what it means for you',
    certified: 'MCS certification and what it means for you',
    quote: 'What a good quote includes',
    warranty: 'Warranties and aftercare',
  };
  const out: OutlineItem[] = [];
  const seen = new Set<string>();
  for (const [w, c] of [...count.entries()].sort((a, b) => b[1] - a[1])) {
    const h2 = IDEAS[w];
    if (!h2 || seen.has(h2) || c < 2) continue;
    seen.add(h2);
    out.push({ h2, why: `"${w}" is in ${c} of ${titles.length} top-10 titles`, source: 'titles', count: c });
  }
  return out.slice(0, 6);
}

const DEFAULT_OUTLINE: Record<PageType, string[]> = {
  pillar: ['What it costs, and what changes the price', 'How it works for your home', 'From survey to switch-on', 'Recent installs', 'Grants, finance and the Smart Export Guarantee', 'Questions people ask'],
  town: ['What it costs in {town}', 'Recent installs near {town}', 'Your network operator and planning in {town}', 'From survey to switch-on', 'Questions people in {town} ask'],
  case_study: ['The home and what the owner wanted', 'What we found at the survey', 'The system we fitted', 'How it has performed', 'What the owner says'],
  cost_guide: ['Typical prices', 'What changes the price', 'A worked example, with its assumptions', 'Payback and savings', 'What a quote should include'],
  comparison: ['The short answer', 'Side by side', 'When each makes sense', 'A worked example, with its assumptions', 'Questions people ask'],
  sector: ['What it means for your site', 'Costs, payback and funding', 'How we work around your operations', 'Recent projects', 'Questions people ask'],
  article: ['The short answer', 'What it means in practice', 'A worked example, with its assumptions', 'What to do next'],
};

const SCHEMA: Record<PageType, string[]> = {
  pillar: ['Service', 'LocalBusiness', 'BreadcrumbList'],
  town: ['Service', 'LocalBusiness', 'BreadcrumbList'],
  sector: ['Service', 'LocalBusiness', 'BreadcrumbList'],
  case_study: ['Article', 'Person', 'BreadcrumbList'],
  cost_guide: ['Article', 'Person', 'BreadcrumbList'],
  comparison: ['Article', 'Person', 'BreadcrumbList'],
  article: ['Article', 'Person', 'BreadcrumbList'],
};

const AUDIENCE: Record<Intent, string> = {
  local_commercial: 'Home and business owners near {town} ready to get quotes from a local installer.',
  commercial: 'People comparing options and installers before they buy.',
  informational: 'People researching the question before they decide anything.',
};

export function defaultKind(pageType: PageType): 'cms_page' | 'blog' {
  return pageType === 'article' ? 'blog' : 'cms_page';
}

export function guessPageType(t: { town: string | null; intent: Intent; primary: string }): PageType {
  const p = t.primary.toLowerCase();
  if (/\b(cost|price|prices|how much)\b/.test(p)) return 'cost_guide';
  if (/\bvs\b|\bversus\b|\bcompare|\bor\b/.test(p) && t.intent !== 'local_commercial') return 'comparison';
  if (/\b(commercial|business|farm|school|warehouse)\b/.test(p)) return 'sector';
  if (t.town) return 'town';
  return t.intent === 'informational' ? 'article' : 'pillar';
}

/** Our pages to link to (out) and that should link here (in), by shared words with the target. */
export function suggestLinks(target: BriefTarget, ours: OurPage[], towns: string[], self?: string | null): { out: LinkSuggestion[]; in: LinkSuggestion[] } {
  const me = normPath(self ?? target.targetPage ?? '');
  const want = new Set([...tokens(target.primary, []), ...(SERVICE_WORDS[target.service ?? ''] ?? [])]);
  const town = (target.town ?? '').toLowerCase();
  const scored = ours
    .filter((o) => normPath(o.path) !== me && !/^\/(admin|preview)/.test(o.path))
    .map((o) => {
      const words = tokens(`${o.title} ${o.path.replace(/[/-]/g, ' ')}`, []);
      const shared = words.filter((w) => want.has(w));
      const sameTown = !!town && `${o.title} ${o.path}`.toLowerCase().includes(town);
      return { o, score: new Set(shared).size + (sameTown ? 2 : 0), shared: [...new Set(shared)], sameTown };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const why = (x: (typeof scored)[number]) => [x.shared.length ? `shares "${x.shared.slice(0, 3).join('", "')}"` : '', x.sameTown ? `same town (${target.town})` : ''].filter(Boolean).join(', ');
  const out: LinkSuggestion[] = scored.slice(0, 5).map((x) => ({ path: x.o.path, title: x.o.title, why: why(x) }));
  // Every page also links to where people act.
  for (const fixed of [
    { path: '/free-solar-quote', title: 'Free solar quote', why: 'the quote form' },
    { path: '/solar-estimator', title: 'Solar estimator', why: 'lets people check the numbers' },
  ]) {
    if (out.length < 6 && !out.some((l) => normPath(l.path) === fixed.path) && ours.some((o) => normPath(o.path) === fixed.path)) out.push(fixed);
  }
  const inbound = scored
    .filter((x) => x.score >= 2 || x.sameTown)
    .slice(0, 5)
    .map((x) => ({ path: x.o.path, title: x.o.title, why: `${why(x)}: add a link from here to the new page` }));
  return { out, in: inbound };
}

const asText = (v: unknown) => (typeof v === 'string' ? v : v && typeof v === 'object' && 'text' in (v as object) ? String((v as { text: unknown }).text) : '');

export function buildBrief(input: BriefInput): Brief {
  const { target, towns } = input;
  const notes: string[] = [];
  const top10 = [...input.top10].sort((a, b) => a.pos - b.pos).slice(0, 10);
  const factsByUrl = new Map(input.facts.map((f) => [f.url, f]));
  const facts = top10.map((r) => (r.url ? factsByUrl.get(r.url) : undefined)).filter((f): f is FactsRow => !!f);

  if (!top10.length) notes.push('No SERP for this search yet: the brief uses the default outline. It improves after the next weekly run (Sunday night).');
  if (!input.teardown) notes.push(top10.length ? 'No teardown for this search yet, so the outline comes from the top-10 titles and any page facts stored.' : 'No teardown for this search yet.');
  if (top10.length && !facts.length) notes.push('No page facts for the top 10 yet (they are fetched after each SERP run), so the word range is a default.');

  // Outline: shared subtopics, then the teardown's suggested outline, then People Also Ask, then the default for the type.
  const outline: OutlineItem[] = [];
  const add = (o: OutlineItem) => {
    const t = tokens(o.h2, towns);
    if (outline.some((x) => jaccard(tokens(x.h2, towns), t) >= 0.5)) return;
    outline.push(o);
  };
  for (const o of sharedSubtopics(facts, towns)) add(o);
  for (const v of input.teardown?.summary?.outline ?? []) {
    // The teardown writes "H1: …" then "H2: …" lines; the H1 is the page title, not a section.
    const line = asText(v).trim();
    const m = line.match(/^h([1-6])\s*:\s*(.*)$/i);
    if (m && m[1] === '1') continue;
    const h2 = (m ? m[2] : line).trim();
    if (h2) add({ h2, why: `In the teardown's suggested outline (${input.teardown?.date})`, source: 'teardown' });
  }
  if (!facts.length) for (const o of titleTopics(top10, target, towns)) add(o);
  const questions = [...new Set([...input.paa, ...facts.flatMap((f) => (f.questions ?? []).map(asText))].map((q) => q.trim()).filter((q) => q.length > 8 && q.length < 160))].slice(0, 8);
  if (input.paa.length) add({ h2: 'Questions people ask', why: `${input.paa.length} People Also Ask questions stored for this search`, source: 'paa' });
  for (const d of DEFAULT_OUTLINE[target.pageType]) {
    if (outline.length >= 8) break;
    add({ h2: d.replace(/\{town\}/g, target.town ?? 'your area'), why: `Standard section for a ${target.pageType.replace('_', ' ')} page`, source: 'default' });
  }

  const wordsList = facts.map((f) => f.words ?? 0).filter((w) => w > 150);
  const med = median(wordsList);
  const DEFAULT_WORDS: Record<PageType, number> = { pillar: 1400, town: 1100, case_study: 800, cost_guide: 1600, comparison: 1400, sector: 1300, article: 1300 };
  const base = med ?? DEFAULT_WORDS[target.pageType];
  const words = {
    min: to50(base * 0.9),
    max: to50(base * 1.25),
    median: med,
    pages: wordsList.length,
    note: med ? `Median of ${wordsList.length} top-10 pages with page facts is ${med.toLocaleString('en-GB')} words.` : `Default for a ${target.pageType.replace('_', ' ')} page (no page facts yet).`,
  };

  const schema = [...SCHEMA[target.pageType]];
  const rivalsSchema = new Map<string, number>();
  for (const f of facts) for (const s of f.schema ?? []) rivalsSchema.set(s, (rivalsSchema.get(s) ?? 0) + 1);
  if (facts.length) notes.push(`Schema the top 10 use: ${[...rivalsSchema.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, c]) => `${s} (${c})`).join(', ') || 'none found'}. FAQ rich results stopped showing in May 2026, so FAQPage is not added for that.`);

  const links = suggestLinks(target, input.ours, towns);
  if (links.out.length < 3) notes.push(`Only ${links.out.length} of our pages match this topic; the draft still needs at least 3 internal links.`);

  const cta = target.intent === 'informational' ? { label: 'Check your numbers', href: '/solar-estimator' } : { label: 'Book a free survey', href: '/book-a-survey' };

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    target,
    audience: AUDIENCE[target.intent].replace('{town}', target.town ?? 'our area'),
    outline: outline.slice(0, 9),
    questions,
    words,
    schema,
    linksOut: links.out,
    linksIn: links.in,
    cta,
    top10: top10.map((r) => ({ pos: r.pos, domain: r.domain, url: r.url, title: r.title, words: r.url ? (factsByUrl.get(r.url)?.words ?? null) : null })),
    sources: { serpDate: input.serpDate, teardownDate: input.teardown?.date ?? null, factsPages: facts.length, paa: input.paa.length },
    notes,
  };
}
