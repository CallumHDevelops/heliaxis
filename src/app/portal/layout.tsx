import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Image from 'next/image';
import './portal.css';

export const metadata: Metadata = {
  title: 'Subcontractor portal',
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pt-shell">
      <header className="pt-top">
        <Image src="/assets/heliaxis-logo.png" alt="Heliaxis" width={128} height={30} style={{ width: 128, height: 'auto' }} />
        <span className="pt-top-tag">Subcontractor portal</span>
      </header>
      <main className="pt-main">{children}</main>
      <footer className="pt-foot">
        Heliaxis Limited · Company No. 16734783 · Registered in England &amp; Wales ·{' '}
        <a href="tel:01633965205">01633 965205</a>
      </footer>
    </div>
  );
}
