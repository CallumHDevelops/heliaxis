import { useId } from 'react';

/**
 * Hestia, the assistant: an H in gold ribbon with a hearth flame inside it, under a halo arc and over a
 * hearth bowl (Hestia was the Greek goddess of the hearth and home). Heliaxis solar gold on ink, in both
 * themes: on dark it takes a hairline ring (.hx-metis in src/app/theme.css) so the tile keeps its edge.
 * The same artwork is public/assets/hestia.svg and the app's hestia_avatar drawable (android/…/drawable).
 */
export function HestiaIcon({ size = 32, className }: { size?: number; className?: string }) {
  const g = `hestia-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className ? `hx-metis ${className}` : 'hx-metis'} aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd35c" />
          <stop offset="1" stopColor="#e3a014" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="#211f18" />
      <g fill="none" stroke={`url(#${g})`} strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.4 20.4A15.7 15.7 0 0 1 39.6 20.4" strokeWidth="1" />
        <path d="M10.8 24.6A13.3 13.3 0 1 0 37.2 24.6" strokeWidth="1.4" />
        <path d="M17 14.5V33.5M31 14.5V33.5M17 26.5H31" strokeWidth="2.3" />
      </g>
      <path d="M24.4 11.8c.5 2.6-3.9 4.6-3.9 8.6a3.5 3.5 0 0 0 7 0c0-1.7-.8-2.9-1.6-3.9.1 1.3-.5 2.2-1.3 2.5.5-3-.1-5.3-.2-7.2z" fill={`url(#${g})`} />
    </svg>
  );
}
