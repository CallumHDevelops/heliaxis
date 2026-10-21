import { deviceSession, isResponse, siteJson, theirAssignment } from '@/lib/site/device';
import { afterAnswers, lateKeysFor } from '@/lib/site/hooks';
import { logSiteEvent, readAssignment } from '@/lib/site/server';
import type { Answer } from '@/lib/site/types';

export const dynamic = 'force-dynamic';

const KEY = /^[A-Za-z][A-Za-z0-9_]{0,30}(?::[A-Za-z0-9_-]{1,30})?$/;
/** Keys only the office writes (the EIC's design part, signed in the office by sign-design): never set or cleared from a phone. */
const OFFICE_KEYS = new Set(['eic_design']);
const phoneKey = (k: string) => KEY.test(k) && !OFFICE_KEYS.has(k.split(':')[0]);
const SOURCES = ['typed', 'scan', 'photo', 'roofer', 'design', 'job', 'calc', 'last'];
const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);

/** One answer from the phone, checked (value at most 4 kB of JSON), with the phone it came from. */
function cleanAnswer(x: unknown, device: string): Answer | null {
  if (!x || typeof x !== 'object' || !('v' in x)) return null;
  const a = x as { v: unknown; src?: unknown; at?: unknown };
  if (JSON.stringify(a.v ?? null).length > 4000) return null;
  const at = typeof a.at === 'string' && !Number.isNaN(Date.parse(a.at)) ? new Date(a.at).toISOString() : new Date().toISOString();
  return { v: a.v ?? null, src: SOURCES.includes(String(a.src)) ? (a.src as Answer['src']) : 'typed', at, dev: device };
}

/**
 * Answers from the phone: { ops: [{ op_id, set: { key: { v, src, at } }, unset: [key] }] }. Each op
 * is applied once (site_ops), per key without touching the others (site_answers_patch). When a key
 * another phone answered differently changes, the later one wins and the earlier one is kept in the
 * history. Once signed off the form is locked (409 "signed"), apart from the keys still open after
 * a sign-off (the scaffold's tag and strike). Replies with every answer the server holds, so the
 * phone's draft takes the others' changes, and the flags.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await deviceSession(req);
  if (isResponse(s)) return s;
  const a = await theirAssignment(s, (await params).id);
  if (isResponse(a)) return a;
  const b = (await req.json().catch(() => ({}))) as { ops?: unknown };
  const ops = (Array.isArray(b.ops) ? b.ops : []).slice(0, 50) as { op_id?: unknown; set?: unknown; unset?: unknown }[];
  if (JSON.stringify(ops).length > 128_000) return siteJson({ error: 'too_big', message: 'Too much to send at once.' }, 413);
  const late = new Set(await lateKeysFor(s.db, a));
  let rev = a.rev;
  let applied = 0;
  for (const op of ops) {
    if (!isUuid(op.op_id)) continue;
    const set: Record<string, Answer> = {};
    for (const [k, v] of Object.entries(op.set && typeof op.set === 'object' ? (op.set as Record<string, unknown>) : {})) {
      const clean = phoneKey(k) ? cleanAnswer(v, s.device.id) : null;
      if (clean) set[k] = clean;
    }
    const unset = (Array.isArray(op.unset) ? op.unset : []).filter((k): k is string => typeof k === 'string' && phoneKey(k));
    const keys = [...Object.keys(set), ...unset];
    if (!keys.length) continue;
    const signed = a.status === 'signed' || a.status === 'done';
    if (signed && !keys.every((k) => late.has(k))) {
      return siteJson({ error: 'signed', message: `Signed off on ${new Date(a.signed_at ?? Date.now()).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' })}. Ask the office to reopen it.`, rev, answers: a.answers }, 409);
    }
    // Once only: a replayed op is a no-op.
    const { error: dup } = await s.db.from('site_ops').insert({ assignment_id: a.id, op_id: op.op_id, kind: 'answers' });
    if (dup) {
      if (dup.code === '23505') continue;
      return siteJson({ error: 'busy', message: 'That didn’t save. It will try again.' }, 503);
    }
    // Another phone answered the same question differently: the later one wins, the earlier is kept.
    for (const k of Object.keys(set)) {
      const was = a.answers[k] as Answer | undefined;
      if (was && was.dev && was.dev !== s.device.id && JSON.stringify(was.v) !== JSON.stringify(set[k].v)) {
        await logSiteEvent(s.db, a.id, 'trade', 'two_phones', { key: k, was: was.v, now: set[k].v, from: was.dev });
      }
    }
    const { data: r, error } = await s.db.rpc('site_answers_patch', { p_assignment: a.id, p_set: set, p_unset: unset, p_late: signed });
    if (error || r === null || r === undefined) {
      await s.db.from('site_ops').delete().eq('assignment_id', a.id).eq('op_id', op.op_id);
      if (error) return siteJson({ error: 'busy', message: 'That didn’t save. It will try again.' }, 503);
      return siteJson({ error: 'signed', message: 'This form is signed off. Ask the office to reopen it.' }, 409);
    }
    rev = Number(r);
    applied++;
    for (const k of unset) delete a.answers[k];
    Object.assign(a.answers, set);
  }
  const now = (await readAssignment(s.db, a.id)) ?? a;
  const flags = applied ? await afterAnswers(s.db, now) : now.flags;
  return siteJson({ rev: now.rev ?? rev, answers: now.answers, flags, status: now.status });
}
