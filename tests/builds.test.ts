import { describe, expect, it } from 'vitest';
import { buildPrompt, cleanBuild, progress, promptFileName, starterBuilds } from '@/lib/builds';

describe('build tracker', () => {
  it('cleans what is sent', () => {
    const b = cleanBuild({ id: 'x', title: '  ', status: 'nonsense' as never, area: 'Nope' as never, checklist: [{ text: ' a ', done: true }, { text: '', done: false }], links: [{ label: 'bad', href: 'javascript:alert(1)' }, { label: 'ok', href: '/admin' }] });
    expect(b.title).toBe('Untitled');
    expect(b.status).toBe('next');
    expect(b.area).toBe('Other');
    expect(b.checklist).toEqual([{ text: 'a', done: true }]);
    expect(b.links).toEqual([{ label: 'ok', href: '/admin' }]);
  });
  it('works out checklist progress', () => {
    expect(progress(cleanBuild({ id: 'x', checklist: [{ text: 'a', done: true }, { text: 'b', done: false }] }))).toBe(50);
    expect(progress(cleanBuild({ id: 'x' }))).toBeNull();
  });
  it('starts with the work in hand, each with a unique id', () => {
    const s = starterBuilds();
    expect(s.length).toBeGreaterThan(8);
    expect(new Set(s.map((b) => b.id)).size).toBe(s.length);
  });
});

describe('build prompts', () => {
  it('turns an item into a brief with what is left, background, links and the hand-back instruction', () => {
    const b = cleanBuild({ id: 'seo-dashboard', title: 'SEO dashboard', area: 'SEO and AI', status: 'doing', next: 'Run it', waitingOn: 'Top-up', checklist: [{ text: 'Built', done: true }, { text: 'First run', done: false }], links: [{ label: 'Dashboard', href: '/admin/analytics/seo' }] });
    const p = buildPrompt(b);
    expect(p).toContain('# SEO dashboard');
    expect(p).toContain('- Next step: Run it');
    expect(p).toContain('- [ ] First run');
    expect(p).toContain('- [x] Built');
    expect(p).toContain('src/lib/seo/serp.ts'); // starting background used when the item has none
    expect(p).toContain('https://heliaxis.co.uk/admin/analytics/seo');
    expect(p).toContain('item id "seo-dashboard"');
    expect(promptFileName(b)).toBe('build-seo-dashboard.md');
  });
});
