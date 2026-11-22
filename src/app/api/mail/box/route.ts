import { NextResponse } from 'next/server';
import { msConfigured } from '@/lib/ms365';
import { testMailbox } from '@/lib/mail/graph';
import { countsFor, mailSession } from '@/lib/mail/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } });

/** My email: this person's mailbox, its settings and how far the first read has got. */
export async function GET() {
  const s = await mailSession();
  if (!s.ok) return json({ error: s.error }, s.status);
  if (!s.box) return json({ box: null, email: s.email, connected: msConfigured() });
  const [counts, rules] = await Promise.all([
    countsFor(s.db, s.box.id),
    s.db.from('mail_rules').select('status', { count: 'exact', head: true }).eq('box_id', s.box.id).eq('status', 'suggested'),
  ]);
  const { count: read } = await s.db.from('mail_messages').select('id', { count: 'exact', head: true }).eq('box_id', s.box.id);
  return json({ box: s.box, email: s.email, connected: true, counts, suggested: rules.count ?? 0, read: read ?? 0 });
}

/** Connect: always the person's own sign-in address. The app checks it can open it first. Nothing is moved yet. */
export async function POST() {
  const s = await mailSession();
  if (!s.ok) return json({ error: s.error }, s.status);
  if (!msConfigured()) return json({ error: 'Microsoft 365 isn’t connected yet (Setup › Connect Microsoft 365 email).' }, 400);
  if (s.box) return json({ box: s.box });
  if (!s.email.includes('@')) return json({ error: 'Your account has no email address.' }, 400);
  const test = await testMailbox(s.email);
  if (!test.ok) return json({ error: test.error }, 400);
  const now = new Date().toISOString();
  const { data, error } = await s.db
    .from('mail_boxes')
    .insert({ user_id: s.userId, address: s.email, scan_before: now, sent_before: now, live_since: now })
    .select('id')
    .single();
  if (error || !data) return json({ error: error?.message || 'Couldn’t connect it.' }, 500);
  return json({ ok: true });
}

/** Settings: filing, marketing, drafts, signature. */
export async function PATCH(req: Request) {
  const s = await mailSession();
  if (!s.ok) return json({ error: s.error }, s.status);
  if (!s.box) return json({ error: 'Connect your mailbox first.' }, 400);
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const k of ['filing', 'marketing', 'drafts', 'outlook_drafts', 'highlight'] as const) if (typeof b[k] === 'boolean') patch[k] = b[k];
  if (typeof b.signature === 'string') patch.signature = b.signature.trim().slice(0, 1000) || null;
  // What every reply ends with, just above the signature ("Kind regards," unless you change it).
  if (typeof b.sign_off === 'string') patch.sign_off = b.sign_off.trim().slice(0, 60) || 'Kind regards,';
  // Your edit of your writing style: kept as it is (the monthly re-learn leaves it alone).
  if (typeof b.style === 'string') {
    patch.style = b.style.trim().slice(0, 4000) || null;
    patch.style_edited = !!patch.style;
  }
  if (!Object.keys(patch).length) return json({ error: 'Nothing to change.' }, 400);
  const { error } = await s.db.from('mail_boxes').update(patch).eq('id', s.box.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

/** Disconnect: forgets everything the app saved about this mailbox. Outlook itself (and every folder made) is left as it is. */
export async function DELETE() {
  const s = await mailSession();
  if (!s.ok) return json({ error: s.error }, s.status);
  if (!s.box) return json({ ok: true });
  const { error } = await s.db.from('mail_boxes').delete().eq('id', s.box.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
