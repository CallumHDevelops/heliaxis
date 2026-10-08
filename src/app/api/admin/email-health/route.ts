import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { getResendApiKey } from '@/lib/resend';
import { smtpProbe } from '@/lib/smtp-probe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SENDER_DOMAIN = 'heliaxis.co.uk';

type ResendDomain = { id: string; name: string; status: string; region?: string; created_at?: string };

/**
 * Admin diagnostic: is the Resend key in this deployment able to send as
 * @heliaxis.co.uk? Reads the key's account domains (never returns the key).
 * Add ?send=1 to email a test to yourself and see Resend's exact response.
 * Add ?smtp=1 to send the test over SMTP exactly as Supabase Auth does (465 and 587).
 * Supabase Auth SMTP uses the same key, so this explains its failures too.
 */
export async function GET(req: Request) {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.role !== 'admin' || profile.status !== 'approved') {
    return NextResponse.json({ error: 'Admins only — sign in first.' }, { status: 401 });
  }
  const key = getResendApiKey();
  if (!key) return NextResponse.json({ verdict: 'No Resend API key is set in this deployment (RESEND_API_KEY).' });

  const auth = { Authorization: `Bearer ${key}` };
  const out: Record<string, unknown> = { keyPrefix: `${key.slice(0, 3)}…`, keyLength: key.length };

  const domainsRes = await fetch('https://api.resend.com/domains', { headers: auth, cache: 'no-store' });
  const domainsBody = (await domainsRes.json().catch(() => ({}))) as { data?: ResendDomain[]; message?: string; name?: string };
  out.domainsLookup = { status: domainsRes.status, message: domainsBody.message, name: domainsBody.name };

  let verdict: string;
  if (domainsRes.status === 401 && /restricted/i.test(`${domainsBody.message} ${domainsBody.name}`)) {
    verdict =
      'The key is valid but is a sending-only key, so domains can’t be listed. Use ?send=1 to test sending, or create a Full access key to see domain status.';
  } else if (domainsRes.status === 401 || domainsRes.status === 403) {
    verdict = 'Resend rejected this API key — it is wrong, deleted, or has a typo. Create a new key and update Vercel + Supabase.';
  } else if (!domainsRes.ok) {
    verdict = `Resend returned ${domainsRes.status} when listing domains.`;
  } else {
    const list = domainsBody.data ?? [];
    out.domains = list.map((d) => ({ name: d.name, status: d.status, region: d.region }));
    const mine = list.find((d) => d.name === SENDER_DOMAIN);
    if (!mine) {
      verdict = `This key belongs to a Resend account that does NOT have ${SENDER_DOMAIN}. The domain is set up in a different Resend account — create the key there instead.`;
    } else {
      const detailRes = await fetch(`https://api.resend.com/domains/${mine.id}`, { headers: auth, cache: 'no-store' });
      const detail = (await detailRes.json().catch(() => ({}))) as { records?: { record: string; name: string; type: string; status: string }[] };
      out.records = (detail.records ?? []).map((r) => ({ record: r.record, name: r.name, type: r.type, status: r.status }));
      verdict =
        mine.status === 'verified'
          ? `${SENDER_DOMAIN} is verified in this key's account — sending as noreply@${SENDER_DOMAIN} should work.`
          : `${SENDER_DOMAIN} is in this account but its status is "${mine.status}". Open Resend → Domains → ${SENDER_DOMAIN} and fix the records it flags (see "records" below).`;
    }
  }
  out.verdict = verdict;

  if (new URL(req.url).searchParams.get('send') === '1' && user.email) {
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Heliaxis <noreply@${SENDER_DOMAIN}>`,
        to: [user.email],
        subject: 'Heliaxis email test',
        text: 'This is a test from /api/admin/email-health. If you received it, sending as noreply@heliaxis.co.uk works.',
      }),
      cache: 'no-store',
    });
    out.testSend = { to: user.email, status: sendRes.status, response: await sendRes.json().catch(() => null) };
  }

  if (new URL(req.url).searchParams.get('smtp') === '1' && user.email) {
    const base = { host: 'smtp.resend.com', user: 'resend', pass: key, from: `noreply@${SENDER_DOMAIN}`, to: user.email };
    const [p465, p587] = await Promise.all([smtpProbe({ ...base, port: 465 }), smtpProbe({ ...base, port: 587 })]);
    out.smtp = { port465: p465, port587: p587 };
    out.smtpVerdict =
      p465.ok || p587.ok
        ? `SMTP works with this key (${[p465.ok && '465', p587.ok && '587'].filter(Boolean).join(' and ')}). Supabase uses the same host/username, so if its emails still fail, the password stored in Supabase's SMTP settings is not this key — paste it again and Save.`
        : `SMTP failed on both ports: 465 → ${p465.error}; 587 → ${p587.error}.`;
  }

  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
