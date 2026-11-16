import Link from 'next/link';
import { readEstimatorSettings } from '@/lib/estimator/settings';
import { packageCards } from '@/lib/estimator/package-cards';
import { Eyebrow } from '@/components/home/Eyebrow';
import './packages-band.css';

/** The main quote button's label and page (spec section 5). */
export const QUOTE_LABEL = 'Get my free solar quote';
export const QUOTE_HREF = '/free-solar-quote';

/**
 * The packages Cal sells and their from-prices, read on the server from the estimator settings, so prices are never typed
 * into page copy. Renders nothing when no active package has a price.
 */
export async function PackagesBand({ quoteHref = QUOTE_HREF }: { quoteHref?: string }) {
  const cards = packageCards((await readEstimatorSettings()).packages);
  if (!cards.length) return null;
  return (
    <section className="sec pkgband" aria-labelledby="pkgband-h">
      <div className="wrap">
        <div className="sec-head center">
          <Eyebrow>Packages</Eyebrow>
          <h2 id="pkgband-h">Our packages and starting prices</h2>
        </div>
        <div className="pkg-grid">
          {cards.map((c) => (
            <article key={c.id} className="pkg-card">
              <h3>{c.name}</h3>
              {c.summary && <p className="pkg-sum">{c.summary}</p>}
              {c.fromPrice && <p className="pkg-price">{c.fromPrice}</p>}
              {c.sizeLine && <p className="pkg-size">{c.sizeLine}</p>}
              {c.includes.length > 0 && (
                <ul className="pkg-inc">
                  {c.includes.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
              <div className="pkg-ctas">
                <Link className="btn btn-solar" href={quoteHref}>
                  {QUOTE_LABEL}
                </Link>
                <Link className="pkg-alt" href="/solar-estimator">
                  Try the solar estimator
                </Link>
              </div>
            </article>
          ))}
        </div>
        <p className="pkg-note">Prices are for a typical home and include fitting. Your survey sets the exact price.</p>
      </div>
    </section>
  );
}
