/** The Letters screen: every address that has a letter, with search and filters. Server-safe. */
import { oneLineAddress } from '@/lib/prospectpv/format';
import type { LetterFilters, LetterListRow } from '@/lib/prospectpv/server/data';
import Link from 'next/link';

const TEMPLATE_NAMES = ['Classic', 'Bold Dark', 'Personal Letter', 'Roof Report', 'Brand Hero'];
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const shownUprn = (u: number) => (u < 0 ? `M${Math.abs(u)}` : String(u));

export function LettersView({ rows, total, page, pageSize, filters, hasLetters }: {
  rows: LetterListRow[]; total: number; page: number; pageSize: number; filters: LetterFilters; hasLetters: boolean;
}) {
  const filtered = !!(filters.q || (filters.show && filters.show !== 'all') || filters.template || filters.source);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (p: number) => {
    const sp = new URLSearchParams();
    if (filters.q) sp.set('q', filters.q);
    if (filters.show && filters.show !== 'all') sp.set('show', filters.show);
    if (filters.template) sp.set('template', String(filters.template));
    if (filters.source) sp.set('source', filters.source);
    if (p > 1) sp.set('page', String(p));
    const s = sp.toString();
    return `/admin/sales/prospectpv${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <div className="pva-head">
        <div>
          <h1>Letters</h1>
          <p>Every address we’ve written to, and what happened next.</p>
        </div>
        <Link className="crm-btn crm-btn--solar" href="/admin/sales/prospectpv/new">New letter</Link>
      </div>

      {!hasLetters ? (
        <div className="pva-empty">
          <h2>No letters yet</h2>
          <p>Create a letter for an address and it will appear here, with its link, scans and bookings.</p>
          <Link className="crm-btn crm-btn--solar" href="/admin/sales/prospectpv/new">Create your first letter</Link>
        </div>
      ) : (
        <>
          <form className="pva-filters" method="get" action="/admin/sales/prospectpv" role="search">
            <label className="pva-field">Search<input type="search" name="q" defaultValue={filters.q ?? ''} placeholder="Address, postcode or letter code" /></label>
            <label className="pva-field">Show
              <select name="show" defaultValue={filters.show ?? 'all'}>
                <option value="all">All letters</option>
                <option value="booked">Booked a survey</option>
                <option value="viewed">Opened the page</option>
                <option value="unviewed">Not opened yet</option>
              </select>
            </label>
            <label className="pva-field">Template
              <select name="template" defaultValue={filters.template ?? ''}>
                <option value="">Any</option>
                {TEMPLATE_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
              </select>
            </label>
            <label className="pva-field">Created
              <select name="source" defaultValue={filters.source ?? ''}>
                <option value="">Any way</option>
                <option value="manual">By hand</option>
                <option value="scan">From a scan</option>
              </select>
            </label>
            <button className="crm-btn crm-btn--ghost" type="submit">Apply</button>
            {filtered ? <Link className="crm-btn crm-btn--ghost" href="/admin/sales/prospectpv">Clear</Link> : null}
          </form>

          {rows.length === 0 ? (
            <div className="pva-empty"><h2>Nothing matches</h2><p>Try a different search, or clear the filters.</p><Link className="crm-btn crm-btn--ghost" href="/admin/sales/prospectpv">Clear filters</Link></div>
          ) : (
            <div className="pva-tablewrap">
              <table className="pva-table">
                <thead>
                  <tr>
                    <th>Address</th><th>Package</th><th className="num">Panels</th><th>Template</th><th>Created</th><th className="num">Opened</th><th>Booked</th><th><span className="sr-only" style={{ position: 'absolute', left: -9999 }}>Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link className="pva-addr" href={`/admin/sales/prospectpv/letters/${r.id}`}>{oneLineAddress({ line1: r.address.line1, line2: r.address.line2 ?? undefined, town: r.address.town, postcode: r.address.postcode })}</Link>
                        <div className="pva-muted pva-mono">{r.code} · UPRN {shownUprn(r.uprn)}{r.source === 'manual' ? ' · by hand' : ''}</div>
                      </td>
                      <td>{r.packageName ?? '–'}</td>
                      <td className="num">{r.panels ?? '–'}</td>
                      <td>{TEMPLATE_NAMES[r.templateKey - 1]}</td>
                      <td>{dateFmt.format(new Date(r.createdAt))}</td>
                      <td className="num">{r.views > 0 ? r.views : <span className="pva-muted">0</span>}</td>
                      <td>{r.booked ? <span className="pva-chip pva-chip--live">Booked</span> : <span className="pva-muted">–</span>}</td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <Link className="crm-btn crm-btn--small crm-btn--ghost" href={`/admin/sales/prospectpv/letters/${r.id}`}>View</Link>{' '}
                        <a className="crm-btn crm-btn--small crm-btn--ghost" href={`/api/prospectpv/letters/${r.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="pva-pager">
            <span>{total === 0 ? 'No letters' : `${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} of ${total}`}</span>
            <span className="pva-actions">
              {page > 1 ? <a className="crm-btn crm-btn--ghost crm-btn--small" href={link(page - 1)}>Previous</a> : null}
              {page < pages ? <a className="crm-btn crm-btn--ghost crm-btn--small" href={link(page + 1)}>Next</a> : null}
            </span>
          </div>
        </>
      )}
    </>
  );
}
