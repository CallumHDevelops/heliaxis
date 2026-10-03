import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { signOut } from '@/lib/auth-actions';
import { brand } from '@/components/auth/authStyles';
import { getSessionProfile } from '@/lib/auth';
import { canAccess } from '@/lib/portals';

type Tab = 'dashboard' | 'enquiries' | 'approvals' | 'users' | 'blog' | 'analytics' | 'heatmap' | 'subcontractors';

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      style={{
        padding: '.45rem .8rem',
        fontSize: '.88rem',
        fontWeight: 600,
        textDecoration: 'none',
        borderRadius: '2px',
        color: active ? brand.ink : brand.muted,
        background: active ? brand.solar : 'transparent',
      }}
    >
      {label}
    </a>
  );
}

export async function AdminShell({
  active,
  children,
  wide,
  flush,
}: {
  active: Tab;
  /** @deprecated nav now reads the signed-in profile itself. */
  isAdmin?: boolean;
  children: ReactNode;
  /** Wider main column (e.g. analytics embed). */
  wide?: boolean;
  /** Edge-to-edge main (no max-width / side padding) — for full iframe pages. */
  flush?: boolean;
}) {
  // Nav shows only what this person can open (see /admin/users).
  const { profile } = await getSessionProfile();
  const can = (k: Parameters<typeof canAccess>[1]) => canAccess(profile, k);
  const admin = profile?.role === 'admin';
  return (
    <div
      className={flush ? 'admin-shell admin-shell--flush' : 'admin-shell'}
      style={{
        minHeight: flush ? undefined : '100vh',
        height: flush ? '100vh' : undefined,
        maxHeight: flush ? '100vh' : undefined,
        overflow: flush ? 'hidden' : undefined,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: flush ? '#111' : brand.paper,
        backgroundImage: flush ? 'none' : 'url(/assets/heliaxis-card-fill-light.svg)',
        backgroundSize: 'cover',
        backgroundPosition: 'top right',
        backgroundRepeat: 'no-repeat',
        fontFamily: brand.body,
        color: brand.ink,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '0.75rem 1.25rem',
          borderBottom: `1px solid ${brand.line}`,
          background: 'rgba(255,253,248,.92)',
          flexWrap: 'wrap',
          flexShrink: 0,
          zIndex: 2,
        }}
      >
        <Link href="/admin" style={{ display: 'flex', alignItems: 'center' }}>
          <Image
            src="/assets/heliaxis-logo.png"
            alt="Heliaxis"
            width={140}
            height={32}
            style={{ width: 140, height: 'auto' }}
          />
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
          <NavLink href="/admin" label="Dashboard" active={active === 'dashboard'} />
          {can('cms') && <NavLink href="/admin/cms" label="CMS" active={false} />}
          {can('cms') && <NavLink href="/admin/blog" label="Blog" active={active === 'blog'} />}
          {can('enquiries') && <NavLink href="/admin/enquiries" label="Enquiries" active={active === 'enquiries'} />}
          {can('subcontractors') && (
            <NavLink href="/admin/subcontractors" label="Subcontractors" active={active === 'subcontractors'} />
          )}
          {can('analytics') && <NavLink href="/admin/analytics" label="Analytics" active={active === 'analytics'} />}
          {can('analytics') && (
            <NavLink href="/admin/analytics/heatmap" label="Heatmap" active={active === 'heatmap'} />
          )}
          {admin && <NavLink href="/admin/users" label="Users" active={active === 'users' || active === 'approvals'} />}
          <form action={signOut} style={{ margin: 0 }}>
            <button
              type="submit"
              style={{
                padding: '.45rem .8rem',
                fontSize: '.88rem',
                fontWeight: 600,
                color: brand.ink,
                background: 'transparent',
                border: `1px solid ${brand.line}`,
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <main
        className={flush ? 'admin-shell__main admin-shell__main--flush' : 'admin-shell__main'}
        style={
          flush
            ? {
                flex: '1 1 auto',
                width: '100%',
                maxWidth: 'none',
                margin: 0,
                padding: 0,
                minHeight: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }
            : {
                // width: 100% — auto margins on a flex item stop it stretching, which
                // otherwise shrink-wraps the page to its content.
                width: '100%',
                boxSizing: 'border-box',
                maxWidth: wide ? 1200 : 1000,
                margin: '0 auto',
                padding: '2rem 1.5rem',
              }
        }
      >
        {children}
      </main>
    </div>
  );
}
