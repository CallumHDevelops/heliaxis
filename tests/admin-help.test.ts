import { describe, expect, it } from 'vitest';
import { HELP_ENTRIES } from '@/lib/admin-help/entries';
import { findHelp, isCmsPath, nameFor, partsOf, type HelpEntry } from '@/lib/admin-help/lookup';

const E = (path: string, extra: Partial<HelpEntry> = {}): HelpEntry => ({ path, title: path, about: '', steps: [], ...extra });
const find = (path: string) => findHelp(HELP_ENTRIES, path)?.entry.path;

describe('partsOf', () => {
  it('ignores the query, hash and trailing slash', () => {
    expect(partsOf('/admin/crm/?view=board#x')).toEqual(['admin', 'crm']);
  });
});

describe('findHelp', () => {
  it('matches an exact page', () => {
    expect(find('/admin/sales/estimator')).toBe('/admin/sales/estimator');
    expect(find('/admin/enquiries')).toBe('/admin/enquiries');
    expect(find('/admin/crm?view=list')).toBe('/admin/crm');
  });

  it('treats [id] as any one part', () => {
    expect(find('/admin/crm/3f2a9c1e-1111-4222-8333-444455556666')).toBe('/admin/crm/[id]');
    expect(find('/admin/projects/abc')).toBe('/admin/projects/[id]');
    expect(find('/admin/sales/quotes/abc')).toBe('/admin/sales/quotes/[id]');
  });

  it('prefers a named page to a placeholder', () => {
    expect(find('/admin/crm/contacts')).toBe('/admin/crm/contacts');
    expect(find('/admin/crm/reports')).toBe('/admin/crm/reports');
    expect(find('/admin/projects/orders')).toBe('/admin/projects/orders');
  });

  it('does not let a page cover the pages below it unless it asks to', () => {
    expect(find('/admin/crm/unknown/deeper/page')).toBeUndefined();
    expect(find('/admin/enquiries/something-new')).toBeUndefined();
  });

  it('lets a tree entry cover its sub-pages', () => {
    expect(find('/admin/cms/home')).toBe('/admin/cms');
    expect(find('/admin/help/surveys/the-diary')).toBe('/admin/help');
  });

  it('is not fooled by a shared prefix', () => {
    const entries = [E('/admin/crm', { tree: true }), E('/admin/crm/[id]')];
    expect(findHelp(entries, '/admin/crmx')?.entry.path).toBeUndefined();
    expect(findHelp(entries, '/admin/crm/abc')?.entry.path).toBe('/admin/crm/[id]');
    expect(findHelp(entries, '/admin/crm/abc/deeper')?.entry.path).toBe('/admin/crm');
    expect(findHelp(entries, '/admin/crm/abc/deeper')?.exact).toBe(false);
  });

  it('returns null for anything outside /admin and for pages with no entry', () => {
    expect(findHelp(HELP_ENTRIES, '/solar-estimator')).toBeNull();
    expect(findHelp(HELP_ENTRIES, '/admin/social/costs')).toBeNull();
  });

  it('says whether the match is exact', () => {
    expect(findHelp(HELP_ENTRIES, '/admin/cms/home')?.exact).toBe(false);
    expect(findHelp(HELP_ENTRIES, '/admin/tasks')?.exact).toBe(true);
  });
});

describe('the help entries', () => {
  it('cover the main pages', () => {
    for (const p of [
      '/admin',
      '/admin/crm',
      '/admin/crm/abc',
      '/admin/enquiries',
      '/admin/enquiries/inbox',
      '/admin/sales/quotes',
      '/admin/sales/quotes/abc',
      '/admin/sales/estimator',
      '/admin/surveys',
      '/admin/projects/abc',
      '/admin/projects/orders',
      '/admin/enquiries/templates',
    ]) {
      expect(find(p), p).toBeDefined();
    }
  });

  it('have a title, what the page is for, and steps', () => {
    for (const e of HELP_ENTRIES) {
      expect(e.title.trim(), e.path).not.toBe('');
      expect(e.about.trim(), e.path).not.toBe('');
      expect(e.steps.length, e.path).toBeGreaterThan(0);
    }
  });

  it('have one entry per path, all under /admin, with real links', () => {
    const paths = HELP_ENTRIES.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const e of HELP_ENTRIES) {
      expect(e.path.startsWith('/admin')).toBe(true);
      for (const l of e.more ?? []) expect(l.href.startsWith('/admin'), l.href).toBe(true);
    }
  });

  it('use no emoji and no spaced dashes', () => {
    const text = JSON.stringify(HELP_ENTRIES);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text).not.toMatch(/ — | – /);
  });

  it('explain the estimator switches', () => {
    const e = HELP_ENTRIES.find((x) => x.path === '/admin/sales/estimator')!;
    const all = [...e.steps, ...(e.watch ?? [])].join(' ');
    for (const w of ['minimum profit', 'Inverters', 'Batteries', 'Packages', 'preview', 'award', 'finance']) expect(all.toLowerCase()).toContain(w.toLowerCase());
  });
});

describe('isCmsPath and nameFor', () => {
  it('spots website pages', () => {
    expect(isCmsPath('/admin/cms/home')).toBe(true);
    expect(isCmsPath('/admin/blog')).toBe(true);
    expect(isCmsPath('/admin/crm')).toBe(false);
  });
  it('names a page that has no entry', () => {
    expect(nameFor('/admin/social/costs')).toBe('Costs');
    expect(nameFor('/admin/search/ai')).toBe('Ai');
    expect(nameFor('/admin')).toBe('Dashboard');
    expect(nameFor('/admin/crm/3f2a9c1e-1111-4222-8333-444455556666')).toBe('Crm');
  });
});
