import { describe, expect, it } from 'vitest';
import { balancedAt, fixDeadQuoteLinks, freshenLogo, hasQuoteButtons, hasQuoteTarget, splitCmsPage, splitForCtas, withoutTestimonials } from '@/lib/cms-ctas';

/** The shape the CMS really publishes: one outer page wrapper, one spacing wrapper per block. */
const wrap = (b: string) => `<div style="padding:0">${b}</div>`;
const real =
  '<div class="pv-page">' +
  wrap('<div class="pv-hero"><h1>Hi</h1></div>') +
  wrap('<div class="pv-steps"><p>How</p></div>') +
  wrap('<div class="pv-testi"><p>Reviews</p></div>') +
  wrap('<div class="pv-faq" id="faq"><p>Q</p></div>') +
  wrap('<div class="pv-quote is-contact" id="quote"><div class="pv-quote-inner"><form><input name="a"></form></div></div>') +
  wrap('<div class="pv-footer">F</div>') +
  '</div>';

const render = (parts: ReturnType<typeof splitCmsPage>) => parts.map((p) => (typeof p === 'string' ? p : 'cta' in p ? `[${p.cta}]` : '[QUOTE]')).join('');

describe('the real CMS page shape', () => {
  it('puts the survey band before the testimonials and the talk band before the quote form', () => {
    const t = render(splitCmsPage(real, { ctas: true }));
    expect(t.indexOf('How')).toBeLessThan(t.indexOf('[survey]'));
    expect(t.indexOf('[survey]')).toBeLessThan(t.indexOf('Reviews'));
    expect(t.indexOf('Q</p>')).toBeLessThan(t.indexOf('[talk]'));
    expect(t.indexOf('[talk]')).toBeLessThan(t.indexOf('<form>'));
  });
  it('swaps the whole old quote form block for the new one', () => {
    const t = render(splitCmsPage(real, { quote: true }));
    expect(t).toContain('[QUOTE]');
    expect(t).not.toContain('<form>');
    expect(t).not.toContain('id="quote"');
    expect(t).toContain('pv-footer');
    expect(t).toContain('pv-hero');
  });
  it('keeps every piece valid by closing and re-opening the page wrapper around each cut', () => {
    for (const p of splitCmsPage(real, { ctas: true, quote: true })) {
      if (typeof p === 'string') expect(balancedAt(p, p.length)).toBe(true);
    }
  });
  it('loses nothing except the replaced quote block', () => {
    const joined = splitCmsPage(real, { ctas: true }).filter((p) => typeof p === 'string').join('');
    // The cuts add a close and an open of the page wrapper; removing those gives back the page.
    expect(joined.split('</div><div class="pv-page">').join('')).toBe(real);
  });
  it('leaves the page alone when there is nothing to place', () => {
    const plain = '<div class="pv-page">' + wrap('<div class="pv-hero">x</div>') + '</div>';
    expect(splitCmsPage(plain, { ctas: true, quote: true })).toEqual([plain]);
  });
  it('a blog page (no testimonials) gets only the new form', () => {
    const blog = '<div class="pv-page">' + wrap('<div class="pv-hero">x</div>') + wrap('<div class="pv-quote" id="quote"><form></form></div>') + wrap('<div class="pv-split">s</div>') + '</div>';
    const parts = splitCmsPage(blog, { quote: true });
    expect(render(parts)).toContain('[QUOTE]');
    expect(render(parts)).toContain('pv-split');
    expect(splitCmsPage(blog, { ctas: true, quote: true }).some((p) => typeof p !== 'string' && 'cta' in p && p.cta === 'survey')).toBe(false);
  });
  it('still works for a flat page with top-level blocks', () => {
    const flat = '<div class="pv-testi">T</div><div class="pv-faq">F</div><div id="quote">Q</div>';
    expect(splitForCtas(flat).filter((p) => typeof p !== 'string')).toHaveLength(2);
  });
});

describe('balance', () => {
  it('knows what balanced means', () => {
    expect(balancedAt('<div><p>a</p></div><div>', 19)).toBe(true);
    expect(balancedAt('<div><p>a</p></div><div>', 10)).toBe(false);
    expect(balancedAt('<img src="x"><br/><div></div>', 29)).toBe(true);
  });
});

describe('logo', () => {
  it('swaps the old logo for the current one wherever it appears', () => {
    expect(freshenLogo('<img src="/assets/heliaxis-logo.png"><img src="/assets/heliaxis-logo.png">')).toBe('<img src="/assets/heliaxis-logo-doc.png"><img src="/assets/heliaxis-logo-doc.png">');
  });
  it('leaves other logos alone', () => {
    expect(freshenLogo('/assets/heliaxis-logo-light.png')).toBe('/assets/heliaxis-logo-light.png');
  });
});

describe('older snapshots', () => {
  it('finds the form by its class when the block has no id', () => {
    const html = '<div class="pv-page"><div style="x"><div class="pv-rich"><p>a</p></div></div><div style="x"><div class="pv-quote is-contact"><div class="pv-quote-inner"><form></form></div></div></div></div>';
    const parts = splitCmsPage(html, { quote: true });
    expect(parts.some((p) => typeof p !== 'string' && 'quote' in p)).toBe(true);
  });
});

describe('live fixes: testimonials and dead quote links', () => {
  const testi = '<div class="pv-testi"><div class="wrap"><div class="tcard"><blockquote>"Great"</blockquote></div><p class="pv-testi-note">Illustrative</p></div></div>';
  it('takes the testimonials block out and leaves a marker', () => {
    const html = `<div class="pv-page"><div style="padding:0">${testi}</div><div style="padding:0"><p>After</p></div></div>`;
    const out = withoutTestimonials(html);
    expect(out).not.toContain('tcard');
    expect(out).not.toContain('Illustrative');
    expect(out).toContain('<div style="padding:0"><div class="pv-testi-removed"></div></div>');
    expect(out).toContain('<p>After</p>');
  });
  it('still places the homepage survey band where the testimonials were', () => {
    const html = `<div class="pv-page"><div style="padding:0">${testi}</div><div style="padding:0"><section class="sec quote" id="quote"><form></form></section></div></div>`;
    const parts = splitCmsPage(withoutTestimonials(html), { ctas: true, quote: true });
    expect(parts.filter((p) => typeof p !== 'string')).toEqual([{ cta: 'survey' }, { cta: 'talk' }, { quote: true }]);
    expect(parts.join('')).not.toContain('tcard');
  });
  it('leaves a page without testimonials alone', () => {
    expect(withoutTestimonials('<div class="pv-page"><p>x</p></div>')).toBe('<div class="pv-page"><p>x</p></div>');
  });
  it('points #quote links at the landing page only when nothing on the page answers them', () => {
    expect(hasQuoteTarget('<section id="quote"></section>')).toBe(true);
    expect(hasQuoteTarget('<div class="pv-quote x"></div>')).toBe(true);
    expect(hasQuoteTarget('<a href="#quote">Go</a>')).toBe(false);
    // They link to the quote page (works without JavaScript) and carry the marker the quote drawer listens for.
    expect(fixDeadQuoteLinks(`<a class="btn" href="#quote">A</a><a href='#quote'>B</a><a href="/#quote">C</a><a data-href="#quote">D</a>`)).toBe(
      `<a class="btn" href="/free-solar-quote" data-quote-drawer="1">A</a><a href="/free-solar-quote" data-quote-drawer="1">B</a><a href="/#quote">C</a><a data-href="#quote">D</a>`,
    );
    expect(hasQuoteButtons('<a class="btn" href="#quote">A</a>')).toBe(true);
    expect(hasQuoteButtons('<a href="/#quote">C</a><a data-href="#quote">D</a>')).toBe(false);
  });
});
