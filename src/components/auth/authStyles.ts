import type { CSSProperties } from 'react';

// Brand tokens (engineered warmth) for the admin auth screens.
export const brand = {
  ink: '#211F18',
  solar: '#F8BC1E',
  amber: '#E39A0C',
  paper: '#F7F2E7',
  card: '#FFFDF8',
  muted: '#6E6A5E',
  line: 'rgba(33,31,24,.14)',
  ok: '#3F7D4E',
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
    background: '#fff',
    border: `1px solid ${brand.line}`,
    borderRadius: '2px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '.8rem 1rem',
    fontSize: '.95rem',
    fontWeight: 700,
    color: brand.ink,
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
    color: '#8a2020',
    background: 'rgba(180,40,40,.08)',
    border: '1px solid rgba(180,40,40,.25)',
    borderRadius: '2px',
  },
};
