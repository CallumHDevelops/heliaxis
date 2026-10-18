import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { guardAdmin } from '@/lib/auth';

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

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await guardAdmin();
  return children;
}
