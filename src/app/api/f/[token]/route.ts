import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { fillFinish, fillSave, fillView, markSubmitted, requestByToken } from '@/lib/requests/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ token: string }> };
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } });
const GONE = 'This link has been replaced or has expired. Ask the Heliaxis office (01633 965205) for a new one.';

/** The installer's link: the item's questions, one at a time. */
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const db = createAdminClient();
  const r = await requestByToken(db, token);
  if (!r) return json({ error: GONE }, 404);
  const v = await fillView(db, r.project_id, r.target);
  if (!v) return json({ error: GONE }, 404);
  return json({ ...v, who: r.contact_name, note: r.note, submitted: !!r.submitted_at });
}

/** { answers } saves as they go; { finish: true, name, image? } signs and hands it to the office. */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const db = createAdminClient();
  const r = await requestByToken(db, token);
  if (!r) return json({ error: GONE }, 404);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const who = { id: null, name: `${r.contact_name} (by link)` };
  if (b.answers && typeof b.answers === 'object' && !Array.isArray(b.answers)) {
    const s = await fillSave(db, r.project_id, r.target, b.answers as Record<string, unknown>, who);
    if (!s.ok) return json({ error: s.why }, 409);
  }
  if (b.finish === true) {
    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 120) : r.contact_name;
    const f = await fillFinish(db, r.project_id, r.target, { name, image: typeof b.image === 'string' ? b.image : undefined }, who, 'remote');
    if (!f.ok) return json({ error: f.why }, 409);
    await markSubmitted(db, r.id);
    const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', r.project_id).maybeSingle();
    if (p) await logActivity({ enquiryId: String(p.enquiry_id), projectId: r.project_id, kind: 'system', body: `${r.contact_name} filled in ${r.target} by their link`, byId: null }).catch(() => null);
  }
  const v = await fillView(db, r.project_id, r.target);
  return json({ ...v, who: r.contact_name, note: r.note, submitted: b.finish === true || !!r.submitted_at });
}
