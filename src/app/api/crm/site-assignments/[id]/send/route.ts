import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { sendToTrade } from '@/lib/site/send';
import { blockedFirmProblem, notReady, readAssignment, siteReady, siteTabData, type ContactRow } from '@/lib/site/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const KINDS = ['job_pack', 'clear_to_start', 'scaffold_hold'] as const;
const VIA = ['email', 'whatsapp', 'both', 'link'] as const;

/**
 * Send a trade their job pack, or "you're clear to start" / "don't use the scaffold yet":
 * { kind?, via: 'email' | 'whatsapp' | 'both' | 'link', rotate? }. Messages after 20:30 wait for the
 * morning (the evening rule); a second tap sends nothing more. 'link' only hands back the link and
 * the words for WhatsApp from my phone. `rotate`: a new link (the old one stops working).
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = (KINDS as readonly string[]).includes(String(b.kind ?? 'job_pack')) ? (String(b.kind ?? 'job_pack') as (typeof KINDS)[number]) : null;
  const via = (VIA as readonly string[]).includes(String(b.via ?? 'both')) ? (String(b.via ?? 'both') as (typeof VIA)[number]) : null;
  if (!kind || !via) return json({ error: 'Unknown message' }, 400);
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a) return json({ error: 'That trade isn’t on the job any more.' }, 404);
  if (a.status === 'cancelled') return json({ error: 'This trade was taken off the job.' }, 409);
  const { data: c } = await db.from('site_contacts').select('*').eq('id', a.contact_id).maybeSingle();
  if (!c) return json({ error: 'That person isn’t there any more.' }, 404);
  // Not with them yet and their firm has been suspended or terminated since: it would be a new job.
  const blocked = await blockedFirmProblem(db, a, c as ContactRow, kind);
  if (blocked) return json({ error: blocked }, 422);
  try {
    const r = await sendToTrade(db, a, c as ContactRow, {
      kind,
      via,
      rotate: b.rotate === true,
      actor: s.user.email ?? s.user.id,
      byId: s.user.id,
      origin: new URL(req.url).origin,
    });
    return json({ ...r, data: await siteTabData(db, a.project_id) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Not sent. Try again.' }, 500);
  }
}
