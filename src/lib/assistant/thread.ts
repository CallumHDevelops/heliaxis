import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Msg } from './run';

/** The person's current (unarchived) conversation. Shared by HAP's own route and the desktop app's, so both see one thread. */
export async function currentThread(userId: string) {
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
export function visibleMessages(messages: Msg[]) {
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

/** Save the conversation after a turn (creates it on the first message). */
export async function saveThread(userId: string, existingId: string | undefined, messages: Msg[]) {
  const db = createAdminClient();
  if (existingId) await db.from('assistant_threads').update({ messages, updated_at: new Date().toISOString() }).eq('id', existingId);
  else await db.from('assistant_threads').insert({ user_id: userId, messages });
}
