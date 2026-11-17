import { describe, expect, it } from 'vitest';
import { cleanBuild, progress, starterBuilds } from '@/lib/builds';

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
