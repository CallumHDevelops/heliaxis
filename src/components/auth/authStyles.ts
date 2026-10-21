import type { CSSProperties } from 'react';

// Brand tokens (engineered warmth) for the admin auth screens, as the light/dark theme's colours
// (src/app/theme.css), so inline styles follow the person's choice like the stylesheets do.
export const brand = {
  ink: 'var(--text)',
  solar: 'var(--accent)',
  amber: 'var(--accent-hover)',
  paper: 'var(--bg)',
  card: 'var(--surface)',
  muted: 'var(--muted)',
  line: 'var(--border)',
  ok: 'var(--ok)',
  /** Gold-family text: links and labels (dark enough to read on light). */
  link: 'var(--accent-text)',
  body: "'Hanken Grotesk', system-ui, -apple-system, sans-serif",
};

export const field: Record<string, CSSProperties> = {
  label: {
    display: 'block',
    fontSize: '.8rem',
    fontWeight: 600,
    color: brand.ink,
    marginBottom: '.4rem',
  },
  input: {
    width: '100%',
    padding: '.7rem .8rem',
    fontSize: '.95rem',
    fontFamily: brand.body,
    color: brand.ink,
    background: 'var(--field)',
    border: '1px solid var(--border-strong)',
    borderRadius: '2px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '.8rem 1rem',
    fontSize: '.95rem',
    fontWeight: 700,
    color: 'var(--accent-ink)',
    background: brand.solar,
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  error: {
    padding: '.65rem .8rem',
    fontSize: '.85rem',
    color: 'var(--danger)',
    background: 'rgb(var(--danger-rgb) / .08)',
    border: '1px solid rgb(var(--danger-rgb) / .25)',
    borderRadius: '2px',
  },
};
