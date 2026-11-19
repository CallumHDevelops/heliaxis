import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { periodFor } from '@/lib/search/metrics';
import { delta } from '@/lib/search/maths';
import { getSetting, searchSession } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { ukClock } from '@/lib/search/schedule';
import { isProjectStage } from '@/lib/crm/stages';
import { leadsByChannel, loadLeads, LEADS_BASIS } from '@/lib/search/leads/funnel';
import { landingSessions } from '@/lib/search/leads/umami-pages';
import { costCompare, type CostSide } from '@/lib/search/leads/cost';
import {
  addDays,
  channelLabel,
  FUNNEL_CHANNELS,
  groupFunnel,
  PAGE_GROUP_LABEL,
  PAGE_GROUPS,
  pageFunnel,
  pageGroup,
  ukStart,
  type Funnel,
  type PageGroup,
} from '@/lib/search/leads/aggregate';
import { dateLabel, DeltaLine, filtersFrom, n, one, PageHead, type SP } from '../common';
import { BackfillPanel } from './LeadsClient';

export const dynamic = 'force-dynamic';

const money = (v: number) => (v ? `£${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '–');
const pence = (p: number | null, currency = 'GBP') =>
  p === null ? '–' : (p / 100).toLocaleString('en-GB', { style: 'currency', currency, maximumFractionDigits: p >= 10000 ? 0 : 2 });
const pct = (v: number | null) => (v === null ? '–' : `${n(v, 1)}%`);

function FunnelCells({ f, before }: { f: Funnel; before?: Funnel }) {
  return (
    <>
      <td>
        <b>{f.enquiries}</b>
        {before && <small className="sx-note"> was {before.enquiries}</small>}
      </td>
      <td>
        {f.surveys}
        {before && <small className="sx-note"> was {before.surveys}</small>}
      </td>
      <td>
        {f.quotes}
        {before && <small className="sx-note"> was {before.quotes}</small>}
      </td>
      <td>
        {f.won}
        {before && <small className="sx-note"> was {before.won}</small>}
      </td>
      <td>
        {money(f.value)}
        {before && before.value ? <small className="sx-note"> was {money(before.value)}</small> : null}
      </td>
    </>
  );
}

function CostCard({ side }: { side: CostSide }) {
  return (
    <section className="sx-card">
      <h3 style={{ margin: 0 }}>{side.label}</h3>
      <p style={{ fontSize: '1.6rem', fontWeight: 800, margin: '4px 0', color: 'inherit' }}>{pence(side.perEnquiry, side.currency)}</p>
      <p>
        per enquiry: {pence(side.spend, side.currency)} over {side.enquiries} {side.enquiries === 1 ? 'enquiry' : 'enquiries'}
      </p>
      {side.note && <p style={{ color: '#b3261e' }}>{side.note}</p>}
      <ul className="sx-note" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {side.includes.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </section>
  );
}

export default async function Leads({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const { period: pk, compare } = filtersFrom(q);
  const period = periodFor(pk, undefined, compare);
  const today = ukClock().date;
  const db = createAdminClient();
  const costStart = addDays(today, -29);

  const [session, areas, now, before, last30] = await Promise.all([
    searchSession(),
    getSetting('areas', db),
    loadLeads(period.start, period.end, db),
    loadLeads(period.compareStart, period.compareEnd, db),
    loadLeads(costStart, today, db),
  ]);
  const towns = [...new Set(areas.list.flatMap((a) => a.towns))];
  const sessionsEnd = period.end > today ? addDays(today, 1) : addDays(period.end, 1);
  const [byChannel, sessions, cost] = await Promise.all([
    leadsByChannel(period, db, { now, before }),
    landingSessions(Date.parse(ukStart(period.start)), Date.parse(ukStart(sessionsEnd))),
    costCompare(today, last30, db),
  ]);
  const pageSessions = sessions.state === 'ok' && sessions.pages.byPath.size ? sessions.pages : null;
  const pages = pageFunnel(now, pageSessions, towns);
  const groups = groupFunnel(pages, !!pageSessions);
  const organicD = delta(byChannel.organic.now.enquiries, byChannel.organic.before.enquiries);
  const allD = delta(byChannel.total.now.enquiries, byChannel.total.before.enquiries);
  const organicWonD = delta(byChannel.organic.now.value, byChannel.organic.before.value);

  // The enquiry list, filtered by channel and landing-page group.
  const ch = one(q.ch);
  const grp = one(q.grp) as PageGroup | '';
  const list = now.filter((l) => (!ch || l.channel === ch) && (!grp || pageGroup(l.landingPath, towns) === grp));
  const href = (set: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (typeof v === 'string' && v && k !== 'ch' && k !== 'grp') p.set(k, v);
    const next = { ch, grp, ...set };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/search/leads${s ? `?${s}` : ''}#enquiries`;
  };
  const sessionsNote =
    sessions.state === 'ok'
      ? pageSessions
        ? pageSessions.kind === 'visits'
          ? `Sessions: Umami visits that started on each page (${sessions.endpoint}).`
          : `Umami's share link gave page views per page, not sessions, so the "Sessions" column is page views (${sessions.endpoint}).`
        : 'Umami answered but gave no per-page rows for this period, so sessions per page are not shown.'
      : `Sessions not shown: ${sessions.error}`;

  return (
    <>
      <PageHead
        title="Leads"
        sub="From a visit to a won job: every enquiry by the channel and landing page it came from, then how far it got in the CRM."
        fresh={`${period.label}: ${dateLabel(period.start)} to ${dateLabel(period.end)}, against ${dateLabel(period.compareStart)} to ${dateLabel(period.compareEnd)}`}
      />

      <section className="sx-tiles" aria-label="This period against the last">
        <article className="sx-tile" title="Channel Google search, Bing search, Business Profile or AI assistants">
          <span className="sx-tile__label">Organic enquiries</span>
          <span className="sx-tile__value">{byChannel.organic.now.enquiries}</span>
          <DeltaLine d={organicD} />
          <span className="sx-tile__note">Google, Bing, Business Profile, AI assistants</span>
        </article>
        <article className="sx-tile" title="Every enquiry in the CRM that came in during the period">
          <span className="sx-tile__label">All enquiries</span>
          <span className="sx-tile__value">{byChannel.total.now.enquiries}</span>
          <DeltaLine d={allD} />
          <span className="sx-tile__note">CRM enquiries, plus leads kept by merges</span>
        </article>
        <article className="sx-tile" title="Won jobs from organic enquiries in the period, price inc. VAT">
          <span className="sx-tile__label">Won from organic</span>
          <span className="sx-tile__value">{money(byChannel.organic.now.value)}</span>
          <DeltaLine d={organicWonD} unit="" />
          <span className="sx-tile__note">
            {byChannel.organic.now.won} won so far, from {byChannel.organic.now.enquiries}
          </span>
        </article>
        <article className="sx-tile" title={sessionsNote}>
          <span className="sx-tile__label">Website sessions</span>
          <span className="sx-tile__value">{sessions.state === 'ok' ? n(sessions.totalVisits) : '–'}</span>
          <span className="sx-tile__note">{sessions.state === 'ok' ? 'Umami visits in the period' : 'Umami not connected'}</span>
        </article>
      </section>

      <section className="sx-card">
        <h2>By channel</h2>
        <p>{LEADS_BASIS}</p>
        <div className="sx-tablewrap">
          <table className="sx-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Enquiries</th>
                <th>Surveyed</th>
                <th>Quoted</th>
                <th>Won</th>
                <th>Won value</th>
              </tr>
            </thead>
            <tbody>
              {byChannel.rows.map((r) => (
                <tr key={r.channel}>
                  <td>
                    <Link className="crm-link" href={href({ ch: r.channel })}>
                      {r.label}
                    </Link>
                  </td>
                  <FunnelCells f={r.now} before={r.before} />
                </tr>
              ))}
              <tr>
                <td>
                  <b>All channels</b>
                </td>
                <FunnelCells f={byChannel.total.now} before={byChannel.total.before} />
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          “was” is {dateLabel(period.compareStart)} to {dateLabel(period.compareEnd)}. Umami sessions are not split by channel here: its own channel grouping does not match these channels (it cannot tell AI assistants or the Business Profile apart).
        </p>
      </section>

      <section className="sx-card">
        <h2>By page group</h2>
        <p>Grouped from the landing path: the blog (/blog…), town pages (the path names a target town), service pages (a service page’s address or a service word), and everything else. {sessionsNote}</p>
        <div className="sx-tablewrap">
          <table className="sx-table">
            <thead>
              <tr>
                <th>Group</th>
                <th>Pages</th>
                <th>Sessions</th>
                <th>Enquiries</th>
                <th>Surveyed</th>
                <th>Quoted</th>
                <th>Won</th>
                <th>Won value</th>
                <th>Enquiries per 100 sessions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.group}>
                  <td>
                    <Link className="crm-link" href={href({ grp: g.group })}>
                      {g.label}
                    </Link>
                  </td>
                  <td>{g.group === 'none' ? '' : g.pages}</td>
                  <td>{n(g.sessions)}</td>
                  <FunnelCells f={g} />
                  <td>{pct(g.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Landing pages are recorded on enquiries since channel capture began; older enquiries sit under “{PAGE_GROUP_LABEL.none}”.</p>
      </section>

      <section className="sx-card">
        <h2>By landing page</h2>
        <div className="sx-tablewrap">
          <table className="sx-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Group</th>
                <th>Sessions</th>
                <th>Enquiries</th>
                <th>Surveyed</th>
                <th>Quoted</th>
                <th>Won</th>
                <th>Won value</th>
                <th>Per 100 sessions</th>
              </tr>
            </thead>
            <tbody>
              {pages
                .filter((p) => p.path !== null)
                .slice(0, 40)
                .map((p) => (
                  <tr key={p.path}>
                    <td>{p.path}</td>
                    <td className="sx-note">{PAGE_GROUP_LABEL[p.group]}</td>
                    <td>{n(p.sessions)}</td>
                    <FunnelCells f={p} />
                    <td>{pct(p.rate)}</td>
                  </tr>
                ))}
              {!pages.some((p) => p.path !== null) && (
                <tr>
                  <td colSpan={9} className="sx-note">
                    No landing pages yet for this period: they fill as website enquiries come in, and Umami adds sessions once it is connected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p>Top 40 pages by enquiries, then sessions.</p>
      </section>

      <section className="sx-card">
        <h2>Cost per enquiry, last 30 days</h2>
        <p>
          {dateLabel(cost.start)} to {dateLabel(cost.end)}, whatever period is picked: Meta gives its spend for 30 days, 90 days or a year, so both sides use the same 30 days. Organic’s figure is what Search costs to run, not the full cost of organic work.
        </p>
        <div className="sx-grid2">
          <CostCard side={cost.organic} />
          <CostCard side={cost.meta} />
        </div>
      </section>

      <section className="sx-card" id="enquiries">
        <h2>Enquiries</h2>
        <div className="sx-row">
          <span className="sx-note">Channel:</span>
          <Link className={`sx-chip${!ch ? ' gold' : ''}`} href={href({ ch: '' })}>
            All
          </Link>
          {FUNNEL_CHANNELS.map((c) => (
            <Link key={c} className={`sx-chip${ch === c ? ' gold' : ''}`} href={href({ ch: c })}>
              {channelLabel(c)}
            </Link>
          ))}
        </div>
        <div className="sx-row">
          <span className="sx-note">Landing page:</span>
          <Link className={`sx-chip${!grp ? ' gold' : ''}`} href={href({ grp: '' })}>
            All
          </Link>
          {PAGE_GROUPS.map((g) => (
            <Link key={g} className={`sx-chip${grp === g ? ' gold' : ''}`} href={href({ grp: g })}>
              {PAGE_GROUP_LABEL[g]}
            </Link>
          ))}
        </div>
        <div className="sx-tablewrap">
          <table className="sx-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Channel</th>
                <th>Came from</th>
                <th>Landed on</th>
                <th>Got to</th>
                <th>Source label</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 500).map((l) => {
                const job = l.jobs.find((j) => j.won) ?? l.jobs.find((j) => j.quoted) ?? l.jobs.find((j) => j.surveyed) ?? l.jobs[0];
                const jobHref = job ? (isProjectStage(job.stage) ? `/admin/projects/${job.id}` : `/admin/crm/${job.id}`) : null;
                const got = l.jobs.some((j) => j.won) ? `Won ${money(l.jobs.reduce((s, j) => s + j.value, 0))}` : l.jobs.some((j) => j.quoted) ? 'Quoted' : l.jobs.some((j) => j.surveyed) ? 'Surveyed' : l.jobs.length ? 'Job open' : 'Enquiry';
                return (
                  <tr key={l.id}>
                    <td>{dateLabel(l.at)}</td>
                    <td>
                      {l.kind === 'enquiry' ? (
                        <Link className="crm-link" href={`/admin/enquiries?open=${l.enquiryId}`}>
                          {l.name || 'Unnamed'}
                        </Link>
                      ) : jobHref ? (
                        <Link className="crm-link" href={jobHref}>
                          Lead kept by a merge
                        </Link>
                      ) : (
                        <span className="sx-note">Lead kept by a merge</span>
                      )}
                      {l.postcode ? <small className="sx-note"> {String(l.postcode).split(' ')[0]}</small> : null}
                    </td>
                    <td>{l.captured ? channelLabel(l.channel) : <span className="sx-note" title="Worked out from the source label, not captured">{channelLabel(l.channel)}</span>}</td>
                    <td>{l.referrerHost ?? ''}</td>
                    <td>{l.landingPath ?? ''}</td>
                    <td>{jobHref ? <Link className="crm-link" href={jobHref}>{got}</Link> : got}</td>
                    <td className="sx-note">{l.source}</td>
                  </tr>
                );
              })}
              {!list.length && (
                <tr>
                  <td colSpan={7} className="sx-note">
                    No enquiries {ch || grp ? 'match these filters ' : ''}in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p>
          {list.length > 500 ? `Showing the newest 500 of ${list.length}. ` : ''}Grey channel names were worked out from the source label (older Meta lead forms); the rest were captured on the website form.
        </p>
      </section>

      {session && can.spend(session.role) && (
        <section className="sx-card">
          <h2>Label older enquiries</h2>
          <p>
            Enquiries from before channel capture have no channel. Where the source label names one without doubt (Meta lead forms and ad links, Google Ads links, utm_source=chatgpt.com, a Business Profile link) they can be labelled in one go. The preview lists every row that would change; nothing is guessed from a missing referrer, and rows that already have a channel are never touched.
          </p>
          <BackfillPanel />
        </section>
      )}
    </>
  );
}
