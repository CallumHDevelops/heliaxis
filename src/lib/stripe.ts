import 'server-only';
import crypto from 'node:crypto';

/** Stripe Checkout for deposits (REST, no SDK). Off until STRIPE_SECRET_KEY is set. */

export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;

function form(obj: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== '') p.append(k, String(v));
  return p;
}

export async function createCheckout(o: {
  amountPence: number;
  name: string;
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
  projectId: string;
}) {
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      mode: 'payment',
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][unit_amount]': Math.round(o.amountPence),
      'line_items[0][price_data][product_data][name]': o.name,
      success_url: o.successUrl,
      cancel_url: o.cancelUrl,
      customer_email: o.email || undefined,
      'metadata[project_id]': o.projectId,
      'payment_intent_data[metadata][project_id]': o.projectId,
    }),
    cache: 'no-store',
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) throw new Error(d?.error?.message || 'Stripe checkout failed');
  return { id: d.id as string, url: d.url as string };
}

/** Checks the Stripe-Signature header (t=…,v1=…) against STRIPE_WEBHOOK_SECRET. */
export function verifyStripe(raw: string, header: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const want = crypto.createHmac('sha256', secret).update(`${t}.${raw}`, 'utf8').digest('hex');
  const got = header
    .split(',')
    .filter((kv) => kv.startsWith('v1='))
    .map((kv) => kv.slice(3));
  return got.some((g) => g.length === want.length && crypto.timingSafeEqual(Buffer.from(g), Buffer.from(want)));
}
