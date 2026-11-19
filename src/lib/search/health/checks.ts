/**
 * M7 technical health (spec §5 M7): the checks that decide whether a page can rank at all. Pure (no network, no database),
 * so every rule here is unit-tested; the fetching and storing are in health/server.ts.
 *
 * Check keys, as stored in seo_health.check_key: index | sitemap | orphan | canonical | schema | lighthouse | crawlers | llms.
 */

export const HEALTH_CHECKS = ['index', 'sitemap', 'orphan', 'canonical', 'schema', 'lighthouse', 'crawlers', 'llms'] as const;
export type HealthCheck = (typeof HEALTH_CHECKS)[number];

export const HEALTH_LABEL: Record<HealthCheck, string> = {
  index: 'In Google’s index',
  sitemap: 'In the sitemap',
  orphan: 'Linked from other pages',
  canonical: 'Canonical links',
  schema: 'Structured data',
  lighthouse: 'Mobile speed (Lighthouse)',
  crawlers: 'Search and AI crawler access',
  llms: 'llms.txt',
};

export type HealthRow = { date: string; check_key: string; url: string; ok: boolean; detail: Record<string, unknown> };

/* ── Paths ───────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** "/solar-panels/" → "/solar-panels"; "" → "/"; a full URL on our host → its path; another host → null. */
export function toPath(u: string, host?: string): string | null {
  let p = u.trim();
  if (/^https?:\/\//i.test(p)) {
    try {
      const url = new URL(p);
      if (host && url.host.replace(/^www\./, '') !== host.replace(/^www\./, '')) return null;
      p = url.pathname;
    } catch {
      return null;
    }
  }
  p = p.split('#')[0].split('?')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  return p.length > 1 ? p.replace(/\/+$/, '') || '/' : '/';
}

/** The <loc> paths in a sitemap, on our host only, in order, once each. */
export function sitemapLocs(xml: string, host: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const p = toPath(m[1].replace(/&amp;/g, '&'), host);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * The most important URLs (up to n): the home page, then pages by Search Console impressions over the last 28 days, then
 * pinned pages (published by the content studio), then the sitemap in its own order (which puts the main pages first).
 */
export function keyPages(o: { gsc?: { page: string; impressions: number }[]; pinned?: string[]; sitemap?: string[]; host: string }, n = 50): string[] {
  const byPage = new Map<string, number>();
  for (const r of o.gsc ?? []) {
    const p = toPath(r.page, o.host);
    if (p) byPage.set(p, (byPage.get(p) ?? 0) + (Number(r.impressions) || 0));
  }
  const ranked = [...byPage.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const out: string[] = [];
  for (const p of ['/', ...ranked, ...(o.pinned ?? []).map((x) => toPath(x, o.host)).filter((x): x is string => !!x), ...(o.sitemap ?? [])]) {
    if (out.length >= n) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/* ── Sitemap coverage ────────────────────────────────────────────────────────────────────────────────────────────── */

export type CmsPageLite = { slug: string; html?: string; seo?: { noindex?: boolean } };

/** Which published, indexable CMS pages and live blog posts are missing from the sitemap (the same rules as sitemap.ts). */
export function sitemapCoverage(o: { sitemap: string[]; cmsPages: CmsPageLite[]; postSlugs: string[] }): { expected: string[]; missing: string[] } {
  const have = new Set(o.sitemap);
  const expected: string[] = [];
  for (const p of o.cmsPages) {
    if (p.seo?.noindex || !(p.html ?? '').trim()) continue;
    const path = toPath(p.slug || '/');
    // Blog articles in the editor are listed through the blog, as posts.
    if (!path || path.startsWith('/blog')) continue;
    if (!expected.includes(path)) expected.push(path);
  }
  for (const s of o.postSlugs) {
    const path = toPath(`/blog/${s.replace(/^\/?(blog\/)?/, '')}`);
    if (path && !expected.includes(path)) expected.push(path);
  }
  return { expected, missing: expected.filter((p) => !have.has(p)) };
}

export type GscSitemap = { path?: string; lastSubmitted?: string; lastDownloaded?: string; isPending?: boolean; errors?: string | number; warnings?: string | number; contents?: { type?: string; submitted?: string | number; indexed?: string | number }[] };

/** Search Console's Sitemaps report for our sitemap: submitted, read, and its error and warning counts. */
export function sitemapStatus(list: GscSitemap[], ourSitemap: string): { submitted: boolean; ok: boolean; errors: number; warnings: number; lastDownloaded: string | null; submittedUrls: number | null; message: string } {
  const want = ourSitemap.replace(/\/$/, '');
  const s = list.find((x) => (x.path ?? '').replace(/\/$/, '') === want) ?? list[0];
  if (!s) return { submitted: false, ok: false, errors: 0, warnings: 0, lastDownloaded: null, submittedUrls: null, message: 'No sitemap has been submitted in Search Console.' };
  const errors = Number(s.errors ?? 0) || 0;
  const warnings = Number(s.warnings ?? 0) || 0;
  const submittedUrls = s.contents?.length ? s.contents.reduce((a, c) => a + (Number(c.submitted ?? 0) || 0), 0) : null;
  const message = errors ? `Search Console reports ${errors} error${errors === 1 ? '' : 's'} in the sitemap.` : s.isPending ? 'Submitted; Google has not read it yet.' : warnings ? `Read by Google, with ${warnings} warning${warnings === 1 ? '' : 's'}.` : 'Read by Google with no errors.';
  return { submitted: true, ok: errors === 0, errors, warnings, lastDownloaded: s.lastDownloaded ?? null, submittedUrls, message };
}

/* ── Orphans and canonicals (from the weekly audit's pages) ──────────────────────────────────────────────────────── */

export type AuditPageLite = { path: string; status: number; canonical: string | null; noindex: boolean; links: string[] };

/** Pages no other checked page links to (the home page is never an orphan; pages that failed to load are skipped). */
export function orphanPages(pages: AuditPageLite[]): string[] {
  const inbound = new Map<string, number>();
  for (const p of pages) for (const l of p.links) {
    const to = toPath(l);
    if (to && to !== p.path) inbound.set(to, (inbound.get(to) ?? 0) + 1);
  }
  return pages.filter((p) => p.status === 200 && p.path !== '/' && !inbound.get(p.path)).map((p) => p.path);
}

export type CanonicalProblem = { path: string; problem: string };

/** Canonical mistakes on pages the sitemap lists: missing, another site, http, a different page, or noindex in the sitemap. */
export function canonicalProblems(pages: AuditPageLite[], base: string): CanonicalProblem[] {
  const host = new URL(base).host;
  const out: CanonicalProblem[] = [];
  for (const p of pages) {
    if (p.status !== 200) continue;
    if (p.noindex) {
      out.push({ path: p.path, problem: 'Marked noindex but listed in the sitemap: take it out of one or the other.' });
      continue;
    }
    if (!p.canonical) {
      out.push({ path: p.path, problem: 'No canonical link.' });
      continue;
    }
    const c = p.canonical.trim();
    if (!/^https?:\/\//i.test(c)) {
      out.push({ path: p.path, problem: `The canonical is relative (${c}); use the full address.` });
      continue;
    }
    let url: URL;
    try {
      url = new URL(c);
    } catch {
      out.push({ path: p.path, problem: `The canonical is not a valid address (${c}).` });
      continue;
    }
    if (url.host.replace(/^www\./, '') !== host.replace(/^www\./, '')) out.push({ path: p.path, problem: `The canonical points to another site (${url.host}).` });
    else if (url.protocol === 'http:') out.push({ path: p.path, problem: 'The canonical uses http, not https.' });
    else if (url.host !== host) out.push({ path: p.path, problem: `The canonical uses ${url.host}, not ${host}.` });
    else if (toPath(url.pathname) !== p.path) out.push({ path: p.path, problem: `The canonical points to a different page (${toPath(url.pathname)}), so this page asks not to be indexed.` });
  }
  return out;
}

/* ── Structured data ─────────────────────────────────────────────────────────────────────────────────────────────── */

type Node = Record<string, unknown>;

/** Every JSON-LD block on a page, flattened (arrays and @graph), and the blocks that don't parse. */
export function extractJsonLd(html: string): { nodes: Node[]; invalid: number } {
  const nodes: Node[] = [];
  let invalid = 0;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Node;
    if (Array.isArray(o['@graph'])) (o['@graph'] as unknown[]).forEach(walk);
    if (o['@type']) nodes.push(o);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      invalid++;
    }
  }
  return { nodes, invalid };
}

const typesOf = (n: Node): string[] => (Array.isArray(n['@type']) ? (n['@type'] as unknown[]).map(String) : [String(n['@type'])]);
const has = (n: Node, k: string) => {
  const v = n[k];
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
};

const LOCAL_TYPES = /^(LocalBusiness|HomeAndConstructionBusiness|Electrician|HVACBusiness|RoofingContractor|Plumber|GeneralContractor|ProfessionalService|Store)$/;

/** Required and recommended properties per type (Google's structured data guidelines, late 2026). */
const RULES: { test: (t: string) => boolean; family: string; required: string[][]; recommended: string[] }[] = [
  { test: (t) => LOCAL_TYPES.test(t), family: 'LocalBusiness', required: [['name'], ['address']], recommended: ['telephone', 'url', 'areaServed', 'openingHoursSpecification'] },
  { test: (t) => t === 'Organization' || t === 'Corporation', family: 'Organization', required: [['name'], ['url']], recommended: ['logo', 'sameAs', 'telephone'] },
  { test: (t) => t === 'Service', family: 'Service', required: [['name', 'serviceType'], ['provider']], recommended: ['areaServed', 'description'] },
  { test: (t) => t === 'BreadcrumbList', family: 'BreadcrumbList', required: [['itemListElement']], recommended: [] },
  { test: (t) => /^(Article|BlogPosting|NewsArticle)$/.test(t), family: 'Article', required: [['headline'], ['author'], ['datePublished']], recommended: ['image', 'dateModified'] },
];

export type SchemaResult = { type: string; family: string | null; missing: string[]; recommended: string[]; note?: string };

/** Check each node: a missing required property is a problem; recommended ones are shown but not counted. FAQ markup is listed, never scored. */
export function validateSchema(nodes: Node[]): SchemaResult[] {
  const out: SchemaResult[] = [];
  for (const n of nodes) {
    for (const type of typesOf(n)) {
      if (type === 'FAQPage') {
        out.push({ type, family: null, missing: [], recommended: [], note: 'FAQ rich results ended in May 2026: harmless, but not scored.' });
        continue;
      }
      const rule = RULES.find((r) => r.test(type));
      if (!rule) {
        out.push({ type, family: null, missing: [], recommended: [] });
        continue;
      }
      const missing = rule.required.filter((alts) => !alts.some((k) => has(n, k))).map((alts) => alts.join(' or '));
      if (rule.family === 'BreadcrumbList' && has(n, 'itemListElement')) {
        const items = (Array.isArray(n.itemListElement) ? n.itemListElement : [n.itemListElement]) as Node[];
        items.forEach((it, i) => {
          const named = has(it ?? {}, 'name') || (!!it?.item && typeof it.item === 'object' && has(it.item as Node, 'name'));
          if (!it || typeof it !== 'object' || !has(it, 'position') || !named) missing.push(`itemListElement ${i + 1}: position and name`);
          else if (i < items.length - 1 && !has(it, 'item')) missing.push(`itemListElement ${i + 1}: item (only the last may leave it out)`);
        });
      }
      if (rule.family === 'LocalBusiness' && has(n, 'address') && typeof n.address === 'object' && !Array.isArray(n.address)) {
        const a = n.address as Node;
        if (!has(a, 'streetAddress') && !has(a, 'postalCode')) missing.push('address: streetAddress or postalCode');
      }
      out.push({ type, family: rule.family, missing, recommended: rule.recommended.filter((k) => !has(n, k)) });
    }
  }
  return out;
}

/** One page's structured data in a line: ok when every block parses and no scored type misses a required property. */
export function schemaVerdict(html: string): { ok: boolean; types: string[]; invalid: number; problems: string[]; notes: string[] } {
  const { nodes, invalid } = extractJsonLd(html);
  const results = validateSchema(nodes);
  const problems = [
    ...(invalid ? [`${invalid} JSON-LD block${invalid === 1 ? '' : 's'} could not be read (broken JSON).`] : []),
    ...results.filter((r) => r.missing.length).map((r) => `${r.type}: missing ${r.missing.join(', ')}`),
  ];
  return { ok: !problems.length, types: [...new Set(results.map((r) => r.type))], invalid, problems, notes: results.filter((r) => r.note).map((r) => r.note!) };
}

/* ── Index (URL Inspection) ──────────────────────────────────────────────────────────────────────────────────────── */

export type Inspection = {
  inspectionResult?: {
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
      robotsTxtState?: string;
      indexingState?: string;
      lastCrawlTime?: string;
      pageFetchState?: string;
      googleCanonical?: string;
      userCanonical?: string;
    };
  };
};

/** What the URL Inspection API says about one page: indexed only on verdict PASS. */
export function readInspection(j: Inspection): { indexed: boolean; verdict: string; coverage: string; lastCrawl: string | null; canonicalMismatch: string | null; detail: Record<string, string | null> } {
  const r = j.inspectionResult?.indexStatusResult ?? {};
  const verdict = r.verdict ?? 'VERDICT_UNSPECIFIED';
  const g = r.googleCanonical ?? null;
  const u = r.userCanonical ?? null;
  return {
    indexed: verdict === 'PASS',
    verdict,
    coverage: r.coverageState ?? 'Unknown',
    lastCrawl: r.lastCrawlTime ?? null,
    canonicalMismatch: g && u && g.replace(/\/$/, '') !== u.replace(/\/$/, '') ? g : null,
    detail: { verdict, coverageState: r.coverageState ?? null, robotsTxtState: r.robotsTxtState ?? null, indexingState: r.indexingState ?? null, pageFetchState: r.pageFetchState ?? null, lastCrawlTime: r.lastCrawlTime ?? null, googleCanonical: g, userCanonical: u },
  };
}

/* ── Lighthouse ──────────────────────────────────────────────────────────────────────────────────────────────────── */

/** DataForSEO's price per live Lighthouse task (the spec's estimate, rounded up). */
export const LIGHTHOUSE_COST = 0.005;

export type LighthouseSummary = { performance: number | null; seo: number | null; accessibility: number | null; lcpMs: number | null; cls: number | null; tbtMs: number | null; ok: boolean };

/** Scores (0 to 100) and lab timings from a Lighthouse result. ok: performance 50 or more and LCP 4 seconds or less on mobile. */
export function readLighthouse(r: Record<string, unknown> | null | undefined): LighthouseSummary {
  const cats = (r?.categories ?? {}) as Record<string, { score?: number | null } | undefined>;
  const audits = (r?.audits ?? {}) as Record<string, { numericValue?: number | null } | undefined>;
  const score = (k: string) => (typeof cats[k]?.score === 'number' ? Math.round(cats[k]!.score! * 100) : null);
  const num = (k: string, digits = 0) => {
    const v = audits[k]?.numericValue;
    return typeof v === 'number' ? Math.round(v * 10 ** digits) / 10 ** digits : null;
  };
  const performance = score('performance');
  const lcpMs = num('largest-contentful-paint');
  return {
    performance,
    seo: score('seo'),
    accessibility: score('accessibility'),
    lcpMs,
    cls: num('cumulative-layout-shift', 3),
    tbtMs: num('total-blocking-time'),
    ok: performance !== null && performance >= 50 && (lcpMs === null || lcpMs <= 4000),
  };
}

/* ── llms.txt ────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** A real llms.txt: answers 200 as text, starts with a "# " title, and isn't an HTML page. Low priority (spec M7). */
export function llmsVerdict(status: number, body: string): { ok: boolean; message: string } {
  if (status !== 200) return { ok: false, message: `/llms.txt answered ${status || 'nothing'}. Low priority: add one when there is time.` };
  if (/^\s*<(!doctype|html)/i.test(body)) return { ok: false, message: '/llms.txt returns a web page, not a text file.' };
  if (!/^\s*#\s+\S/.test(body)) return { ok: false, message: '/llms.txt should start with a “# ” title line.' };
  return { ok: true, message: `Present (${body.trim().split(/\r?\n/).length} lines).` };
}

/* ── Reading back ────────────────────────────────────────────────────────────────────────────────────────────────── */

/** For each check, the rows from its most recent date. */
export function latestByCheck(rows: HealthRow[]): Partial<Record<HealthCheck, { date: string; rows: HealthRow[] }>> {
  const out: Partial<Record<HealthCheck, { date: string; rows: HealthRow[] }>> = {};
  for (const r of rows) {
    const k = r.check_key as HealthCheck;
    if (!HEALTH_CHECKS.includes(k)) continue;
    const cur = out[k];
    if (!cur || r.date > cur.date) out[k] = { date: r.date, rows: [r] };
    else if (r.date === cur.date) cur.rows.push(r);
  }
  return out;
}

/** Problems per check for a summary (the monthly report, the tiles): page rows that failed, ignoring the '' summary row. */
export function healthSummary(latest: ReturnType<typeof latestByCheck>): { check: HealthCheck; label: string; date: string; checked: number; problems: number }[] {
  return HEALTH_CHECKS.filter((k) => latest[k]).map((k) => {
    const l = latest[k]!;
    const pageRows = l.rows.filter((r) => r.url !== '');
    const rows = pageRows.length ? pageRows : l.rows;
    return { check: k, label: HEALTH_LABEL[k], date: l.date, checked: rows.length, problems: rows.filter((r) => !r.ok).length };
  });
}
