import { NextResponse } from 'next/server';
import { contextFor, learnFromSent } from '@/lib/mail/sync';
import { mailSession } from '@/lib/mail/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Learn my style again now: reads up to 40 of your recent sent emails and rewrites the style guide (replacing your edits). */
export async function POST() {
  const s = await mailSession();
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: s.status });
  if (!s.box) return NextResponse.json({ error: 'Connect your mailbox first.' }, { status: 400 });
  if (s.box.sent_before) return NextResponse.json({ error: 'Still reading your sent emails for the first time. Try again once that’s finished.' }, { status: 400 });
  const ctx = await contextFor(s.db, s.box.id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ok = await learnFromSent(ctx);
  if (!ok) return NextResponse.json({ error: 'Couldn’t learn it: there need to be at least five emails you wrote yourself in Sent Items.' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
