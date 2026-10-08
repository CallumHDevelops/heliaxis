import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { emailShell, esc, sendEmail } from '@/lib/subcontractors/server';

export const dynamic = 'force-dynamic';

/**
 * Supabase Auth "Send Email" hook. Supabase calls this instead of using SMTP for
 * password resets, magic links, invites, sign-up confirmations and email changes;
 * we send through Resend's HTTP API (Resend's SMTP relay was stalling at end of
 * DATA, which Supabase reported as "Error sending … email").
 *
 * Supabase signs each call with Standard Webhooks (HMAC-SHA256); the secret it
 * generates ("v1,whsec_…") goes in SEND_EMAIL_HOOK_SECRET. Unsigned or stale calls
 * are refused, so nobody else can use this to send mail as Heliaxis.
 */

type HookPayload = {
  user: { email: string; new_email?: string; user_metadata?: { full_name?: string } };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url?: string;
    token_new?: string;
    token_hash_new?: string;
  };
};

function verify(raw: string, headers: Headers): boolean {
  const secret = (process.env.SEND_EMAIL_HOOK_SECRET || '').replace(/^v1,/, '').replace(/^whsec_/, '');
  const id = headers.get('webhook-id');
  const ts = headers.get('webhook-timestamp');
  const sigs = headers.get('webhook-signature');
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay window
  const expected = createHmac('sha256', Buffer.from(secret, 'base64')).update(`${id}.${ts}.${raw}`).digest();
  return sigs.split(' ').some((part) => {
    const [, sig] = part.split(',');
    if (!sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

function verifyLink(tokenHash: string, type: string, redirectTo: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const p = new URLSearchParams({ token: tokenHash, type, redirect_to: redirectTo });
  return `${base}/auth/v1/verify?${p.toString()}`;
}

const COPY: Record<string, { subject: string; title: string; body: string; cta: string }> = {
  recovery: {
    subject: 'Reset your Heliaxis password',
    title: 'Reset your password',
    body: 'Someone (hopefully you) asked to reset the password for your Heliaxis account. The link works once and expires soon.',
    cta: 'Set a new password',
  },
  magiclink: {
    subject: 'Your Heliaxis sign-in link',
    title: 'Sign in to Heliaxis',
    body: 'Use the button below to sign in. The link works once and expires soon.',
    cta: 'Sign in',
  },
  signup: {
    subject: 'Confirm your Heliaxis account',
    title: 'Confirm your email',
    body: 'Thanks for registering. Confirm your email address to finish setting up your account.',
    cta: 'Confirm email',
  },
  invite: {
    subject: "You've been invited to Heliaxis",
    title: "You've been invited",
    body: "You've been invited to a Heliaxis account. Accept the invitation to set up your sign-in.",
    cta: 'Accept invitation',
  },
  email_change: {
    subject: 'Confirm your new Heliaxis email address',
    title: 'Confirm your email change',
    body: 'Confirm this change of email address for your Heliaxis account.',
    cta: 'Confirm change',
  },
};

async function deliver(to: string, type: string, tokenHash: string, code: string, redirectTo: string) {
  if (type === 'reauthentication') {
    return sendEmail({
      to,
      from: 'Heliaxis <noreply@heliaxis.co.uk>',
      subject: `Your Heliaxis verification code: ${code}`,
      html: emailShell(
        'Your verification code',
        `<p style="font-size:30px;font-weight:800;letter-spacing:.3em;margin:18px 0">${esc(code)}</p><p>Enter this code to confirm it's you.</p>`,
        undefined,
        'Account security'
      ),
    });
  }
  const c = COPY[type] ?? COPY.magiclink;
  const link = verifyLink(tokenHash, type, redirectTo);
  return sendEmail({
    to,
    from: 'Heliaxis <noreply@heliaxis.co.uk>',
    subject: c.subject,
    text: `${c.title}\n\n${c.body}\n\n${link}\n\nOr use this code: ${code}\n\nIf you didn't ask for this, ignore this email.`,
    html: emailShell(
      c.title,
      `<p>${esc(c.body)}</p>${code ? `<p style="font-size:13px;color:#6E6A5E">Or enter this code: <strong>${esc(code)}</strong></p>` : ''}
       <p style="font-size:13px;color:#6E6A5E">If you didn't ask for this, you can ignore this email.</p>`,
      { href: link, label: c.cta },
      'Account'
    ),
  });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(raw, req.headers)) {
    return NextResponse.json({ error: { http_code: 401, message: 'Invalid signature' } }, { status: 401 });
  }
  let payload: HookPayload;
  try {
    payload = JSON.parse(raw) as HookPayload;
  } catch {
    return NextResponse.json({ error: { http_code: 400, message: 'Invalid JSON' } }, { status: 400 });
  }
  const { user, email_data: d } = payload;
  const type = d.email_action_type;

  const sends: Promise<{ ok: boolean; error?: string }>[] = [];
  if (type === 'email_change') {
    // Field names are reversed for backward compatibility (per Supabase docs): with Secure
    // Email Change on, the CURRENT address gets token_hash_new + token, the NEW address gets
    // token_hash + token_new. With it off, there's a single email to the new address.
    const newAddress = user.new_email || user.email;
    if (d.token_hash_new) {
      sends.push(deliver(user.email, type, d.token_hash_new, d.token, d.redirect_to));
      sends.push(deliver(newAddress, type, d.token_hash, d.token_new || '', d.redirect_to));
    } else {
      sends.push(deliver(newAddress, type, d.token_hash, d.token, d.redirect_to));
    }
  } else {
    sends.push(deliver(user.email, type, d.token_hash, d.token, d.redirect_to));
  }

  const results = await Promise.all(sends);
  const failed = results.find((r) => !r.ok);
  if (failed) {
    console.error('[auth-email-hook]', type, failed.error);
    return NextResponse.json({ error: { http_code: 500, message: failed.error || 'Email send failed' } }, { status: 500 });
  }
  return NextResponse.json({});
}
