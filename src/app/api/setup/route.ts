import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { answersArePublic, saveAnswer } from '@/lib/claude-answers';
import { assignTodo, isAssigned, markDone, setupTodos, visibleSetupTodos } from '@/lib/setup-checks';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: NO_STORE });

/** The "From Claude" setup to-dos: all of them for admins, just the ones passed to them for members. */
export async function GET() {
  const s = await requireApproved();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role === 'admin') return json({ todos: await setupTodos() });
  return json({ todos: (await visibleSetupTodos(s.user.id, false)).mine });
}

/**
 * { done: id } ticks a to-do; { undone: id } unticks it. Admins can tick anything, members only
 * what's passed to them.
 * { assign: { id, userIds } } (admins only) chooses who sees it; [] = back to admins.
 */
export async function PATCH(req: Request) {
  const s = await requireApproved();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const isAdmin = s.profile.role === 'admin';
  const b = await req.json().catch(() => ({}));
  const may = async (id: string) => isAdmin || (await isAssigned(id, s.user.id));
  if (typeof b.done === 'string') {
    if (!(await may(b.done))) return json({ error: 'forbidden' }, 403);
    await markDone(b.done);
  }
  if (typeof b.undone === 'string') {
    if (!(await may(b.undone))) return json({ error: 'forbidden' }, 403);
    await markDone(b.undone, false);
  }
  if (b.answer !== undefined) {
    // { answer: { id, text, confirmPublic? } }: an answer to one of Claude's questions.
    const { id, text, confirmPublic } = b.answer ?? {};
    if (typeof id !== 'string' || !/^q-[a-z0-9-]{1,57}$/.test(id) || typeof text !== 'string') return json({ error: 'bad request' }, 400);
    const answer = text.trim().slice(0, 4000);
    if (!answer) return json({ error: 'Type an answer first.' }, 400);
    if (!(await may(id))) return json({ error: 'forbidden' }, 403);
    const todo = (await setupTodos()).find((t) => t.id === id && t.kind === 'question');
    if (!todo) return json({ error: 'That question has gone.' }, 404);
    if (confirmPublic !== true && (await answersArePublic())) return json({ needsConfirm: 'public' });
    try {
      const saved = await saveAnswer({ id, question: todo.title, text: answer, name: s.profile.full_name || s.user.email || 'Someone' });
      if (saved.sent) await markDone(id);
      return json({ ok: true, sent: saved.sent });
    } catch {
      return json({ error: 'Couldn’t save that. Try again.' }, 500);
    }
  }
  if (b.assign !== undefined) {
    if (!isAdmin) return json({ error: 'Only admins can choose who sees a to-do.' }, 403);
    const { id, userIds } = b.assign ?? {};
    if (typeof id !== 'string' || !Array.isArray(userIds)) return json({ error: 'bad request' }, 400);
    try {
      return json({ ok: true, assignees: await assignTodo(id, userIds) });
    } catch {
      return json({ error: 'Couldn’t save that. Try again.' }, 500);
    }
  }
  return json({ ok: true });
}
