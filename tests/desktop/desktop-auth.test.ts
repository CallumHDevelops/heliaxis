import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { authorise, bearerToken } from '@/lib/desktop/auth';
import type { Profile } from '@/lib/auth';

const profile = (p: Partial<Profile>): Profile => ({ role: 'member', status: 'approved', full_name: 'Test', email: 't@example.com', portals: [], ...p });
const JWT = 'aaa.bbb.ccc';

describe('bearerToken', () => {
  it('reads a Bearer token', () => {
    expect(bearerToken(new Request('http://x', { headers: { authorization: `Bearer ${JWT}` } }))).toBe(JWT);
  });
  it('rejects a missing, malformed or non-bearer header', () => {
    expect(bearerToken(new Request('http://x'))).toBeNull();
    expect(bearerToken(new Request('http://x', { headers: { authorization: 'Bearer nope' } }))).toBeNull();
    expect(bearerToken(new Request('http://x', { headers: { authorization: `Basic ${JWT}` } }))).toBeNull();
  });
});

describe('authorise (desktop access = HAP access)', () => {
  it('lets an approved admin in', () => {
    expect(authorise(profile({ role: 'admin' })).ok).toBe(true);
  });
  it('lets an approved member with the CRM portal in', () => {
    expect(authorise(profile({ portals: ['crm'] })).ok).toBe(true);
  });
  it('keeps out a member without the CRM portal', () => {
    const v = authorise(profile({ portals: ['cms', 'social'] }));
    expect(v).toMatchObject({ ok: false, status: 403 });
  });
  it('keeps out pending and rejected accounts, even admins', () => {
    expect(authorise(profile({ status: 'pending', role: 'admin' }))).toMatchObject({ ok: false, status: 403 });
    expect(authorise(profile({ status: 'rejected', portals: ['crm'] }))).toMatchObject({ ok: false, status: 403 });
  });
  it('treats a missing profile as an expired session', () => {
    expect(authorise(null)).toMatchObject({ ok: false, status: 401 });
  });
});

/** Metis can only draft. These guard the rule that nothing reaches a customer without a person pressing Send. */
describe('draft only, never send', () => {
  const root = path.resolve(__dirname, '../..');
  const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

  it('has no tool that sends', () => {
    const src = read('src/lib/assistant/tools.ts');
    const names = [...src.matchAll(/^\s{4}name: '([a-z_]+)'/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(5);
    for (const n of names) expect(n).not.toMatch(/send|post|publish|dispatch|nudge/);
  });

  it('never marks a draft sent, nor imports a sender, in the assistant or desktop code', () => {
    for (const f of ['src/lib/assistant/tools.ts', 'src/lib/assistant/run.ts', 'src/app/api/desktop/chat/route.ts', 'src/lib/desktop/auth.ts']) {
      const src = read(f);
      expect(src, f).not.toMatch(/status:\s*'sent'/);
      expect(src, f).not.toMatch(/sent_at/);
      expect(src, f).not.toMatch(/from 'resend'|@\/lib\/resend|@\/lib\/ms365|whatsapp\/send|send-quote|send-document/);
    }
  });

  it('saves every draft with the default draft status', () => {
    const src = read('src/lib/assistant/tools.ts');
    const inserts = [...src.matchAll(/from\('assistant_drafts'\)\s*\.insert\(\{([^}]*)\}/g)];
    expect(inserts.length).toBeGreaterThan(0);
    for (const m of inserts) expect(m[1]).not.toMatch(/status/);
  });
});
