import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { ACTIVITY_KINDS } from '@/lib/crm/stages';

export const dynamic = 'force-dynamic';

/** Log a note, call, site visit or email against the project. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const kind = String(b.kind || 'note');
  const body = String(b.body || '').trim();
  if (!(ACTIVITY_KINDS as readonly string[]).includes(kind)) return json({ error: 'Unknown type' }, 400);
  if (!body) return json({ error: 'Write something first.' }, 400);
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  await logActivity({
    enquiryId: p.enquiry_id,
    projectId: id,
    kind: kind as 'note' | 'call' | 'visit' | 'email',
    body: body.slice(0, 5000),
    byId: s.user.id,
  });
  await db.from('crm_projects').update({ updated_at: new Date().toISOString() }).eq('id', id);
  // A logged call, visit or email counts as contacting them (speed-to-lead).
  if (kind !== 'note') {
    await db.from('crm_projects').update({ first_contact_at: new Date().toISOString() }).eq('id', id).is('first_contact_at', null).then(
      () => null,
      () => null
    );
  }
  return json({ ok: true });
}
