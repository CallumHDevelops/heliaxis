import { beforeEach, describe, expect, it, vi } from 'vitest';

// Texts and mail are captured, not sent.
const sent: { to: string; content: string }[] = [];
vi.mock('@/lib/sms', () => ({
  smsConfigured: () => true,
  toMsisdn: (p: string) => (/^07\d{9}$/.test(p.replace(/\s/g, '')) ? `44${p.replace(/\s/g, '').slice(1)}` : null),
  sendSms: async (to: string, content: string) => {
    sent.push({ to, content });
    return { ok: true, id: 'x' };
  },
}));
vi.mock('@/lib/ms365', () => ({ msConfigured: () => true, sendMail: async (o: { to: string; text: string }) => void sent.push({ to: o.to, content: o.text }) }));
vi.mock('@/lib/crm/server', () => ({ siteUrl: () => 'https://heliaxis.co.uk' }));

import { channelsFor, checkCode, maskEmail, maskMobile, MAX_TRIES, sendCode } from '@/lib/crm/portal-codes';

/** Just enough of the Supabase query builder for portal-codes.ts, over one in-memory table. */
type Row = Record<string, unknown>;
function fakeDb() {
  const rows: Row[] = [];
  let n = 0;
  const builder = (op: 'select' | 'update' | 'insert', payload?: Row) => {
    const filters: ((r: Row) => boolean)[] = [];
    let wantRows = op === 'select';
    let inserted: Row | null = null;
    const run = () => {
      if (op === 'insert') {
        inserted = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, attempts: 0, used_at: null, ...payload };
        rows.push(inserted);
        return [inserted];
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') for (const r of hit) Object.assign(r, payload);
      return hit;
    };
    const b = {
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), b),
      gte: () => b,
      select: () => ((wantRows = true), b),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (ok: (v: { data: Row[] | null; error: null; count?: number }) => unknown) => {
        const r = run();
        return Promise.resolve(ok({ data: wantRows ? r : null, error: null, count: r.length }));
      },
    };
    return b;
  };
  const db = {
    from: () => ({
      select: () => builder('select'),
      update: (p: Row) => builder('update', p),
      insert: (p: Row) => builder('insert', p),
    }),
  };
  return { db: db as never, rows };
}

const contact = { name: 'Sam Jones', email: 'sam@example.com', mobile: '07700900123' };
const codeIn = (s: string) => /is (\d{6})/.exec(s)?.[1] ?? '';

describe('portal sign-in codes', () => {
  beforeEach(() => {
    sent.length = 0;
    process.env.PORTAL_CODE_SECRET = 'test-secret';
  });

  it('masks what it shows', () => {
    expect(maskEmail('sam@example.com')).toBe('s•••@example.com');
    expect(maskMobile('07700 900123')).toBe('07••• •••123');
    expect(channelsFor(contact).map((c) => c.kind)).toEqual(['sms', 'email']);
    expect(channelsFor({ name: 'x', email: null, mobile: 'nope' })).toEqual([]);
  });

  it('sends a 6-digit code, stores only its hash, and opens once', async () => {
    const { db, rows } = fakeDb();
    const r = await sendCode(db, { projectId: 'p1', contact, channel: 'sms', ip: '1.2.3.4' });
    expect(r.ok).toBe(true);
    const code = codeIn(sent[0].content);
    expect(code).toMatch(/^\d{6}$/);
    expect(sent[0].content).toContain('@portal.heliaxis.co.uk #' + code);
    expect(JSON.stringify(rows)).not.toContain(`"${code}"`);
    const id = (r as { id: string }).id;
    expect(await checkCode(db, id, code)).toEqual({ ok: true, projectId: 'p1' });
    expect((await checkCode(db, id, code)).ok).toBe(false);
  });

  it('counts wrong tries and stops after the limit', async () => {
    const { db } = fakeDb();
    const r = (await sendCode(db, { projectId: 'p1', contact, channel: 'email', ip: null })) as { id: string };
    const code = codeIn(sent[0].content);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 1; i < MAX_TRIES; i++) expect((await checkCode(db, r.id, wrong)).ok).toBe(false);
    const last = await checkCode(db, r.id, wrong);
    expect(last).toMatchObject({ ok: false, dead: true });
    expect((await checkCode(db, r.id, code)).ok).toBe(false);
  });

  it('refuses an expired code, and a new code ends the old one', async () => {
    const { db, rows } = fakeDb();
    const a = (await sendCode(db, { projectId: 'p1', contact, channel: 'sms', ip: null })) as { id: string };
    const codeA = codeIn(sent[0].content);
    const b = (await sendCode(db, { projectId: 'p1', contact, channel: 'sms', ip: null })) as { id: string };
    const codeB = codeIn(sent[1].content);
    expect((await checkCode(db, a.id, codeA)).ok).toBe(false);
    rows.find((x) => x.id === b.id)!.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await checkCode(db, b.id, codeB)).toMatchObject({ ok: false, dead: true });
  });
});
