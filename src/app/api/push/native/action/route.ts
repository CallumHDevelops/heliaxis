import { after, NextResponse } from 'next/server';
import { readPushAction } from '@/lib/push-actions';
import { processOutbox } from '@/lib/whatsapp/inbox';
import { cancelQueued, markSendNow } from '@/lib/whatsapp/outbox-actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * A button tapped on an Android notification. No sign-in: the token itself (signed by
 * src/lib/notify.ts, valid for a few hours) names the one action on the one queued reply.
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const act = readPushAction(b?.token);
  if (!act) return NextResponse.json({ ok: false, message: 'That button has expired. Open the chat.' }, { status: 403, headers: NO_STORE });

  if (act.action === 'outbox-cancel') {
    const kind = await cancelQueued(act.outboxId);
    return kind
      ? NextResponse.json({ ok: true, message: kind === 'scheduled' ? 'Cancelled: that message won’t go' : 'Smart reply cancelled' }, { headers: NO_STORE })
      : NextResponse.json({ ok: false, message: 'Too late: that message has already gone' }, { status: 409, headers: NO_STORE });
  }
  if (!(await markSendNow(act.outboxId))) {
    return NextResponse.json({ ok: false, message: 'Already sent or cancelled' }, { status: 409, headers: NO_STORE });
  }
  // Answer the phone straight away (it gives up after a few seconds); send in the background.
  after(() => processOutbox().catch(() => {}));
  return NextResponse.json({ ok: true, message: 'Sending your reply now' }, { headers: NO_STORE });
}
