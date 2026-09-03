'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Spark, Wordmark } from '@/components/brand/Spark';
import { SignOutButton } from './SignOutButton';
import { cn } from '@/lib/cn';
import type { Profile } from '@/lib/types';

const LINKS = [
  { href: '/', label: 'Dashboard', exact: true },
  { href: '/projects', label: 'Projects' },
  { href: '/rams', label: 'RAMS' },
  { href: '/certifications', label: 'Certifications' },
  { href: '/company', label: 'Company' },
];

export function AppNav({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isAdmin = profile.role === 'admin';

  const links = isAdmin ? [...LINKS, { href: '/admin/users', label: 'Users' }] : LINKS;

  function active(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="no-print sticky top-0 z-40 border-b border-[color:var(--line-d)] bg-ink text-paper">
      <div className="mx-auto flex max-w-[86rem] items-center gap-6 px-5 py-3">
        <Link href="/" className="shrink-0">
          <Wordmark tone="light" className="text-[1.05rem]" />
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'rounded-[2px] px-3 py-1.5 text-[0.84rem] font-semibold transition-colors',
                active(l.href, l.exact)
                  ? 'bg-solar text-ink'
                  : 'text-muted-d hover:bg-ink-2 hover:text-paper'
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <div className="text-right leading-tight">
            <div className="text-[0.8rem] font-semibold">{profile.full_name || profile.email}</div>
            <div className="mono text-[0.66rem] uppercase tracking-[0.1em] text-muted-d">
              {profile.role}
            </div>
          </div>
          <SignOutButton className="border-[color:var(--line-d)] text-paper hover:bg-ink-2" />
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Toggle navigation"
          className="ml-auto rounded-[2px] border border-[color:var(--line-d)] px-3 py-1.5 text-[0.8rem] font-semibold md:hidden"
        >
          Menu
        </button>
      </div>

      {open && (
        <div className="border-t border-[color:var(--line-d)] px-5 pb-4 md:hidden">
          <nav className="flex flex-col gap-1 py-3">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'rounded-[2px] px-3 py-2 text-[0.88rem] font-semibold',
                  active(l.href, l.exact) ? 'bg-solar text-ink' : 'text-muted-d hover:bg-ink-2'
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center justify-between gap-3 border-t border-[color:var(--line-d)] pt-3">
            <div className="flex items-center gap-2 text-[0.82rem]">
              <Spark size={12} />
              {profile.full_name || profile.email}
            </div>
            <SignOutButton className="border-[color:var(--line-d)] text-paper hover:bg-ink-2" />
          </div>
        </div>
      )}
    </header>
  );
}
