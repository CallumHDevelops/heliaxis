export default function AdminLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(ellipse 70% 50% at 80% 0%, rgba(248,188,30,.18), transparent 55%), linear-gradient(165deg, #F7F2E7 0%, #EFE8D8 55%, #e7e1d2 100%)',
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
        color: '#211F18',
      }}
    >
      <div style={{ textAlign: 'center', padding: '28px 32px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/heliaxis-logo.png"
          alt="Heliaxis"
          style={{ height: 36, width: 'auto', display: 'block', margin: '0 auto 18px' }}
        />
        <div
          style={{
            height: 3,
            width: 140,
            margin: '0 auto 14px',
            borderRadius: 2,
            background: 'rgba(33,31,24,.1)',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'block',
              height: '100%',
              width: '40%',
              borderRadius: 2,
              background: '#F8BC1E',
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
            color: '#6E6A5E',
          }}
        >
          Loading…
        </p>
      </div>
      <style>{`@keyframes adminLoadSlide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}`}</style>
    </div>
  );
}
