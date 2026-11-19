import { describe, expect, it } from 'vitest';
import {
  canonicalProblems,
  extractJsonLd,
  healthSummary,
  keyPages,
  latestByCheck,
  llmsVerdict,
  orphanPages,
  readInspection,
  readLighthouse,
  schemaVerdict,
  sitemapCoverage,
  sitemapLocs,
  sitemapStatus,
  toPath,
  validateSchema,
  type HealthRow,
} from '@/lib/search/health/checks';
import { addMonthsIso, allowedNumbers, comparisonFor, monthPeriods, monthlyStatus, periodHeadline, periodWords, reportTables, reportTextProblems, reportTitle, toCsv, ukMidnight, type StoredNumbers } from '@/lib/search/reporting/shape';
import { delta } from '@/lib/search/maths';

const BASE = 'https://heliaxis.co.uk';
const HOST = 'heliaxis.co.uk';
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

describe('paths and the sitemap', () => {
  it('normalises paths and drops other hosts', () => {
    expect(toPath('https://heliaxis.co.uk/solar-panels/', HOST)).toBe('/solar-panels');
    expect(toPath('https://www.heliaxis.co.uk/', HOST)).toBe('/');
    expect(toPath('https://example.com/x', HOST)).toBeNull();
    expect(toPath('blog/a?x=1#y')).toBe('/blog/a');
  });

  it('reads <loc> entries once each, our host only', () => {
    const xml = `<urlset><url><loc>https://heliaxis.co.uk</loc></url><url><loc> https://heliaxis.co.uk/blog/a/ </loc></url><url><loc>https://heliaxis.co.uk/blog/a</loc></url><url><loc>https://other.com/z</loc></url></urlset>`;
    expect(sitemapLocs(xml, HOST)).toEqual(['/', '/blog/a']);
  });

  it('finds published pages and posts missing from the sitemap, with sitemap.ts rules', () => {
    const r = sitemapCoverage({
      sitemap: ['/', '/solar-panels', '/blog/how-much'],
      cmsPages: [
        { slug: '/', html: '<p>x</p>' },
        { slug: 'solar-panels', html: '<p>x</p>' },
        { slug: '/batteries', html: '<p>x</p>' },
        { slug: '/hidden', html: '<p>x</p>', seo: { noindex: true } },
        { slug: '/empty', html: '  ' },
        { slug: '/blog/editor-article', html: '<p>x</p>' },
      ],
      postSlugs: ['how-much', 'new-post'],
    });
    expect(r.expected).toEqual(['/', '/solar-panels', '/batteries', '/blog/how-much', '/blog/new-post']);
    expect(r.missing).toEqual(['/batteries', '/blog/new-post']);
  });

  it('reads Search Console’s sitemap report', () => {
    expect(sitemapStatus([], `${BASE}/sitemap.xml`).submitted).toBe(false);
    const ok = sitemapStatus([{ path: `${BASE}/sitemap.xml`, errors: '0', warnings: '0', lastDownloaded: '2026-11-17T03:00:00Z', contents: [{ type: 'web', submitted: '42' }] }], `${BASE}/sitemap.xml`);
    expect(ok).toMatchObject({ ok: true, errors: 0, submittedUrls: 42 });
    expect(sitemapStatus([{ path: `${BASE}/sitemap.xml`, errors: '2' }], `${BASE}/sitemap.xml`)).toMatchObject({ ok: false, errors: 2 });
  });

  it('picks key pages: home, Search Console impressions, pinned, then the sitemap', () => {
    const pages = keyPages(
      {
        host: HOST,
        gsc: [
          { page: `${BASE}/b`, impressions: 10 },
          { page: `${BASE}/a`, impressions: 50 },
          { page: `${BASE}/b`, impressions: 45 },
          { page: 'https://other.com/x', impressions: 999 },
        ],
        pinned: ['/new-page'],
        sitemap: ['/', '/a', '/c', '/d'],
      },
      5,
    );
    expect(pages).toEqual(['/', '/b', '/a', '/new-page', '/c']);
  });
});

describe('orphans and canonicals', () => {
  const pages = [
    { path: '/', status: 200, canonical: `${BASE}/`, noindex: false, links: ['/a', '/b'] },
    { path: '/a', status: 200, canonical: `${BASE}/a`, noindex: false, links: ['/a', '/'] },
    { path: '/b', status: 200, canonical: `${BASE}/a`, noindex: false, links: [] },
    { path: '/c', status: 200, canonical: null, noindex: false, links: ['/c'] },
    { path: '/d', status: 200, canonical: 'http://heliaxis.co.uk/d', noindex: false, links: [] },
    { path: '/e', status: 200, canonical: 'https://elsewhere.com/e', noindex: false, links: [] },
    { path: '/f', status: 200, canonical: `${BASE}/f`, noindex: true, links: [] },
    { path: '/g', status: 404, canonical: null, noindex: false, links: [] },
  ];
  it('an orphan has no links in from another page (self-links don’t count; home never is)', () => {
    expect(orphanPages(pages)).toEqual(['/c', '/d', '/e', '/f']);
  });
  it('flags missing, http, other-site, other-page and noindex-in-sitemap canonicals', () => {
    const p = canonicalProblems(pages, BASE);
    expect(p.map((x) => x.path)).toEqual(['/b', '/c', '/d', '/e', '/f']);
    expect(p.find((x) => x.path === '/b')!.problem).toMatch(/different page/);
    expect(p.find((x) => x.path === '/d')!.problem).toMatch(/http/);
    expect(p.find((x) => x.path === '/e')!.problem).toMatch(/another site/);
    expect(p.find((x) => x.path === '/f')!.problem).toMatch(/noindex/);
  });
});

describe('structured data', () => {
  it('flattens @graph and arrays and counts broken JSON', () => {
    const html = ld({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: 'Heliaxis', url: BASE }, { '@type': 'BreadcrumbList', itemListElement: [] }] }) + '<script type="application/ld+json">{oops</script>';
    const r = extractJsonLd(html);
    expect(r.nodes.map((x) => x['@type'])).toEqual(['Organization', 'BreadcrumbList']);
    expect(r.invalid).toBe(1);
  });

  it('checks the required properties per type', () => {
    const res = validateSchema([
      { '@type': 'HomeAndConstructionBusiness', name: 'Heliaxis', address: { '@type': 'PostalAddress', addressLocality: 'Newport' } },
      { '@type': 'Service', serviceType: 'Solar PV installation' },
      { '@type': 'Article', headline: 'How much do panels cost?', author: { name: 'Cal' } },
      { '@type': 'BreadcrumbList', itemListElement: [{ position: 1, name: 'Home' }, { position: 2, name: 'Solar' }] },
      { '@type': 'FAQPage', mainEntity: [] },
    ]);
    expect(res[0]).toMatchObject({ family: 'LocalBusiness', missing: ['address: streetAddress or postalCode'] });
    expect(res[0].recommended).toContain('telephone');
    expect(res[1].missing).toEqual(['provider']);
    expect(res[2].missing).toEqual(['datePublished']);
    expect(res[3].missing).toEqual(['itemListElement 1: item (only the last may leave it out)']);
    expect(res[4]).toMatchObject({ type: 'FAQPage', missing: [] });
    expect(res[4].note).toMatch(/May 2026/);
  });

  it('gives one verdict a page: FAQ alone never fails it', () => {
    expect(schemaVerdict(ld({ '@type': 'FAQPage' })).ok).toBe(true);
    const good = schemaVerdict(ld({ '@type': ['LocalBusiness', 'Electrician'], name: 'Heliaxis', address: { postalCode: 'NP20' } }));
    expect(good).toMatchObject({ ok: true, types: ['LocalBusiness', 'Electrician'] });
    const badPage = schemaVerdict(ld({ '@type': 'Organization', name: 'Heliaxis' }) + '<script type="application/ld+json">[</script>');
    expect(badPage.ok).toBe(false);
    expect(badPage.problems).toHaveLength(2);
  });
});

describe('index, Lighthouse and llms.txt', () => {
  it('counts a page indexed only on PASS, and spots a different Google canonical', () => {
    expect(readInspection({ inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed', googleCanonical: `${BASE}/a`, userCanonical: `${BASE}/a/` } } })).toMatchObject({ indexed: true, canonicalMismatch: null });
    const r = readInspection({ inspectionResult: { indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'Crawled - currently not indexed', googleCanonical: `${BASE}/b`, userCanonical: `${BASE}/a` } } });
    expect(r).toMatchObject({ indexed: false, coverage: 'Crawled - currently not indexed', canonicalMismatch: `${BASE}/b` });
    expect(readInspection({}).indexed).toBe(false);
  });

  it('reads Lighthouse scores and timings', () => {
    const r = readLighthouse({ categories: { performance: { score: 0.62 }, seo: { score: 1 } }, audits: { 'largest-contentful-paint': { numericValue: 3500.4 }, 'cumulative-layout-shift': { numericValue: 0.0512 } } });
    expect(r).toMatchObject({ performance: 62, seo: 100, lcpMs: 3500, cls: 0.051, ok: true });
    expect(readLighthouse({ categories: { performance: { score: 0.9 } }, audits: { 'largest-contentful-paint': { numericValue: 5200 } } }).ok).toBe(false);
    expect(readLighthouse(null).ok).toBe(false);
  });

  it('wants a real text llms.txt', () => {
    expect(llmsVerdict(404, '').ok).toBe(false);
    expect(llmsVerdict(200, '<!doctype html><html>').ok).toBe(false);
    expect(llmsVerdict(200, '# Heliaxis\n> Solar installer').ok).toBe(true);
  });
});

describe('reading health back', () => {
  it('keeps each check’s latest day and counts its problems', () => {
    const rows: HealthRow[] = [
      { date: '2026-11-17', check_key: 'schema', url: '/', ok: true, detail: {} },
      { date: '2026-11-17', check_key: 'schema', url: '/a', ok: false, detail: {} },
      { date: '2026-11-10', check_key: 'schema', url: '/a', ok: true, detail: {} },
      { date: '2026-11-18', check_key: 'index', url: '/', ok: false, detail: {} },
      { date: '2026-11-17', check_key: 'sitemap', url: '', ok: false, detail: {} },
      { date: '2026-11-17', check_key: 'sitemap', url: '/x', ok: true, detail: {} },
      { date: '2026-11-17', check_key: 'nonsense', url: '', ok: false, detail: {} },
    ];
    const latest = latestByCheck(rows);
    expect(latest.schema?.date).toBe('2026-11-17');
    expect(latest.schema?.rows).toHaveLength(2);
    const sum = healthSummary(latest);
    expect(sum.map((s) => [s.check, s.checked, s.problems])).toEqual([
      ['index', 1, 1],
      ['sitemap', 1, 0],
      ['schema', 2, 1],
    ]);
  });
});

/* ── Reports ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

const tile = (key: string, now: number | null, before: number | null) => ({ key, label: key, source: `src:${key}`, delta: delta(now, before), spark: [] });
const numbers = (over: Partial<StoredNumbers> = {}): StoredNumbers => ({
  tiles: [tile('organic_enquiries', 4, 2), tile('clicks', 120, 100), tile('impressions', 5000, 4000), tile('avg_position', 18.4, 20.1), tile('top3', 2, 1), tile('visibility', 7.5, 6)],
  winners: [{ keywordId: 1, label: 'solar panels newport', before: 14, now: 6, volume: 90, moved: 8 }],
  losers: [{ keywordId: 2, label: 'heat pump cardiff', before: 9, now: null, volume: 50, moved: -92 }],
  leads: [{ channel: 'organic_google', now: 3, before: 1 }, { channel: 'untracked', now: 0, before: 2 }],
  freshness: { gscTo: '2026-10-31', serpRun: '2026-10-27' },
  rankRunDates: { now: '2026-10-27', before: '2026-09-29' },
  ...over,
});

describe('report periods', () => {
  it('clamps month arithmetic', () => {
    expect(addMonthsIso('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsIso('2026-01-15', -12)).toBe('2025-01-15');
  });
  it('the Growth Report covers the month just ended, against the one before and a year earlier', () => {
    const m = monthPeriods('2026-11-03');
    expect(m.period).toMatchObject({ start: '2026-10-01', end: '2026-10-31', compareStart: '2026-09-01', compareEnd: '2026-09-30' });
    expect(m.yearAgo).toEqual({ start: '2025-10-01', end: '2025-10-31' });
    expect(monthPeriods('2026-01-06').period).toMatchObject({ start: '2025-12-01', end: '2025-12-31', compareStart: '2025-11-01' });
  });
  it('is provisional until Search Console has the last day', () => {
    expect(monthlyStatus('2026-10-31', '2026-11-03')).toBe('provisional');
    expect(monthlyStatus('2026-10-31', '2026-11-04')).toBe('final');
  });
  it('counts enquiries by UK day (BST shifts midnight an hour back)', () => {
    expect(ukMidnight('2026-07-01')).toBe('2026-06-30T23:00:00.000Z');
    expect(ukMidnight('2026-12-01')).toBe('2026-12-01T00:00:00.000Z');
  });
  it('compares a custom period with the days before or a year earlier', () => {
    expect(comparisonFor('2026-10-01', '2026-10-14', 'previous')).toEqual({ compareStart: '2026-09-17', compareEnd: '2026-09-30' });
    expect(comparisonFor('2026-10-01', '2026-10-14', 'year')).toEqual({ compareStart: '2025-10-01', compareEnd: '2025-10-14' });
  });
});

describe('report words obey the number rule', () => {
  it('writes the headline only from the snapshot', () => {
    const n = numbers({ yearAgo: { organic_enquiries: delta(4, 1) }, content: { published: [{ title: 'Solar Newport', slug: '/solar-panels-newport', publishedAt: '2026-10-12T09:00:00Z' }], inReview: 2 } });
    const lines = periodHeadline(n, periodWords('monthly'));
    expect(lines[0]).toBe('Organic enquiries: 4 this month against 2 the month before, and 1 in the same month last year.');
    expect(lines[3]).toBe('1 new page was published this month.');
    expect(reportTextProblems(lines, n)).toEqual([]);
    expect(allowedNumbers(n)).toContain(92);
  });
  it('rejects a number that is not in the snapshot', () => {
    expect(reportTextProblems(['Organic enquiries rose to 7.'], numbers())).toEqual(['7']);
  });
});

describe('report tables, titles and CSV', () => {
  it('shares one set of tables across the screen, PDF, email and CSV', () => {
    const weekly = reportTables({ kind: 'weekly', numbers: numbers({ fourWeek: { clicks: 110 } }) });
    expect(weekly.map((t) => t.key)).toEqual(['measures', 'movers', 'leads']);
    expect(weekly[0].columns).toEqual(['Measure', 'Source', 'This week', 'Last week', 'Change', 'Change %', '4-week average']);
    expect(weekly[0].rows[1]).toEqual(['clicks', 'src:clicks', '120', '100', '+20', '+20%', '110']);
    expect(weekly[0].rows[0][5]).toBe('small numbers');
    expect(weekly[1].rows[1]).toEqual(['heat pump cardiff', '9', 'not in top 100', '-92']);
    expect(weekly[2].rows[1][0]).toBe('Before tracking began');

    const monthly = reportTables({ kind: 'monthly', numbers: numbers({ yearAgo: { clicks: delta(120, 80) }, health: [{ check: 'schema', label: 'Structured data', date: '2026-11-03', checked: 20, problems: 3 }] }) });
    expect(monthly[0].columns[6]).toBe('Same month last year');
    expect(monthly[0].rows[1][6]).toBe('80');
    expect(monthly.at(-1)).toMatchObject({ key: 'health', rows: [['Structured data', '20', '3', '2026-11-03']] });

    const custom = reportTables({ kind: 'custom', numbers: numbers({ sections: ['leads'], view: { periodKey: 'last_month', compare: 'year', sections: ['leads'] } }) });
    expect(custom.map((t) => t.key)).toEqual(['leads']);
    expect(custom[0].columns).toEqual(['Channel', 'This period', 'A year earlier']);
  });

  it('names reports by kind', () => {
    expect(reportTitle({ kind: 'monthly', name: null, period_start: '2026-10-01', period_end: '2026-10-31' })).toBe('Growth Report, October 2026');
    expect(reportTitle({ kind: 'weekly', name: null, period_start: '2026-11-09', period_end: '2026-11-15' })).toBe('Weekly report, 9 Nov to 15 Nov 2026');
    expect(reportTitle({ kind: 'custom', name: 'Tier 1', period_start: '2026-10-01', period_end: '2026-10-31' })).toBe('Tier 1');
  });

  it('writes CSV with quoting and no spreadsheet formulas', () => {
    const csv = toCsv([{ key: 'movers', title: 'Winners, losers', source: 's', columns: ['Search', 'Moved'], rows: [['=HYPERLINK("x")', '-3'], ['say "hi"', '+2']] }]);
    expect(csv.split('\r\n')).toEqual(['"Winners, losers"', 'Source: s', 'Search,Moved', `"'=HYPERLINK(""x"")",-3`, '"say ""hi""",+2', '']);
  });
});

describe('the report PDF', () => {
  it('builds in the document kit from a stored report', async () => {
    const { reportPdf } = await import('@/lib/search/reporting/server');
    const bytes = await reportPdf({
      id: 1,
      kind: 'monthly',
      name: null,
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      compare_start: '2026-09-01',
      compare_end: '2026-09-30',
      status: 'final',
      numbers: numbers({ yearAgo: { clicks: delta(120, 80) }, content: { published: [], inReview: 0 }, health: [{ check: 'schema', label: 'Structured data', date: '2026-11-03', checked: 20, problems: 3 }] }),
      text: { headline: ['Organic enquiries: 4 this month against 2 the month before.'] },
      created_at: '2026-11-03T08:00:00Z',
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  }, 30_000);
});
