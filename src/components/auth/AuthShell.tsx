import type { ReactNode } from 'react';
import { brand } from './authStyles';

function Spark({ size = 26 }: { size?: number }) {
  const ray = 'M11 9.6 L13 9.6 L13 0.8 L11 3 Z';
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={brand.solar} aria-hidden="true">
      {[0, 90, 180, 270].map((a) => (
        <g key={a} transform={`rotate(${a} 12 12)`}>
          <path d={ray} />
        </g>
      ))}
    </svg>
  );
}

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
        background: brand.paper,
        fontFamily: brand.body,
        color: brand.ink,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '.5rem',
            justifyContent: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <Spark />
          <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '.02em' }}>
            HELIAXIS
          </span>
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
