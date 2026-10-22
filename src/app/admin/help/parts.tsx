import Link from 'next/link';
import type { ReactNode } from 'react';
import { icons, type IconName } from '@/components/admin/AdminShell';
import { accessLabel } from '@/lib/help/parse';

/** Bits the three Help pages share. */

/** A section's icon (a name from the shell's icons; Help's own when it isn't one). */
export const sectionIcon = (name: string) => icons[(name in icons ? name : 'help') as IconName];

export function Crumbs({ trail }: { trail: { href?: string; label: string }[] }) {
  return (
    <nav className="hp-crumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((t, i) => (
          <li key={i}>
            {t.href ? (
              <Link href={t.href}>{t.label}</Link>
            ) : (
              <span aria-current="page">{t.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const CHIP_ICON = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

/** Where it is in the menus on a computer ("CRM › WhatsApp templates"). */
export function WhereChip({ where }: { where: string }) {
  return (
    <span className="hp-chip" title="Where to find it in the menu on a computer">
      <svg {...CHIP_ICON}>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
      <span className="hx-sr">Where: </span>
      {where}
    </span>
  );
}

/** Who can use what the article describes; says so when the reader can't (yet). */
export function AccessChip({ access, has }: { access: string[]; has: boolean }) {
  const everyone = !access.length || access.includes('everyone');
  return (
    <span className={`hp-chip hp-chip--access${everyone ? ' is-everyone' : ''}${access.includes('admin') ? ' is-admin' : ''}`}>
      <svg {...CHIP_ICON}>
        {everyone ? (
          <>
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.7a3.5 3.5 0 0 1 0 6.6M18.5 14.3A6.5 6.5 0 0 1 21.5 20" />
          </>
        ) : (
          <>
            <rect x="5" y="10.5" width="14" height="10" rx="2" />
            <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
          </>
        )}
      </svg>
      {accessLabel(access)}
      {!has && <span className="hp-chip__note"> · you don’t have it</span>}
    </span>
  );
}

/** "3 articles". */
export const articleCount = (n: number) => `${n} article${n === 1 ? '' : 's'}`;

/** A page's heading block. */
export function HelpHead({ kicker, title, lead, icon, children }: { kicker?: string; title: string; lead?: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <header className={icon ? 'hp-head has-icon' : 'hp-head'}>
      {icon && <span className="hp-head__icon">{icon}</span>}
      <div className="hp-head__text">
        {kicker && <p className="hp-kicker">{kicker}</p>}
        <h1>{title}</h1>
        {lead && <p className="hp-lead">{lead}</p>}
        {children}
      </div>
    </header>
  );
}
