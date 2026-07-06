import type { ReactNode } from 'react';
import Image from 'next/image';
import { signOut } from '@/lib/auth-actions';
import { brand } from '@/components/auth/authStyles';

type Tab = 'enquiries' | 'approvals';

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
}: {
  active: Tab;
  isAdmin: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: brand.paper,
        backgroundImage: 'url(/assets/heliaxis-card-fill-light.svg)',
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
          padding: '1rem 1.5rem',
          borderBottom: `1px solid ${brand.line}`,
          background: 'rgba(255,253,248,.75)',
          flexWrap: 'wrap',
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

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>{children}</main>
    </div>
  );
}
