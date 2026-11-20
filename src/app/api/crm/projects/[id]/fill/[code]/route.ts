import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { fillFinish, fillSave, fillView } from '@/lib/requests/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string; code: string }> };

/** "Complete it myself": the item's questions, one at a time, for the office. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id, code } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const v = await fillView(createAdminClient(), id, code);
  return v ? json(v) : json({ error: 'Not found' }, 404);
}

/** { answers } saves; { finish: true, name?, image? } signs (a form) and makes the item's document. */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id, code } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const who = { id: s.user.id, name: s.profile.full_name || s.profile.email || 'Someone' };
  if (b.answers && typeof b.answers === 'object' && !Array.isArray(b.answers)) {
    const r = await fillSave(db, id, code, b.answers as Record<string, unknown>, who);
    if (!r.ok) return json({ error: r.why }, 409);
  }
  if (b.finish === true) {
    const sign = typeof b.name === 'string' ? { name: b.name, image: typeof b.image === 'string' ? b.image : undefined } : null;
    const r = await fillFinish(db, id, code, sign, who, 'hap');
    if (!r.ok) return json({ error: r.why }, 409);
  }
  return json(await fillView(db, id, code));
}
