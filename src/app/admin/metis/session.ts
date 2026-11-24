import 'server-only';
import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';

/** Metis full-screen is for CRM staff, as Metis in the app is. */
export async function metisSession() {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const firstName = (session.profile.full_name || session.profile.email || '').split(/[\s@]/)[0];
  return { session, firstName };
}

export const metisMetadata: Metadata = { title: 'Metis · Heliaxis', robots: { index: false, follow: false } };
/** The chat fills the phone: the keyboard shrinks the page rather than covering the composer. */
export const metisViewport: Viewport = { interactiveWidget: 'resizes-content', themeColor: '#252422' };
