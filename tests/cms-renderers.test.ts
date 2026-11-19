import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderCmsPageHtml } from '@/lib/cms-render-html';

/**
 * Page blocks become HTML in two places: the browser engine (used when someone presses Publish) and the TypeScript renderer
 * (scheduled blog posts). These tests exercise the TypeScript one directly and guard the engine's source text, so the two cannot
 * drift apart on the things that matter: no invented trust figures, no place names in defaults, no broken filler boxes.
 */

const render = (t: string, p: Record<string, unknown>) => renderCmsPageHtml([{ id: 'b1', t, p }]);
const steps = (n: number) => render('steps', { title: 'How it works', items: Array.from({ length: n }, (_, i) => ({ title: `Step ${i + 1}`, text: 'Something happens.' })) });
const hero = (p: Record<string, unknown> = {}) => render('hero', { headline: 'Keep your essentials running', sub: 'Backup that works.', ctaLabel: 'Book my survey', ctaHref: '#quote', ...p });

describe('steps: spare grid cells', () => {
  it('become one call-to-action tile spanning them, never hatched boxes', () => {
    for (const [n, span] of [[5, 3], [6, 2], [7, 1]] as const) {
      const h = steps(n);
      expect(h, `${n} steps`).toContain(`class="pv-pstep-cta" style="grid-column:span ${span}"`);
      expect(h).toContain('Ready when you are');
      expect(h).toContain('Book my free survey');
      expect(h).toContain('tel:01633965205');
      expect(h).not.toContain('pv-pstep-fill');
    }
  });

  it('leave a full grid alone (4 or 8 steps, or fewer than 4)', () => {
    for (const n of [3, 4, 8]) expect(steps(n), `${n} steps`).not.toContain('pv-pstep-cta');
  });
});

describe('hero rating row', () => {
  it('shows nothing when no figures were entered, even with the row switched on', () => {
    const h = hero({ hideRating: false });
    expect(h).not.toContain('class="rating"');
    expect(h).not.toContain('4.9');
    expect(h).not.toContain('Trustpilot');
    expect(h).not.toContain('1200');
  });

  it('needs the value and where it comes from together', () => {
    expect(hero({ ratingValue: '4.8' })).not.toContain('class="rating"');
    expect(hero({ ratingSource: 'Google' })).not.toContain('class="rating"');
    const h = hero({ ratingValue: '4.8', ratingSource: 'Google reviews' });
    expect(h).toContain('class="rating"');
    expect(h).toContain('4.8');
    expect(h).toContain('Google reviews');
  });

  it('shows an install figure only with what it counts', () => {
    expect(hero({ ratingInstalls: '300+' })).not.toContain('class="rating"');
    const h = hero({ ratingInstalls: 'Hundreds', ratingInstallsLabel: 'arrays installed' });
    expect(h).toContain('Hundreds');
    expect(h).toContain('arrays installed');
    expect(h).not.toContain('★★★★★');
  });

  it('can be hidden', () => {
    expect(hero({ ratingValue: '4.8', ratingSource: 'Google', hideRating: true })).not.toContain('class="rating"');
  });
});

describe('split buttons', () => {
  const split = (p: Record<string, unknown> = {}) => render('split', { lt: 'For your home', ld: 'x', lb: ['a'], lc: 'Plan essential backup', rt: 'Whole home', rd: 'y', rb: ['b'], rc: 'Plan whole-home backup', ...p });

  it('both go to the quote form unless a link was chosen', () => {
    const h = split();
    expect(h.match(/href="#quote"/g)?.length).toBe(2);
    expect(h).not.toContain('commercial-funding');
  });

  it('keep a link that was chosen', () => {
    expect(split({ rcHref: '/commercial-funding' })).toContain('href="/commercial-funding"');
  });
});

describe('sample titles carry no place name', () => {
  it('for testimonials and galleries', () => {
    expect(render('testi', { items: [] })).not.toContain('South Wales');
    expect(render('gallery', { items: [] })).not.toContain('South Wales');
  });
});

describe('the browser engine (source guard)', () => {
  const engine = readFileSync('src/app/admin/cms-engine.ts', 'utf8');
  const tsRenderer = readFileSync('src/lib/cms-render-html.ts', 'utf8');

  it('no longer invents a rating, an install count or a place for the hero', () => {
    for (const bad of ["p.ratingValue||'4.9'", "p.ratingInstalls||'1200'", 'installs across South Wales', 'Google &amp; Trustpilot', 'Join 1,200+', "ratingValue='4.9';changed", "ratingInstalls='1200';changed"]) {
      expect(engine.includes(bad), `engine still has: ${bad}`).toBe(false);
    }
    for (const bad of ["p.ratingValue || '4.9'", "p.ratingInstalls || '1200'", 'installs across South Wales', 'Google &amp; Trustpilot']) {
      expect(tsRenderer.includes(bad), `renderer still has: ${bad}`).toBe(false);
    }
  });

  it('has the steps tile and the area constant, like the TypeScript renderer', () => {
    for (const src of [engine, tsRenderer]) {
      expect(src).toContain('pv-pstep-cta');
      expect(src).toContain('Ready when you are');
      expect(src).not.toMatch(/class="pv-pstep-fill/);
    }
    expect(engine).toContain("var SERVICE_AREA='South Wales and the South West';");
  });

  it('uses the service area in templates instead of a hard-coded place', () => {
    expect(engine).not.toContain("eyebrow:'MCS-certified · South Wales'");
    expect(engine).not.toContain('Trusted across South Wales');
    expect(engine).not.toContain('Installs across South Wales');
    expect(engine).toContain("eyebrow:'MCS-certified · '+SERVICE_AREA");
  });

  it('upgrades the home page split link before the default changes, and clears the old sample figures once', () => {
    expect(engine).toContain('function ensureSplitLinks()');
    expect(engine).toContain("bl.p.rcHref='/commercial-funding'");
    expect(engine).toContain('if(ensureSplitLinks())save();');
    expect(engine).toContain("p.ratingValue==='4.9'&&!p.ratingSource");
  });
});

describe('the browser engine runs the new code correctly (the real source lines, with stand-in helpers)', () => {
  const lines = readFileSync('src/app/admin/cms-engine.ts', 'utf8').split('\n');
  const esc = (s: unknown) => String(s ?? '');
  const ce = () => '';

  it('steps: a spare-cell tile for 5, 6 and 7 steps, none for 4 and 8', () => {
    const line = lines.find((l) => l.includes("if(t==='steps'){var _sn="));
    expect(line).toBeTruthy();
    const run = new Function('t', 'p', 'id', 'edit', 'esc', 'ce', 'accentText', 'eyebrow', `${line}; return null;`) as (...a: unknown[]) => string;
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `S${i}`, text: 'x' }));
    for (const [n, span] of [[5, 3], [6, 2], [7, 1]] as const) {
      const html = run('steps', { items: items(n), title: 'T' }, 'b', false, esc, ce, esc, () => '');
      expect(html, `${n}`).toContain(`class="pv-pstep-cta" style="grid-column:span ${span}"`);
      expect(html).not.toContain('pv-pstep-fill');
    }
    for (const n of [4, 8]) expect(run('steps', { items: items(n), title: 'T' }, 'b', false, esc, ce, esc, () => ''), `${n}`).not.toContain('pv-pstep-cta');
    // In the editor the tile's buttons must not navigate away.
    expect(run('steps', { items: items(6), title: 'T' }, 'b', true, esc, ce, esc, () => '')).toContain('onclick="event.preventDefault()"');
  });

  it('hero: the rating row needs its source, the install figure its label, and nothing is invented', () => {
    const start = lines.findIndex((l) => l.includes("var rtVal=String(p.ratingValue||'').trim()"));
    const end = lines.findIndex((l, i) => i > start && l.includes('var rthtml='));
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = lines.slice(start, end + 1).join('\n');
    const run = new Function('p', 'id', 'edit', 'esc', 'ce', `${block}; return rthtml;`) as (...a: unknown[]) => string;
    expect(run({}, 'h', false, esc, ce)).toBe('');
    expect(run({ hideRating: false }, 'h', false, esc, ce)).toBe('');
    expect(run({ ratingValue: '4.9' }, 'h', false, esc, ce)).toBe('');
    expect(run({ ratingValue: '4.8', ratingSource: 'Google' }, 'h', false, esc, ce)).toContain('4.8');
    expect(run({ ratingInstalls: '300+' }, 'h', false, esc, ce)).toBe('');
    const both = run({ ratingValue: '4.8', ratingSource: 'Google', ratingInstalls: 'Hundreds', ratingInstallsLabel: 'arrays installed' }, 'h', false, esc, ce);
    expect(both).toContain('Google');
    expect(both).toContain('arrays installed');
    expect(run({ ratingValue: '4.8', ratingSource: 'Google', hideRating: true }, 'h', false, esc, ce)).toBe('');
  });
});
