// Scratch route to verify the shared Header + brand fonts render in Next.js.
// The live marketing pages are untouched (still static) until the port is done.
export default function Preview() {
  return (
    <main style={{ minHeight: '80vh' }}>
      <section style={{ padding: '80px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <div
          style={{
            fontFamily: 'var(--mono)',
            textTransform: 'uppercase',
            letterSpacing: '.14em',
            color: 'var(--amber-2)',
            fontSize: '.72rem',
          }}
        >
          Header preview
        </div>
        <h1 style={{ fontSize: '3.2rem', fontWeight: 900, marginTop: '1rem', maxWidth: '14ch' }}>
          Cut your energy bills with <span style={{ color: 'var(--solar)' }}>Welsh sunshine.</span>
        </h1>
        <p style={{ color: 'var(--muted)', maxWidth: '52ch', marginTop: '1.2rem', lineHeight: 1.6 }}>
          Scratch page to verify the shared mega-menu header, Ezra display font and brand tokens
          render correctly in Next.js. Hover “Residential” or “Commercial” to open the mega panels.
        </p>
      </section>
    </main>
  );
}
