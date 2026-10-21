import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Image from 'next/image';
import './portal.css';

export const metadata: Metadata = {
  title: 'Subcontractor portal',
  robots: { index: false, follow: false },
};

// Declaring both schemes stops mobile browsers auto-darkening the page; portal.css supplies the dark theme.
export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: '#211F18',
};

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
