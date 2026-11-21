import type { Award } from '@/lib/estimator/calc';

/**
 * Under the hero: the accreditations (the one logo set the quote PDF uses too: MCS, TrustMark, NAPIT, RECC, SSIP) and, once its wording is
 * confirmed and switched on in the admin, the GoodWe award. One row on a desktop, scrolls sideways on a phone.
 */
export function TrustBar({ award }: { award: Award }) {
  return (
    <div className="est-trust" role="group" aria-label="Accreditations">
      {award.on && (
        <span className="est-trust__award">
          {award.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={award.imageUrl} alt={award.title || 'GoodWe award'} width={44} height={44} loading="lazy" />
          ) : null}
          <span>{award.title}</span>
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="est-trust__logos" src="/assets/heliaxis-accreditations-light.png" alt="MCS certified, TrustMark, NAPIT, RECC and SSIP accredited installer" width={800} height={76} />
    </div>
  );
}
