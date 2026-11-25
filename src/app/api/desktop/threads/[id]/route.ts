import { NextResponse } from 'next/server';
import { ownThread, patchThread, threadTitle, visibleMessages } from '@/lib/assistant/thread';
import { desktopSession } from '@/lib/desktop/auth';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const a = await desktopSession(req);
  if ('error' in a) return json({ error: a.error }, a.status);
  const t = await ownThread(a.session.user.id, (await params).id);
  if (!t) return json({ error: 'Chat not found.' }, 404);
  return json({ id: t.id, title: threadTitle(t), archived: t.archived, messages: visibleMessages(t.messages) });
}

/** { title?, archived? }: rename, archive or restore one of your own chats. */
export async function PATCH(req: Request, { params }: Ctx) {
  const a = await desktopSession(req);
  if ('error' in a) return json({ error: a.error }, a.status);
  const b = await req.json().catch(() => ({}));
  const r = await patchThread(a.session.user.id, (await params).id, { title: typeof b.title === 'string' ? b.title : undefined, archived: typeof b.archived === 'boolean' ? b.archived : undefined });
  return 'error' in r ? json({ error: r.error }, r.status) : json({ ok: true });
}
