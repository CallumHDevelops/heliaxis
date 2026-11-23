import { NextResponse } from 'next/server';
import { learnSignature } from '@/lib/mail/sync';
import { mailSession } from '@/lib/mail/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Copy my signature again now, from my latest sent emails (it's also done weekly). */
export async function POST() {
  const s = await mailSession();
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: s.status });
  if (!s.box) return NextResponse.json({ error: 'Connect your mailbox first.' }, { status: 400 });
  // Asked for: copied again from your sent emails, even if you'd given one (kept if none is found).
  await s.db.from('mail_boxes').update({ signature_locked: false }).eq('id', s.box.id);
  const found = await learnSignature(s.db, s.box).catch((e) => (e instanceof Error ? e.message : 'failed'));
  if (typeof found === 'string') return NextResponse.json({ error: found }, { status: 502 });
  return NextResponse.json({ ok: true, found });
}
