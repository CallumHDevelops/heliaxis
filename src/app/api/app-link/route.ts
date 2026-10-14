import { NextRequest, NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { APP_LINK_TTL_DAYS, appLinkUrl, createAppLinkToken } from '@/lib/app-link';
import { emailShell, esc, sendEmail } from '@/lib/subcontractors/server';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email the signed-in user (or an address they give, e.g. their phone's mail) a personal download link. */
export async function POST(req: NextRequest) {
  const session = await requireApproved();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });

  const body = await req.json().catch(() => ({}));
  const to = String(body?.to || session.profile.email || session.user.email || '').trim();
  if (!EMAIL.test(to) || to.length > 200) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400, headers: NO_STORE });
  }

  const name = session.profile.full_name || session.profile.email || '';
  const firstName = name.split(/[\s@]/)[0] || '';
  const link = appLinkUrl(createAppLinkToken(session.user.id, firstName), req.nextUrl.origin);

  const result = await sendEmail({
    from: 'Heliaxis <noreply@heliaxis.co.uk>',
    to,
    subject: 'Your Heliaxis app download link',
    html: emailShell(
      'Get the Heliaxis app on your phone',
      `<p>Hi ${esc(firstName || 'there')},</p>
       <p>Open this email on your <b>Android phone or tablet</b> and tap the button below. It downloads the
       Heliaxis app — your dashboard and Tasks in one place, working offline, with a notification when you're
       given a task.</p>
       <p style="font-size:13px;color:#6E6A5E">The first time, Android may ask to allow installs from your browser —
       tap <b>Settings</b>, turn on <b>Allow from this source</b>, go back and tap <b>Install</b>.</p>
       <p style="font-size:13px;color:#6E6A5E">This link works for ${APP_LINK_TTL_DAYS} days.</p>`,
      { href: link, label: 'Download the app' },
      'Heliaxis app'
    ),
    text: `Get the Heliaxis app: open this on your Android phone — ${link} (works for ${APP_LINK_TTL_DAYS} days)`,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Email could not be sent' }, { status: 502, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, to }, { headers: NO_STORE });
}
