import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, briefMessage, factsBlock } from '@/lib/cms/builder-prompt';
import { cleanBrief, quoteFormProps, shapePage, type Block } from '@/lib/cms/blueprints';
import { cleanFacts, DEFAULT_FACTS } from '@/lib/cms/facts';
import { checkPage } from '@/lib/cms/validate';

const brief = cleanBrief({ pageType: 'service', audience: 'home', service: 'Home battery backup' });
const mk = (t: string, p: Record<string, unknown> = {}): Block => ({ t, p });
const items = (n: number, extra: Record<string, unknown> = {}) => Array.from({ length: n }, (_, i) => ({ title: `T${i}`, text: `x${i}`, desc: `d${i}`, ...extra }));

describe('cleanBrief', () => {
  it('falls back to safe values and clips text', () => {
    const b = cleanBrief({ pageType: 'nonsense', audience: 'x', service: 'a'.repeat(500) });
    expect(b.pageType).toBe('service');
    expect(b.audience).toBe('home');
    expect(b.service.length).toBe(120);
    expect(cleanBrief(null).notes).toBe('');
  });
});

describe('the prompt is built from the facts', () => {
  const sys = buildSystemPrompt(DEFAULT_FACTS, brief, 'BLOCK TYPES:\nhero {…}');
  it('states the service-area phrase and the credentials held, and forbids invention', () => {
    expect(sys).toContain(DEFAULT_FACTS.serviceArea);
    expect(sys).toContain('Credentials held');
    expect(sys).toContain('Nothing invented');
    expect(sys).toContain('BLOCK TYPES:');
  });
  it('tells the model there is no rating, no testimonials and no case studies when the sheet has none', () => {
    const f = factsBlock(DEFAULT_FACTS);
    expect(f).toContain('none verified');
    expect(f).toContain('no approved testimonials');
    expect(f).toContain('no approved case studies');
    expect(f).toContain('print no number');
  });
  it('uses a verified rating and the approved items when they exist', () => {
    const f = factsBlock(
      cleanFacts({ rating: { value: '4.8', count: '120', platform: 'Google', verified: true }, installCount: '300', testimonials: [{ name: 'A B', quote: 'Great', town: 'Bath', product: 'Solar' }], caseStudies: [{ title: 'Farm', town: 'Bath', systemSize: '10 kWp', summary: 's', permission: true }] }),
    );
    expect(f).toContain('4.8 on Google');
    expect(f).toContain('Install count (verified): 300');
    expect(f).toContain('Approved testimonials exist');
    expect(f).toContain('Farm');
  });
  it('carries the brief into the user message', () => {
    const m = briefMessage(cleanBrief({ pageType: 'landing', trafficSource: 'Meta: free survey', doubt: 'Is it safe?' }), 'Write it');
    expect(m).toContain('Meta: free survey');
    expect(m).toContain('Is it safe?');
    expect(m).toContain('Description: Write it');
  });
});

describe('shapePage', () => {
  it('trims steps to 4 or 8', () => {
    const out = shapePage([mk('hero'), mk('steps', { items: items(6) }), mk('steps', { items: items(10) })], brief, DEFAULT_FACTS);
    const steps = out.filter((b) => b.t === 'steps');
    expect((steps[0].p.items as unknown[]).length).toBe(4);
    expect((steps[1].p.items as unknown[]).length).toBe(8);
  });
  it('fits grid columns to whole rows', () => {
    const g = (n: number, cols = 3) => shapePage([mk('hero'), mk('grid', { cols, items: items(n) })], brief, DEFAULT_FACTS).find((b) => b.t === 'grid')!;
    expect(g(4, 3).p.cols).toBe(4);
    expect(g(6, 4).p.cols).toBe(3);
    const five = g(5, 3);
    expect((five.p.items as unknown[]).length % (five.p.cols as number)).toBe(0);
  });
  it('drops proof that is not on the facts sheet and fills testimonials from approved ones', () => {
    const blocks = [mk('hero'), mk('stats', { items: [{ n: '1,200+', k: 'Installs' }] }), mk('casestudy'), mk('gallery'), mk('testi', { items: items(2) })];
    const none = shapePage(blocks, brief, DEFAULT_FACTS).map((b) => b.t);
    expect(none).not.toContain('stats');
    expect(none).not.toContain('casestudy');
    expect(none).not.toContain('gallery');
    expect(none).not.toContain('testi');
    const facts = cleanFacts({ testimonials: [{ name: 'A B', quote: 'Fitted in a day', town: 'Bath', product: 'Solar' }] });
    const t = shapePage(blocks, brief, facts).find((b) => b.t === 'testi')!;
    expect(t.p.approved).toBe(true);
    expect((t.p.items as { name: string }[])[0].name).toBe('A B');
  });
  it('gives the hero a call button and the page exactly one quote form', () => {
    const out = shapePage([mk('hero', { ctaHref: '/x' }), mk('faq', { items: items(6) }), mk('form'), mk('form'), mk('cta')], brief, DEFAULT_FACTS);
    expect(out.filter((b) => b.t === 'form')).toHaveLength(1);
    expect(out.find((b) => b.t === 'form')!.p.anchor).toBe('quote');
    const hero = out.find((b) => b.t === 'hero')!;
    expect(hero.p.ctaHref).toBe('#quote');
    expect(hero.p.cta2Href).toBe('tel:01633965205');
  });
  it('adds a form when there is none, before the faq, and accreditation logos at the end', () => {
    const out = shapePage([mk('hero'), mk('faq', { items: items(6) }), mk('cta')], brief, DEFAULT_FACTS).map((b) => b.t);
    expect(out.indexOf('form')).toBeLessThan(out.indexOf('faq'));
    expect(out[out.length - 1]).toBe('accbanner');
  });
  it('landing pages put the form straight after the hero', () => {
    const out = shapePage([mk('hero'), mk('grid', { items: items(3) }), mk('cta')], cleanBrief({ pageType: 'landing' }), DEFAULT_FACTS).map((b) => b.t);
    expect(out[1]).toBe('form');
  });
  it('never emits a footer, and the shaped page has no contact or proof-claim errors', () => {
    const out = shapePage([mk('hero', { headline: 'Keep the lights on', sub: 'Backup for homes.', ctaLabel: 'Book my survey' }), mk('footer'), mk('faq', { items: items(6) })], brief, DEFAULT_FACTS);
    expect(out.some((b) => b.t === 'footer')).toBe(false);
    const issues = checkPage({ name: 'Battery backup', slug: '/battery-backup', type: 'page', seo: { title: 'Home Battery Backup | Heliaxis', desc: 'd' }, blocks: out }, { facts: DEFAULT_FACTS, pageSlugs: [], images: [], today: '2026-11-26' });
    expect(issues.some((i) => i.code === 'no-contact')).toBe(false);
    expect(issues.some((i) => i.code === 'testimonial-not-approved')).toBe(false);
  });
});

describe('quoteFormProps', () => {
  it('uses the facts sheet phone and response promise', () => {
    const p = quoteFormProps(cleanFacts({ phone: '01234 567890', responsePromise: 'We call the same day' }));
    expect(p.callHref).toBe('tel:01234567890');
    expect((p.points as { title: string }[])[1].title).toBe('We call the same day');
    expect(p.anchor).toBe('quote');
  });
});

describe('generatePage end to end (model mocked)', () => {
  it('shapes the draft, checks it against the facts, and repairs what words can fix once', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.doMock('@/lib/ai-usage', () => ({ recordChatUsage: async () => {} }));
    process.env.OPENROUTER_API_KEY = 'test-key';
    delete process.env.TAVILY_API_KEY;
    const bad = {
      seo: { title: 'Home Battery Backup | Heliaxis', description: 'x', slug: 'battery-backup' },
      blocks: [
        { t: 'hero', p: { eyebrow: 'Backup', headline: 'Keep the lights on', sub: 'Power when the grid goes down.', ctaLabel: 'Book my survey' } },
        { t: 'grid', p: { title: 'Why', cols: 3, items: items(5) } },
        { t: 'steps', p: { title: 'Next', items: items(6) } },
        { t: 'testi', p: { title: 'Customers', items: items(2) } },
        { t: 'rich', p: { html: '<p>Our systems save you £1,200 a year.</p>' } },
        { t: 'faq', p: { title: 'FAQ', items: items(6) } },
        { t: 'cta', p: { headline: 'Ready?', btn: 'Book my survey' } },
      ],
    };
    const fixed = { ...bad, blocks: bad.blocks.map((b) => (b.t === 'rich' ? { t: 'rich', p: { html: '<p>Savings depend on your home and how you use power.</p>' } } : b)) };
    const replies = [JSON.stringify(bad), JSON.stringify(fixed)];
    let calls = 0;
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: replies[Math.min(calls++, 1)] } }], usage: {} }), text: async () => '' }));
    const { generatePage } = await import('@/lib/cms/ai-page');
    const r = await generatePage('Write a battery backup page', undefined, { brief: { pageType: 'service', service: 'Home battery backup' } });
    expect(calls).toBe(2);
    expect(r.debug.repaired).toBe(true);
    const types = r.blocks.map((b) => b.t);
    expect(types).not.toContain('testi');
    expect(types).toContain('form');
    expect(JSON.stringify(r.blocks)).not.toContain('£1,200');
    expect(r.issues.some((i) => i.code === 'money-figure' && i.level === 'error')).toBe(false);
    const steps = r.blocks.find((b) => b.t === 'steps')!;
    expect((steps.p.items as unknown[]).length).toBe(4);
    vi.unstubAllGlobals();
    vi.doUnmock('@/lib/ai-usage');
  });
});
