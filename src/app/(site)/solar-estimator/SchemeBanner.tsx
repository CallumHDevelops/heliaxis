import type { Scheme } from '@/lib/estimator/calc';

/** The open monopitch spark from the brand kit. */
function Spark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#F8BC1E" aria-hidden="true">
      {[0, 90, 180, 270].map((a) => (
        <g key={a} transform={`rotate(${a} 12 12)`}>
          <path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" />
        </g>
      ))}
    </svg>
  );
}

/**
 * Heliaxis's own badge for the scheme, in the house style (charcoal, gold spark, mono label). It is not the government's mark and does not
 * look like it: no crest, no "funded by". Used until the scheme's official logo is added in the admin.
 */
export function SchemeBadge({ name }: { name: string }) {
  return (
    <span className="est-v4-badge" role="img" aria-label={`Finance through the ${name}`}>
      <Spark />
      <span className="est-v4-badge__t">
        <small>Finance through the</small>
        <b>{name}</b>
      </span>
    </span>
  );
}

/**
 * Once, under the systems: the government scheme Heliaxis is approved for, with the scheme's official logo (or our own badge until it is
 * added), the wording, and a link to the scheme's own page. Hidden until it is switched on in the admin. No rates or amounts: the scheme's
 * page and the lender give those.
 */
export function SchemeBanner({ scheme }: { scheme: Scheme }) {
  if (!scheme.on || !scheme.wording) return null;
  const name = scheme.name || 'Warm Homes Loan Scheme';
  return (
    <aside className="est-v4-scheme" aria-label={name}>
      {scheme.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={scheme.logoUrl} alt={`${name} logo`} height={48} loading="lazy" />
      ) : (
        <SchemeBadge name={name} />
      )}
      <p>
        {scheme.wording}
        {scheme.link && (
          <>
            {' '}
            <a href={scheme.link} target="_blank" rel="noopener noreferrer">
              About the scheme
            </a>
          </>
        )}
      </p>
    </aside>
  );
}
