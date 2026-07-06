import type { Metadata } from 'next';
import changelog from '@/data/changelog.json';

export const metadata: Metadata = {
  title: 'Product updates — Heliaxis',
  description: 'Fixes, improvements and new features shipped to the Heliaxis site.',
};

type Entry = { version: string; date: string; type: string; title: string; detail: string };

const TYPE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  feature: { bg: 'rgba(248,188,30,.18)', fg: '#8a5a02', label: 'New' },
  fix: { bg: 'rgba(63,125,78,.15)', fg: '#2f5f3b', label: 'Fix' },
  improvement: { bg: 'rgba(37,99,235,.12)', fg: '#1e40af', label: 'Improved' },
};

function fmt(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function UpdatesPage() {
  const entries = changelog as Entry[];

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '64px 24px 96px' }}>
      <div
        style={{
          fontFamily: 'var(--mono)',
          textTransform: 'uppercase',
          letterSpacing: '.14em',
          color: 'var(--amber-2)',
          fontSize: '.72rem',
        }}
      >
        Changelog
      </div>
      <h1 style={{ fontSize: 'clamp(2rem,4vw,2.8rem)', fontWeight: 900, margin: '.6rem 0 .4rem' }}>
        Product updates
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '1rem', margin: 0, lineHeight: 1.6 }}>
        Fixes, improvements and new features as they ship. Spotted something? Report it from the
        admin and it&rsquo;ll show up here once resolved.
      </p>

      <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {entries.map((e, i) => {
          const t = TYPE_STYLE[e.type] || TYPE_STYLE.improvement;
          return (
            <article
              key={i}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: 4,
                padding: '20px 22px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '.66rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    padding: '.25rem .5rem',
                    borderRadius: 2,
                    background: t.bg,
                    color: t.fg,
                  }}
                >
                  {t.label}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '.72rem', color: 'var(--muted)' }}>
                  {fmt(e.date)} · v{e.version}
                </span>
              </div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '12px 0 6px' }}>
                {e.title}
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '.94rem', margin: 0, lineHeight: 1.6 }}>
                {e.detail}
              </p>
            </article>
          );
        })}
      </div>
    </main>
  );
}
