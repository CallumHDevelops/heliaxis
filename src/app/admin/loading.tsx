import { BrandLogo } from '@/components/theme/BrandLogo';

// Shown on every admin navigation, so it follows the light/dark theme (src/app/theme.css) or it would flash.
export default function AdminLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(ellipse 70% 50% at 80% 0%, rgb(var(--accent-rgb) / .18), transparent 55%), linear-gradient(165deg, var(--bg) 0%, var(--surface-2) 55%, var(--surface-2) 100%)',
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
        color: 'var(--text)',
      }}
    >
      <div style={{ textAlign: 'center', padding: '28px 32px' }}>
        <BrandLogo width={157} className="hx-loading-logo" />
        <div
          style={{
            height: 3,
            width: 140,
            margin: '0 auto 14px',
            borderRadius: 2,
            background: 'rgb(var(--fg-rgb) / .1)',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'block',
              height: '100%',
              width: '40%',
              borderRadius: 2,
              background: 'var(--accent)',
              animation: 'adminLoadSlide 1.05s ease-in-out infinite',
            }}
          />
        </div>
        <p
          style={{
            margin: 0,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.68rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          Loading…
        </p>
      </div>
      <style>{`@keyframes adminLoadSlide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}.hx-loading-logo{display:flex;margin:0 auto 18px}`}</style>
    </div>
  );
}
