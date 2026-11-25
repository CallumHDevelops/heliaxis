import { NextResponse } from 'next/server';
import { createThread, listThreads } from '@/lib/assistant/thread';
import { desktopSession } from '@/lib/desktop/auth';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** The person's own chats: ?archived=1 for the archive, ?q= to search titles and words. */
export async function GET(req: Request) {
  const a = await desktopSession(req);
  if ('error' in a) return json({ error: a.error }, a.status);
  const u = new URL(req.url);
  const threads = await listThreads(a.session.user.id, { archived: u.searchParams.get('archived') === '1', q: u.searchParams.get('q') ?? '' });
  return json({ threads });
}

/** Start a new, empty chat. */
export async function POST(req: Request) {
  const a = await desktopSession(req);
  if ('error' in a) return json({ error: a.error }, a.status);
  try {
    return json({ id: await createThread(a.session.user.id) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not start a chat' }, 500);
  }
}
