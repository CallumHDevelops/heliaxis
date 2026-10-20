import Link from 'next/link';
import type { HubMetaLeads as Data } from './meta-leads';

/**
 * Dashboard → New Meta leads: how many are waiting and how many came in today, the newest few with
 * Open, WhatsApp and Call, and a link to all of them on Enquiries. Times come from the server, so the
 * page shows them as it was given them.
 */
export function HubMetaLeads({ data }: { data: Data }) {
  const { count, more, today, rows, last, seeAll } = data;
  return (
    <section className="hub-section hub-meta" aria-labelledby="hub-meta-h">
      <div className="hub-meta-head">
        <h2 className="hub-h2" id="hub-meta-h">
          New Meta leads
        </h2>
        {count > 0 && (
          <span className="hub-meta-n" aria-label={`${count}${more ? ' or more' : ''} new`}>
            {count.toLocaleString('en-GB')}
            {more ? '+' : ''}
          </span>
        )}
        {today > 0 && <span className="hub-meta-today">{today} today</span>}
      </div>
      {rows.length === 0 ? (
        <div className="hub-list">
          <p className="hub-meta-empty">
            No new Meta leads. {last ? `The last one came in ${last}.` : 'None have come in from Meta yet.'}
          </p>
        </div>
      ) : (
        <ul className="hub-list">
          {rows.map((r) => {
            const who = (
              <>
                <b>
                  {r.name}
                  {r.ref && <span className="hub-meta-ref">{r.ref}</span>}
                </b>
                <small>
                  <span className="hub-meta-ad">{r.ad}</span>
                  {r.postcode && <span>{r.postcode}</span>}
                  <time dateTime={r.at}>{r.ago}</time>
                </small>
              </>
            );
            return (
              <li key={r.id}>
                <div className="hub-meta-row">
                  {r.href ? (
                    <Link href={r.href} className="hub-meta-main">
                      {who}
                    </Link>
                  ) : (
                    <span className="hub-meta-main">{who}</span>
                  )}
                  <span className="hub-meta-actions">
                    {r.href && (
                      <Link className="hub-meta-btn is-primary" href={r.href}>
                        Open
                      </Link>
                    )}
                    {r.chat && (
                      <Link className="hub-meta-btn is-wa" href={r.chat}>
                        WhatsApp
                      </Link>
                    )}
                    {r.phone && (
                      <a className="hub-meta-btn" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>
                        Call
                      </a>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {seeAll && count > 0 && (
        <Link href={seeAll} className="hub-more">
          See all new Meta leads →
        </Link>
      )}
    </section>
  );
}
