import type { Brief, CheckIssue, CheckResult, Checks, ContentMode, ContentStatus, Draft, Proof } from './types';
import { draftText, internalLinks, overlap, shingles, wordCount } from './text';

/**
 * The checks that block publishing (spec §5 M4.4). Pure, so the phase 3 gate can be tested:
 * - claims: credentials only from Settings › Business facts, no banned claims, and every price, saving or other figure
 *   must come from the proof pack or the packages picked into it (a £ amount only from a package price or a figure
 *   marked as money);
 * - originality: word 5-gram overlap with our own published pages, and with rivals' top-10 text, under the threshold;
 * - title 50–60 and description 120–158 characters; valid JSON-LD; at least 3 internal links;
 * - the weekly new-page limit.
 */

/** Trade bodies and schemes a page might claim. Any not in Business facts is blocked (strategy §11: never NICEIC). */
export const KNOWN_SCHEMES = ['MCS', 'RECC', 'NAPIT', 'NICEIC', 'TrustMark', 'HIES', 'Gas Safe', 'OFTEC', 'Checkatrade', 'Which? Trusted Trader', 'Stroma', 'Elmhurst', 'Certsure', 'ECA', 'Solar Energy UK'];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Finds a phrase as a whole word (or the raw text when it has no letters at the edges, like "#1"). */
function findPhrase(text: string, phrase: string, caseSensitive = false): string[] {
  const p = phrase.trim();
  if (!p) return [];
  const pre = /^[\p{L}\p{N}]/u.test(p) ? '(?<![\\p{L}\\p{N}])' : '';
  const post = /[\p{L}\p{N}]$/u.test(p) ? '(?![\\p{L}\\p{N}])' : '';
  const re = new RegExp(`${pre}${escapeRe(p)}${post}`, caseSensitive ? 'gu' : 'giu');
  return [...text.matchAll(re)].map((m) => around(text, m.index ?? 0, m[0].length));
}

function around(text: string, i: number, len: number, pad = 40): string {
  const a = Math.max(0, i - pad);
  const b = Math.min(text.length, i + len + pad);
  return `${a > 0 ? '…' : ''}${text.slice(a, b).trim()}${b < text.length ? '…' : ''}`;
}

export type NumberToken = { raw: string; value: number; unit: string; money: boolean; context: string };

const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
const UNIT = '%|per\\s?cent|kwp|kwh|kw|mwh|mw|wp|watts?|w|p\\/kwh|pence|p|years?|yrs?|months?|weeks?|days?|hours?|panels?|times|x';
const NUM_RE = new RegExp(`(£\\s?)?(?<![\\p{L}\\p{N}.,])(\\d{1,3}(?:,\\d{3})+|\\d+)(\\.\\d+)?(?:\\s?(${UNIT})(?![\\p{L}]))?`, 'giu');

/** The figures a text states. Dates, years, step numbers and the like are not figures and are left out. */
export function numbersIn(text: string, opts: { phone?: string } = {}): NumberToken[] {
  let t = String(text || '');
  if (opts.phone) {
    const digits = opts.phone.replace(/\D/g, '');
    if (digits.length >= 6) t = t.replace(new RegExp(digits.split('').join('[\\s-]?'), 'g'), ' ');
  }
  // UK phone numbers in general, and dates such as 19 November 2026 or 2026-11-19 or 19/11/2026.
  t = t.replace(/(?:\+44\s?|0)\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g, ' ');
  t = t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ');
  t = t.replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b`, 'gi'), ' ');
  const out: NumberToken[] = [];
  for (const m of t.matchAll(NUM_RE)) {
    const money = !!m[1];
    const unit = (m[4] ?? '').toLowerCase().replace(/\s/g, '');
    const value = Number(`${m[2].replace(/,/g, '')}${m[3] ?? ''}`);
    if (!Number.isFinite(value)) continue;
    const bare = !money && !unit;
    if (bare && Number.isInteger(value) && value >= 1990 && value <= 2099) continue; // a year
    if (bare && value <= 12) continue; // "3 steps", "step 1", list counts
    if (!money && (unit === 'x' || unit === 'times') && value <= 3) continue;
    out.push({ raw: m[0].trim(), value, unit, money, context: around(t, m.index ?? 0, m[0].length) });
  }
  return out;
}

/** Every number the proof pack holds (prices, sizes, figures, dates), as values a draft may use. */
export function allowedNumbers(proof: Proof, extra: (string | number)[] = []): Set<number> {
  const set = new Set<number>();
  const add = (v: unknown) => {
    if (v == null || v === '') return;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) {
        set.add(round(v));
        set.add(Math.round(v));
      }
      return;
    }
    for (const m of String(v).matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)) add(Number(m[0].replace(/,/g, '')));
  };
  for (const p of proof.packages) {
    add(p.priceIncVat);
    add(p.kwp);
    add(p.usableKwh);
    add(p.panels);
    add(p.warranties);
  }
  for (const p of proof.projects) {
    add(p.sizeKwp);
    add(p.batteryKwh);
    add(p.summary);
  }
  for (const r of proof.reviews) add(r.stars);
  for (const f of proof.figures) {
    add(f.value);
    add(f.label);
  }
  add(proof.findings);
  for (const e of extra) add(e);
  return set;
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * The £ amounts a draft may state: only package prices picked into the proof pack (pv_packages, never typed) and
 * figures a person marked as money. A kWh, a star rating or a size in the proof pack never licenses a price.
 */
export function allowedMoney(proof: Proof): Set<number> {
  const set = new Set<number>();
  const add = (v: number) => {
    if (!Number.isFinite(v)) return;
    set.add(round(v));
    set.add(Math.round(v));
  };
  for (const p of proof.packages) if (p.priceIncVat != null) add(Number(p.priceIncVat));
  for (const f of proof.figures) {
    if (f.money !== true) continue;
    for (const m of String(f.value).matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)) add(Number(m[0].replace(/,/g, '')));
  }
  return set;
}

export type CheckInput = {
  draft: Draft;
  proof: Proof;
  brief?: Brief | null;
  mode?: ContentMode;
  business: { name: string; phone: string; credentials: string[] };
  rules: { bannedClaims: string[]; originalityMaxOverlap: number; weeklyNewPages: number };
  /** Our own published pages (not this one). */
  ours: { path: string; title: string; text: string }[];
  /** Rivals' top-10 text samples (seo_page_facts.text_sample). */
  rivals: { url: string; text: string }[];
  towns: string[];
  site?: string;
  /** New pages published this week (for the limit), not counting this one. */
  publishedThisWeek?: number;
};

const result = (key: string, label: string, ok: boolean, detail: string, issues: CheckIssue[] = [], blocking = true): CheckResult => ({ key, label, ok, blocking, detail, issues });

export function claimsCheck(input: Pick<CheckInput, 'draft' | 'proof' | 'business' | 'rules'>): CheckResult {
  const { draft, proof, business, rules } = input;
  const body = draftText(draft).text;
  const all = [draft.title, draft.description, body].join(' . ');
  const issues: CheckIssue[] = [];
  const seen = new Set<string>();
  const push = (text: string, where?: string) => {
    if (seen.has(text + (where ?? ''))) return;
    seen.add(text + (where ?? ''));
    issues.push({ text, where });
  };

  const allowedCreds = new Set(business.credentials.map((c) => c.toLowerCase()));
  for (const s of KNOWN_SCHEMES) {
    if (allowedCreds.has(s.toLowerCase())) continue;
    // Short acronyms only count in capitals ("select" the word is fine; "SELECT" the scheme is not).
    const hits = findPhrase(all, s, s.length <= 6 && s === s.toUpperCase());
    for (const h of hits.slice(0, 2)) push(`Names ${s}, which is not one of our credentials (${business.credentials.join(', ')}).`, h);
  }
  for (const b of rules.bannedClaims) {
    const hits = findPhrase(all, b);
    for (const h of hits.slice(0, 2)) push(`Banned claim: "${b}".`, h);
  }
  // The schema can't claim more than the page.
  if (draft.schema) for (const s of KNOWN_SCHEMES) if (!allowedCreds.has(s.toLowerCase()) && findPhrase(draft.schema, s, s.length <= 6 && s === s.toUpperCase()).length) push(`The schema names ${s}.`);

  const allowed = allowedNumbers(proof);
  const money = allowedMoney(proof);
  const figures = numbersIn(all, { phone: business.phone });
  for (const f of figures) {
    const pool = f.money ? money : allowed;
    if (pool.has(round(f.value)) || pool.has(Math.round(f.value))) continue;
    const kind = f.money ? 'price' : f.unit === '%' || f.unit.startsWith('per') ? 'percentage' : 'figure';
    push(f.money ? `The price "${f.raw}" is not a package price in the proof pack or a figure marked as a £ amount.` : `The ${kind} "${f.raw}" is not in the proof pack or the packages.`, f.context);
  }
  const ok = issues.length === 0;
  return result('claims', 'Claims', ok, ok ? `Credentials named: ${business.credentials.join(', ')} only. Every figure (${figures.length}) is in the proof pack.` : `${issues.length} claim${issues.length === 1 ? '' : 's'} to fix.`, issues);
}

export function originalityCheck(input: Pick<CheckInput, 'draft' | 'ours' | 'rivals' | 'towns' | 'rules'>): CheckResult {
  const { text } = draftText(input.draft);
  const mine = shingles(text, input.towns);
  const max = input.rules.originalityMaxOverlap;
  const scores = [
    ...input.ours.map((o) => ({ where: o.path, who: 'our page', score: overlap(mine, shingles(o.text, input.towns)) })),
    ...input.rivals.map((r) => ({ where: r.url, who: 'a rival page', score: overlap(mine, shingles(r.text, input.towns)) })),
  ].sort((a, b) => b.score - a.score);
  const over = scores.filter((s) => s.score > max);
  const top = scores[0];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const detail = !mine.size
    ? 'The draft has no text to compare.'
    : over.length
      ? `${over.length} page${over.length === 1 ? '' : 's'} over the ${pct(max)} limit. Highest: ${pct(over[0].score)} with ${over[0].who} ${over[0].where}.`
      : `Highest overlap ${top ? `${pct(top.score)} with ${top.who} ${top.where}` : '0%'} (limit ${pct(max)}), against ${input.ours.length} of our pages and ${input.rivals.length} rival pages.`;
  return result(
    'originality',
    'Originality',
    mine.size > 0 && over.length === 0,
    detail,
    over.slice(0, 6).map((o) => ({ text: `${pct(o.score)} of the draft's 5-word runs also appear on ${o.who}.`, where: o.where })),
  );
}

export function lengthChecks(draft: Pick<Draft, 'title' | 'description'>): CheckResult[] {
  const t = draft.title.trim().length;
  const d = draft.description.trim().length;
  return [
    result('title', 'Title length', t >= 50 && t <= 60, `${t} characters (50 to 60).`),
    result('description', 'Description length', d >= 120 && d <= 158, `${d} characters (120 to 158).`),
  ];
}

type Node = Record<string, unknown>;
const REQUIRED: Record<string, string[]> = {
  Article: ['headline', 'author'],
  BlogPosting: ['headline', 'author'],
  Service: ['name', 'provider'],
  LocalBusiness: ['name'],
  Organization: ['name'],
  Person: ['name'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  WebPage: ['name'],
};

export function schemaCheck(schema: string): CheckResult {
  const issues: CheckIssue[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(schema || '');
  } catch (e) {
    return result('schema', 'Schema', false, 'The JSON-LD does not parse.', [{ text: e instanceof Error ? e.message : 'Not JSON' }]);
  }
  const roots = Array.isArray(parsed) ? parsed : [parsed];
  const nodes: Node[] = [];
  for (const r of roots) {
    if (!r || typeof r !== 'object') {
      issues.push({ text: 'A top-level item is not an object.' });
      continue;
    }
    const o = r as Node;
    if (!/schema\.org/.test(String(o['@context'] ?? ''))) issues.push({ text: 'Missing "@context": "https://schema.org".' });
    if (Array.isArray(o['@graph'])) nodes.push(...(o['@graph'] as Node[]));
    else nodes.push(o);
  }
  const types: string[] = [];
  for (const n of nodes) {
    const t = n && typeof n === 'object' ? n['@type'] : undefined;
    const list = Array.isArray(t) ? t.map(String) : t ? [String(t)] : [];
    if (!list.length) {
      issues.push({ text: 'An item has no "@type".' });
      continue;
    }
    types.push(...list);
    for (const ty of list) {
      for (const f of REQUIRED[ty] ?? []) {
        const v = n[f];
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) issues.push({ text: `${ty} is missing "${f}".` });
      }
      if (ty === 'BreadcrumbList' && Array.isArray(n.itemListElement)) {
        (n.itemListElement as Node[]).forEach((li, i) => {
          if (!li || li.position == null || !li.name) issues.push({ text: `Breadcrumb ${i + 1} needs a position and a name.` });
        });
      }
    }
  }
  if (!nodes.length) issues.push({ text: 'There is no schema.' });
  const ok = issues.length === 0;
  return result('schema', 'Schema', ok, ok ? `Valid JSON-LD: ${[...new Set(types)].join(', ')}.` : `${issues.length} problem${issues.length === 1 ? '' : 's'} in the JSON-LD.`, issues);
}

export function linksCheck(draft: Draft, site?: string): CheckResult {
  const { links } = draftText(draft);
  const self = draft.kind === 'blog' ? `/blog/${draft.slug.replace(/^\/?(blog\/)?/, '')}` : `/${draft.slug.replace(/^\//, '')}`;
  const internal = internalLinks(links, { site, self });
  return result('links', 'Internal links', internal.length >= 3, `${internal.length} internal link${internal.length === 1 ? '' : 's'} (at least 3)${internal.length ? `: ${internal.slice(0, 8).join(', ')}` : ''}.`);
}

export function limitCheck(mode: ContentMode, publishedThisWeek: number, limit: number): CheckResult {
  if (mode === 'refresh') return result('limit', 'Weekly new-page limit', true, 'A refresh does not count towards the limit.');
  return result('limit', 'Weekly new-page limit', publishedThisWeek < limit, `${publishedThisWeek} of ${limit} new pages published this week (Monday to Sunday).`);
}

/** Advice that does not block: answer first, "last checked" on figures, length against the brief. */
export function adviceChecks(draft: Draft, brief?: Brief | null): CheckResult[] {
  const { text } = draftText(draft);
  const out: CheckResult[] = [];
  const lead = leadSentences(draft);
  if (brief) {
    const words = brief.target.primary.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
    const hit = words.filter((w) => lead.toLowerCase().includes(w));
    out.push(result('answer', 'Answers first', words.length === 0 || hit.length / words.length >= 0.5, lead ? `Opens with: "${lead.slice(0, 220)}"` : 'No opening text found.', [], false));
    const wc = wordCount(text);
    out.push(result('words', 'Length', wc >= brief.words.min * 0.85, `${wc.toLocaleString('en-GB')} words; the brief asks for ${brief.words.min.toLocaleString('en-GB')} to ${brief.words.max.toLocaleString('en-GB')}.`, [], false));
  }
  const hasFigures = /£\s?\d|\d\s?%|\d\s?kwh?p?\b/i.test(text);
  out.push(result('checked', '"Last checked" on figures', !hasFigures || /last checked/i.test(text), hasFigures ? (/last checked/i.test(text) ? 'Figures carry a "last checked" date.' : 'The draft gives figures but no "last checked" date.') : 'No figures given.', [], false));
  return out;
}

const STOP = new Set(['the', 'and', 'for', 'near', 'with', 'how', 'what', 'does', 'are', 'you', 'can', 'much', 'best', 'from', 'your']);

function leadSentences(draft: Draft): string {
  let t = '';
  if (draft.kind === 'blog') t = draftText({ kind: 'blog', article: { introText: draft.article?.introText } }).text;
  else {
    const first = (draft.blocks ?? []).find((b) => b.t !== 'hero' && b.t !== 'stats');
    t = first ? draftText({ kind: 'cms_page', blocks: [first] }).text : '';
  }
  return (t.match(/[^.!?]+[.!?]+/g) ?? [t]).slice(0, 2).join(' ').trim();
}

export function runChecks(input: CheckInput, now = new Date()): Checks {
  const results = [
    claimsCheck(input),
    originalityCheck(input),
    ...lengthChecks(input.draft),
    schemaCheck(input.draft.schema),
    linksCheck(input.draft, input.site),
    limitCheck(input.mode ?? 'new', input.publishedThisWeek ?? 0, input.rules.weeklyNewPages),
    ...adviceChecks(input.draft, input.brief),
  ];
  return { ranAt: now.toISOString(), ok: results.every((r) => r.ok || !r.blocking), results };
}

/* ── Who may move a page on ─────────────────────────────────────────────────────────────────────────────────────── */

export type Gate = { ok: true } | { ok: false; why: string };

/** Editors send a draft for approval only when every blocking check (except the weekly limit) passes. */
export function canSubmit(status: ContentStatus, checks: Checks | null | undefined): Gate {
  if (status !== 'draft') return { ok: false, why: 'Only a draft can be sent for approval.' };
  if (!checks?.results?.length) return { ok: false, why: 'Run the checks first.' };
  const failing = checks.results.filter((r) => r.blocking && !r.ok && r.key !== 'limit');
  return failing.length ? { ok: false, why: `Fix first: ${failing.map((f) => f.label).join(', ')}.` } : { ok: true };
}

/** Nothing publishes without an admin's approval, fresh passing checks, and room under the weekly limit. */
export function canPublish(c: { status: ContentStatus; approved_by: string | null }, role: 'owner' | 'admin' | 'editor' | 'viewer', checks: Checks | null | undefined): Gate {
  if (role !== 'owner' && role !== 'admin') return { ok: false, why: 'Only an admin or the owner can approve and publish.' };
  if (c.status !== 'in_review' && c.status !== 'approved') return { ok: false, why: 'Only a page in review can be published.' };
  if (!checks?.results?.length) return { ok: false, why: 'Run the checks first.' };
  const failing = checks.results.filter((r) => r.blocking && !r.ok);
  if (failing.length) return { ok: false, why: `Blocked by: ${failing.map((f) => `${f.label} (${f.detail})`).join('; ')}` };
  return { ok: true };
}
