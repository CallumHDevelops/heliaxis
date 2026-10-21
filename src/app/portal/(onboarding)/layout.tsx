import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Image from 'next/image';
import './portal.css';

export const metadata: Metadata = {
  title: 'Subcontractor portal',
  robots: { index: false, follow: false },
};

// color-scheme (which stops phones auto-darkening the page) and the status bar colour (the ink top bar)
// come from the root layout, which follows the person's Light / Dark / Match phone choice (src/lib/theme).

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pt-shell">
      <header className="pt-top">
        <Image src="/assets/heliaxis-logo-light.png" alt="Heliaxis" width={130} height={26} priority style={{ width: 130, height: 'auto' }} />
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
