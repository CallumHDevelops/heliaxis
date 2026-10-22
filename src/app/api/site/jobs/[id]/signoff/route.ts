import { after } from 'next/server';
import { clientIp } from '@/lib/subcontractors/server';
import { deviceSession, isResponse, siteJson, theirAssignment } from '@/lib/site/device';
import { finishSignoff, signOff, type SignoffInput } from '@/lib/site/signoff';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * A sign-off from the phone: { op_id, stage, name, signature, declaration, signed_at, rev }. 422
 * with what's missing when the server's gate doesn't pass (the phone shows it and opens the form
 * again); a retry gets the first result. The reply carries the PO so the done screen can show it;
 * issuing it, the trade's report and telling the job owner run after the reply.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await deviceSession(req);
  if (isResponse(s)) return s;
  const a = await theirAssignment(s, (await params).id);
  if (isResponse(a)) return a;
  const raw = await req.text().catch(() => '');
  if (raw.length > 400_000) return siteJson({ error: 'too_big', message: 'That signature is too big to send.' }, 413);
  let b: SignoffInput = {};
  try {
    b = JSON.parse(raw || '{}') as SignoffInput;
  } catch {
    return siteJson({ error: 'bad', message: 'That sign-off didn’t arrive whole. Sign again.' }, 400);
  }
  const r = await signOff(s.db, a, b, { deviceId: s.device.id, ip: clientIp(req.headers), userAgent: req.headers.get('user-agent') });
  if (!r.ok) return siteJson(r.body, r.status);
  // Each step stamps its column; the cron finishes any that don't run here (a retry leaves them to it,
  // so two runs never issue the same PO at once).
  if (r.fresh) after(() => finishSignoff(s.db, r.signoff.id).then(() => null));
  return siteJson(r.reply);
}
