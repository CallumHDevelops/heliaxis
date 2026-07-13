import type { ReactNode } from 'react';
import { guardAdmin } from '@/lib/auth';
import { BlockTrackersOnAdmin } from '@/components/analytics/BlockTrackersOnAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await guardAdmin();
  return (
    <>
      <BlockTrackersOnAdmin />
      {children}
    </>
  );
}
