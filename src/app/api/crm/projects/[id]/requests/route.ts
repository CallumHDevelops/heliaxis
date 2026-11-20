import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { cancelRequest, createRequest, installers, listRequests } from '@/lib/requests/server';
import { targetOf } from '@/lib/requests/targets';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** The job's requests for installer information, and who can be asked. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const [requests, people] = await Promise.all([listRequests(db, id), installers(db)]);
  return json({
    requests,
    installers: people.map((p) => ({ id: p.id, name: p.name, company: p.company, email: !!p.email, whatsapp: !!(p.wa_id || p.mobile), trades: p.trades ?? [] })),
  });
}

/** { action: 'create', code, contact_id, via: ['email' | 'whatsapp'], note } · { action: 'cancel', request }. */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.action === 'cancel') {
    if (!isUuid(String(b.request))) return json({ error: 'Not found' }, 404);
    await cancelRequest(db, id, String(b.request));
    return json({ ok: true, requests: await listRequests(db, id) });
  }
  if (b.action !== 'create') return json({ error: 'Unknown action' }, 400);
  if (!isUuid(String(b.contact_id))) return json({ error: 'Choose who to ask.' }, 400);
  const via = (Array.isArray(b.via) ? b.via : []).map(String).filter((v): v is 'email' | 'whatsapp' => v === 'email' || v === 'whatsapp');
  const name = s.profile.full_name || s.profile.email || 'Heliaxis';
  const code = String(b.code ?? '');
  const r = await createRequest(db, id, { code, contactId: String(b.contact_id), via, note: String(b.note ?? ''), by: { id: s.user.id, name } });
  if (!r.ok) return json({ error: r.why }, 400);
  const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', id).maybeSingle();
  const title = targetOf(code, [])?.title ?? code;
  if (p) await logActivity({ enquiryId: String(p.enquiry_id), projectId: id, kind: 'system', body: `Installer information requested: ${title}`, byId: s.user.id }).catch(() => null);
  return json({ ...r, requests: await listRequests(db, id) });
}
