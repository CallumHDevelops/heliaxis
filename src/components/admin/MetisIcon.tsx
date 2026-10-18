import { useId } from 'react';

/**
 * Metis, the assistant: an M woven from gold ribbon inside a circle, with a halo arc and a point of
 * insight (Metis was the Greek goddess of wisdom and counsel). Heliaxis solar gold on ink.
 */
export function MetisIcon({ size = 32, className }: { size?: number; className?: string }) {
  const g = `metis-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd35c" />
          <stop offset="1" stopColor="#e3a014" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="#211f18" />
      <g fill="none" stroke={`url(#${g})`} strokeLinecap="round" strokeLinejoin="round" transform="translate(24 24.2) scale(.93) translate(-24 -24)">
        <path d="M8.4 20.4A15.7 15.7 0 0 1 39.6 20.4" strokeWidth="1" />
        <path d="M10.8 22.6A13.3 13.3 0 1 0 37.2 22.6" strokeWidth="1.4" />
        <path d="M21.9 23.2C19.6 21.4 16.5 20.7 13.4 21.1 9.3 21.6 6.8 24.3 7.2 27.4c.4 3 3.1 4.9 6.2 4.8" strokeWidth="1.4" />
        <path d="M26.1 23.2c2.3-1.8 5.4-2.5 8.5-2.1 4.1.5 6.6 3.2 6.2 6.3-.4 3-3.1 4.9-6.2 4.8" strokeWidth="1.4" />
        <path
          d="M10.8 22.6C10.9 17.4 12.6 14.6 15.2 14.6c3.4 0 5.8 6.2 7.4 10.4.5 1.3.9 2 1.4 2s.9-.7 1.4-2c1.6-4.2 4-10.4 7.4-10.4 2.6 0 4.3 2.8 4.4 8"
          strokeWidth="2.1"
        />
      </g>
      <circle cx="24" cy="17.8" r="1.4" fill={`url(#${g})`} />
    </svg>
  );
}
