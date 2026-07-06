import type { ReactNode } from 'react';
import './site.css';
import Header from '@/components/site/Header';
import { getPublishedMenu } from '@/lib/cms';

// Re-read the published menu at most once a minute, so publishing a nav change
// shows up without a full rebuild while keeping pages fast.
export const revalidate = 60;

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const menu = await getPublishedMenu();
  return (
    <div className="site">
      <Header menu={menu ?? undefined} />
      {children}
    </div>
  );
}
