'use client';

import { brand } from '@/components/auth/authStyles';

type Props = {
  slug: string;
};

export function BlogAdminPostActions({ slug }: Props) {
  const btn: React.CSSProperties = {
    padding: '5px 10px',
    borderRadius: 4,
    fontSize: '0.78rem',
    fontWeight: 700,
    cursor: 'pointer',
    border: `1px solid ${brand.line}`,
    background: brand.paper,
    color: brand.ink,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  };

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <a
        href={`/admin/blog/preview/${encodeURIComponent(slug)}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...btn, background: brand.solar, borderColor: brand.solar }}
      >
        Preview
      </a>
      <a href={`/blog/${slug}`} target="_blank" rel="noopener noreferrer" style={btn}>
        Live
      </a>
    </div>
  );
}
