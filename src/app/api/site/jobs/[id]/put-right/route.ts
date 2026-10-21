import { after } from 'next/server';
import { clientIp } from '@/lib/subcontractors/server';
import { deviceSession, isResponse, siteJson, theirAssignment } from '@/lib/site/device';
import { afterPutRight, putRight, type PutRightInput } from '@/lib/site/returns';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * A Put right from the phone after a return to site: { op_id, n, note, name, signature, declaration,
 * signed_at }. The photos of the fix (slot PR:<n>) have gone first. 422 when none has reached the
 * server; a retry gets the same reply. It goes back to the office for review; the trade's report is
 * made again after the reply.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await deviceSession(req);
  if (isResponse(s)) return s;
  const a = await theirAssignment(s, (await params).id);
  if (isResponse(a)) return a;
  const raw = await req.text().catch(() => '');
  if (raw.length > 400_000) return siteJson({ error: 'too_big', message: 'That signature is too big to send.' }, 413);
  let b: PutRightInput = {};
  try {
    b = JSON.parse(raw || '{}') as PutRightInput;
  } catch {
    return siteJson({ error: 'bad', message: 'That put right didn’t arrive whole. Sign again.' }, 400);
  }
  const r = await putRight(s.db, a, b, { deviceId: s.device.id, ip: clientIp(req.headers), userAgent: req.headers.get('user-agent') });
  if (!r.ok) return siteJson(r.body, r.status);
  if (r.fresh) after(() => afterPutRight(s.db, a).then(() => null));
  return siteJson({ return: r.ret });
}
