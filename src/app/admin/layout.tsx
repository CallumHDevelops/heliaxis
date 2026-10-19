import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { DockFrame } from '@/components/admin/whatsapp/DockFrame';
import { CRM_VIEW_COOKIE, DOCK_COOKIE } from '@/components/admin/whatsapp/dock-shared';
import { getSessionProfile, guardAdmin } from '@/lib/auth';
import { canAccess } from '@/lib/portals';

export const dynamic = 'force-dynamic';

// "Add to Home Screen" from a staff page (iPhone, or Chrome's Install app) opens the dashboard
// as its own full-screen app instead of the public homepage.
export const metadata: Metadata = {
  manifest: '/admin.webmanifest',
  appleWebApp: { capable: true, title: 'Heliaxis', statusBarStyle: 'default' },
};

// Lets the page reach the screen edges on iPhones with a home bar or notch, so the safe-area
// padding in admin-shell.css applies (without it the bottom tab bar sits under the home bar).
export const viewport: Viewport = { viewportFit: 'cover' };

/**
 * Every admin page sits in the WhatsApp dock's frame, mounted here once so the dock, its open chat
 * and half-written replies stay put as you move between pages. Each page's starting state comes from
 * its URL and the person's remembered choice (both read here, so the server paints it right).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await guardAdmin();
  const [{ user, profile }, jar] = await Promise.all([getSessionProfile(), cookies()]);
  return (
    <DockFrame
      me={user?.id ?? ''}
      access={{ inbox: canAccess(profile, 'enquiries'), crm: canAccess(profile, 'crm') }}
      choice={jar.get(DOCK_COOKIE)?.value ?? ''}
      crmView={jar.get(CRM_VIEW_COOKIE)?.value ?? ''}
    >
      {children}
    </DockFrame>
  );
}
