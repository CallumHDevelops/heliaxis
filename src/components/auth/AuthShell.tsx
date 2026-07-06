import type { ReactNode } from 'react';
import Image from 'next/image';
import { brand } from './authStyles';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        backgroundColor: brand.paper,
        backgroundImage: 'url(/assets/heliaxis-card-fill-light.svg)',
        backgroundSize: 'cover',
        backgroundPosition: 'top right',
        backgroundRepeat: 'no-repeat',
        fontFamily: brand.body,
        color: brand.ink,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <Image
            src="/assets/heliaxis-logo.png"
            alt="Heliaxis"
            width={180}
            height={41}
            style={{ width: 180, height: 'auto' }}
            priority
          />
        </div>

        <div
          style={{
            background: brand.card,
            border: `1px solid ${brand.line}`,
            borderRadius: '4px',
            padding: '2rem',
          }}
        >
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>{title}</h1>
          {subtitle && (
            <p style={{ color: brand.muted, fontSize: '.9rem', margin: '.4rem 0 1.5rem' }}>
              {subtitle}
            </p>
          )}
          <div style={{ marginTop: subtitle ? 0 : '1.25rem' }}>{children}</div>
        </div>

        {footer && (
          <p
            style={{
              textAlign: 'center',
              color: brand.muted,
              fontSize: '.85rem',
              marginTop: '1.25rem',
            }}
          >
            {footer}
          </p>
        )}
      </div>
    </div>
  );
}
