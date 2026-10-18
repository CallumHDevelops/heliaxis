import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { guardAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// "Add to Home Screen" from a staff page (iPhone, or Chrome's Install app) opens the dashboard
// as its own full-screen app instead of the public homepage.
export const metadata: Metadata = {
  manifest: '/admin.webmanifest',
  appleWebApp: { capable: true, title: 'Heliaxis', statusBarStyle: 'default' },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await guardAdmin();
  return children;
}
