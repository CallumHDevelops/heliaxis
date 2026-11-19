import Link from 'next/link';
import type { Metric, TeardownFacts } from '@/lib/search/teardown/card';
import type { TeardownSummary } from '@/lib/search/teardown/server';
import { dateLabel, n, Pos } from '../common';
import { RebuildTeardown } from './RebuildTeardown';

const short = (s: string) => {
  const [table, key] = [s.slice(0, s.indexOf(':')), s.slice(s.indexOf(':') + 1)];
  if (table === 'seo_page_facts') {
    try {
      const u = new URL(key);
      return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
    } catch {
      return key;
    }
  }
  return s;
};

export const rivalHref = (domain: string) => `/admin/search/competitors/${encodeURIComponent(domain)}`;

function TopValue({ m }: { m: Metric }) {
  if (m.value === null) return <span className="sx-note">not known</span>;
  return m.kind === 'median' ? (
    <>
      {n(m.value, 1)} <small className="sx-note">median of {m.of}</small>
    </>
  ) : (
    <>
      {m.value} <small className="sx-note">of {m.of}</small>
    </>
  );
}

function OursValue({ m }: { m: Metric }) {
  if (m.kind === 'count') return m.oursHas === null || m.oursHas === undefined ? <span className="sx-note">–</span> : m.oursHas ? <span className="sx-up">yes</span> : <span className="sx-down">no</span>;
  if (m.ours === null) return <span className="sx-note">–</span>;
  const behind = m.value !== null && m.ours < m.value;
  return <span className={behind ? 'sx-down' : undefined}>{n(m.ours, 1)}</span>;
}

/** Where a line's numbers came from: the stored rows, listed. */
function Sources({ m }: { m: Metric }) {
  const all = [...m.from, ...m.oursFrom.map((s) => `${s} (ours)`)];
  if (!all.length) return <span className="sx-note">–</span>;
  return (
    <details className="tdn-src">
      <summary>{all.length} row{all.length === 1 ? '' : 's'}</summary>
      <ul>
        {all.map((s) => (
          <li key={s} title={s}>
            {short(s)}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function TeardownCard({ facts, summary, model, costUsd, canSpend, keywordId, title }: { facts: TeardownFacts | null; summary: TeardownSummary | null; model: string | null; costUsd: number; canSpend: boolean; keywordId: number; title: { phrase: string; town: string | null; date: string | null } }) {
  return (
    <section className="sx-card tdn-card" id={`k${keywordId}`}>
      <div className="sx-row tdn-head">
        <div>
          <h2>{title.phrase}</h2>
          <span className="sx-note">
            {title.town ?? 'No town'}
            {facts ? (
              <>
                {' '}
                · us: <Pos p={facts.ours.pos} /> organic, {facts.ours.packPos ? `${facts.ours.packPos} in the map pack` : 'not in the map pack'} · run of {dateLabel(facts.date)}
              </>
            ) : null}
          </span>
        </div>
        {canSpend && <RebuildTeardown keywordId={keywordId} />}
      </div>

      {!facts ? (
        <p className="sx-note">No teardown yet. Teardowns for priority-1 searches are built on Monday at 07:00, after the page facts for the weekend’s run are read.</p>
      ) : (
        <>
          <h3>What it takes</h3>
          <div className="sx-tablewrap">
            <table className="sx-table tdn-metrics">
              <thead>
                <tr>
                  <th>Measure</th>
                  <th className="num">Top {facts.topN}, not us</th>
                  <th className="num">Ours</th>
                  <th>From</th>
                </tr>
              </thead>
              <tbody>
                {facts.metrics.map((m) => (
                  <tr key={m.key}>
                    <td>
                      {m.label}
                      {m.note && <small className="sx-note"> ({m.note})</small>}
                    </td>
                    <td className="num">
                      <TopValue m={m} />
                    </td>
                    <td className="num">
                      <OursValue m={m} />
                    </td>
                    <td>
                      <Sources m={m} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sx-note">
            {facts.top10.filter((t) => t.read && !t.ours).length} of {facts.top10.filter((t) => !t.ours).length} rival pages read.{' '}
            {facts.ours.url ? (facts.ours.pageRead ? `Ours is ${facts.ours.pageFrom === 'target' ? 'the target page' : 'the ranking page'} ${short(`seo_page_facts:${facts.ours.url}`)}.` : 'Our page has not been read yet.') : 'We have no ranking or target page for this search (set one in Settings › Keywords).'}{' '}
            {facts.pack.length ? (facts.ours.businessFound ? '' : 'Our Business Profile has not been looked up yet.') : 'No map pack shown for this search.'}
          </p>

          <div className="tdn-chips">
            {Object.entries(facts.pageTypes).map(([t, c]) => (
              <span key={t} className="sx-chip" title="Page types in the top 10">
                {c} {t}
              </span>
            ))}
            {facts.schemaTypes.map((s) => (
              <span key={s.type} className={s.ours ? 'sx-chip gold' : 'sx-chip'} title={`${s.count} rival page${s.count === 1 ? '' : 's'} mark up ${s.type}${s.ours ? '; ours does too' : '; ours does not'}`}>
                {s.type} ×{s.count}
              </span>
            ))}
          </div>

          <details className="tdn-top">
            <summary>The top {facts.topN} and the map pack</summary>
            <div className="sx-grid2">
              <ol>
                {facts.top10.map((t) => (
                  <li key={t.pos} className={t.ours ? 'tdn-ours' : undefined}>
                    {t.installer && !t.ours ? <Link href={rivalHref(t.domain)}>{t.domain}</Link> : t.domain || <span className="sx-note">unidentified</span>} <small className="sx-note">{t.pageType ?? 'not read'}</small>
                  </li>
                ))}
              </ol>
              {facts.pack.length ? (
                <ol>
                  {facts.pack.map((p) => (
                    <li key={p.pos} className={p.ours ? 'tdn-ours' : undefined}>
                      {p.name}{' '}
                      <small className="sx-note">{p.businessId === null ? 'profile not looked up' : `${p.rating ?? '–'} stars, ${p.reviews ?? '–'} reviews${p.reviews90d !== null ? `, ${p.reviews90d} in 90 days` : ''}`}</small>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="sx-note">No map pack.</p>
              )}
            </div>
          </details>

          <h3>The write-up</h3>
          {summary && (summary.shared.length || summary.gaps.length || summary.outline.length) ? (
            <div className="sx-grid3">
              <div>
                <h4>What the winners share</h4>
                <ul className="sx-list">{summary.shared.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
              <div>
                <h4>Where we fall short</h4>
                <ul className="sx-list">{summary.gaps.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
              <div>
                <h4>Suggested outline</h4>
                <ol className="tdn-outline">{summary.outline.map((s) => <li key={s}>{s}</li>)}</ol>
              </div>
            </div>
          ) : null}
          <p className="sx-note">
            {summary?.note ? `${summary.note} ` : ''}
            {model ? `Written by ${model} on ${dateLabel(summary?.writtenAt)} from the figures above only (never the pages themselves); every number in it is checked against them. Cost $${costUsd.toFixed(4)}.` : ''}
          </p>
        </>
      )}
    </section>
  );
}
