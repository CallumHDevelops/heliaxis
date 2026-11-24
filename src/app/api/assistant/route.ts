import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { assistantConfigured, runAssistant, type AssistantEvent, type Msg } from '@/lib/assistant/run';
import { visible } from '@/lib/assistant/visible';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Session = NonNullable<Awaited<ReturnType<typeof crmSession>>>;
type Thread = { id: string; messages: Msg[] };
const actor = (s: Session) => ({ id: s.user.id, name: s.profile.full_name || s.profile.email || 'Someone' });
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/** The user's latest live conversation (what /admin/assistant carries on with). */
async function latest(userId: string) {
  const { data } = await createAdminClient()
    .from('assistant_threads')
    .select('id, messages')
    .eq('user_id', userId)
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(1);
  return data?.[0] as Thread | undefined;
}

/** One of the user's own conversations by id (archived ones too: "Last chat" and links reopen them). Never someone else's. */
async function byId(userId: string, id: string) {
  const { data } = await createAdminClient().from('assistant_threads').select('id, messages').eq('id', id).eq('user_id', userId).maybeSingle();
  return (data as Thread | null) ?? undefined;
}

/** ?thread=<id>: that conversation; otherwise the latest live one. */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const id = new URL(req.url).searchParams.get('thread');
  const t = await (isUuid(id) ? byId(s.user.id, id) : latest(s.user.id)).catch(() => undefined);
  if (isUuid(id) && !t) return json({ error: 'That conversation isn’t there any more.' }, 404);
  return json({ configured: assistantConfigured(), thread_id: t?.id ?? null, messages: visible(t?.messages ?? []) });
}

/**
 * { text, thread_id?, new?, stream? } — one message to Hestia.
 * thread_id: carry on that conversation; new: start a fresh one (saved once she has answered); neither: the
 * latest. Without stream: { reply, actions, thread_id }. With stream: newline-delimited JSON events as she
 * works ({t:'text',d}, {t:'step'}, {t:'tool',name}, {t:'action',a}), then {t:'done', reply, actions,
 * thread_id, refused} or {t:'error', error}.
 */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!assistantConfigured()) return json({ error: 'Add ANTHROPIC_API_KEY in Vercel to switch the assistant on.' }, 400);
  const b = await req.json().catch(() => ({}));
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, 8000) : '';
  if (!text) return json({ error: 'Say something first.' }, 400);

  const db = createAdminClient();
  const { error: missing } = await db.from('assistant_threads').select('id').limit(1);
  if (missing) return json({ error: 'Run supabase/assistant.sql in Supabase first.' }, 400);
  let t: Thread | undefined;
  if (isUuid(b.thread_id)) {
    t = await byId(s.user.id, b.thread_id);
    if (!t) return json({ error: 'That conversation isn’t there any more. Start a new one.' }, 404);
  } else if (b.new !== true) t = await latest(s.user.id);

  /** Saves the conversation; returns its id. */
  async function save(messages: Msg[]) {
    const now = new Date().toISOString();
    if (t) {
      await db.from('assistant_threads').update({ messages, updated_at: now, archived: false }).eq('id', t.id);
      return t.id;
    }
    const { data } = await db.from('assistant_threads').insert({ user_id: s!.user.id, messages }).select('id').single();
    return (data?.id as string | undefined) ?? null;
  }
  const failure = (e: unknown) => {
    const msg = e instanceof Error ? e.message : 'Hestia didn’t answer';
    return /overloaded|529/i.test(msg) ? 'Hestia is busy right now — try again in a minute.' : msg;
  };

  if (b.stream !== true) {
    try {
      const result = await runAssistant(t?.messages ?? [], text, actor(s));
      const id = await save(result.messages);
      return json({ reply: result.reply, actions: result.actions, thread_id: id });
    } catch (e) {
      return json({ error: failure(e) }, 502);
    }
  }

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const put = (e: AssistantEvent | Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false; // the phone went away: carry on, so the answer is saved for when they come back
        }
      };
      try {
        const result = await runAssistant(t?.messages ?? [], text, actor(s), put);
        const id = await save(result.messages);
        put({ t: 'done', reply: result.reply, actions: result.actions, thread_id: id, refused: !!result.refused });
      } catch (e) {
        put({ t: 'error', error: failure(e) });
      }
      if (open) controller.close();
    },
  });
  return new Response(body, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}

/** Start a new conversation (the old one is kept, archived). */
export async function DELETE() {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  await createAdminClient().from('assistant_threads').update({ archived: true }).eq('user_id', s.user.id).eq('archived', false);
  return json({ ok: true });
}
