'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { checkProofCode, sendProofCode, SSO_APPS, ssoApp, type SsoApp } from '@/lib/sso';

async function who(app: SsoApp) {
  const { user, profile } = await getSessionProfile();
  if (!user?.email || profile?.status !== 'approved') redirect('/login');
  if (!SSO_APPS[app].configured() || !SSO_APPS[app].canUse(profile)) redirect('/admin');
  return { user, name: profile?.full_name || '' };
}

/** Which app (RAMS unless it's exactly "social") and where in it. */
function target(formData: FormData) {
  const app = ssoApp(formData.get('app'));
  const next = formData.get('next');
  return { app, next: SSO_APPS[app].safePath(typeof next === 'string' ? next : null) };
}

// RAMS, the default, keeps its old addresses (no app=).
const back = (app: SsoApp, q: Record<string, string>) =>
  redirect(`/admin/sso?${new URLSearchParams(app === 'rams' ? q : { app, ...q })}`);

/** Email the signed-in person a 6-digit code (src/lib/sso.ts). */
export async function sendSsoCode(formData: FormData): Promise<void> {
  const { app, next } = target(formData);
  const { user, name } = await who(app);
  const r = await sendProofCode(user, name, app);
  back(app, r === 'ok' ? { step: 'code', next } : r === 'wait' ? { step: 'code', e: 'wait', next } : { e: r, next });
}

/** Check the typed code; once right, the app opens signed in. */
export async function verifySsoCode(formData: FormData): Promise<void> {
  const { app, next } = target(formData);
  const { user } = await who(app);
  const r = await checkProofCode(user, String(formData.get('code') || ''));
  // Straight to the app (an absolute URL, so Next doesn't fetch it server-side first), with the
  // cookie the studio's link needs.
  if (r === 'ok') {
    const { url, cookie } = await SSO_APPS[app].link(user.email, next);
    if (cookie) (await cookies()).set(cookie);
    redirect(url);
  }
  back(app, r === 'wrong' ? { step: 'code', e: r, next } : { e: r, next });
}
