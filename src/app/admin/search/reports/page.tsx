import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { searchSession } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { channelName, reportWeekLabel, type ReportNumbers, type ReportText } from '@/lib/search/reports';
import { dateLabel, DeltaLine, n, one, PageHead, Pos, type SP } from '../common';
import { RebuildReport } from './RebuildReport';

export const dynamic = 'force-dynamic';

type Row = { id: number; kind: string; name: string | null; period_start: string; period_end: string; compare_start: string | null; compare_end: string | null; status: string; numbers: ReportNumbers; text: ReportText; created_at: string };

export default async function Reports({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const db = createAdminClient();
  const s = await searchSession();
  const { data } = await db.from('seo_report').select('*').order('period_start', { ascending: false }).limit(60);
  const list = (data ?? []) as Row[];
  const open = list.find((r) => String(r.id) === one(q.id)) ?? list[0];
  return (
    <>
      <PageHead title="Reports" sub="Every week a report is built provisional on Monday at 07:00 and final on Wednesday at 07:00, once Search Console has Sunday’s data. A final report is frozen: last week’s numbers never shift." />
      {!open ? (
        <section className="sx-card">
          <h2>No reports yet</h2>
          <p>The first weekly report is built next Monday at 07:00.</p>
          {s && can.spend(s.role) && <RebuildReport />}
        </section>
      ) : (
        <div className="sx-grid2" style={{ gridTemplateColumns: 'minmax(0, 2.2fr) minmax(220px, 1fr)' }}>
          <Report r={open} />
          <section className="sx-card">
            <h2>Archive</h2>
            <ul className="sx-list">
              {list.map((r) => (
                <li key={r.id}>
                  <Link href={`?id=${r.id}`} style={r.id === open.id ? { fontWeight: 800 } : undefined}>
                    {r.kind === 'weekly' ? reportWeekLabel(r.period_start) : (r.name ?? `${r.period_start} to ${r.period_end}`)}
                  </Link>
                  <small>{r.status}</small>
                </li>
              ))}
            </ul>
            {s && can.spend(s.role) && <RebuildReport />}
            <p>The monthly Growth Report, custom reports, PDF and email arrive with phase 4.</p>
          </section>
        </div>
      )}
    </>
  );
}

function Report({ r }: { r: Row }) {
  const nums = r.numbers;
  return (
    <section className="sx-card">
      <div className="sx-row" style={{ justifyContent: 'space-between' }}>
        <h2>Week of {reportWeekLabel(r.period_start)}</h2>
        <span className={`sx-chip${r.status === 'final' ? ' gold' : ''}`}>{r.status === 'final' ? 'Final' : 'Provisional'}</span>
      </div>
      {(r.text.headline ?? []).map((t) => (
        <p key={t} style={{ color: 'var(--text)', fontSize: '0.95rem' }}>
          {t}
        </p>
      ))}
      <table className="sx-table">
        <thead>
          <tr>
            <th>Measure</th>
            <th className="num">This week</th>
            <th className="num">Last week</th>
            <th>Change</th>
            <th className="num">4-week average</th>
          </tr>
        </thead>
        <tbody>
          {nums.tiles.map((t) => (
            <tr key={t.key}>
              <td title={t.source}>{t.label}</td>
              <td className="num">{n(t.delta.now, 1)}</td>
              <td className="num">{n(t.delta.before, 1)}</td>
              <td>
                <DeltaLine d={t.delta} />
              </td>
              <td className="num">{n(nums.fourWeek?.[t.key], 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sx-grid2">
        <div>
          <h2>Winners and losers</h2>
          <ul className="sx-list">
            {[...nums.winners, ...nums.losers].map((w) => (
              <li key={`${w.keywordId}-${w.moved}`}>
                <span>{w.label}</span>
                <span>
                  <Pos p={w.before} /> → <Pos p={w.now} />
                </span>
              </li>
            ))}
            {!nums.winners.length && !nums.losers.length && <li className="sx-note">No movement.</li>}
          </ul>
        </div>
        <div>
          <h2>Leads by channel</h2>
          <ul className="sx-list">
            {nums.leads.map((l) => (
              <li key={l.channel}>
                <span>{channelName(l.channel)}</span>
                <span>
                  {l.now} <small>(was {l.before})</small>
                </span>
              </li>
            ))}
            {!nums.leads.length && <li className="sx-note">No enquiries.</li>}
          </ul>
        </div>
      </div>
      <p>
        Sources: Search Console to {dateLabel(nums.freshness?.gscTo) || 'not connected'}; rankings run {dateLabel(nums.rankRunDates?.now) || 'none'} against {dateLabel(nums.rankRunDates?.before) || 'none'}; enquiries by date received. Built {dateLabel(r.created_at)}. Compared with {dateLabel(r.compare_start)} to {dateLabel(r.compare_end)}.
      </p>
    </section>
  );
}
