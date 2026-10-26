import { describe, expect, it } from 'vitest';
import { balancedAt, freshenLogo, splitForCtas } from '@/lib/cms-ctas';

const page = '<div class="pv-hero"><h1>Hi</h1></div><div class="pv-steps"><p>How</p></div><div class="pv-testi"><p>Reviews</p></div><div class="pv-faq" id="faq"><p>Q</p></div><div class="pv-quote" id="quote"><form></form></div><div class="pv-footer">F</div>';

describe('splitting the CMS homepage for the CTA bands', () => {
  it('puts the survey band before the testimonials and the talk band before the quote form', () => {
    const parts = splitForCtas(page);
    const slots = parts.filter((p) => typeof p !== 'string').map((p) => (p as { cta: string }).cta);
    expect(slots).toEqual(['survey', 'talk']);
    const text = parts.map((p) => (typeof p === 'string' ? p : `[${p.cta}]`)).join('');
    expect(text.indexOf('How')).toBeLessThan(text.indexOf('[survey]'));
    expect(text.indexOf('[survey]')).toBeLessThan(text.indexOf('Reviews'));
    expect(text.indexOf('Q</p>')).toBeLessThan(text.indexOf('[talk]'));
    expect(text.indexOf('[talk]')).toBeLessThan(text.indexOf('<form>'));
  });
  it('keeps every byte of the page', () => {
    expect(splitForCtas(page).filter((p) => typeof p === 'string').join('')).toBe(page);
  });
  it('skips a band when its spot is missing', () => {
    const slots = splitForCtas('<div class="pv-hero">x</div><div class="pv-footer">f</div>');
    expect(slots).toHaveLength(1);
  });
  it('never cuts inside another block', () => {
    const nested = '<div class="wrap"><div class="pv-testi">T</div><div id="quote">Q</div></div>';
    expect(splitForCtas(nested)).toHaveLength(1);
  });
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
