'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SECTIONS, type Section } from '@/lib/search/reporting/shape';
import { saveCustomReport } from './actions';

const PERIODS: [string, string][] = [
  ['last_week', 'Last week'],
  ['this_week', 'This week'],
  ['last_4_weeks', 'Last 4 weeks'],
  ['last_month', 'Last month'],
  ['this_month', 'This month'],
  ['quarter', 'This quarter'],
  ['custom', 'Pick dates'],
];

/** Pick the period, comparison, sections, area tier and service, then save it as a named view. */
export function CustomReportForm({ services }: { services: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [periodKey, setPeriodKey] = useState('last_month');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [compare, setCompare] = useState<'previous' | 'year'>('previous');
  const [sections, setSections] = useState<Section[]>(SECTIONS.map((s) => s.key));
  const [tier, setTier] = useState('');
  const [service, setService] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open)
    return (
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setOpen(true)}>
        New custom report
      </button>
    );

  return (
    <form
      className="sx-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const r = await saveCustomReport({ name, periodKey, start, end, compare, sections, tier: tier ? Number(tier) : null, service: service || null });
        setBusy(false);
        if (!r.ok) return setErr(r.error);
        setOpen(false);
        setName('');
        if (r.id) router.push(`?id=${r.id}`, { scroll: false });
        router.refresh();
      }}
    >
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tier 1 heat pumps, last month" maxLength={80} required />
      </label>
      <label>
        Period
        <select value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
          {PERIODS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {periodKey === 'custom' && (
        <div className="sx-row">
          <label>
            From
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label>
            To
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>
      )}
      <label>
        Compare with
        <select value={compare} onChange={(e) => setCompare(e.target.value === 'year' ? 'year' : 'previous')}>
          <option value="previous">The period just before</option>
          <option value="year">The same dates a year earlier</option>
        </select>
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: '0.84rem', fontWeight: 600 }}>Sections</legend>
        <div className="sx-row" style={{ flexWrap: 'wrap' }}>
          {SECTIONS.map((s) => (
            <label key={s.key} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 500 }}>
              <input type="checkbox" checked={sections.includes(s.key)} onChange={(e) => setSections((cur) => (e.target.checked ? [...cur, s.key] : cur.filter((x) => x !== s.key)))} />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sx-row">
        <label>
          Area tier
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">All areas</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
          </select>
        </label>
        <label>
          Service
          <select value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">Every service</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="sx-note">Area tier and service narrow the rankings measures (tracked searches). Search Console, enquiries and site health are for the whole site.</p>
      <div className="sx-row">
        <button type="submit" className="crm-btn crm-btn--solar crm-btn--small" disabled={busy}>
          {busy ? 'Building…' : 'Build and save'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
        {err && <small className="sx-down">{err}</small>}
      </div>
    </form>
  );
}
