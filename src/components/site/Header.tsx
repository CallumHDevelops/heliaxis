'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import styles from './Header.module.css';

/* Monopitch spark */
export function Spark({ size = 13 }: { size?: number }) {
  const ray = 'M11 9.6 L13 9.6 L13 0.8 L11 3 Z';
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      {[0, 90, 180, 270].map((a) => (
        <g key={a} transform={`rotate(${a} 12 12)`}>
          <path d={ray} />
        </g>
      ))}
    </svg>
  );
}

/* Duotone icons */
type IconDef = { o: string[]; f?: string };
const ICONS: Record<string, IconDef> = {
  solar: { o: ['M4 16l2-9h12l2 9z', 'M3 16h18', 'M9 7L8 16', 'M15 7l1 9', 'M6 11.5h12'], f: 'M4 16l2-9h12l2 9z' },
  battery: { o: ['M6 5h12v16H6z', 'M10 5V3h4v2', 'M13 9l-3 5h4l-3 4'], f: 'M6 5h12v16H6z' },
  heatpump: { o: ['M3 7h18v11H3z', 'M12 9a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7', 'M12 10.5v4', 'M10 12.5h4'], f: 'M3 7h18v11H3z' },
  ev: { o: ['M6 20V9a2.5 2.5 0 0 1 2.5-2.5h5A2.5 2.5 0 0 1 16 9v11', 'M4 20h14', 'M16 11h2.5l2 2v5a1.75 1.75 0 0 1-3.5 0v-3', 'M11 9l-1.5 3H12l-1.5 3'], f: 'M6 20V9a2.5 2.5 0 0 1 2.5-2.5h5A2.5 2.5 0 0 1 16 9v11z' },
  led: { o: ['M12 3a7 7 0 0 1 4 12.8c-.6.4-1 1-1 1.7V18H9v-.5c0-.7-.4-1.3-1-1.7A7 7 0 0 1 12 3Z', 'M9.5 21h5', 'M10 18v3', 'M14 18v3'], f: 'M12 3a7 7 0 0 1 4 12.8c-.6.4-1 1-1 1.7V18H9v-.5c0-.7-.4-1.3-1-1.7A7 7 0 0 1 12 3Z' },
  estimator: { o: ['M6 3h12v18H6z', 'M9 7h6', 'M8.5 11h1M11.5 11h1M14.5 11h1M8.5 14h1M11.5 14h1M14.5 14h1M8.5 17h1M11.5 17h4'] },
  roof: { o: ['M3 12l9-7 9 7', 'M5 11v8h14v-8', 'M10 19v-4h4v4'] },
  fund: { o: ['M12 3v18', 'M8 7h6a2.5 2.5 0 0 1 0 5h-4a2.5 2.5 0 0 0 0 5h6'] },
  phone: { o: ['M6.5 3h3l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4.5 5a2 2 0 0 1 2-2Z'] },
  ppa: { o: ['M4 7h7l-2-2M4 7l2 2', 'M20 17h-7l2 2M20 17l-2-2', 'M4 7a8 8 0 0 1 16 0M20 17a8 8 0 0 1-16 0'] },
  grant: { o: ['M6 3h9l3 3v15H6z', 'M15 3v3h3M9 11h6M9 14h6M9 17h4'] },
  warehouse: { o: ['M3 21V9l9-5 9 5v12', 'M3 21h18M8 21v-6h8v6'] },
  agri: { o: ['M4 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0M14 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0', 'M7 14V7h5l3 4M7 9h5'] },
  care: { o: ['M3 21h18M5 21V7l7-3 7 3v14', 'M12 12l-1.2-1.2a1.4 1.4 0 1 1 1.2-2 1.4 1.4 0 1 1 1.2 2z'] },
  hotel: { o: ['M3 21V6h11v6h7v9', 'M3 21h18M6 9h.01M6 12h.01M17 15h.01'] },
};

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const d = ICONS[name] ?? ICONS.solar;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {d.f && <path d={d.f} fill="var(--solar)" fillOpacity={0.28} stroke="none" />}
      {d.o.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

/* Menu data — hrefs mapped to current routes. Items without a dedicated page yet
   point at the closest section/anchor; update as pages are built. */
type NavItem = { icon: string; label: string; href: string; desc?: string };
type NavCol = { title: string; items: NavItem[] };
type Featured = { title: string; text: string; cta: string; href: string };
type Top = { label: string; href?: string; cols?: NavCol[]; featured?: Featured };

const MENU: Top[] = [
  {
    label: 'Residential',
    cols: [
      {
        title: 'What we install',
        items: [
          { icon: 'solar', label: 'Solar panels', href: '/#services', desc: 'Tier-one panels sized to your roof' },
          { icon: 'battery', label: 'Battery storage', href: '/#services', desc: 'Store your power for after dark' },
          { icon: 'heatpump', label: 'Heat pumps', href: '/#services', desc: 'Efficient low-carbon heating' },
          { icon: 'ev', label: 'EV chargers', href: '/#services', desc: 'Charge from your own solar' },
        ],
      },
      {
        title: 'Tools & funding',
        items: [
          { icon: 'estimator', label: 'Savings estimator', href: '/solar-estimator', desc: 'See your savings in 20 seconds' },
          { icon: 'roof', label: 'Roof designer', href: '/roof-designer', desc: 'Draw your roof, place the panels' },
          { icon: 'fund', label: 'Funding & 0% VAT', href: '/#quote', desc: '0% VAT on home solar to 2027' },
          { icon: 'phone', label: 'Book a free survey', href: '/#quote', desc: 'No obligation, no hard sell' },
        ],
      },
    ],
    featured: { title: 'See your savings in 20 seconds', text: 'No forms — draw your roof, get an instant estimate.', cta: 'Try the estimator', href: '/solar-estimator' },
  },
  {
    label: 'Commercial',
    cols: [
      {
        title: 'Solutions',
        items: [
          { icon: 'solar', label: 'Commercial solar', href: '/#business', desc: 'Turn your roof into lower bills' },
          { icon: 'battery', label: 'Battery storage', href: '/#business', desc: 'Shift solar into peak hours' },
          { icon: 'ev', label: 'EV & fleet', href: '/#business', desc: 'Workplace & fleet charging' },
          { icon: 'led', label: 'LED lighting', href: '/#business', desc: 'Fast-payback lighting upgrades' },
        ],
      },
      {
        title: 'Grants & funding',
        items: [
          { icon: 'fund', label: 'Funding & finance', href: '/commercial-funding', desc: 'CapEx, lease or a PPA' },
          { icon: 'ppa', label: 'PPA / Solar-as-a-Service', href: '/commercial-funding', desc: 'Zero upfront, pay for the power' },
          { icon: 'grant', label: 'Newport Net Zero grant', href: '/newport-net-zero-grant', desc: 'Up to £30k for local SMEs' },
          { icon: 'grant', label: 'Welsh & local grants', href: '/commercial-funding', desc: 'We help you find & apply' },
        ],
      },
      {
        title: 'By sector',
        items: [
          { icon: 'warehouse', label: 'Warehousing & industrial', href: '/warehousing' },
          { icon: 'agri', label: 'Agriculture & farms', href: '/#business' },
          { icon: 'care', label: 'Care homes', href: '/#business' },
          { icon: 'hotel', label: 'Hospitality & hotels', href: '/#business' },
        ],
      },
    ],
    featured: { title: 'Book a commercial assessment', text: 'Free site survey with ROI, funding and grant options modelled for you.', cta: 'Get started', href: '/#quote' },
  },
  { label: 'Estimator', href: '/solar-estimator' },
  { label: 'Our Work', href: '/#work' },
  { label: 'Contact', href: '/#quote' },
];

export default function Header() {
  const [open, setOpen] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpand, setMobileExpand] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (i: number) => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(i);
  };
  const hide = () => {
    timer.current = setTimeout(() => setOpen(null), 140);
  };

  const Arrow = () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );

  return (
    <header className={styles.header}>
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

      {/* nav + mega */}
      <div className={styles.navbar}>
        <div className={styles.barrow}>
          <Link href="/" className={styles.logo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/heliaxis-logo.png" alt="Heliaxis" />
          </Link>

          <nav className={styles.nav}>
            {MENU.map((t, i) =>
              t.cols ? (
                <span
                  key={i}
                  className={`${styles.navlink} ${open === i ? styles.active : ''}`}
                  onMouseEnter={() => show(i)}
                  onMouseLeave={hide}
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  {t.label}
                  <svg className={styles.caret} viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              ) : (
                <Link key={i} href={t.href!} className={styles.navlink} onMouseEnter={hide}>
                  {t.label}
                </Link>
              )
            )}
          </nav>

          <div className={styles.headcta}>
            <a className={styles.headtel} href="tel:01633965205">
              <Icon name="phone" size={16} />
              01633 965205
            </a>
            <Link className={styles.qbtn} href="/#quote">
              Free quote
            </Link>
          </div>

          <button className={styles.burger} aria-label="Menu" onClick={() => setMobileOpen((v) => !v)}>
            <span /><span /><span />
          </button>
        </div>

        {/* mega panels (desktop) */}
        {MENU.map((t, i) =>
          t.cols ? (
            <div
              key={i}
              className={`${styles.mega} ${open === i ? styles.open : ''}`}
              onMouseEnter={() => timer.current && clearTimeout(timer.current)}
              onMouseLeave={hide}
            >
              <div
                className={styles.inner}
                style={{ gridTemplateColumns: `repeat(${t.cols.length}, 1fr) 1.15fr` }}
              >
                {t.cols.map((c, ci) => (
                  <div key={ci} className={styles.megacol}>
                    <div className={styles.ey}>
                      <Spark size={12} />
                      {c.title}
                    </div>
                    {c.items.map((it, ii) => (
                      <Link key={ii} className={styles.megaitem} href={it.href}>
                        <span className={styles.miIc}>
                          <Icon name={it.icon} />
                        </span>
                        <span className={styles.miT}>
                          <b>{it.label}</b>
                          {it.desc && <span className={styles.miD}>{it.desc}</span>}
                        </span>
                      </Link>
                    ))}
                  </div>
                ))}
                {t.featured && (
                  <div className={styles.megafeat}>
                    <Spark size={34} />
                    <div className={styles.ftT}>{t.featured.title}</div>
                    <p>{t.featured.text}</p>
                    <Link className={styles.ftCta} href={t.featured.href}>
                      {t.featured.cta} <Arrow />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ) : null
        )}
      </div>

      {/* mobile accordion */}
      {mobileOpen && (
        <div className={styles.mobile}>
          {MENU.map((t, i) =>
            t.cols ? (
              <div key={i} className={styles.mSection}>
                <button className={styles.mTop} onClick={() => setMobileExpand(mobileExpand === i ? null : i)}>
                  {t.label}
                  <span>{mobileExpand === i ? '–' : '+'}</span>
                </button>
                {mobileExpand === i && (
                  <div className={styles.mBody}>
                    {t.cols.map((c, ci) => (
                      <div key={ci} className={styles.mCol}>
                        <div className={styles.ey}>{c.title}</div>
                        {c.items.map((it, ii) => (
                          <Link key={ii} className={styles.mItem} href={it.href} onClick={() => setMobileOpen(false)}>
                            <Icon name={it.icon} size={18} />
                            {it.label}
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link key={i} href={t.href!} className={styles.mTop} onClick={() => setMobileOpen(false)}>
                {t.label}
              </Link>
            )
          )}
          <Link href="/#quote" className={styles.qbtn} onClick={() => setMobileOpen(false)}>
            Free quote
          </Link>
        </div>
      )}
    </header>
  );
}
