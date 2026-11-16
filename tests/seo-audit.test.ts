import { describe, expect, it } from 'vitest';
import { blockedCrawlers, compareAudits, duplicates, findingsFor, parsePage, summarise, type Audit, type PageAudit } from '@/lib/seo/shared';

const good = `<html><head><title>Solar panels in Cardiff: free survey and fixed price | Heliaxis</title>
<meta name="description" content="Heliaxis fits MCS-certified solar panels and batteries across South Wales and the South West. Book a free survey and get a fixed written price."/>
<link rel="canonical" href="https://heliaxis.co.uk/solar"/><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"LocalBusiness"},{"@type":"FAQPage"}]}</script></head>
<body><h1>Solar panels</h1><img src="/a.jpg" alt="Roof"><img src="/b.jpg" alt=""><a href="/book-a-survey?x=1#top">Book</a> ${'word '.repeat(200)}</body></html>`;

describe('parsePage', () => {
  it('reads the title, description, headings, images, schema and links', () => {
    const p = parsePage(good, '/solar', 200, 300);
    expect(p.title).toContain('Solar panels in Cardiff');
    expect(p.description.length).toBeGreaterThan(70);
    expect(p.h1).toBe(1);
    expect(p.imgs).toBe(2);
    expect(p.imgsNoAlt).toBe(0); // an empty alt is deliberate
    expect(p.jsonld).toEqual(['LocalBusiness', 'FAQPage']);
    expect(p.canonical).toBe('https://heliaxis.co.uk/solar');
    expect(p.links).toEqual(['/book-a-survey']);
    expect(findingsFor(p)).toEqual([]);
  });
  it('finds the problems', () => {
    const bad = parsePage('<html><head><title>Hi</title><meta content="noindex" name="robots"></head><body><h1>a</h1><h1>b</h1><img src="x.jpg"></body></html>', '/x', 200, 4000);
    const codes = findingsFor(bad).map((f) => f.code);
    for (const c of ['title-short', 'desc-missing', 'h1-many', 'img-alt', 'noindex', 'canonical', 'thin', 'slow']) expect(codes).toContain(c);
  });
  it('a page that fails is one high finding', () => {
    expect(findingsFor(parsePage('', '/gone', 404, 100))).toEqual([{ code: 'status', severity: 'high', message: 'The page answers 404.' }]);
  });
});

const audit = (pages: Partial<PageAudit>[], id = '2026-11-16'): Audit => {
  const full = pages.map((p) => ({ ...parsePage(good, p.path ?? '/a', 200, 100), ...p, findings: p.findings ?? [] })) as PageAudit[];
  return { id, at: id, pages: full, site: [], summary: summarise(full, []) };
};

describe('weekly comparison', () => {
  it('says what was fixed and what is new', () => {
    const before = audit([{ path: '/a', findings: [{ code: 'desc-missing', severity: 'high', message: 'No meta description.' }] }, { path: '/b', findings: [] }], '2026-11-09');
    const now = audit([{ path: '/a', findings: [] }, { path: '/b', findings: [{ code: 'h1-missing', severity: 'high', message: 'No main heading (h1).' }] }]);
    const c = compareAudits(before, now);
    expect(c.fixed).toEqual(['/a: No meta description.']);
    expect(c.appeared).toEqual(['/b: No main heading (h1).']);
    expect(c.scoreBefore).toBe(50);
    expect(c.scoreNow).toBe(50);
  });
  it('a page that has gone is not "fixed"', () => {
    const before = audit([{ path: '/old', findings: [{ code: 'desc-missing', severity: 'high', message: 'No meta description.' }] }], '2026-11-09');
    expect(compareAudits(before, audit([{ path: '/a' }])).fixed).toEqual([]);
  });
  it('the first check has nothing to compare', () => {
    expect(compareAudits(null, audit([{ path: '/a' }]))).toMatchObject({ fixed: [], appeared: [], scoreBefore: null });
  });
});

describe('site checks', () => {
  it('spots AI crawlers that are blocked, and not search in general', () => {
    const robots = 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nUser-agent: PerplexityBot\nDisallow: /\n\nUser-agent: Googlebot\nDisallow: /private';
    expect(blockedCrawlers(robots).sort()).toEqual(['ClaudeBot', 'GPTBot', 'PerplexityBot']);
    expect(blockedCrawlers('User-agent: *\nDisallow: /')).toEqual([]);
  });
  it('finds shared titles', () => {
    const pages = [{ path: '/a', title: 'Same' }, { path: '/b', title: 'same' }, { path: '/c', title: 'Other' }].map((p) => ({ ...parsePage(good, p.path, 200, 1), title: p.title, findings: [] })) as PageAudit[];
    expect(duplicates(pages, 'title')).toEqual([{ text: 'same', paths: ['/a', '/b'] }]);
  });
});
