'use client';

import { useState } from 'react';
import { DEFAULT_SETTINGS, type EstimatorSettings } from '@/lib/estimator/calc';

type Field = { key: keyof EstimatorSettings; label: string; unit: string; help: string };
const FIELDS: { title: string; fields: Field[] }[] = [
  {
    title: 'Prices shown to visitors (indicative)',
    fields: [
      { key: 'homeFixed', label: 'Home: fixed cost of any installation', unit: '£', help: 'Scaffold, inverter, labour, grid paperwork: the part that does not grow with the number of panels.' },
      { key: 'homePerKwp', label: 'Home: price per extra kWp', unit: '£', help: 'Added for each kW of panels. A 4 kWp system costs the fixed cost plus 4 times this. The survey sets the real price.' },
      { key: 'businessFixed', label: 'Business: fixed cost', unit: '£', help: 'As above, for a business site.' },
      { key: 'businessPerKwp', label: 'Business: price per extra kWp', unit: '£', help: 'Larger systems cost less per kW.' },
      { key: 'batteryPerKwh', label: 'Battery: price per kWh of storage', unit: '£', help: 'Added when the visitor adds a battery.' },
      { key: 'batteryKwh', label: 'Battery size offered', unit: 'kWh', help: 'The battery the estimate assumes.' },
      { key: 'panelWatts', label: 'Panel size', unit: 'W', help: 'Used to count panels.' },
    ],
  },
  {
    title: 'Electricity prices',
    fields: [
      { key: 'importPence', label: 'What a kWh costs the customer', unit: 'p', help: 'Ofgem’s price cap is about 26p. Update it when the cap changes.' },
      { key: 'standingPence', label: 'Standing charge per day', unit: 'p', help: 'Taken off a bill to work out the kWh used.' },
      { key: 'exportPence', label: 'Export payment (Smart Export Guarantee)', unit: 'p', help: 'Paid for electricity sent to the grid. Suppliers vary from about 4p to 15p.' },
      { key: 'priceRisePct', label: 'Yearly rise in electricity prices to assume', unit: '%', help: '0 means today’s prices for 25 years, which is cautious.' },
    ],
  },
  {
    title: 'Performance',
    fields: [
      { key: 'degradationPct', label: 'Panel output lost each year', unit: '%', help: 'Typically about 0.5%.' },
      { key: 'co2PerKwh', label: 'CO₂ saved per kWh', unit: 'kg', help: 'Used for the carbon figure.' },
    ],
  },
];

/** The estimator's prices and assumptions. What is saved is used by the website straight away (within a few minutes). */
export function EstimatorSettingsForm({ initial }: { initial: EstimatorSettings }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(Object.entries(initial).map(([k, x]) => [k, String(x)])));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/crm/estimator-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? undefined : Number(x)]))) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? 'Saved. The website uses these within a few minutes.' : d.error || 'Not saved');
  }
  return (
    <div className="est-admin">
      {FIELDS.map((g) => (
        <section key={g.title} className="qb-card">
          <b>{g.title}</b>
          <div className="est-grid">
            {g.fields.map((f) => (
              <div key={f.key} className="est-field">
                <label htmlFor={`es-${f.key}`}>{f.label}</label>
                <div className="est-input">
                  <input id={`es-${f.key}`} className="crm-input" inputMode="decimal" value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value.replace(/[^0-9.]/g, '') })} placeholder={String(DEFAULT_SETTINGS[f.key])} />
                  <span>{f.unit}</span>
                </div>
                <small className="crm-muted">{f.help}</small>
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setV(Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, x]) => [k, String(x)])))}>
          Reset to the starting values
        </button>
        {msg && <span className="crm-small">{msg}</span>}
      </div>
    </div>
  );
}
