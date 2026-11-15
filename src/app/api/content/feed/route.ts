import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { json } from '@/lib/crm/server';
import { listContentPhotos } from '@/lib/content/server';

export const dynamic = 'force-dynamic';

const ok = (given: string, want: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * A read-only feed of the content library for another system (the social studio) to pull from: `Authorization: Bearer <CONTENT_FEED_TOKEN>`,
 * `?after=<created_at>` for what is new since last time. Off until CONTENT_FEED_TOKEN is set in Vercel. Links last 24 hours.
 */
export async function GET(req: Request) {
  const want = process.env.CONTENT_FEED_TOKEN;
  if (!want || want.length < 24) return json({ error: 'Not switched on.' }, 404);
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!given || !ok(given, want)) return json({ error: 'unauthorized' }, 401);
  const after = new URL(req.url).searchParams.get('after');
  const photos = await listContentPhotos(createAdminClient(), { after, limit: 200, seconds: 86_400 });
  return json({ photos, next: photos.length ? photos[photos.length - 1].created_at : after });
}
