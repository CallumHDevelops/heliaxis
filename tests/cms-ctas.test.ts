import { describe, expect, it } from 'vitest';
import { balancedAt, freshenLogo, splitCmsPage, splitForCtas } from '@/lib/cms-ctas';

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
