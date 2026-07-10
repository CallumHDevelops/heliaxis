'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import styles from './Header.module.css';

const NAV_LINKS = [
  { label: 'Solar & Battery', href: '/#services' },
  { label: 'Business', href: '/#business' },
  { label: 'Funding', href: '/commercial-funding' },
  { label: 'Estimator', href: '/solar-estimator' },
  { label: 'Blog', href: '/blog' },
  { label: 'FAQs', href: '/#faq' },
  { label: 'Contact', href: '/#quote' },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNavClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    setMobileOpen(false);
    if (href.startsWith('/#')) {
      const id = href.slice(2);
      if (window.location.pathname === '/') {
        e.preventDefault();
        const el = document.getElementById(id);
        if (el) {
          setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      }
    }
  }, []);

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
      {/* utility top bar */}
      <div className={styles.topbar}>
        <div className={styles.wrap}>
          <span className={styles.tl}>MCS · RECC · NICEIC · TrustMark certified installer</span>
          <span className={styles.tr}>
            <span className={styles.stars}>★★★★★</span> 4.9 rated · Mon–Sat 8am–6pm ·{' '}
            <a href="tel:01633965205">01633 965205</a>
          </span>
        </div>
      </div>

      {/* main nav bar */}
      <div className={styles.bar}>
        <div className={styles.wrap}>
          <Link href="/" className={styles.logoLink}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.logo} src="/assets/heliaxis-logo.png" alt="Heliaxis" />
          </Link>

          <nav className={`${styles.nav} ${mobileOpen ? styles.navOpen : ''}`} id="nav">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={styles.navLink}
                onClick={(e) => handleNavClick(e, link.href)}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className={styles.headCta}>
            <a className={styles.headTel} href="tel:01633965205">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 3h3l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4.5 5a2 2 0 0 1 2-2Z" />
              </svg>
              01633 965205
            </a>
            <Link
              className={styles.btn}
              href="/#quote"
              onClick={(e) => handleNavClick(e, '/#quote')}
            >
              Free quote
            </Link>
          </div>

          <button
            className={styles.burger}
            id="burger"
            aria-label="Menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}
