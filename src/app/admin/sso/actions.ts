'use server';

import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { canAccess } from '@/lib/portals';
import { checkProofCode, ramsLink, ramsSsoConfigured, safeRamsPath, sendProofCode } from '@/lib/sso';

async function who() {
  const { user, profile } = await getSessionProfile();
  if (!user?.email || profile?.status !== 'approved') redirect('/login');
  if (!ramsSsoConfigured() || !(canAccess(profile, 'rams') || canAccess(profile, 'team'))) redirect('/admin');
  return { user, name: profile?.full_name || '' };
}

const back = (q: Record<string, string>) => redirect(`/admin/sso?${new URLSearchParams(q)}`);

/** Email the signed-in person a 6-digit code (src/lib/sso.ts). */
export async function sendSsoCode(formData: FormData): Promise<void> {
  const next = safeRamsPath(String(formData.get('next') || '/'));
  const { user, name } = await who();
  const r = await sendProofCode(user, name);
  back(r === 'ok' ? { step: 'code', next } : r === 'wait' ? { step: 'code', e: 'wait', next } : { e: r, next });
}

/** Check the typed code; once right, RAMS opens signed in. */
export async function verifySsoCode(formData: FormData): Promise<void> {
  const next = safeRamsPath(String(formData.get('next') || '/'));
  const { user } = await who();
  const r = await checkProofCode(user, String(formData.get('code') || ''));
  // Straight to RAMS (an absolute URL, so Next doesn't fetch it server-side first).
  if (r === 'ok') redirect(await ramsLink(user.email, next));
  back(r === 'wrong' ? { step: 'code', e: r, next } : { e: r, next });
}
