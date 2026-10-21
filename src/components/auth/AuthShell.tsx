import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/theme/BrandLogo';
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
        // The card-fill pattern for the theme (light or dark), from src/app/theme.css.
        backgroundImage: 'var(--fill-texture)',
        backgroundSize: 'cover',
        backgroundPosition: 'top right',
        backgroundRepeat: 'no-repeat',
        fontFamily: brand.body,
        color: brand.ink,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <BrandLogo width={180} priority />
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
