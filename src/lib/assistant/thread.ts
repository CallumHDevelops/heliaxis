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

/* ---- Several conversations per person (the desktop app's thread sidebar) ---- */

export type ThreadRow = { id: string; user_id: string; messages: Msg[]; archived: boolean; title?: string | null; created_at: string; updated_at: string };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** A thread's name: the one it was given, else the start of the first thing the person said. */
export function threadTitle(t: Pick<ThreadRow, 'title' | 'messages'>) {
  if (t.title?.trim()) return t.title.trim();
  const first = visibleMessages(t.messages).find((m) => m.role === 'user');
  return first ? clip(first.text.replace(/\s+/g, ' '), 60) : 'New chat';
}

/** The person's own threads, newest first, optionally only those whose title or words contain `q`. */
export async function listThreads(userId: string, opts: { archived?: boolean; q?: string } = {}) {
  const { data } = await createAdminClient()
    .from('assistant_threads')
    .select('*')
    .eq('user_id', userId)
    .eq('archived', !!opts.archived)
    .order('updated_at', { ascending: false })
    .limit(200);
  const needle = (opts.q ?? '').trim().toLowerCase();
  return ((data ?? []) as ThreadRow[])
    .map((t) => ({ t, title: threadTitle(t), text: visibleMessages(t.messages).map((m) => m.text).join('\n').toLowerCase() }))
    .filter(({ title, text }) => !needle || title.toLowerCase().includes(needle) || text.includes(needle))
    .map(({ t, title }) => ({ id: t.id, title, updated_at: t.updated_at, archived: t.archived }));
}

/** One of the person's own threads (never anyone else's). */
export async function ownThread(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const { data } = await createAdminClient().from('assistant_threads').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  return (data as ThreadRow | null) ?? undefined;
}

export async function createThread(userId: string) {
  const { data, error } = await createAdminClient().from('assistant_threads').insert({ user_id: userId, messages: [] }).select('id').single();
  if (error || !data) throw new Error(error?.message || 'Could not start a chat');
  return data.id as string;
}

/** Rename and/or archive (or restore) one of the person's threads. Renaming needs supabase/assistant-threads-v2.sql. */
export async function patchThread(userId: string, id: string, patch: { title?: string; archived?: boolean }) {
  const own = await ownThread(userId, id);
  if (!own) return { error: 'Chat not found.' as const, status: 404 as const };
  const set: Record<string, unknown> = {};
  if (typeof patch.title === 'string') set.title = patch.title.trim().slice(0, 120) || null;
  if (typeof patch.archived === 'boolean') set.archived = patch.archived;
  if (!Object.keys(set).length) return { ok: true as const };
  const { error } = await createAdminClient().from('assistant_threads').update(set).eq('id', id).eq('user_id', userId);
  if (error) return { error: /title/.test(error.message) ? ('Renaming needs supabase/assistant-threads-v2.sql to be run in Supabase first.' as const) : error.message, status: 400 as const };
  return { ok: true as const };
}
