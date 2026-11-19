import { describe, expect, it } from 'vitest';
import { DEFAULT_FACTS, type Facts } from '@/lib/cms/facts';
import { checkPage, checkSite, differentShare, pageKind, parseImage, shingles, stripHtml, type CmsBlockLike, type CmsPageLike } from '@/lib/cms/validate';

const img = (alt = 'A dark kitchen with only the fridge lit', libId = 'lib1') => JSON.stringify({ alt, src: '', libId, decorative: false });
const ctx = (facts: Facts = DEFAULT_FACTS, extra: { pages?: CmsPageLike[]; images?: { id?: string; source?: string; approved?: boolean }[] } = {}) => ({ facts, pageSlugs: ['/', '/solar-panels', '/battery-backup'], images: extra.images ?? [], today: '2026-11-19', pages: extra.pages });
const b = (t: string, p: Record<string, unknown>, id = `${t}-1`): CmsBlockLike => ({ id, t, p });
const para = (n: number) => Array.from({ length: n }, (_, i) => `word${i % 40}`).join(' ');
const codes = (issues: { code: string; level: string }[], level?: string) => issues.filter((i) => !level || i.level === level).map((i) => i.code);

/** A page that follows the spec: intro, four outcomes, two options, proof, explainer, four steps, form, FAQ, final ask. */
const goodPage = (over: Partial<CmsPageLike> = {}): CmsPageLike => ({
  name: 'Battery backup',
  slug: '/battery-backup',
  seo: { title: 'Home Battery Backup for Power Cuts', desc: 'Most solar batteries switch off in a power cut. We design backup so your fridge, lights, broadband and heating keep running. Free survey.' },
  blocks: [
    b('hero', { headline: 'Keep your essentials running in a power cut', sub: 'Backup that keeps the circuits you choose working.', ctaLabel: 'Book my backup survey', ctaHref: '#quote', cta2: 'Call 01633 965205', microtrust: 'MCS-certified · South Wales and the South West · Free survey', bgImg: img() }),
    b('media', { title: 'Why backup has to be designed in', text: para(140), img: img(), eyebrow: 'The short answer' }),
    b('grid', { cols: 4, items: Array.from({ length: 4 }, (_, i) => ({ icon: 'solar', title: `Outcome ${i}`, desc: para(25) })) }),
    b('split', { lt: 'Essential-load backup', ld: para(50), lb: ['Fridge and freezer', 'Lights in key rooms', 'Broadband', 'Heating controls'], lc: 'Plan essential backup', rt: 'Whole-home backup', rd: para(50), rb: ['All sockets', 'Most kitchen appliances', 'Alarms', 'Home office'], rc: 'Plan whole-home backup' }),
    b('gallery', { items: [{ img: img() }] }),
    b('rich', { html: `<h3>Sizing</h3><p>${para(300)}</p>` }),
    b('steps', { items: Array.from({ length: 4 }, (_, i) => ({ title: `Step ${i}`, text: para(20) })) }),
    b('form', { anchor: 'quote' }),
    b('faq', { items: [{ q: 'Does it work?', a: para(50) }] }),
    b('cta', { headline: 'Be ready before the next power cut', btn: 'Talk to an installer', btnHref: '#quote' }),
    b('footer', { about: 'MCS-certified installer.' }),
  ],
  ...over,
});

describe('page kinds', () => {
  it('are read from the address', () => {
    expect(pageKind({ slug: '/' })).toBe('home');
    expect(pageKind({ slug: '/blog/how-much-do-solar-panels-cost' })).toBe('blog');
    expect(pageKind({ slug: '/areas/bristol-and-somerset' })).toBe('area');
    expect(pageKind({ slug: '/case-studies/congress-theatre' })).toBe('case-study');
    expect(pageKind({ slug: '/residential-case-study' })).toBe('case-study');
    expect(pageKind({ slug: '/lp/solar-offer' })).toBe('landing');
    expect(pageKind({ slug: '/battery-backup' })).toBe('service');
  });
});

describe('a page that follows the spec', () => {
  it('has no errors', () => {
    const issues = checkPage(goodPage(), ctx());
    expect(codes(issues, 'error'), JSON.stringify(issues.filter((i) => i.level === 'error'))).toEqual([]);
  });
});

describe('errors (these block Publish)', () => {
  const only = (blocks: CmsBlockLike[], over: Partial<CmsPageLike> = {}, c = ctx()) => checkPage({ ...goodPage(), blocks: [...(goodPage().blocks as CmsBlockLike[]).filter((x) => x.t === 'form'), ...blocks], ...over }, c);

  it('placeholders and CONFIRM markers', () => {
    expect(codes(only([b('hero', { headline: 'Your headline here' })]))).toContain('placeholder');
    expect(codes(only([b('rich', { html: '<p>We install in [[CONFIRM: days]] days.</p>' })]))).toContain('placeholder');
    expect(codes(only([], { name: 'Untitled page' }))).toContain('placeholder');
  });

  it('a page nobody can contact us from', () => {
    const noForm = checkPage({ ...goodPage(), blocks: [b('hero', { headline: 'x', ctaLabel: 'Read on', ctaHref: '/solar-panels' })] }, ctx());
    expect(codes(noForm)).toContain('no-contact');
    // Buttons to #quote are enough: the page opens the quote drawer.
    const drawer = checkPage({ ...goodPage(), blocks: [b('hero', { headline: 'x', ctaLabel: 'Book my survey', ctaHref: '#quote' })] }, ctx());
    expect(codes(drawer)).not.toContain('no-contact');
    // A button with no link chosen goes to the quote form too.
    const implicit = checkPage({ ...goodPage(), blocks: [b('hero', { headline: 'x', ctaLabel: 'Book my survey' })] }, ctx());
    expect(codes(implicit)).not.toContain('no-contact');
  });

  it('links that go nowhere', () => {
    expect(codes(only([b('cta', { btn: 'See options', btnHref: '#options' })]))).toContain('broken-anchor');
    expect(codes(only([b('cta', { btn: 'See options', btnHref: '/solar-panels-cardiff' })]))).toContain('broken-link');
    expect(codes(only([b('cta', { btn: 'See options', btnHref: '/solar-panels' })]))).not.toContain('broken-link');
    expect(codes(only([b('cta', { btn: 'Funding', btnHref: '/commercial-funding' })]))).toContain('link-mismatch');
    expect(codes(only([b('cta', { btn: 'Funding', btnHref: '/commercial-funding' })], { slug: '/commercial', name: 'Commercial' }))).not.toContain('link-mismatch');
  });

  it('pictures: missing, no alt text, AI pictures unapproved or posing as installs', () => {
    expect(codes(only([b('media', { title: 'x', text: 'y', img: '' })]))).toContain('image-empty');
    expect(codes(only([b('explorer', { items: [{ title: 'a', text: 'b', img: '' }] })]))).toContain('image-empty');
    expect(codes(only([b('media', { title: 'x', text: 'y', img: JSON.stringify({ libId: 'a', alt: '' }) })]))).toContain('image-alt');
    expect(codes(only([b('media', { title: 'x', text: 'y', img: JSON.stringify({ libId: 'a', alt: '', decorative: true }) })]))).not.toContain('image-alt');
    const ai = ctx(DEFAULT_FACTS, { images: [{ id: 'lib1', source: 'ai', approved: false }] });
    expect(codes(only([b('media', { title: 'x', text: 'y', img: img() })], {}, ai))).toContain('image-unapproved');
    expect(codes(only([b('gallery', { items: [{ img: img() }] })], {}, ctx(DEFAULT_FACTS, { images: [{ id: 'lib1', source: 'ai', approved: true }] })))).toContain('image-ai-as-install');
    // The hero background is a warning, not an error.
    const heroNoBg = only([b('hero', { headline: 'Keep going', ctaLabel: 'Book', bgImg: '' })]);
    expect(codes(heroNoBg, 'warning')).toContain('image-empty');
    expect(codes(heroNoBg, 'error')).not.toContain('image-empty');
  });

  it('a hero rating or install count that is not on the facts sheet', () => {
    const rated = only([b('hero', { headline: 'x', ctaLabel: 'Book', hideRating: false, ratingValue: '4.9', ratingPlatform: 'Google' })]);
    expect(codes(rated)).toContain('rating-not-in-facts');
    const verified: Facts = { ...DEFAULT_FACTS, rating: { value: '4.8', count: '120', platform: 'Google', verified: true } };
    const ok = only([b('hero', { headline: 'x', ctaLabel: 'Book', hideRating: false, ratingValue: '4.8', ratingPlatform: 'Google' })], {}, ctx(verified));
    expect(codes(ok)).not.toContain('rating-not-in-facts');
    expect(codes(only([b('hero', { headline: 'x', ctaLabel: 'Book', hideRating: true, ratingInstalls: '1200', ratingInstallsLabel: 'installs' })]))).not.toContain('installs-not-in-facts'); // row switched off: nothing is shown
    expect(codes(only([b('hero', { headline: 'x', ctaLabel: 'Book', hideRating: false, ratingInstalls: '1200', ratingInstallsLabel: 'installs' })]))).toContain('installs-not-in-facts');
  });

  it('claims with nothing behind them', () => {
    const text = (t: string) => codes(only([b('rich', { html: `<p>${t}</p>` })]));
    expect(text('Rated 4.9 stars by customers.')).toContain('rating-claim');
    expect(text('We are the best installer in Wales.')).toContain('superlative');
    expect(text('Over 1,200 installs across Wales.')).toContain('count-claim');
    expect(text('With 15 years of experience, we know roofs.')).toContain('years-in-business');
    expect(text('We have been trading since 2009.')).toContain('years-in-business');
    expect(text('Fully NICEIC approved.')).toContain('credential-not-held');
    expect(text('Panels carry a 10-year warranty.')).toContain('warranty-not-in-facts');
    expect(text('Save £2,400 a year.')).toContain('money-figure');
    // The facts sheet's own facts are fine.
    expect(text('Panel manufacturers give 25 to 30 year warranties, and Heliaxis gives a 7-year workmanship warranty.')).not.toContain('warranty-not-in-facts');
    expect(text('Installed at 0% VAT.')).not.toContain('percentage-figure');
    expect(text('We are MCS and RECC registered.')).not.toContain('credential-not-held');
  });

  it('a funding route that has ended', () => {
    const late = { ...ctx(), today: '2027-04-02' };
    expect(codes(only([b('rich', { html: '<p>Enjoy 0% VAT on your install.</p>' })], {}, late))).toContain('funding-expired');
    expect(codes(only([b('rich', { html: '<p>Enjoy 0% VAT on your install.</p>' })]))).not.toContain('funding-expired');
  });

  it('testimonials and case studies must be approved ones', () => {
    const sample = b('testi', { items: [{ stars: 5, quote: 'Neat and tidy.', name: 'Sarah M.', loc: 'Cardiff' }] });
    expect(codes(only([sample]))).toContain('testimonial-not-approved');
    const withFacts: Facts = { ...DEFAULT_FACTS, testimonials: [{ id: 't1', name: 'Sarah M.', town: 'Cardiff', product: 'Solar', quote: 'Neat and tidy.', date: '2026-10-01', source: 'https://example.com' }] };
    expect(codes(only([sample], {}, ctx(withFacts)))).not.toContain('testimonial-not-approved');
    expect(codes(only([sample], {}, ctx(withFacts)))).toContain('testimonial-not-marked');
    expect(codes(only([{ ...sample, p: { ...sample.p, approved: true } }], {}, ctx(withFacts)))).not.toContain('testimonial-not-marked');
    expect(codes(only([b('casestudy', { title: 'Congress Theatre', items: [] })]))).toContain('casestudy-not-approved');
    const cs: Facts = { ...DEFAULT_FACTS, caseStudies: [{ id: 'c1', title: 'Congress Theatre', town: 'Newport', systemSize: '', summary: '', imageIds: [], permission: true }] };
    expect(codes(only([b('casestudy', { title: 'Congress Theatre', items: [] })], {}, ctx(cs)))).not.toContain('casestudy-not-approved');
  });

  it('area pages need local proof and must not copy each other', () => {
    const area = (slug: string, text: string): CmsPageLike => ({ name: slug, slug, blocks: [b('form', { anchor: 'quote' }), b('rich', { html: `<p>${text}</p>` })] });
    const a = area('/areas/bristol', 'Terraced houses and slate roofs under National Grid Electricity Distribution in Bristol, with planning notes for the conservation areas around Clifton and Redland and the council schemes that apply here.');
    const c = ctx(DEFAULT_FACTS, { pages: [a, area('/areas/bath', 'Terraced houses and slate roofs under National Grid Electricity Distribution in Bristol, with planning notes for the conservation areas around Clifton and Redland and the council schemes that apply here.')] });
    expect(codes(checkPage(a, c))).toContain('area-proof');
    expect(codes(checkPage(a, c))).toContain('area-duplicate');
    const proven: Facts = { ...DEFAULT_FACTS, areaProof: [{ slug: '/areas/bristol', name: 'Bristol', installs: 3, reviews: 1 }] };
    const distinct = ctx(proven, { pages: [a, area('/areas/bath', 'Georgian terraces and listed buildings need a different approach: a heritage officer, roof surveys by drone, and panels placed on rear slopes only.')] });
    expect(codes(checkPage(a, distinct))).not.toContain('area-proof');
    expect(codes(checkPage(a, distinct))).not.toContain('area-duplicate');
  });
});

describe('warnings (shown in the editor)', () => {
  const w = (blocks: CmsBlockLike[], over: Partial<CmsPageLike> = {}) => codes(checkPage({ ...goodPage(), blocks: [b('form', { anchor: 'quote' }), ...blocks], ...over }, ctx()), 'warning');

  it('steps and grids that leave gaps', () => {
    expect(w([b('steps', { items: Array.from({ length: 6 }, () => ({ title: 'a', text: 'b' })) })])).toContain('steps-count');
    expect(w([b('steps', { items: Array.from({ length: 8 }, () => ({ title: 'a', text: 'b' })) })])).not.toContain('steps-count');
    expect(w([b('grid', { cols: 3, items: Array.from({ length: 5 }, () => ({ title: 'a', desc: 'b' })) })])).toContain('grid-count');
    expect(w([b('grid', { cols: 3, items: Array.from({ length: 3 }, () => ({ title: 'a', desc: '' })) })])).toContain('grid-empty');
  });

  it('button labels', () => {
    expect(w([b('cta', { btn: 'Learn More', btnHref: '#quote' })])).toContain('button-label');
    expect(w([b('cta', { btn: 'Get my survey', btnHref: '#quote' }), b('cta', { btn: 'Get my survey', btnHref: '#quote' })])).toContain('button-repeat');
    // The hero and the final ask may share a label.
    const same = checkPage({ ...goodPage(), blocks: [b('form', { anchor: 'quote' }), b('hero', { headline: 'x', ctaLabel: 'Get my survey', ctaHref: '#quote' }), b('cta', { btn: 'Get my survey', btnHref: '#quote' })] }, ctx());
    expect(codes(same, 'warning')).not.toContain('button-repeat');
  });

  it('place names on service pages', () => {
    expect(w([b('hero', { headline: 'Battery backup in Cardiff', ctaLabel: 'Book' })])).toContain('place-in-h1');
    expect(w([b('rich', { html: '<p>We cover South Wales. Also South Wales again, and South Wales a third time.</p>' })])).toContain('place-names');
    expect(w([], { slug: '/battery-backup-cardiff' })).toContain('seo-slug-place');
  });

  it('intro, length, proof, trust and the search listing', () => {
    const thin = checkPage({ name: 'x', slug: '/x', blocks: [b('form', { anchor: 'quote' }), b('hero', { headline: 'Keep going', hideMicrotrust: true }), b('rich', { html: '<p>Short.</p>' })] }, ctx());
    const c = codes(thin, 'warning');
    for (const code of ['intro', 'length', 'proof', 'trust-off', 'seo-title', 'seo-description']) expect(c, code).toContain(code);
    expect(codes(checkPage({ ...goodPage(), seo: { title: 'Home Battery Backup for Power Cuts', desc: 'Too short.' } }, ctx()), 'warning')).toContain('seo-description');
    // A title that already has 50 to 60 characters with the brand is fine.
    expect(codes(checkPage({ ...goodPage(), seo: { title: 'Home Battery Backup for Power Cuts in Your Home', desc: 'x'.repeat(140) } }, ctx()), 'warning')).not.toContain('seo-title');
  });

  it('a hidden rating when a verified one exists, and more than one hero', () => {
    const verified: Facts = { ...DEFAULT_FACTS, rating: { value: '4.8', count: '120', platform: 'Google', verified: true } };
    const p = { ...goodPage(), blocks: [b('form', { anchor: 'quote' }), b('hero', { headline: 'x', hideRating: true }), b('hero', { headline: 'y' })] };
    expect(codes(checkPage(p, ctx(verified)), 'warning')).toEqual(expect.arrayContaining(['rating-hidden', 'one-h1']));
  });
});

describe('whole site', () => {
  const ok = goodPage();
  const bad: CmsPageLike = { name: 'Draft', slug: '/draft', _draft: 1, blocks: [b('hero', { headline: 'Your headline here', ctaLabel: 'Learn More' })] };

  it('only a new or changed page can block Publish', () => {
    const r = checkSite([ok, bad], { facts: DEFAULT_FACTS, images: [], today: '2026-11-19' }, []);
    expect(r.blocking.map((p) => p.slug)).toEqual(['/draft']);
    expect(r.pages.find((p) => p.slug === '/draft')).toMatchObject({ draft: true, changed: true, kind: 'service' });
    // Once published and left alone, the same problems still show but no longer block.
    const again = checkSite([ok, bad], { facts: DEFAULT_FACTS, images: [], today: '2026-11-19' }, [ok, bad]);
    expect(again.blocking).toEqual([]);
    expect(again.errors).toBeGreaterThan(0);
    // Editing it makes it count again.
    const edited = checkSite([ok, { ...bad, name: 'Draft 2' }], { facts: DEFAULT_FACTS, images: [], today: '2026-11-19' }, [ok, bad]);
    expect(edited.blocking.map((p) => p.slug)).toEqual(['/draft']);
  });

  it('works out the pages that links can point to from the site itself', () => {
    const linked: CmsPageLike = { ...ok, slug: '/linked', name: 'Linked', blocks: [b('form', { anchor: 'quote' }), b('cta', { btn: 'See backup', btnHref: '/battery-backup' })] };
    const r = checkSite([ok, linked], { facts: DEFAULT_FACTS, images: [], today: '2026-11-19' }, []);
    expect(r.pages.find((p) => p.slug === '/linked')?.issues.map((i) => i.code)).not.toContain('broken-link');
  });
});

describe('helpers', () => {
  it('reads image fields', () => {
    expect(parseImage('')).toMatchObject({ empty: true });
    expect(parseImage(undefined)).toMatchObject({ empty: true });
    expect(parseImage('https://x.test/a.webp')).toMatchObject({ empty: false, src: 'https://x.test/a.webp', alt: '' });
    expect(parseImage(JSON.stringify({ alt: ' Roof ', libId: 'a1', decorative: false }))).toMatchObject({ empty: false, libId: 'a1', alt: 'Roof' });
    expect(parseImage(JSON.stringify({ alt: 'x', src: '', libId: '' }))).toMatchObject({ empty: true });
    expect(parseImage('{broken')).toMatchObject({ empty: false });
  });

  it('strips markup', () => {
    expect(stripHtml('<h3>Sizing</h3><p>A &amp; B&nbsp;C</p><script>x()</script>')).toBe('Sizing A & B C');
  });

  it('measures how different two texts are', () => {
    const a = shingles('one two three four five six seven eight nine ten');
    expect(differentShare(a, a)).toBe(0);
    expect(differentShare(a, shingles('alpha beta gamma delta epsilon zeta eta theta iota kappa'))).toBe(1);
  });
});

describe('calibrated on the real site', () => {
  const rich = (html: string, slug = '/battery-storage') => checkPage({ ...goodPage(), slug, blocks: [b('form', { anchor: 'quote' }), b('rich', { html })] }, ctx());

  it('recommendations are not boasts', () => {
    for (const ok of ['Best for warehouses, factories and offices.', 'Determine the best solar fit for your building.', 'The best option if cuts are frequent.']) expect(codes(rich(`<p>${ok}</p>`)), ok).not.toContain('superlative');
    for (const bad of ['We are the best installer in Wales.', 'The best solar company around.', 'Number one for batteries.', 'The cheapest way to go solar.', 'You will never lose power.']) expect(codes(rich(`<p>${bad}</p>`)), bad).toContain('superlative');
  });

  it('a guide may carry a worked example, so money figures there are warnings; elsewhere they are errors', () => {
    const guide = rich('<p>Using 35% on site at 27p, that is about £321 a year.</p>', '/blog/what-size-solar-system-do-i-need');
    expect(codes(guide, 'warning')).toContain('money-figure');
    expect(codes(guide, 'error')).not.toContain('money-figure');
    expect(codes(rich('<p>Save £2,400 a year.</p>'), 'error')).toContain('money-figure');
  });

  it('a call, WhatsApp or the pages that hold the forms are ways to get in touch', () => {
    const page = (href: string): CmsPageLike => ({ name: 'x', slug: '/x', blocks: [b('hero', { headline: 'x', ctaLabel: 'Go', ctaHref: href })] });
    for (const href of ['tel:01633965205', 'https://wa.me/441633965439', '/#quote', '/free-solar-quote', '/book-a-survey']) expect(codes(checkPage(page(href), ctx())), href).not.toContain('no-contact');
    expect(codes(checkPage(page('/solar-panels'), ctx()))).toContain('no-contact');
  });
});
