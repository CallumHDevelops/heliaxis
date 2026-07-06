import type { ReactNode } from 'react';
import './site.css';
import Header from '@/components/site/Header';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <Header />
      {children}
    </div>
  );
}
