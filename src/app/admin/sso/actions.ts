'use server';

import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { canAccess } from '@/lib/portals';
import { checkProofCode, ramsSsoConfigured, safeRamsPath, sendProofCode } from '@/lib/sso';

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
  back(r === 'ok' || r === 'wait' ? { step: 'code', next, ...(r === 'wait' ? { e: 'wait' } : {}) } : { e: r, next });
}

/** Check the typed code; once right, RAMS opens signed in. */
export async function verifySsoCode(formData: FormData): Promise<void> {
  const next = safeRamsPath(String(formData.get('next') || '/'));
  const { user } = await who();
  const r = await checkProofCode(user, String(formData.get('code') || ''));
  if (r === 'ok') redirect(`/api/sso/rams?${new URLSearchParams({ next })}`);
  back(r === 'wrong' ? { step: 'code', e: r, next } : { e: r, next });
}
