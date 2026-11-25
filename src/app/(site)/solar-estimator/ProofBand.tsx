import { BrandIcon } from '@/app/admin/crm/CrmUi';
import type { Accreditation, Reviews } from '@/lib/estimator/calc';

/**
 * Under the systems: the accreditations with Heliaxis's own number for each and a link to the scheme's public register, so a visitor can
 * check them, and the review line once it is switched on with a real count. Only what is filled in shows; with no numbers at all it falls
 * back to the logo strip.
 */
export function ProofBand({ accreditations, reviews }: { accreditations: Accreditation[]; reviews: Reviews }) {
  const shown = accreditations.filter((a) => a.name && a.number);
  return (
    <section className="est-v4-proof" aria-labelledby="est-proof-h">
      <div className="est-v4-proof__head">
        <span className="est-v4-eyebrow">Accredited installer</span>
        <h2 id="est-proof-h">Check our numbers before you call us</h2>
        {reviews.on && (
          <p className="est-v4-proof__reviews">
            <BrandIcon k="star" size={18} />{' '}
            {reviews.url ? (
              <a href={reviews.url} target="_blank" rel="noopener noreferrer">
                {reviews.rating.toFixed(1)} from {reviews.count.toLocaleString('en-GB')} reviews on {reviews.source}
              </a>
            ) : (
              <span>
                {reviews.rating.toFixed(1)} from {reviews.count.toLocaleString('en-GB')} reviews on {reviews.source}
              </span>
            )}
          </p>
        )}
      </div>
      {shown.length ? (
        <ul className="est-v4-proof__list">
          {shown.map((a) => (
            <li key={a.name}>
              <BrandIcon k="shield" size={20} />
              <div>
                <b>{a.name}</b>
                <span className="mono">{a.number}</span>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer">
                    Check the register
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="est-v4-proof__logos" src="/assets/heliaxis-accreditations-light.png" alt="MCS certified, TrustMark, NAPIT, RECC and SSIP accredited installer" width={800} height={76} />
      )}
    </section>
  );
}
