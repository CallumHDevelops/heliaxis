'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { setTheme, useThemePref } from '@/lib/theme/client';
import { DEFAULT_PREF, THEME_GROUP_LABEL, THEME_LABELS, THEME_PREFS, type ThemePref } from '@/lib/theme/shared';
import './theme-choice.css';

const SVG = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const ICONS: Record<ThemePref, ReactNode> = {
  light: (
    <svg {...SVG}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg {...SVG}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  ),
  system: (
    <svg {...SVG}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2" />
      <path d="M10.5 18.5h3" />
    </svg>
  ),
};

/**
 * Light / Dark / Match phone. The colours change at once and the choice is kept on this device (and,
 * for staff, on their account once supabase/theme.sql has run). `menu` is for inside a role="menu"
 * (the avatar menu); otherwise it's a radio group with arrow keys. `serverPref` is the choice the
 * server rendered with, so the first paint shows the right one.
 */
export function ThemeChoice({
  variant = 'inline',
  size = 'md',
  serverPref = DEFAULT_PREF,
  className,
}: {
  variant?: 'inline' | 'menu';
  size?: 'sm' | 'md' | 'lg';
  serverPref?: ThemePref;
  className?: string;
}) {
  const pref = useThemePref(serverPref);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const menu = variant === 'menu';

  function pick(p: ThemePref) {
    if (p !== pref) setTheme(p);
  }

  // Radio group: arrows move the choice (and focus) along, wrapping round.
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (menu) return;
    const n = THEME_PREFS.length;
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i + n - 1) % n
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    buttons.current[to]?.focus();
    pick(THEME_PREFS[to]);
  }

  return (
    <div
      role={menu ? 'group' : 'radiogroup'}
      aria-label={THEME_GROUP_LABEL}
      className={`hx-tc hx-tc--${size}${className ? ` ${className}` : ''}`}
    >
      {THEME_PREFS.map((p, i) => {
        const on = pref === p;
        return (
          <button
            key={p}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role={menu ? 'menuitemradio' : 'radio'}
            aria-checked={on}
            tabIndex={menu || on ? 0 : -1}
            className={on ? 'hx-tc__opt is-on' : 'hx-tc__opt'}
            onClick={() => pick(p)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className="hx-tc__icon">{ICONS[p]}</span>
            <span className="hx-tc__label">{THEME_LABELS[p]}</span>
          </button>
        );
      })}
    </div>
  );
}
