'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { proofToken, safeRamsPath } from '@/lib/sso';
import { emailShell, esc, sendEmail } from '@/lib/subcontractors/server';

/** Email the signed-in person a link that proves the address is theirs (see src/lib/sso.ts). */
export async function sendSsoProof(formData: FormData): Promise<void> {
  const next = safeRamsPath(String(formData.get('next') || '/'));
  const { user, profile } = await getSessionProfile();
  if (!user?.email || profile?.status !== 'approved') redirect('/login');

  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'https';
  const link = `${proto}://${host}/api/sso/confirm?${new URLSearchParams({ t: proofToken(user), next })}`;
  const sent = await sendEmail({
    to: user.email,
    from: 'Heliaxis <noreply@heliaxis.co.uk>',
    subject: 'Confirm your email to open RAMS in one tap',
    text: `Confirm your email\n\nOpen this link to confirm ${user.email} is yours. After that, RAMS opens from the Heliaxis menu without signing in again. It works for an hour.\n\n${link}\n\nIf you didn't ask for this, ignore this email.`,
    html: emailShell(
      'Confirm your email',
      `<p>Tap the button to confirm ${esc(user.email)} is yours. After that, RAMS opens from the Heliaxis menu without signing in again. The link works for an hour.</p>
       <p style="font-size:13px;color:#6E6A5E">If you didn't ask for this, you can ignore this email.</p>`,
      { href: link, label: 'Confirm my email' },
      'Account'
    ),
  });
  redirect(`/admin/sso?${new URLSearchParams(sent.ok ? { sent: '1', next } : { failed: '1', next })}`);
}
