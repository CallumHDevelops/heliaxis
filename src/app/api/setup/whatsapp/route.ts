import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { connectionReport, registerNumber, subscribeApp } from '@/lib/whatsapp/connection';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: NO_STORE });

async function admin() {
  const { profile } = await getSessionProfile();
  return profile?.role === 'admin' && profile.status === 'approved';
}

/** What Meta says about the WhatsApp number and account in Vercel (admins only). */
export async function GET() {
  if (!(await admin())) return json({ error: 'unauthorized' }, 401);
  return json(await connectionReport());
}

/**
 * { action: 'subscribe' } — connect the account's webhooks to our app.
 * { action: 'register', pin, notOnPhone: true } — put the number on the Cloud API.
 */
export async function POST(req: Request) {
  if (!(await admin())) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  if (b.action === 'subscribe') {
    const r = await subscribeApp();
    return r.ok ? json({ ok: true }) : json({ error: r.error }, 400);
  }
  if (b.action === 'register') {
    // Registering moves a number off the WhatsApp / WhatsApp Business phone app; the UI makes them confirm.
    if (b.notOnPhone !== true) return json({ error: 'Confirm the number isn’t in use on a phone first.' }, 400);
    const r = await registerNumber(String(b.pin ?? '').trim());
    return r.ok ? json({ ok: true }) : json({ error: r.error }, 400);
  }
  return json({ error: 'Unknown action' }, 400);
}
