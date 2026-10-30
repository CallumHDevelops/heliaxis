import { NextResponse } from 'next/server';
import { projectByToken, projectSigned } from '@/lib/crm/portal';
import { recordDecline } from '@/lib/crm/quote-track';

export const dynamic = 'force-dynamic';

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** The customer declines their quote, with a comment: { reason }. The job stays where it is; the team is told and can follow up. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await projectByToken(token);
  if (!p) return reply({ error: 'Not found' }, 404);
  if (await projectSigned(p)) return reply({ error: 'You have already accepted this quote.' }, 409);
  const b = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = String(b.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  await recordDecline({ id: p.id, enquiry_id: p.enquiry_id, owner_id: p.owner_id as string | null, title: p.title }, reason);
  return reply({ ok: true });
}
