import { deviceSession, isResponse, siteJson, theirAssignment } from '@/lib/site/device';
import { afterAnswers } from '@/lib/site/hooks';
import { readAssignment } from '@/lib/site/server';
import { queueRead, readsEnabled, runRead } from '@/lib/site/vision';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,30}$/;

/**
 * Read a label photo now: { photo_id, key } → { status, result }. The phone waits up to about 15 s,
 * so the roofer hears "That label couldn't be read. Take another?" while they're still there. If the
 * upload's own read is already running, this waits for it rather than reading twice. 'queued' means
 * it will be read later (the cron) and the result comes with the next job pack.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await deviceSession(req);
  if (isResponse(s)) return s;
  const a = await theirAssignment(s, (await params).id);
  if (isResponse(a)) return a;
  const b = (await req.json().catch(() => ({}))) as { photo_id?: unknown; key?: unknown };
  if (!isUuid(b.photo_id) || typeof b.key !== 'string' || !KEY.test(b.key)) return siteJson({ error: 'bad', message: 'That photo can’t be read.' }, 400);
  if (!readsEnabled()) return siteJson({ status: 'off', result: null });
  const { data: ph } = await s.db.from('crm_photos').select('id').eq('id', b.photo_id).eq('assignment_id', a.id).maybeSingle();
  if (!ph) return siteJson({ error: 'bad', message: 'That photo isn’t on this job.' }, 404);

  await queueRead(s.db, a.id, b.photo_id, b.key);
  const until = Date.now() + 15_000;
  let row = await runRead(s.db, b.photo_id);
  while (row?.status === 'queued' && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1000));
    row = await runRead(s.db, b.photo_id);
  }
  if (row && row.status !== 'queued') {
    const fresh = await readAssignment(s.db, a.id);
    if (fresh) await afterAnswers(s.db, fresh);
  }
  return siteJson({ status: row?.status ?? 'queued', result: row?.result ?? null, key: b.key, photo_id: b.photo_id });
}
