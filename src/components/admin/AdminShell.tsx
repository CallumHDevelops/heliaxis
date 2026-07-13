import type { ReactNode } from 'react';
import Image from 'next/image';
import { signOut } from '@/lib/auth-actions';
import { brand } from '@/components/auth/authStyles';

type Tab = 'enquiries' | 'approvals' | 'blog' | 'analytics';

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

export function AdminShell({
  active,
  isAdmin,
  children,
  wide,
  flush,
}: {
  active: Tab;
  isAdmin: boolean;
  children: ReactNode;
  /** Wider main column (e.g. analytics embed). */
  wide?: boolean;
  /** Edge-to-edge main (no max-width / side padding) — for full iframe pages. */
  flush?: boolean;
}) {
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
        <a href="/admin" style={{ display: 'flex', alignItems: 'center' }}>
          <Image
            src="/assets/heliaxis-logo.png"
            alt="Heliaxis"
            width={140}
            height={32}
            style={{ width: 140, height: 'auto' }}
          />
        </a>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
          <NavLink href="/admin/enquiries" label="Enquiries" active={active === 'enquiries'} />
          <NavLink href="/admin/blog" label="Blog" active={active === 'blog'} />
          {isAdmin && (
            <NavLink href="/admin/analytics" label="Analytics" active={active === 'analytics'} />
          )}
          {isAdmin && (
            <NavLink href="/admin/approvals" label="Approvals" active={active === 'approvals'} />
          )}
          <a
            href="/admin"
            style={{
              padding: '.45rem .8rem',
              fontSize: '.88rem',
              fontWeight: 600,
              textDecoration: 'none',
              color: brand.muted,
            }}
          >
            CMS
          </a>
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
