'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PORTAL_KEYS } from '@/lib/portals';
import { emailShell, esc, sendEmail } from '@/lib/subcontractors/server';

type Result = { ok: true } | { ok: false; error: string };

export async function updateUser(
  id: string,
  input: { status: string; role: string; portals: string[] }
): Promise<Result> {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.role !== 'admin' || profile.status !== 'approved') return { ok: false, error: 'Not authorised' };
  if (!['pending', 'approved', 'rejected'].includes(input.status)) return { ok: false, error: 'Bad status' };
  if (!['member', 'admin'].includes(input.role)) return { ok: false, error: 'Bad role' };
  // Avoid locking yourself out.
  if (id === user.id && (input.status !== 'approved' || input.role !== 'admin')) {
    return { ok: false, error: "You can't remove your own admin access." };
  }

  const portals = [...new Set(input.portals)].filter((k) => (PORTAL_KEYS as string[]).includes(k));
  const { error } = await createAdminClient()
    .from('profiles')
    .update({ status: input.status, role: input.role, portals })
    .eq('id', id);
  if (error) {
    return {
      ok: false,
      error: /portals/.test(error.message)
        ? 'The portals column is missing — run supabase/user-portals.sql in Supabase first.'
        : error.message,
    };
  }
  revalidatePath('/admin/users');
  return { ok: true };
}

type ResetResult = { ok: true; email: string; link?: string } | { ok: false; error: string };

/**
 * Admin-sent password reset. Supabase's own reset email uses PKCE, which only works in the
 * browser that asked for it, so we make a one-time recovery token here and point it at
 * /auth/confirm ourselves. `email` sends it in our branded email; `link` returns it so the
 * admin can pass it on (e.g. by WhatsApp) when the email doesn't arrive. Each new link
 * cancels the previous one.
 */
export async function sendPasswordReset(id: string, mode: 'email' | 'link'): Promise<ResetResult> {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.role !== 'admin' || profile.status !== 'approved') return { ok: false, error: 'Not authorised' };

  const admin = createAdminClient();
  const { data: found, error: findErr } = await admin.auth.admin.getUserById(id);
  const email = found?.user?.email;
  if (findErr || !email) return { ok: false, error: findErr?.message || 'This user has no email address.' };

  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return { ok: false, error: error?.message || 'Supabase did not return a reset link.' };

  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'https';
  const link = `${proto}://${host}/auth/confirm?${new URLSearchParams({ token_hash: tokenHash, type: 'recovery', next: '/reset-password' })}`;
  if (mode === 'link') return { ok: true, email, link };

  const from = profile.full_name || 'Your Heliaxis admin';
  const sent = await sendEmail({
    to: email,
    from: 'Heliaxis <noreply@heliaxis.co.uk>',
    subject: 'Reset your Heliaxis password',
    text: `Reset your password\n\n${from} has sent you a link to set a new password for your Heliaxis account. It works once and expires in an hour.\n\n${link}\n\nIf you weren't expecting this, you can ignore this email and keep your current password.`,
    html: emailShell(
      'Reset your password',
      `<p>${esc(from)} has sent you a link to set a new password for your Heliaxis account. It works once and expires in an hour.</p>
       <p style="font-size:13px;color:#6E6A5E">If you weren't expecting this, you can ignore this email and keep your current password.</p>`,
      { href: link, label: 'Set a new password' },
      'Account'
    ),
  });
  if (!sent.ok) return { ok: false, error: `The email could not be sent: ${sent.error}` };
  return { ok: true, email };
}
