import { describe, expect, it } from 'vitest';
import { canPublish, canSubmit, claimsCheck, lengthChecks, linksCheck, numbersIn, originalityCheck, runChecks, schemaCheck, type CheckInput } from '@/lib/search/studio/checks';
import { buildBrief, guessPageType, sharedSubtopics, type BriefTarget } from '@/lib/search/studio/brief';
import { normaliseProof, packageProof, proofStatus, requiredProof } from '@/lib/search/studio/proof';
import { overlap, shingles, internalLinks, blocksText } from '@/lib/search/studio/text';
import { buildSchema, publicPath, writerBrief } from '@/lib/search/studio/writer';
import { suggestEdits } from '@/lib/search/studio/refresh';
import { bestPosition, dueDays, gscTotals, hasMoved } from '@/lib/search/studio/measure';
import type { Draft, Proof } from '@/lib/search/studio/types';
import { claimedAhead, publishInFlight } from '@/lib/search/studio/publish-lock';
import { aiCapMessage, draftWaitSeconds } from '@/lib/search/ai-cap';
import { casCmsKv, CMS_BUSY, type KvDb } from '@/lib/cms-kv-cas';
import { keepRenderedPages, keepStudioPages } from '@/lib/cms-studio-merge';
import { publishOneBlogInState } from '@/lib/blog/publish-one';
import { buildCmsArticlePage, placeholderCmsArticleAi } from '@/lib/blog/cms-article-template';
import { jsonLdScript } from '@/lib/seo/json-ld';

const business = { name: 'Heliaxis', phone: '01633 965205', credentials: ['MCS', 'RECC', 'NAPIT'] };
const rules = { bannedClaims: ['NICEIC', 'TrustMark', 'award-winning', '#1'], originalityMaxOverlap: 0.3, weeklyNewPages: 3 };
const towns = ['Cardiff', 'Newport', 'Swansea', 'Bridgend'];

const pkg = packageProof({ id: 'p1', name: 'Essentials 10', min_panels: 10, max_panels: null, panel_watts: 440, usable_kwh: 5.12, price_inc_vat: 8995, active: true }, '2026-11-19');

function proof(extra: Partial<Proof> = {}): Proof {
  return normaliseProof({
    projects: [{ town: 'Cardiff', sizeKwp: 4.4, batteryKwh: 5.12, date: '2026-09', summary: 'Semi-detached, south-west roof.', photoUrl: 'https://x/p.jpg', photoPermission: true }],
    reviews: [{ quote: 'Tidy job, explained everything.', name: 'Sian', town: 'Cardiff', source: 'Google', date: '2026-10-01', stars: 5 }],
    packages: [pkg],
    figures: [{ label: 'Typical household use', value: '2,700 kWh a year', source: 'Ofgem TDCV', checked: '2026-11-01' }],
    dno: 'National Grid Electricity Distribution (South Wales)',
    council: 'Cardiff Council',
    author: { name: 'Cal', role: 'Founder', bio: 'Runs Heliaxis.', photo: '' },
    ...extra,
  });
}

const TOWN_PAGE = `Solar panels in Cardiff, fitted by a local MCS-certified team. We survey your roof, design the system around how your household uses power, and handle the paperwork with the network operator before a single panel goes up. Most homes in Cardiff have the space for a useful array, and our installers explain the shading, the roof structure and the export limits in plain words. After switch-on we register the system, set up the monitoring app and stay on hand for aftercare. Book a free survey and we will visit within a week to measure up and talk through the options with you, with no pressure and no hard sell at any point.`;

function draft(text: string, extra: Partial<Draft> = {}): Draft {
  return {
    kind: 'cms_page',
    title: 'Solar Panels in Newport | MCS Installers Near You Today',
    description: 'Solar panels in Newport fitted by a local MCS-certified installer. Free survey, honest design and aftercare from a team that knows your area.',
    slug: 'solar-panels-newport',
    blocks: [
      { t: 'hero', p: { headline: 'Solar panels in Newport', ctaHref: '#quote' } },
      { t: 'rich', p: { html: `<p>${text}</p><p>See <a href="/solar-estimator">the estimator</a>, <a href="/free-solar-quote">a quote</a> and <a href="/battery-storage">batteries</a>.</p>` } },
    ],
    schema: JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Service', name: 'Solar', provider: { name: 'Heliaxis' } }] }),
    model: 'test',
    writtenAt: '2026-11-19T00:00:00Z',
    lastChecked: '2026-11-19',
    ...extra,
  };
}

const base = (d: Draft, p = proof()): CheckInput => ({ draft: d, proof: p, business, rules, ours: [], rivals: [], towns });

describe('phase 3 gate: claims', () => {
  it('blocks a draft that says NICEIC', () => {
    const r = claimsCheck(base(draft('We are NICEIC approved electricians and fit solar across the city.')));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.text.includes('NICEIC'))).toBe(true);
  });

  it('blocks NICEIC hidden in the schema too', () => {
    const d = draft('Plain words.', { schema: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Heliaxis', award: 'NICEIC' }) });
    expect(claimsCheck(base(d)).ok).toBe(false);
  });

  it('blocks a price that is not in pv_packages', () => {
    const r = claimsCheck(base(draft('A 10-panel system costs £7,499 including VAT (last checked 19 November 2026).')));
    expect(r.ok).toBe(false);
    expect(r.issues[0].text).toContain('£7,499');
  });

  it('passes the package price, its size and a proof figure', () => {
    const r = claimsCheck(base(draft('Our Essentials 10 package is £8,995 including VAT for 4.4 kWp with a 5.12 kWh battery (last checked 19 November 2026). A typical home uses 2,700 kWh a year. Call 01633 965205.')));
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('blocks a made-up saving or percentage', () => {
    expect(claimsCheck(base(draft('Most customers save 70% on their bills.'))).ok).toBe(false);
    expect(claimsCheck(base(draft('You could save £600 a year.'))).ok).toBe(false);
  });

  it('a £ amount only matches a package price or a figure marked as money', () => {
    const kwh = proof({ projects: [{ town: 'Cardiff', sizeKwp: 4.4, batteryKwh: 5.12, date: '2026-09', summary: 'Semi-detached, saves 600 kWh a year.', photoUrl: '', photoPermission: false }] });
    expect(claimsCheck(base(draft('It saves 600 kWh a year.'), kwh)).ok).toBe(true);
    expect(claimsCheck(base(draft('You could save £600 a year.'), kwh)).ok).toBe(false);
    // The 5-star review is not a price.
    expect(claimsCheck(base(draft('Systems from £5 a week.'))).ok).toBe(false);
    expect(claimsCheck(base(draft('Rated 5 stars on Google.'))).ok).toBe(true);
    // A figure is money only when a person ticked it.
    const fig = (money: boolean) => proof({ figures: [{ label: 'Average saving', value: '£450 a year', source: 'Our 2026 installs', checked: '2026-11-01', money }] });
    expect(claimsCheck(base(draft('Customers save £450 a year on average.'), fig(false))).ok).toBe(false);
    expect(claimsCheck(base(draft('Customers save £450 a year on average.'), fig(true))).ok).toBe(true);
    expect(normaliseProof({ figures: [{ value: '£1', money: 'yes' }] }).figures[0].money).toBe(false);
  });

  it('allows MCS, RECC and NAPIT but not another scheme or a banned claim', () => {
    expect(claimsCheck(base(draft('We are MCS certified, RECC members and NAPIT registered.'))).ok).toBe(true);
    expect(claimsCheck(base(draft('An award-winning team.'))).ok).toBe(false);
    expect(claimsCheck(base(draft('TrustMark registered.'))).ok).toBe(false);
    expect(claimsCheck({ ...base(draft('We are NAPIT registered.')), business: { ...business, credentials: ['MCS', 'RECC'] } }).ok).toBe(false);
  });

  it('ignores dates, years, step numbers and the phone number', () => {
    expect(numbersIn('Step 3 of 5. Since 2019. Last checked 19 November 2026 or 2026-11-19. Call 01633 965205.', { phone: '01633 965205' })).toEqual([]);
    expect(numbersIn('NP20 and CF10 postcodes').length).toBe(0);
    expect(numbersIn('£8,995 and 4.4 kWp and 25 years').map((n) => n.value)).toEqual([8995, 4.4, 25]);
  });
});

describe('phase 3 gate: originality', () => {
  it('blocks a town-swapped copy of one of our pages', () => {
    const copy = TOWN_PAGE.replace(/Cardiff/g, 'Newport');
    const r = originalityCheck({ ...base(draft(copy)), ours: [{ path: '/solar-panels-cardiff', title: 'Solar panels Cardiff', text: TOWN_PAGE }] });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('/solar-panels-cardiff');
  });

  it('blocks copying a rival page', () => {
    const r = originalityCheck({ ...base(draft(TOWN_PAGE)), rivals: [{ url: 'https://rival.co.uk/solar', text: `Intro. ${TOWN_PAGE} Outro.` }] });
    expect(r.ok).toBe(false);
  });

  it('passes original text', () => {
    const own = 'Newport homes on the Malpas side often have shallow hipped roofs, so we usually split the array across two faces and pair it with a battery sized to evening use. The survey takes about an hour and we bring drone photos back to the office before designing anything.';
    const r = originalityCheck({ ...base(draft(own)), ours: [{ path: '/solar-panels-cardiff', title: 'Cardiff', text: TOWN_PAGE }] });
    expect(r.ok).toBe(true);
  });

  it('the shingle overlap is a share of the draft', () => {
    const a = shingles('one two three four five six', []);
    expect(a.size).toBe(2);
    expect(overlap(a, shingles('one two three four five', []))).toBe(0.5);
  });
});

describe('the other blocking checks', () => {
  it('title 50–60 and description 120–158 characters', () => {
    const [t, d] = lengthChecks({ title: 'Too short', description: 'Also short' });
    expect(t.ok).toBe(false);
    expect(d.ok).toBe(false);
    const [t2, d2] = lengthChecks(draft('x'));
    expect(t2.ok).toBe(true);
    expect(d2.ok).toBe(true);
  });

  it('schema must parse and carry the required fields', () => {
    expect(schemaCheck('{not json').ok).toBe(false);
    expect(schemaCheck(JSON.stringify({ '@type': 'Service', name: 'x' })).ok).toBe(false);
    expect(schemaCheck(JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ position: 1, name: 'Home', item: 'https://h/' }] })).ok).toBe(true);
  });

  it('needs at least 3 internal links, not counting the page itself or the quote anchor', () => {
    expect(linksCheck(draft('Words.'), 'https://heliaxis.co.uk').ok).toBe(true);
    const few = draft('Words.', { blocks: [{ t: 'rich', p: { html: '<p><a href="/solar-panels-newport">me</a> <a href="#quote">q</a> <a href="https://heliaxis.co.uk/blog">b</a> <a href="https://other.com/x">o</a></p>' } }] });
    expect(linksCheck(few, 'https://heliaxis.co.uk').ok).toBe(false);
    expect(internalLinks(['/a', '/a/', 'https://www.heliaxis.co.uk/b?x=1', '#quote'], { site: 'https://heliaxis.co.uk' })).toEqual(['/a', '/b']);
  });

  it('the weekly new-page limit blocks the fourth page, not a refresh', () => {
    const c = runChecks({ ...base(draft('Plain words with no figures.')), publishedThisWeek: 3 });
    expect(c.results.find((r) => r.key === 'limit')?.ok).toBe(false);
    const r = runChecks({ ...base(draft('Plain words.')), publishedThisWeek: 3, mode: 'refresh' });
    expect(r.results.find((x) => x.key === 'limit')?.ok).toBe(true);
  });
});

describe('phase 3 gate: approval', () => {
  const passing = runChecks(base(draft('Plain words with no figures at all, written for people in Newport.')));
  it('a clean draft passes every blocking check', () => {
    expect(passing.results.filter((r) => r.blocking && !r.ok)).toEqual([]);
    expect(passing.ok).toBe(true);
  });
  it('nothing publishes without an admin', () => {
    expect(canPublish({ status: 'in_review', approved_by: null }, 'editor', passing).ok).toBe(false);
    expect(canPublish({ status: 'in_review', approved_by: null }, 'viewer', passing).ok).toBe(false);
    expect(canPublish({ status: 'in_review', approved_by: null }, 'admin', passing).ok).toBe(true);
  });
  it('nothing publishes straight from a draft, or with a failing check', () => {
    expect(canPublish({ status: 'draft', approved_by: null }, 'owner', passing).ok).toBe(false);
    const failing = runChecks(base(draft('NICEIC approved.')));
    expect(canPublish({ status: 'in_review', approved_by: null }, 'owner', failing).ok).toBe(false);
    expect(canSubmit('draft', failing).ok).toBe(false);
    expect(canSubmit('draft', passing).ok).toBe(true);
  });
});

describe('brief', () => {
  const target: BriefTarget = { name: 'Solar panels Newport', primary: 'solar panels newport', phrases: ['solar panels newport', 'solar installers newport'], keywordIds: [1, 2], service: 'solar', town: 'Newport', intent: 'local_commercial', pageType: 'town', action: 'create', targetPage: null };
  const facts = [1, 2, 3, 4].map((i) => ({
    url: `https://r${i}.co.uk/`,
    words: 1000 + i * 100,
    headings: [
      { level: 2, text: i % 2 ? 'How much do solar panels cost in Newport?' : 'Solar panel costs in Cardiff' },
      { level: 2, text: 'Our installation process' },
      { level: 2, text: `Unique heading ${i}` },
    ],
    questions: ['Do I need planning permission for solar panels?'],
    schema: ['LocalBusiness'],
    page_type: 'town',
    prices_shown: true,
  }));
  const top10 = facts.map((f, i) => ({ pos: i + 1, domain: `r${i + 1}.co.uk`, url: f.url, title: `Solar panels Newport ${i}` }));

  it('takes shared subtopics from the top 10 headings, and the word range from their median', () => {
    const b = buildBrief({ target, serpDate: '2026-11-16', top10, facts, teardown: null, paa: ['Are solar panels worth it in Wales?'], ours: [{ path: '/solar-panels', title: 'Solar panels' }, { path: '/free-solar-quote', title: 'Free solar quote' }, { path: '/battery-storage', title: 'Battery storage' }], towns, now: new Date('2026-11-19') });
    const shared = b.outline.filter((o) => o.source === 'shared');
    expect(shared.length).toBeGreaterThanOrEqual(2);
    expect(shared[0].why).toMatch(/4 of 4/);
    expect(b.words.median).toBe(1250);
    expect(b.words.min).toBeLessThanOrEqual(1250);
    expect(b.questions).toContain('Are solar panels worth it in Wales?');
    expect(b.notes.join(' ')).toMatch(/No teardown/);
    expect(b.linksOut.map((l) => l.path)).toContain('/solar-panels');
    expect(b.schema).toContain('LocalBusiness');
  });

  it('still briefs from the top-10 titles when there are no facts and no teardown', () => {
    const titles = ['Solar panel cost Newport', 'Solar panels Newport: cost and grants', 'Newport solar grants', 'Best solar installer Newport'].map((title, i) => ({ pos: i + 1, domain: 'x', url: `https://x${i}`, title }));
    const b = buildBrief({ target, serpDate: '2026-11-16', top10: titles, facts: [], teardown: null, paa: [], ours: [], towns });
    expect(b.outline.some((o) => o.source === 'titles')).toBe(true);
    expect(b.words.median).toBeNull();
    expect(b.notes.join(' ')).toMatch(/top-10 titles/);
  });

  it('groups similar headings', () => {
    const s = sharedSubtopics(facts, towns);
    expect(s.find((x) => /cost/i.test(x.h2))?.count).toBe(4);
  });

  it('guesses the page type', () => {
    expect(guessPageType({ town: null, intent: 'informational', primary: 'how much do solar panels cost' })).toBe('cost_guide');
    expect(guessPageType({ town: 'Newport', intent: 'local_commercial', primary: 'solar panels for home newport' })).toBe('town');
  });
});

describe('proof pack', () => {
  it('locks drafting until the required items are in', () => {
    const empty = proofStatus(normaliseProof({}), requiredProof({ target: { town: 'Newport', service: 'solar', pageType: 'town' } as BriefTarget }, null));
    expect(empty.ready).toBe(false);
    expect(empty.missing).toContain('The local council');
    expect(proofStatus(proof(), requiredProof({ target: { town: 'Newport', service: 'solar', pageType: 'town' } as BriefTarget }, null)).ready).toBe(true);
  });
  it('a photo only counts with permission', () => {
    const p = proof({ projects: [{ town: 'Cardiff', sizeKwp: 4, batteryKwh: null, date: '', summary: 'x', photoUrl: 'https://x', photoPermission: false }] });
    expect(proofStatus(p, ['photos']).ready).toBe(false);
  });
  it('the settings list wins, and the author is always required', () => {
    expect(requiredProof(null, ['reviews'])).toEqual(['reviews', 'author']);
  });
  it('a package carries its real price and size', () => {
    expect(pkg).toMatchObject({ priceIncVat: 8995, kwp: 4.4, usableKwh: 5.12, panels: '10' });
  });
});

describe('writer brief and schema', () => {
  const b = buildBrief({ target: { name: 'x', primary: 'solar panels newport', phrases: ['solar panels newport'], keywordIds: [], service: 'solar', town: 'Newport', intent: 'local_commercial', pageType: 'town', action: 'create', targetPage: null }, serpDate: null, top10: [], facts: [], teardown: null, paa: [], ours: [], towns });
  const facts = { business: { name: 'Heliaxis', phone: '01633 965205', area: 'South Wales and the South West', credentials: ['MCS', 'RECC', 'NAPIT'], website: 'https://heliaxis.co.uk' }, author: { name: 'Cal', role: 'Founder', bio: 'Bio', photo: '' }, bannedClaims: ['NICEIC'] };
  it('fits the page writer limit and carries the rules and figures', () => {
    const p = writerBrief(b, proof(), facts, { kind: 'cms_page', today: '2026-11-19' });
    expect(p.length).toBeLessThanOrEqual(4000);
    expect(p).toMatch(/first two sentences/);
    expect(p).toMatch(/£8,995/);
    expect(p).toMatch(/last checked 2026-11-19/);
    expect(p).toMatch(/Never write: NICEIC/);
  });
  it('builds valid JSON-LD', () => {
    const s = buildSchema({ types: ['Service', 'LocalBusiness', 'BreadcrumbList'], title: 'T', description: 'D', url: 'https://heliaxis.co.uk/x', site: 'https://heliaxis.co.uk', business: facts.business, author: facts.author, date: '2026-11-19', crumbs: [{ name: 'Home', url: 'https://heliaxis.co.uk/' }] });
    expect(schemaCheck(s).ok).toBe(true);
    const a = buildSchema({ types: ['Article', 'BreadcrumbList'], title: 'T', description: 'D', url: 'u', site: 'https://heliaxis.co.uk', business: facts.business, author: facts.author, date: '2026-11-19', crumbs: [{ name: 'Home', url: 'u' }] });
    expect(schemaCheck(a).ok).toBe(true);
  });
  it('public paths', () => {
    expect(publicPath('blog', 'blog/My Post')).toBe('/blog/my-post');
    expect(publicPath('cms_page', '/solar-panels-newport')).toBe('/solar-panels-newport');
  });
  it('reads the words and links out of CMS blocks', () => {
    const r = blocksText([{ t: 'faq', p: { items: [{ q: 'Q?', a: 'A.' }], anchor: 'faq' } }, { t: 'cta', p: { headline: 'Go', btnHref: '/book-a-survey' } }]);
    expect(r.text).toContain('Q?');
    expect(r.text).not.toContain('faq');
    expect(r.links).toEqual(['/book-a-survey']);
  });
});

describe('refresh mode', () => {
  it('suggests section edits, not a rewrite', () => {
    const b = buildBrief({ target: { name: 'x', primary: 'solar panels newport', phrases: [], keywordIds: [], service: 'solar', town: 'Newport', intent: 'local_commercial', pageType: 'town', action: 'improve', targetPage: '/solar-newport' }, serpDate: null, top10: [], facts: [], teardown: { date: '2026-11-17', summary: { outline: ['H1: Solar panels in Newport', 'H2: Grants and funding in Wales'] } }, paa: ['Do I need planning permission for solar panels?'], ours: [], towns });
    const s = suggestEdits({ brief: b, html: '<h2>About us</h2><p>Short page. £5,000.</p>', title: 'Short', description: 'Short', path: '/solar-newport', towns });
    const kinds = s.map((x) => x.kind);
    expect(kinds).toContain('add');
    expect(kinds).toContain('expand');
    expect(kinds).toContain('answer');
    expect(kinds).toContain('meta');
    expect(kinds).toContain('figures');
    expect(s.find((x) => x.kind === 'add')?.title).toMatch(/Grants/);
    expect(s.some((x) => /H1|Solar panels in Newport/.test(x.title))).toBe(false);
  });
});

describe('measures', () => {
  it('days due', () => {
    expect(dueDays('2026-08-01T10:00:00Z', [], '2026-08-20')).toEqual([14]);
    expect(dueDays('2026-08-01T10:00:00Z', [14], '2026-11-19')).toEqual([28, 56, 90]);
    expect(dueDays('2026-11-18T10:00:00Z', [], '2026-11-19')).toEqual([]);
  });
  it('best position in the window', () => {
    expect(bestPosition([{ date: '2026-08-10', our_pos: 30 }, { date: '2026-08-14', our_pos: 22 }, { date: '2026-08-15', our_pos: 1 }], '2026-08-14')).toBe(22);
  });
  it('Search Console totals for the page only', () => {
    const t = gscTotals([{ date: '2026-08-10', page: 'https://heliaxis.co.uk/solar-newport', clicks: 2, impressions: 40 }, { date: '2026-08-10', page: 'https://heliaxis.co.uk/solar-newport-old', clicks: 9, impressions: 90 }], '/solar-newport', '2026-08-01', '2026-08-31');
    expect(t).toEqual({ clicks: 2, impressions: 40 });
  });
  it('moved or not by day 90', () => {
    const m = (best_pos: number | null, impressions = 0) => ({ day: 90, best_pos, impressions, clicks: 0, enquiries: 0 });
    expect(hasMoved(m(40), m(30))).toBe(true);
    expect(hasMoved(m(40), m(39))).toBe(false);
    expect(hasMoved(m(null), m(80))).toBe(true);
    expect(hasMoved(m(null, 0), m(null, 0))).toBe(false);
  });
});

/* ── Review fixes: publish locking, CMS compare-and-swap, studio pages kept, one article published, caps ── */

describe('publish claim', () => {
  const now = Date.parse('2026-11-19T10:00:00Z');
  it('refuses a retry while a fresh claim has not failed, allows it once failed or stale', () => {
    const row = { status: 'approved', approved_by: 'Cal', approved_at: '2026-11-19T09:59:00Z', checks: {} };
    expect(publishInFlight(row, now)).toMatch(/still being published/);
    expect(publishInFlight({ ...row, checks: { error: 'Publishing failed: x' } }, now)).toBeNull();
    expect(publishInFlight({ ...row, approved_at: '2026-11-19T09:50:00Z' }, now)).toBeNull();
    expect(publishInFlight({ ...row, status: 'in_review' }, now)).toBeNull();
  });
  it('of two claims at once exactly one counts the other against the weekly limit', () => {
    const at = '2026-11-19T10:00:00.000Z';
    const a = { id: 1, approved_at: at };
    const b = { id: 2, approved_at: at };
    expect(claimedAhead({ id: 1, approvedAt: at }, [b])).toBe(0);
    expect(claimedAhead({ id: 2, approvedAt: at }, [a])).toBe(1);
    expect(claimedAhead({ id: 3, approvedAt: '2026-11-19T10:00:01Z' }, [a, b])).toBe(2);
  });
});

describe('AI cap and draft rate limit', () => {
  it('refuses at or over the cap', () => {
    expect(aiCapMessage('writing the draft', 4, 10)).toBeNull();
    expect(aiCapMessage('writing the draft', 10, 10)).toMatch(/monthly cap/);
  });
  it('one draft per page every 2 minutes', () => {
    const t = Date.parse('2026-11-19T10:00:00Z');
    expect(draftWaitSeconds(null, t)).toBe(0);
    expect(draftWaitSeconds('2026-11-19T09:59:30Z', t)).toBe(90);
    expect(draftWaitSeconds('2026-11-19T09:57:59Z', t)).toBe(0);
  });
});

/** An in-memory cms_kv with the calls casCmsKv makes; onRead lets a test save "from another tab" in between. */
function fakeKv(rows: Record<string, { value: string; updated_at: string }>, onRead?: (n: number) => void) {
  let reads = 0;
  let clock = 0;
  const db = {
    from: () => ({
      select: () => ({
        in: async (_c: string, keys: string[]) => {
          const data = keys.filter((k) => rows[k]).map((k) => ({ key: k, ...rows[k] }));
          // Someone else saves after this read and before our write.
          onRead?.(++reads);
          return { data, error: null };
        },
      }),
      update: (row: { value: string; updated_at: string }) => ({
        eq: (_c: string, key: string) => {
          const done = (ok: boolean) => ({
            select: async () => {
              if (!ok) return { data: [], error: null };
              rows[key] = { value: row.value, updated_at: `${row.updated_at}#${++clock}` };
              return { data: [{ key }], error: null };
            },
          });
          return { eq: (_c2: string, at: string) => done(rows[key]?.updated_at === at), is: () => done(false) };
        },
      }),
      insert: async (row: { key: string; value: string; updated_at: string }) => {
        if (rows[row.key]) return { data: null, error: { message: 'dup', code: '23505' } };
        rows[row.key] = { value: row.value, updated_at: row.updated_at };
        return { data: null, error: null };
      },
    }),
  };
  return db as unknown as KvDb;
}

describe('CMS compare-and-swap', () => {
  it('re-reads and re-applies when another save lands in between, keeping both', async () => {
    const rows = { doc: { value: JSON.stringify({ pages: ['home'] }), updated_at: 't0' } };
    const db = fakeKv(rows, (n) => {
      // The editor saves right after our first read.
      if (n === 1) rows.doc = { value: JSON.stringify({ pages: ['home', 'editor-page'] }), updated_at: 't1' };
    });
    await casCmsKv(db, ['doc'], async (v) => {
      const s = JSON.parse(v.doc ?? '{"pages":[]}') as { pages: string[] };
      return { writes: { doc: { pages: [...s.pages.filter((p) => p !== 'studio'), 'studio'] } }, result: null };
    });
    expect(JSON.parse(rows.doc.value).pages).toEqual(['home', 'editor-page', 'studio']);
  });
  it('gives up after 3 clashes with a clear message', async () => {
    let n = 0;
    const rows = { doc: { value: '{}', updated_at: 't0' } };
    const db = fakeKv(rows, () => {
      rows.doc = { value: '{}', updated_at: `other${++n}` };
    });
    await expect(casCmsKv(db, ['doc'], async () => ({ writes: { doc: {} }, result: null }))).rejects.toThrow(CMS_BUSY);
  });
});

describe('studio pages survive a stale editor save', () => {
  const server = JSON.stringify({ pages: [{ id: 'home', slug: '/' }, { id: 'search-7', slug: '/solar-newport', origin: 'search-studio' }, { id: 'b1', slug: '/blog/x', searchStudio: true }, { id: 'old', slug: '/old' }] });
  it('adds back the studio pages the browser lacks, and nothing else', () => {
    const r = keepStudioPages(JSON.stringify({ current: 0, pages: [{ id: 'home', slug: '/' }] }), server);
    expect(JSON.parse(r.value).pages.map((p: { id: string }) => p.id)).toEqual(['home', 'search-7', 'b1']);
    expect(r.kept).toEqual(['/solar-newport', '/blog/x']);
  });
  it('leaves the text alone when nothing is missing or it cannot be read', () => {
    const inc = JSON.stringify({ pages: [{ id: 'search-7', slug: '/solar-newport' }, { id: 'b1', slug: '/blog/x' }] });
    expect(keepStudioPages(inc, server)).toEqual({ value: inc, kept: [] });
    expect(keepStudioPages('not json', server).value).toBe('not json');
  });
  it('keeps their rendered HTML too', () => {
    const ren = JSON.stringify({ pages: [{ slug: '/solar-newport', html: '<p>x</p>' }, { slug: '/old', html: 'o' }] });
    const out = keepRenderedPages({ css: 'c', pages: [{ slug: '/', html: 'h' }] }, ren, ['/solar-newport']) as { pages: { slug: string }[] };
    expect(out.pages.map((p) => p.slug)).toEqual(['/', '/solar-newport']);
  });
});

describe('publishing one article', () => {
  it('publishes only that article, not others scheduled in the same minute', () => {
    const a = { ...buildCmsArticlePage({ ...placeholderCmsArticleAi(), slug: 'ours' }), id: 'a' };
    const b = { ...buildCmsArticlePage({ ...placeholderCmsArticleAi(), slug: 'theirs' }), id: 'b', blogStatus: 'scheduled' as const, publishAt: '2026-11-19T10:00:30Z' };
    const draft = { pages: [a, b] as Record<string, unknown>[] };
    const published = { pages: [] as Record<string, unknown>[] };
    const out = publishOneBlogInState({ draft, published, rendered: { pages: [] }, id: 'a', nowIso: '2026-11-19T10:00:00Z', css: () => 'css' });
    expect(out.slug).toBe('/blog/ours');
    expect(draft.pages[0].blogStatus).toBe('published');
    expect(draft.pages[1].blogStatus).toBe('scheduled');
    expect(published.pages.map((p) => p.id)).toEqual(['a']);
    expect(out.rendered.pages?.map((p) => p.slug)).toEqual(['/blog/ours']);
  });
});

describe('JSON-LD on the live page', () => {
  it('accepts the stored text or an object, escapes the less-than sign, drops bad JSON', () => {
    expect(jsonLdScript('{"@type":"Service","name":"</script>"}')).toBe('{"@type":"Service","name":"\\u003c/script>"}');
    expect(jsonLdScript({ '@type': 'Service' })).toBe('{"@type":"Service"}');
    expect(jsonLdScript('{bad')).toBeNull();
    expect(jsonLdScript('"just a string"')).toBeNull();
    expect(jsonLdScript(undefined)).toBeNull();
  });
});
