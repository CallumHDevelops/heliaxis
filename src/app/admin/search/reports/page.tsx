import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { searchSession } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { rangeLabel, reportTables, reportTitle, periodWords, type ReportRow } from '@/lib/search/reporting/shape';
import { dateLabel, DeltaLine, n, one, PageHead, type SP } from '../common';
import { CustomReportForm } from './CustomReportForm';
import { RebuildReport, ReportActions } from './RebuildReport';

export const dynamic = 'force-dynamic';

const KINDS = [
  ['', 'All'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['custom', 'Custom'],
] as const;

export default async function Reports({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const db = createAdminClient();
  const s = await searchSession();
  const kind = one(q.kind);
  let query = db.from('seo_report').select('*').order('period_start', { ascending: false }).order('created_at', { ascending: false }).limit(120);
  if (kind === 'weekly' || kind === 'monthly' || kind === 'custom') query = query.eq('kind', kind);
  const [{ data }, kwRes] = await Promise.all([query, db.from('seo_keyword').select('service').eq('active', true).not('service', 'is', null).limit(5000)]);
  const list = (data ?? []) as ReportRow[];
  const services = [...new Set(((kwRes.data ?? []) as { service: string | null }[]).map((r) => r.service).filter((x): x is string => !!x))].sort();
  let open: ReportRow | undefined = list.find((r) => String(r.id) === one(q.id)) ?? list[0];
  if (!open && one(q.id)) {
    const { data: one_ } = await db.from('seo_report').select('*').eq('id', Number(one(q.id))).maybeSingle();
    open = (one_ as ReportRow | null) ?? undefined;
  }
  const canSpend = !!s && can.spend(s.role);
  const canDraft = !!s && can.draft(s.role);

  return (
    <>
      <PageHead
        title="Reports"
        sub="Weekly reports are built provisional on Monday at 07:00 and final on Wednesday at 07:00. The monthly Growth Report is built on the first Tuesday of the month at 08:00. A final report is frozen: its numbers never shift."
      />
      <div className="sx-grid2" style={{ gridTemplateColumns: 'minmax(0, 2.2fr) minmax(240px, 1fr)' }}>
        {open ? (
          <Report r={open} canSpend={canSpend} canDraft={canDraft} />
        ) : (
          <section className="sx-card">
            <h2>No reports yet</h2>
            <p>The first weekly report is built next Monday at 07:00, and the first Growth Report on the first Tuesday of next month.</p>
          </section>
        )}
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          {canDraft && (
            <section className="sx-card">
              <h2>Custom report</h2>
              <p className="sx-note">Pick the period, comparison, sections, area tier and service, and save it as a named view.</p>
              <CustomReportForm services={services} />
            </section>
          )}
          <section className="sx-card">
            <h2>Archive</h2>
            <div className="sx-row" style={{ flexWrap: 'wrap' }}>
              {KINDS.map(([k, l]) => (
                <Link key={k} href={k ? `?kind=${k}` : '?'} className={`sx-chip${kind === k ? ' gold' : ''}`}>
                  {l}
                </Link>
              ))}
            </div>
            <ul className="sx-list">
              {list.map((r) => (
                <li key={r.id}>
                  <Link href={`?${kind ? `kind=${kind}&` : ''}id=${r.id}`} style={r.id === open?.id ? { fontWeight: 800 } : undefined}>
                    {reportTitle(r)}
                  </Link>
                  <small>
                    {r.kind}, {r.status}
                    {r.sent_at ? ', emailed' : ''}
                  </small>
                </li>
              ))}
              {!list.length && <li className="sx-note">No {kind || ''} reports yet.</li>}
            </ul>
            {canSpend && <RebuildReport />}
          </section>
        </div>
      </div>
    </>
  );
}

function Report({ r, canSpend, canDraft }: { r: ReportRow; canSpend: boolean; canDraft: boolean }) {
  const nums = r.numbers;
  const w = periodWords(r.kind, nums.view?.compare);
  const tables = reportTables(r);
  const third = tables.find((t) => t.key === 'measures')?.columns[6] ?? null;
  const filters = [nums.view?.tier ? `Tier ${nums.view.tier} areas` : null, nums.view?.service ?? null].filter(Boolean).join(', ');
  return (
    <section className="sx-card">
      <div className="sx-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>{reportTitle(r)}</h2>
          <small className="sx-note">
            {rangeLabel(r.period_start, r.period_end)} against {rangeLabel(r.compare_start, r.compare_end)}
            {filters ? `; ${filters}` : ''}
          </small>
        </div>
        <span className={`sx-chip${r.status === 'final' ? ' gold' : ''}`}>{r.status === 'final' ? 'Final' : 'Provisional'}</span>
      </div>
      <ReportActions id={r.id} kind={r.kind} status={r.status} canSpend={canSpend} canDraft={canDraft} sentAt={r.sent_at ?? null} />
      {(r.text.headline ?? []).map((t) => (
        <p key={t} style={{ color: 'var(--text)', fontSize: '0.95rem' }}>
          {t}
        </p>
      ))}

      {tables.map((t) =>
        t.key === 'measures' ? (
          <div key={t.key}>
            <h2>Measures</h2>
            <div className="sx-tablewrap">
              <table className="sx-table">
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th className="num">{w.nowCol}</th>
                    <th className="num">{w.beforeCol}</th>
                    <th>Change</th>
                    {third && <th className="num">{third}</th>}
                  </tr>
                </thead>
                <tbody>
                  {nums.tiles.map((tile) => (
                    <tr key={tile.key}>
                      <td>
                        {tile.label}
                        <br />
                        <small className="sx-note">
                          {tile.source}
                          {tile.note ? `. ${tile.note}` : ''}
                        </small>
                      </td>
                      <td className="num">{n(tile.delta.now, 1)}</td>
                      <td className="num">{n(tile.delta.before, 1)}</td>
                      <td>
                        <DeltaLine d={tile.delta} unit={tile.unit} />
                      </td>
                      {third && <td className="num">{third === '4-week average' ? n(nums.fourWeek?.[tile.key], 1) : n(nums.yearAgo?.[tile.key]?.before, 1)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div key={t.key}>
            <h2>{t.title}</h2>
            <p className="sx-note">Source: {t.source}</p>
            {t.rows.length ? (
              <div className="sx-tablewrap">
                <table className="sx-table">
                  <thead>
                    <tr>
                      {t.columns.map((c, i) => (
                        <th key={c} className={i ? 'num' : undefined}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((row, i) => (
                      <tr key={`${row[0]}-${i}`}>
                        {row.map((c, j) => (
                          <td key={j} className={j ? 'num' : undefined}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="sx-note">{t.key === 'movers' ? 'No movement between the two rankings runs.' : t.key === 'leads' ? 'No enquiries in either period.' : 'Nothing in this period.'}</p>
            )}
          </div>
        ),
      )}

      <p className="sx-note">
        Sources: Search Console to {dateLabel(nums.freshness?.gscTo) || 'not connected'}; rankings run {dateLabel(nums.rankRunDates?.now) || 'none'} against {dateLabel(nums.rankRunDates?.before) || 'none'}; enquiries by date received
        {nums.yearAgoPeriod ? `; same period last year ${rangeLabel(nums.yearAgoPeriod.start, nums.yearAgoPeriod.end)}` : r.kind === 'monthly' ? '; the year-on-year column appears once a year of Search Console data exists' : ''}. Built {dateLabel(r.created_at)}.
        {r.sent_at ? ` Emailed ${dateLabel(r.sent_at)}.` : ''}
      </p>
    </section>
  );
}
