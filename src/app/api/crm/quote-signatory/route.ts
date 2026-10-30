import { crmSession, json } from '@/lib/crm/server';
import { clearSignatory, readSignatory, writeSignatory } from '@/lib/quotes/signatory';

export const dynamic = 'force-dynamic';

/** The signature that goes under the quote introduction: { signatory } or null. */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  return json({ signatory: await readSignatory() });
}

/** Save it: { name, role, png }. */
export async function PUT(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const out = await writeSignatory(await req.json().catch(() => ({})));
  return out.ok ? json({ signatory: out.signatory }) : json({ error: out.error }, 400);
}

export async function DELETE() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  await clearSignatory();
  return json({ ok: true });
}
