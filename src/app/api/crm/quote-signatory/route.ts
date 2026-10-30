import { crmSession, json } from '@/lib/crm/server';
import { clearSignatory, readSignatory, sharedSignatories, writeSignatory } from '@/lib/quotes/signatory';

export const dynamic = 'force-dynamic';

/** Your own signature, the ones others have shared, and who you are: { meId, mine, shared }. */
export async function GET() {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const [mine, shared] = await Promise.all([readSignatory(s.user.id), sharedSignatories(s.user.id)]);
  return json({ meId: s.user.id, mine, shared });
}

/** Save your own: { name, role, png, shared }. */
export async function PUT(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const out = await writeSignatory(s.user.id, await req.json().catch(() => ({})));
  return out.ok ? json({ signatory: out.signatory }) : json({ error: out.error }, 400);
}

export async function DELETE() {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  await clearSignatory(s.user.id);
  return json({ ok: true });
}
