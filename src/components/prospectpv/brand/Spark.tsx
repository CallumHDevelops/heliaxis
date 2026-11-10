/**
 * The Heliaxis spark: an open monopitch spark with four rays, each
 * M11 9.6 L13 9.6 L13 0.8 L11 3 Z rotated 0/90/180/270 about (12,12).
 * Never a solid star.
 */
const RAY = 'M11 9.6 L13 9.6 L13 0.8 L11 3 Z';

export function Spark({ size = 20, color = 'var(--solar)', className }: { size?: number; color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden="true" className={className}>
      {[0, 90, 180, 270].map((r) => (
        <path key={r} d={RAY} transform={r ? `rotate(${r} 12 12)` : undefined} />
      ))}
    </svg>
  );
}

/** Spark + HELIAXIS wordmark, or the uploaded logo if there is one. */
export function Wordmark({
  size = 22,
  logoUrl,
  tone = 'ink',
  className,
}: {
  size?: number;
  logoUrl?: string;
  tone?: 'ink' | 'light';
  className?: string;
}) {
  if (logoUrl) return <img src={logoUrl} alt="Heliaxis" className={className} style={{ height: size * 1.3, width: 'auto', display: 'block' }} />;
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.36 }}>
      <Spark size={Math.round(size * 1.18)} />
      <span
        style={{
          fontFamily: 'var(--display)',
          fontSize: size,
          fontWeight: 900,
          letterSpacing: size * 0.14,
          lineHeight: 1,
          color: tone === 'light' ? 'var(--card)' : 'var(--ink)',
        }}
      >
        HELIAXIS
      </span>
    </span>
  );
}
