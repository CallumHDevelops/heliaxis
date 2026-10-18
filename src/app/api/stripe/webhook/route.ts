import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { notify } from '@/lib/notify';
import { canAccess } from '@/lib/portals';
import { verifyStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/** Stripe → deposit paid. Subscribe the endpoint to checkout.session.completed. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyStripe(raw, req.headers.get('stripe-signature'))) return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  const evt = JSON.parse(raw);
  if (evt.type !== 'checkout.session.completed') return NextResponse.json({ ok: true });
  const session = evt.data?.object ?? {};
  const projectId = session.metadata?.project_id;
  if (!projectId || session.payment_status !== 'paid') return NextResponse.json({ ok: true });
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id, title, deposit_paid_at').eq('id', projectId).maybeSingle();
  if (!p || p.deposit_paid_at) return NextResponse.json({ ok: true });
  const amount = (Number(session.amount_total) || 0) / 100;
  await db.from('crm_projects').update({ deposit_paid_at: new Date().toISOString(), deposit_ref: session.payment_intent || session.id }).eq('id', p.id);
  await logActivity({ enquiryId: p.enquiry_id, projectId: p.id, kind: 'system', body: `💷 Deposit of £${amount.toFixed(2)} paid by card` });
  const { data: people } = await db.from('profiles').select('*').eq('status', 'approved');
  await Promise.all(
    (people ?? [])
      .filter((x) => canAccess(x, 'crm'))
      .map((x) => notify({ userId: x.id, kind: 'crm_deposit', title: `💷 Deposit paid: ${p.title}`, body: `£${amount.toFixed(2)}`, href: `/admin/crm/${p.id}` }))
  );
  return NextResponse.json({ ok: true });
}
