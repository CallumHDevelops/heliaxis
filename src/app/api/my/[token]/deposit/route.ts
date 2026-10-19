import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { projectByToken, projectSigned } from '@/lib/crm/portal';
import { portalUrl } from '@/lib/crm/server';
import { createCheckout, stripeConfigured } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/** Pay the deposit by card (Stripe Checkout), once the quote is signed. Returns the payment page URL. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await projectByToken(token);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!stripeConfigured()) return NextResponse.json({ error: 'Card payments aren’t set up yet. We’ll send you bank details.' }, { status: 400 });
  if (!p.deposit_amount || p.deposit_paid_at) return NextResponse.json({ error: 'There’s no deposit to pay.' }, { status: 400 });
  if (!(await projectSigned(p))) return NextResponse.json({ error: 'Please sign your quote first, then you can pay the deposit here.' }, { status: 400 });
  const { data: e } = await createAdminClient().from('enquiries').select('email').eq('id', p.enquiry_id).maybeSingle();
  try {
    const s = await createCheckout({
      amountPence: Number(p.deposit_amount) * 100,
      name: `Deposit — ${p.title}`,
      email: e?.email || null,
      successUrl: `${portalUrl(token)}?paid=1`,
      cancelUrl: portalUrl(token),
      projectId: p.id,
    });
    return NextResponse.json({ url: s.url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Payment page unavailable' }, { status: 502 });
  }
}
