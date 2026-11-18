import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { addSuggestionToDiary, dismissSuggestion, openSuggestions, sendSuggestionReply } from '@/lib/crm/call-suggest';

export const dynamic = 'force-dynamic';

/** The calls this customer has asked for that are waiting for a yes or no. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  return json({ suggestions: await openSuggestions(createAdminClient(), { projectId: id }) });
}

/** { id, action: 'add' | 'dismiss' | 'reply', text? }: add the call to the diary, leave it, or send the reply. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id: project } = await params;
  if (!isUuid(project)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { id?: string; action?: string; text?: string };
  if (typeof b.id !== 'string') return json({ error: 'Which one?' }, 400);
  const mine = (await openSuggestions(createAdminClient(), { projectId: project })).some((x) => x.id === b.id);
  if (!mine) return json({ error: 'That suggestion is gone.' }, 404);
  if (b.action === 'dismiss') {
    await dismissSuggestion(b.id);
    return json({ ok: true });
  }
  if (b.action === 'reply') {
    const sent = await sendSuggestionReply(b.id, String(b.text ?? ''), { id: s.user.id, name: s.profile.full_name || s.profile.email || 'Someone' });
    return sent.ok ? json({ ok: true }) : json({ error: sent.error }, 400);
  }
  const r = await addSuggestionToDiary(b.id, { id: s.user.id, name: s.profile.full_name || s.profile.email || 'Someone' });
  return r.ok ? json({ ok: true }) : json({ error: r.error }, 400);
}
