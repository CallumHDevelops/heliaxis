import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { assistantConfigured, runAssistant, type Msg } from '@/lib/assistant/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Session = NonNullable<Awaited<ReturnType<typeof crmSession>>>;
const actor = (s: Session) => ({ id: s.user.id, name: s.profile.full_name || s.profile.email || 'Someone' });

async function thread(userId: string) {
  const { data } = await createAdminClient()
    .from('assistant_threads')
    .select('id, messages')
    .eq('user_id', userId)
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(1);
  return data?.[0] as { id: string; messages: Msg[] } | undefined;
}

/** What to show: the user's words and Metis's replies (tool calls and thinking left out). */
function visible(messages: Msg[]) {
  const out: { role: 'user' | 'assistant'; text: string }[] = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (typeof m.content === 'string') {
      if (m.content.trim()) out.push({ role: m.role, text: m.content });
      continue;
    }
    const text = m.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
      .trim();
    if (!text) continue;
    // Several assistant steps in one answer read as one bubble.
    const prev = out[out.length - 1];
    if (m.role === 'assistant' && prev?.role === 'assistant') prev.text += `\n\n${text}`;
    else out.push({ role: m.role, text });
  }
  return out;
}

export async function GET() {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const t = await thread(s.user.id).catch(() => undefined);
  return json({ configured: assistantConfigured(), messages: visible(t?.messages ?? []) });
}

/** { text } — one message to Metis. Returns its reply and what it did. */
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
  const t = await thread(s.user.id);
  let result;
  try {
    result = await runAssistant(t?.messages ?? [], text, actor(s));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Metis didn’t answer';
    return json({ error: /overloaded|529/i.test(msg) ? 'Metis is busy right now — try again in a minute.' : msg }, 502);
  }
  const now = new Date().toISOString();
  if (t) await db.from('assistant_threads').update({ messages: result.messages, updated_at: now }).eq('id', t.id);
  else await db.from('assistant_threads').insert({ user_id: s.user.id, messages: result.messages });
  return json({ reply: result.reply, actions: result.actions });
}

/** Start a new conversation (the old one is kept, archived). */
export async function DELETE() {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  await createAdminClient().from('assistant_threads').update({ archived: true }).eq('user_id', s.user.id).eq('archived', false);
  return json({ ok: true });
}
