import { createAdminClient } from '@/lib/supabase/admin';
import { CHANNEL_LABEL } from '@/lib/search/channel';
import { channelOf, periodFor } from '@/lib/search/metrics';
import { channelName } from '@/lib/search/reports';
import { dateLabel, filtersFrom, PageHead, type SP } from '../common';

export const dynamic = 'force-dynamic';

export default async function Leads({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const { period: pk, compare } = filtersFrom(q);
  const period = periodFor(pk === 'this_week' ? 'last_4_weeks' : pk, undefined, compare);
  const db = createAdminClient();
  const { data } = await db
    .from('enquiries')
    .select('id, name, created_at, source, channel, landing_path, referrer_host, postcode')
    .gte('created_at', `${period.start}T00:00:00Z`)
    .lte('created_at', `${period.end}T23:59:59Z`)
    .order('created_at', { ascending: false })
    .limit(500);
  const rows = data ?? [];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(channelOf(r), (counts.get(channelOf(r)) ?? 0) + 1);
  const tracked = rows.filter((r) => r.channel).length;
  return (
    <>
      <PageHead
        title="Leads"
        sub="Every enquiry labelled with the channel it came from, so organic search, the Business Profile and AI assistants show up next to Meta. Surveys, quotes, won jobs and cost per enquiry arrive with phase 4."
        fresh={`${period.label}: ${dateLabel(period.start)} to ${dateLabel(period.end)}`}
      />
      <div className="sx-grid2" style={{ gridTemplateColumns: 'minmax(220px, 1fr) minmax(0, 2.4fr)' }}>
        <section className="sx-card">
          <h2>By channel</h2>
          <ul className="sx-list">
            {[...counts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([c, k]) => (
                <li key={c}>
                  <span>{channelName(c)}</span>
                  <b>{k}</b>
                </li>
              ))}
            {!rows.length && <li className="sx-note">No enquiries in this period.</li>}
          </ul>
          <p>
            {tracked} of {rows.length} carry a channel. Channel capture started with this release: older website enquiries show as “Before tracking began”, and Meta lead-form enquiries count as Meta by their source.
          </p>
        </section>
        <section className="sx-card">
          <h2>Enquiries</h2>
          <div className="sx-tablewrap">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Channel</th>
                  <th>Came from</th>
                  <th>Landed on</th>
                  <th>Source label</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{dateLabel(r.created_at)}</td>
                    <td>
                      {r.name}
                      {r.postcode ? <small className="sx-note"> {String(r.postcode).split(' ')[0]}</small> : null}
                    </td>
                    <td>{r.channel ? (CHANNEL_LABEL as Record<string, string>)[r.channel] ?? r.channel : <span className="sx-note">{channelName(channelOf(r))}</span>}</td>
                    <td>{r.referrer_host ?? ''}</td>
                    <td>{r.landing_path ?? ''}</td>
                    <td className="sx-note">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
