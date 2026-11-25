import { assistantConfigured, runAssistant } from '@/lib/assistant/run';
import { currentThread, saveThread, visibleMessages } from '@/lib/assistant/thread';
import { actorOf, desktopSession } from '@/lib/desktop/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** The current conversation: the same thread HAP shows. */
export async function GET(req: Request) {
  const a = await desktopSession(req);
  if ('error' in a) return json({ error: a.error }, a.status);
  const t = await currentThread(a.session.user.id).catch(() => undefined);
  return json({ configured: assistantConfigured(), me: actorOf(a.session).name, theme: a.session.profile.theme ?? 'system', messages: visibleMessages(t?.messages ?? []) });
}

/**
 * { text }: one message to Metis, answered as a server-sent event stream:
 *   event: tool  data: { name }            a tool she has started (for the "working…" line)
 *   event: done  data: { reply, actions }  her answer and the items she created (cards)
 *   event: error data: { error }
 * Metis can only draft: nothing is sent to a customer from here.
 */
export async function POST(req: Request) {
  const a = await desktopSession(req);
  if ('error' in a) return json({ error: a.error }, a.status);
  if (!assistantConfigured()) return json({ error: 'The assistant is not switched on (ANTHROPIC_API_KEY is missing).' }, 400);
  const b = await req.json().catch(() => ({}));
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, 8000) : '';
  if (!text) return json({ error: 'Say something first.' }, 400);
  const { error: missing } = await createAdminClient().from('assistant_threads').select('id').limit(1);
  if (missing) return json({ error: 'Run supabase/assistant.sql in Supabase first.' }, 400);

  const me = actorOf(a.session);
  const t = await currentThread(me.id);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (event: string, data: unknown) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        const result = await runAssistant(t?.messages ?? [], text, me, { ref: 'desktop', onTool: (name) => send('tool', { name }) });
        await saveThread(me.id, t?.id, result.messages);
        send('done', { reply: result.reply, actions: result.actions });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Metis did not answer';
        const error = /overloaded|529/i.test(msg) ? 'Metis is busy right now: try again in a minute.' : /rate.?limit|429/i.test(msg) ? 'The AI usage limit was reached: try again shortly.' : msg;
        send('error', { error });
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform' } });
}

/** Start a new conversation (the old one is kept, archived), as in HAP. */
export async function DELETE(req: Request) {
  const a = await desktopSession(req);
  if ('error' in a) return json({ error: a.error }, a.status);
  await createAdminClient().from('assistant_threads').update({ archived: true }).eq('user_id', a.session.user.id).eq('archived', false);
  return json({ ok: true });
}
