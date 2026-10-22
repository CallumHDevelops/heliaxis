import type { ReactNode } from 'react';
import './site.css';
import Header from '@/components/site/Header';
import { WhatsAppButton } from '@/components/site/WhatsAppButton';
import { SiteEnhancements } from '@/components/site/SiteEnhancements';
import { getPublishedMenu, getPublishedTopbar } from '@/lib/cms';

/** Menu comes from CMS — keep layout fresh after Publish from /admin/mega. */
export const dynamic = 'force-dynamic';

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const [menu, topbar] = await Promise.all([getPublishedMenu(), getPublishedTopbar()]);
  return (
    <div className="site">
      <Header menu={menu ?? undefined} topbar={topbar ?? undefined} />
      {children}
      <WhatsAppButton />
      <SiteEnhancements />
    </div>
  );
}
