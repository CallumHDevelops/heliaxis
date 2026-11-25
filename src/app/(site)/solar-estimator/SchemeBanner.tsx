import type { Scheme } from '@/lib/estimator/calc';

/**
 * Once, under the systems: the government scheme Heliaxis is approved for, with its official logo and the wording its guidelines allow, and
 * a link to the scheme's own page. Hidden until it is switched on in the admin. No rates or amounts: the scheme's page and the lender give those.
 */
export function SchemeBanner({ scheme }: { scheme: Scheme }) {
  if (!scheme.on || !scheme.wording) return null;
  return (
    <aside className="est-v4-scheme" aria-label={scheme.name || 'Government scheme'}>
      {scheme.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={scheme.logoUrl} alt={scheme.name ? `${scheme.name} logo` : 'Scheme logo'} height={48} loading="lazy" />
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
