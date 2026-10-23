'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReportOverview } from '@/lib/report/build';
import { engineLabel, pct } from '@/lib/geo/shared';
import { localLeaders, rivals, serpKey, town, type SerpResult } from '@/lib/report/shared';

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const num = (n: number | null | undefined) => (n == null ? '–' : n.toLocaleString('en-GB'));
const STAGE: Record<string, string> = {
  gsc: 'Reading Search Console',
  serp: 'Checking Google town by town',
  market: 'Sizing up the competition',
  pages: 'Reading the competitors’ pages',
  analysis: 'Writing it up (a minute or two)',
};
const COUNTRY: Record<string, string> = { gbr: 'United Kingdom', usa: 'United States', irl: 'Ireland', ind: 'India', fra: 'France', deu: 'Germany', esp: 'Spain', nld: 'Netherlands', can: 'Canada', aus: 'Australia' };

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/cms-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

const TABS = [
  ['summary', 'Summary'],
  ['rankings', 'Where we rank'],
  ['competitors', 'Who beats us'],
  ['pages', 'Page comparison'],
  ['keywords', 'What we rank for'],
  ['ai', 'AI search'],
  ['settings', 'Settings'],
] as const;
type Tab = (typeof TABS)[number][0];

export function ReportView({ initial, admin }: { initial: ReportOverview; admin: boolean }) {
  const [o, setO] = useState(initial);
  const [tab, setTab] = useState<Tab>('summary');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (id?: string) => {
    const res = await fetch(`/api/cms-report${id ? `?id=${encodeURIComponent(id)}` : ''}`, { cache: 'no-store' });
    if (res.ok) setO(await res.json());
  }, []);

  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError('');
    try {
      await post(body);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      return false;
    } finally {
      setBusy('');
    }
  };

  const r = o.report;
  const buildingNow = o.history.find((h) => h.status === 'building');

  // While a report is building and this page is open, move it on a step at a time.
  useEffect(() => {
    if (!buildingNow) return;
    let stop = false;
    (async () => {
      while (!stop) {
        if (document.visibilityState === 'visible') await post({ action: 'step' }).catch(() => null);
        if (stop) break;
        const res = await fetch('/api/cms-report', { cache: 'no-store' }).catch(() => null);
        const next: ReportOverview | null = res?.ok ? await res.json() : null;
        if (next && !stop) setO(next);
        if (!next?.history.some((h) => h.status === 'building')) break;
        await new Promise((ok) => setTimeout(ok, 3000));
      }
    })();
    return () => {
      stop = true;
    };
  }, [buildingNow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!o.ready) {
    return (
      <div className="rpt">
        <Head />
        <section className="rpt__card">
          <h2>One step to switch this on</h2>
          <p>
            Run <code>supabase/seo-report.sql</code> in Supabase. It’s on the “From Claude” list on the <Link href="/admin">dashboard</Link>, with a
            Copy SQL button.
          </p>
        </section>
        <Sources o={o} />
      </div>
    );
  }

  const d = r?.data;
  const serps = Object.values(d?.serp ?? {});

  return (
    <div className="rpt">
      <Head>
        <div className="rpt__head-actions">
          {o.history.length > 1 && (
            <select aria-label="Choose a report" value={r?.id ?? ''} onChange={(e) => load(e.target.value)}>
              {o.history.map((h) => (
                <option key={h.id} value={h.id}>
                  {day(h.started_at)}
                  {h.status === 'building' ? ' (building)' : h.status === 'failed' ? ' (failed)' : ''}
                </option>
              ))}
            </select>
          )}
          {admin && (
            <button type="button" className="rpt__btn rpt__btn--primary" disabled={!!buildingNow || !!busy} onClick={() => act('build', { action: 'build' })}>
              {busy === 'build' ? 'Starting…' : buildingNow ? 'Building…' : 'Build a new report'}
            </button>
          )}
        </div>
      </Head>

      {error && (
        <p className="rpt__error" role="alert">
          {error}
        </p>
      )}

      {buildingNow && (
        <section className="rpt__card" aria-live="polite">
          <div className="rpt__bar">
            <span style={{ width: `${((Object.keys(STAGE).indexOf(buildingNow.stage) + 1) / 6) * 100}%` }} />
          </div>
          <p className="rpt__progress">
            {STAGE[buildingNow.stage] ?? 'Building'}… Keep this page open to finish sooner.
            {r?.id === buildingNow.id && r.stage === 'serp' && d?.serp
              ? ` ${Object.keys(d.serp).length} of ${d.settings.keywords.length * d.settings.locations.length} searches done.`
              : ''}
          </p>
        </section>
      )}

      {r?.status === 'failed' && (
        <section className="rpt__card rpt__card--warn">
          <p>This report didn’t finish: {r.error}</p>
          {admin && (
            <button type="button" className="rpt__btn" disabled={!!busy} onClick={() => act('retry', { action: 'retry', id: r.id })}>
              {busy === 'retry' ? 'Writing…' : 'Try the write-up again'}
            </button>
          )}
        </section>
      )}

      {!r && (
        <>
          <section className="rpt__card">
            <h2>No report yet</h2>
            <p>{admin ? 'Connect a data source below, then tap Build a new report.' : 'Ask an admin to build the first report.'}</p>
          </section>
          <Sources o={o} />
        </>
      )}

      {r && d && (
        <>
          <p className="rpt__meta">
            Report from {when(r.finished_at || r.started_at)}
            {r.started_by && r.started_by !== 'schedule' ? ` · built by ${r.started_by}` : r.started_by === 'schedule' ? ' · built automatically' : ''}
            {d.cost > 0 ? ` · DataForSEO cost $${d.cost.toFixed(2)}` : ''}
          </p>
          <nav className="rpt__tabs" aria-label="Report sections">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" className={tab === k ? 'is-on' : ''} aria-current={tab === k} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </nav>

          {tab === 'summary' && <Summary o={o} serps={serps} />}
          {tab === 'rankings' && <Rankings o={o} serps={serps} />}
          {tab === 'competitors' && <Competitors o={o} serps={serps} />}
          {tab === 'pages' && <Pages o={o} />}
          {tab === 'keywords' && <Keywords o={o} />}
          {tab === 'ai' && <AiSearch o={o} />}
          {tab === 'settings' && <Settings o={o} admin={admin} busy={busy} act={act} />}

          {d.notes.length > 0 && (
            <details className="rpt__notes">
              <summary>Missing data in this report ({d.notes.length})</summary>
              <ul>
                {d.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Head({ children }: { children?: React.ReactNode }) {
  return (
    <header className="rpt__head">
      <div>
        <h1>CMS report</h1>
        <p className="rpt__lede">
          What the website ranks for in Google and where, who is beating us and why, and how often AI assistants name Heliaxis. Built each month, or
          whenever an admin asks.
        </p>
      </div>
      {children}
    </header>
  );
}

function Sources({ o }: { o: ReportOverview }) {
  const s = o.sources;
  return (
    <section className="rpt__section">
      <h2>Data sources</h2>
      <div className="rpt__sources">
        <div className={`rpt__card ${s.gsc ? 'is-ok' : ''}`}>
          <h3>Google Search Console {s.gsc ? '✓' : ''}</h3>
          <p className="rpt__meta">Free. Your real searches, clicks, positions and countries.</p>
          {s.gsc ? (
            <p className="rpt__meta">
              Reading <code>{o.gscSite}</code> as <code>{o.gscEmail}</code>. If the report says access was refused, add that email as a user in Search
              Console (Settings → Users and permissions, Restricted is enough).
            </p>
          ) : (
            <ol>
              <li>In Google Cloud, open the project behind the Firebase key (or any project), switch on the Search Console API and make a service account key (JSON).</li>
              <li>
                Add it in Vercel as <code>GSC_SERVICE_ACCOUNT</code> (the Firebase key in <code>FIREBASE_SERVICE_ACCOUNT</code> works too).
              </li>
              <li>In Search Console → Settings → Users and permissions, add the service account’s email as a Restricted user.</li>
            </ol>
          )}
        </div>
        <div className={`rpt__card ${s.dataForSeo ? 'is-ok' : ''}`}>
          <h3>DataForSEO {s.dataForSeo ? '✓' : ''}</h3>
          <p className="rpt__meta">
            Pay as you go. Google’s results town by town with the map pack, and who competes with us. A report of 8 searches in 4 towns uses well
            under $1 of credit (check their current pricing).
          </p>
          {!s.dataForSeo && (
            <ol>
              <li>Sign up at dataforseo.com and add credit.</li>
              <li>
                In Vercel add <code>DATAFORSEO_LOGIN</code> and <code>DATAFORSEO_PASSWORD</code> (from API access in their dashboard).
              </li>
            </ol>
          )}
        </div>
        <div className={`rpt__card ${s.ai ? 'is-ok' : ''}`}>
          <h3>Claude {s.ai ? '✓' : ''}</h3>
          <p className="rpt__meta">Reads everything and explains why competitors win. Uses the same ANTHROPIC_API_KEY as Metis.</p>
        </div>
      </div>
    </section>
  );
}

function Delta({ now, was, lowerIsBetter, suffix = '' }: { now: number; was: number; lowerIsBetter?: boolean; suffix?: string }) {
  if (!was && !now) return null;
  const diff = Math.round((now - was) * 10) / 10;
  if (!diff) return <span className="rpt__meta"> no change</span>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <span className={good ? 'rpt__up' : 'rpt__down'}>
      {' '}
      {good ? '▲' : '▼'} {Math.abs(diff).toLocaleString('en-GB')}
      {suffix}
    </span>
  );
}

function Summary({ o, serps }: { o: ReportOverview; serps: SerpResult[] }) {
  const d = o.report!.data;
  const a = o.report!.analysis;
  const g = d.gsc;
  const ok = serps.filter((s) => !s.error);
  const top3 = ok.filter((s) => s.ours != null && s.ours <= 3).length;
  const page1 = ok.filter((s) => s.ours != null && s.ours <= 10).length;
  const inPack = ok.filter((s) => s.oursLocal != null).length;
  return (
    <>
      {a && (
        <section className="rpt__card rpt__lead">
          <h2>{a.headline}</h2>
          <p className="rpt__pre">{a.summary}</p>
        </section>
      )}
      <section className="rpt__tiles">
        {g && (
          <>
            <Tile label="Clicks from Google" value={num(g.totals.clicks)} sub={<Delta now={g.totals.clicks} was={g.prevTotals.clicks} />} />
            <Tile label="Times shown in Google" value={num(g.totals.impressions)} sub={<Delta now={g.totals.impressions} was={g.prevTotals.impressions} />} />
            <Tile label="Average position" value={String(g.totals.position)} sub={<Delta now={g.totals.position} was={g.prevTotals.position} lowerIsBetter suffix=" places" />} />
          </>
        )}
        {ok.length > 0 && (
          <>
            <Tile label="Tracked searches in the top 3" value={`${top3}/${ok.length}`} sub={<span className="rpt__meta">{page1} on page one</span>} />
            <Tile label="In the Google map pack" value={`${inPack}/${ok.length}`} sub={<span className="rpt__meta">the map above the results</span>} />
          </>
        )}
        {d.geo && <Tile label="Named by AI assistants" value={`${pct(d.geo.mentioned, d.geo.total)}%`} sub={<span className="rpt__meta">of {d.geo.total} answers</span>} />}
      </section>
      {g && <p className="rpt__meta">Search Console: {day(g.period.start)} to {day(g.period.end)}, against the 28 days before.</p>}
      {a && a.actions.length > 0 && (
        <section className="rpt__section">
          <h2>What to do next</h2>
          <ol className="rpt__actions">
            {a.actions.map((x, i) => (
              <li key={i} className="rpt__card">
                <div className="rpt__action-head">
                  <b>{x.title}</b>
                  <span className={`rpt__pill rpt__pill--${x.impact}`}>{x.impact} impact</span>
                  <span className="rpt__pill">{x.effort === 'quick' ? 'quick' : x.effort === 'big' ? 'big job' : 'medium job'}</span>
                  {x.page && (
                    <a className="rpt__link" href={x.page.startsWith('http') ? x.page : `https://heliaxis.co.uk${x.page}`} target="_blank" rel="noopener noreferrer">
                      {x.page}
                    </a>
                  )}
                </div>
                <p>{x.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!a && <p className="rpt__meta">{d.sources.ai ? 'The write-up appears here once the report is finished.' : 'Add ANTHROPIC_API_KEY for the write-up.'}</p>}
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rpt__tile">
      <span className="rpt__meta">{label}</span>
      <b>{value}</b>
      {sub}
    </div>
  );
}

function Rankings({ o, serps }: { o: ReportOverview; serps: SerpResult[] }) {
  const d = o.report!.data;
  const a = o.report!.analysis;
  const [open, setOpen] = useState<string | null>(null);
  const shown = open ? d.serp?.[open] : null;
  const g = d.gsc;
  return (
    <>
      {a && (
        <section className="rpt__card">
          <h2>Where we rank</h2>
          <p className="rpt__pre">{a.where_we_rank}</p>
        </section>
      )}
      {serps.length > 0 && (
        <section className="rpt__section">
          <h2>Google, town by town</h2>
          <p className="rpt__meta">Our place in Google’s results for each search, as seen from each town. 📍 = also in the map pack. Tap a cell to see who’s there.</p>
          <div className="rpt__table-wrap">
            <table className="rpt__table rpt__grid">
              <thead>
                <tr>
                  <th scope="col">Search</th>
                  {d.settings.locations.map((l) => (
                    <th key={l} scope="col">
                      {town(l)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.settings.keywords.map((k) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    {d.settings.locations.map((l) => {
                      const key = serpKey(k, l);
                      const s = d.serp?.[key];
                      if (!s) return <td key={l} className="rpt__meta">…</td>;
                      const band = s.error ? 'err' : s.ours == null ? 'none' : s.ours <= 3 ? 'top' : s.ours <= 10 ? 'page1' : 'page2';
                      return (
                        <td key={l}>
                          <button type="button" className={`rpt__rank rpt__rank--${band}`} aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                            {s.error ? '!' : s.ours == null ? '–' : `#${s.ours}`}
                            {s.oursLocal != null && ' 📍'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown && <SerpDetail s={shown} />}
        </section>
      )}
      {g && (
        <>
          <section className="rpt__section">
            <h2>Your searches in Google (Search Console)</h2>
            <p className="rpt__meta">What people actually typed when Heliaxis came up, last 28 days. Position change is against the 28 days before.</p>
            <div className="rpt__table-wrap">
              <table className="rpt__table">
                <thead>
                  <tr>
                    <th scope="col">Search</th>
                    <th scope="col">Clicks</th>
                    <th scope="col">Shown</th>
                    <th scope="col">Position</th>
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {g.queries.slice(0, 60).map((q) => (
                    <tr key={q.query}>
                      <th scope="row">{q.query}</th>
                      <td>{num(q.clicks)}</td>
                      <td>{num(q.impressions)}</td>
                      <td>{q.position}</td>
                      <td>{q.prevPosition == null ? <span className="rpt__meta">new</span> : <Delta now={q.position} was={q.prevPosition} lowerIsBetter suffix=" places" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {g.striking.length > 0 && (
            <section className="rpt__section">
              <h2>Nearly there</h2>
              <p className="rpt__meta">Searches where we’re just off the top of page one (positions 4–20) and already being shown: the quickest wins.</p>
              <ul className="rpt__list">
                {g.striking.map((q) => (
                  <li key={q.query}>
                    <b>{q.query}</b> <span className="rpt__meta">position {q.position} · shown {num(q.impressions)} times</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="rpt__split">
            <div className="rpt__section">
              <h2>Where searchers are</h2>
              <ul className="rpt__list">
                {g.countries.map((c) => (
                  <li key={c.country}>
                    {COUNTRY[c.country] ?? c.country.toUpperCase()} <span className="rpt__meta">· {num(c.clicks)} clicks · position {c.position}</span>
                  </li>
                ))}
              </ul>
              <ul className="rpt__list">
                {g.devices.map((c) => (
                  <li key={c.device}>
                    {c.device.charAt(0) + c.device.slice(1).toLowerCase()} <span className="rpt__meta">· {num(c.clicks)} clicks · position {c.position}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rpt__section">
              <h2>Pages that get the clicks</h2>
              <ul className="rpt__list">
                {g.pages.slice(0, 15).map((p) => (
                  <li key={p.page}>
                    <a className="rpt__link" href={p.page} target="_blank" rel="noopener noreferrer">
                      {p.page.replace(/^https?:\/\/(www\.)?heliaxis\.co\.uk/, '') || '/'}
                    </a>{' '}
                    <span className="rpt__meta">
                      · {num(p.clicks)} clicks · position {p.position}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
      {!serps.length && !g && <p className="rpt__meta">No ranking data in this report: connect Search Console or DataForSEO.</p>}
    </>
  );
}

function SerpDetail({ s }: { s: SerpResult }) {
  return (
    <div className="rpt__card rpt__serp">
      <p className="rpt__meta">
        “{s.keyword}” from {town(s.location)}
      </p>
      {s.error ? (
        <p className="rpt__error">{s.error}</p>
      ) : (
        <div className="rpt__split">
          <div>
            <h3>Results</h3>
            <ol className="rpt__serp-list">
              {s.organic.slice(0, 10).map((x) => (
                <li key={x.pos + x.url} value={x.pos} className={x.url === s.ourUrl ? 'is-ours' : ''}>
                  <a href={x.url} target="_blank" rel="noopener noreferrer">
                    {x.title || x.domain}
                  </a>
                  <span className="rpt__meta"> {x.domain}</span>
                </li>
              ))}
            </ol>
            {s.ours != null && s.ours > 10 && (
              <p className="rpt__meta">
                Us: #{s.ours} {s.ourUrl}
              </p>
            )}
          </div>
          <div>
            <h3>Map pack</h3>
            {s.local.length ? (
              <ol className="rpt__serp-list">
                {s.local.map((l) => (
                  <li key={l.pos + l.title} className={s.oursLocal === l.pos ? 'is-ours' : ''}>
                    {l.title}
                    <span className="rpt__meta">
                      {l.rating != null ? ` ${l.rating}★ (${num(l.reviews)} reviews)` : ''} {l.domain}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rpt__meta">No map pack for this search.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Competitors({ o, serps }: { o: ReportOverview; serps: SerpResult[] }) {
  const d = o.report!.data;
  const a = o.report!.analysis;
  const list = useMemo(() => rivals(serps), [serps]);
  const pack = useMemo(() => localLeaders(serps), [serps]);
  const market = d.market?.competitors ?? [];
  return (
    <>
      {a && a.beating_us.length > 0 && (
        <section className="rpt__section">
          <h2>Who is beating us, and why</h2>
          <div className="rpt__why">
            {a.beating_us.map((b, i) => (
              <article key={i} className="rpt__card">
                <div className="rpt__action-head">
                  <b>{b.name}</b>
                  <span className={`rpt__pill rpt__pill--${b.threat}`}>{b.threat} threat</span>
                  {b.domain && <span className="rpt__meta">{b.domain}</span>}
                </div>
                <ul>
                  {b.why.map((w, j) => (
                    <li key={j}>{w}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}
      {list.length > 0 && (
        <section className="rpt__section">
          <h2>Installers above us in Google</h2>
          <p className="rpt__meta">Across the tracked searches and towns. Directories like Checkatrade are left out.</p>
          <div className="rpt__table-wrap">
            <table className="rpt__table">
              <thead>
                <tr>
                  <th scope="col">Website</th>
                  <th scope="col">Above us</th>
                  <th scope="col">Shows in</th>
                  <th scope="col">Top 3</th>
                  <th scope="col">Avg position</th>
                  <th scope="col">Map pack</th>
                  <th scope="col">Their best page</th>
                </tr>
              </thead>
              <tbody>
                {list.map((v) => (
                  <tr key={v.domain}>
                    <th scope="row">{v.domain}</th>
                    <td>{v.beatsUs}</td>
                    <td>{v.appearances}</td>
                    <td>{v.top3}</td>
                    <td>{v.avgPos}</td>
                    <td>{v.localPack || '–'}</td>
                    <td>
                      <a className="rpt__link" href={v.bestUrl} target="_blank" rel="noopener noreferrer">
                        {v.bestTitle || v.bestUrl}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {pack.length > 0 && (
        <section className="rpt__section">
          <h2>Map pack regulars</h2>
          <p className="rpt__meta">The businesses in Google’s map, which sits above the website results for most local searches. Reviews count for a lot here.</p>
          <ul className="rpt__list">
            {pack.map((l) => (
              <li key={l.title}>
                <b>{l.title}</b>{' '}
                <span className="rpt__meta">
                  · in {l.count} map pack{l.count === 1 ? '' : 's'} · best #{l.best}
                  {l.rating != null ? ` · ${l.rating}★ from ${num(l.reviews)} reviews` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {market.length > 0 && (
        <section className="rpt__section">
          <h2>Competing websites across the UK</h2>
          <p className="rpt__meta">
            Domains ranking for the same keywords as heliaxis.co.uk anywhere in the UK (DataForSEO estimates).
            {d.market?.ours ? ` For comparison, we rank for ${num(d.market.ours.keywords)} keywords, about ${num(d.market.ours.etv)} visits a month.` : ''}
          </p>
          <div className="rpt__table-wrap">
            <table className="rpt__table">
              <thead>
                <tr>
                  <th scope="col">Website</th>
                  <th scope="col">Keywords shared with us</th>
                  <th scope="col">Their avg position</th>
                  <th scope="col">Keywords they rank for</th>
                  <th scope="col">Est. visits / month</th>
                </tr>
              </thead>
              <tbody>
                {market.map((c) => (
                  <tr key={c.domain}>
                    <th scope="row">{c.domain}</th>
                    <td>{num(c.shared)}</td>
                    <td>{c.avgPos}</td>
                    <td>{num(c.metrics.keywords)}</td>
                    <td>{num(c.metrics.etv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {!list.length && !market.length && <p className="rpt__meta">Competitor data needs DataForSEO.</p>}
    </>
  );
}

function Pages({ o }: { o: ReportOverview }) {
  const d = o.report!.data;
  const audits = d.audits ?? [];
  if (!audits.length) return <p className="rpt__meta">No pages compared in this report.</p>;
  const keywords = [...new Set(audits.map((x) => x.keyword))];
  return (
    <section className="rpt__section">
      <h2>Our pages against the ones above them</h2>
      <p className="rpt__meta">For the searches where we’re furthest from the top in {town(d.settings.locations[0] ?? 'Newport')}: what each page puts in front of Google.</p>
      {keywords.map((k) => (
        <div key={k} className="rpt__table-wrap">
          <table className="rpt__table rpt__compare">
            <caption>“{k}”</caption>
            <thead>
              <tr>
                <th scope="col">Page</th>
                <th scope="col">Position</th>
                <th scope="col">Title</th>
                <th scope="col">Words</th>
                <th scope="col">Towns named</th>
                <th scope="col">Structured data</th>
                <th scope="col">FAQ</th>
                <th scope="col">Accreditations</th>
                <th scope="col">Speed</th>
              </tr>
            </thead>
            <tbody>
              {audits
                .filter((x) => x.keyword === k)
                .sort((x, y) => (x.pos ?? 99) - (y.pos ?? 99))
                .map((x) => (
                  <tr key={x.url} className={x.ours ? 'is-ours' : ''}>
                    <th scope="row">
                      <a className="rpt__link" href={x.url} target="_blank" rel="noopener noreferrer">
                        {x.ours ? 'Us: ' : ''}
                        {x.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}
                      </a>
                    </th>
                    <td>{x.pos ?? '–'}</td>
                    {x.ok ? (
                      <>
                        <td>{x.title || <span className="rpt__meta">none</span>}</td>
                        <td>{num(x.words)}</td>
                        <td>{Object.entries(x.towns ?? {}).map(([t, n]) => `${t} ${n}`).join(', ') || '–'}</td>
                        <td>{x.schema?.join(', ') || '–'}</td>
                        <td>{x.faq ? 'Yes' : 'No'}</td>
                        <td>{x.accreditations?.join(', ') || '–'}</td>
                        <td>{x.ms != null ? `${(x.ms / 1000).toFixed(1)} s` : '–'}</td>
                      </>
                    ) : (
                      <td colSpan={7} className="rpt__meta">
                        Couldn’t read it: {x.error}
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
      {o.report!.analysis && o.report!.analysis.keyword_notes.length > 0 && (
        <div className="rpt__card">
          <h3>Notes by search</h3>
          <dl className="rpt__notes-list">
            {o.report!.analysis.keyword_notes.map((n, i) => (
              <div key={i}>
                <dt>{n.keyword}</dt>
                <dd>{n.note}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

function Keywords({ o }: { o: ReportOverview }) {
  const m = o.report!.data.market;
  const [q, setQ] = useState('');
  if (!m?.ranked.items.length) return <p className="rpt__meta">The full keyword list needs DataForSEO. Search Console’s searches are under Where we rank.</p>;
  const items = m.ranked.items.filter((k) => !q || k.keyword.includes(q.toLowerCase()));
  return (
    <section className="rpt__section">
      <h2>Everything we rank for in Google UK</h2>
      <p className="rpt__meta">
        {num(m.ranked.total)} keywords in all (DataForSEO’s index, refreshed weekly), the {m.ranked.items.length} bringing the most visits shown.
      </p>
      <input className="rpt__filter" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter keywords" aria-label="Filter keywords" />
      <div className="rpt__table-wrap">
        <table className="rpt__table">
          <thead>
            <tr>
              <th scope="col">Keyword</th>
              <th scope="col">Position</th>
              <th scope="col">Searches / month</th>
              <th scope="col">Est. visits</th>
              <th scope="col">Difficulty</th>
              <th scope="col">Page</th>
            </tr>
          </thead>
          <tbody>
            {items.map((k) => (
              <tr key={k.keyword + k.url}>
                <th scope="row">{k.keyword}</th>
                <td>{k.pos}</td>
                <td>{num(k.volume)}</td>
                <td>{k.etv != null ? num(Math.round(k.etv)) : '–'}</td>
                <td>{k.difficulty ?? '–'}</td>
                <td>
                  <a className="rpt__link" href={k.url} target="_blank" rel="noopener noreferrer">
                    {k.url.replace(/^https?:\/\/(www\.)?heliaxis\.co\.uk/, '') || '/'}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AiSearch({ o }: { o: ReportOverview }) {
  const d = o.report!.data;
  const a = o.report!.analysis;
  const g = d.geo;
  return (
    <section className="rpt__section">
      <h2>AI search (ChatGPT, Perplexity, Claude)</h2>
      {a && <p className="rpt__card rpt__pre">{a.ai_search}</p>}
      {g ? (
        <>
          <section className="rpt__tiles">
            <Tile label="Named in" value={`${pct(g.mentioned, g.total)}%`} sub={<span className="rpt__meta">of {g.total} answers</span>} />
            <Tile label="Linked to heliaxis.co.uk in" value={`${pct(g.cited, g.total)}%`} sub={<span className="rpt__meta">of {g.total} answers</span>} />
          </section>
          <ul className="rpt__list">
            {g.byEngine.map((e) => (
              <li key={e.engine}>
                {engineLabel(e.engine)} <span className="rpt__meta">· named {e.mentioned}/{e.total} · linked {e.cited}/{e.total}</span>
              </li>
            ))}
          </ul>
          {g.businesses.length > 0 && (
            <>
              <h3>Who the assistants name</h3>
              <ul className="rpt__list">
                {g.businesses.map((b) => (
                  <li key={b.name}>
                    {b.name} <span className="rpt__meta">· {b.count} answers</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="rpt__meta">From the GEO bot’s check on {day(g.at)}.</p>
        </>
      ) : (
        <p className="rpt__meta">No AI search check yet.</p>
      )}
      <p>
        <Link className="rpt__link" href="/admin/geo">
          Open AI search visibility
        </Link>{' '}
        <span className="rpt__meta">for the answers themselves and the website changes the GEO bot suggests.</span>
      </p>
    </section>
  );
}

function Settings({
  o,
  admin,
  busy,
  act,
}: {
  o: ReportOverview;
  admin: boolean;
  busy: string;
  act: (key: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [keywords, setKeywords] = useState(o.settings.keywords.join('\n'));
  const [locations, setLocations] = useState(o.settings.locations.join('\n'));
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  return (
    <>
      <section className="rpt__section">
        <h2>What the report checks</h2>
        <div className="rpt__card rpt__settings">
          <label>
            Searches to check in Google, one per line, without a town (the report adds the towns)
            <textarea rows={8} value={keywords} disabled={!admin} onChange={(e) => setKeywords(e.target.value)} />
          </label>
          <label>
            Towns, one per line, as <code>Town,Region,United Kingdom</code>
            <textarea rows={5} value={locations} disabled={!admin} onChange={(e) => setLocations(e.target.value)} />
          </label>
          <label>
            Build a report automatically{' '}
            <select
              value={o.settings.everyDays}
              disabled={!admin || !!busy}
              onChange={(e) => act('settings', { action: 'settings', settings: { everyDays: Number(e.target.value) } })}
            >
              <option value={0}>Never (only when built by hand)</option>
              <option value={7}>Every week</option>
              <option value={14}>Every two weeks</option>
              <option value={30}>Every month</option>
            </select>
          </label>
          {admin && (
            <div>
              <button
                type="button"
                className="rpt__btn rpt__btn--primary"
                disabled={!!busy}
                onClick={() => act('settings', { action: 'settings', settings: { keywords: lines(keywords), locations: lines(locations) } })}
              >
                {busy === 'settings' ? 'Saving…' : 'Save'}
              </button>
              <span className="rpt__meta"> Changes apply from the next report. Each search × town is one Google check, a fraction of a penny each.</span>
            </div>
          )}
        </div>
      </section>
      <Sources o={o} />
    </>
  );
}
