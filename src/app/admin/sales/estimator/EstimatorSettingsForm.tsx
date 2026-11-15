'use client';

import { useState } from 'react';
import { DEFAULT_SETTINGS, priceFromBands, type EstimatorSettings, type NumKey, type Package } from '@/lib/estimator/calc';

type Field = { key: NumKey; label: string; unit: string; help: string };
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
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(Object.entries(initial).filter(([k]) => k !== 'packages').map(([k, x]) => [k, String(x)])));
  const [pkgs, setPkgs] = useState<Package[]>(initial.packages.length ? initial.packages : STARTERS);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/crm/estimator-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? undefined : Number(x)])), packages: pkgs.filter((p) => p.name.trim()) }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? 'Saved. The website uses these within a few minutes.' : d.error || 'Not saved');
  }
  return (
    <div className="est-admin">
      <PackagesEditor pkgs={pkgs} setPkgs={setPkgs} settings={{ ...DEFAULT_SETTINGS, ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x) || 0])) } as EstimatorSettings} />
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
        <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setV(Object.fromEntries(Object.entries(DEFAULT_SETTINGS).filter(([k]) => k !== 'packages').map(([k, x]) => [k, String(x)])))}>
          Reset to the starting values
        </button>
        {msg && <span className="crm-small">{msg}</span>}
      </div>
    </div>
  );
}

const STARTERS: Package[] = [
  { id: 'solar', kind: 'solar', name: 'Solar only', summary: 'Solar panels, inverter and fitting, fully installed.', includes: ['Solar panels and inverter', 'Scaffold, fitting and wiring', 'MCS certificate and grid paperwork', 'Monitoring app'], active: true, batteryKwh: 0, bands: [] },
  { id: 'solar-battery', kind: 'solar_battery', name: 'Solar and battery', summary: 'Solar panels with a home battery, so you keep more of what you make.', includes: ['Everything in Solar only', 'Home battery storage', 'Battery commissioning and monitoring'], active: true, batteryKwh: 5, bands: [] },
];

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

/**
 * The packages and their prices. Each has a price list: what a system of this many panels costs, installed. The estimator uses the list for
 * the matching package (in between two prices it works the price out); a package with no prices isn't used, and the formula below is.
 */
function PackagesEditor({ pkgs, setPkgs, settings }: { pkgs: Package[]; setPkgs: (p: Package[]) => void; settings: EstimatorSettings }) {
  const set = (i: number, patch: Partial<Package>) => setPkgs(pkgs.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const fill = (i: number) => {
    const p = pkgs[i];
    const bands = [6, 8, 10, 12, 14, 16, 18, 20].map((panels) => ({ panels, price: Math.round((settings.homeFixed + ((panels * settings.panelWatts) / 1000) * settings.homePerKwp + (p.kind === 'solar_battery' ? (p.batteryKwh || settings.batteryKwh) * settings.batteryPerKwh : 0)) / 50) * 50 }));
    set(i, { bands });
  };
  return (
    <section className="qb-card">
      <b>Packages and prices</b>
      <p className="crm-muted" style={{ margin: '0 0 10px' }}>
        What you sell, with the installed price for each size of system. The estimator prices a home from the matching package; a visitor who adds a battery is priced from Solar and battery. A package with no prices is not used, and the formula further down is used instead.
      </p>
      <div className="est-pkgs">
        {pkgs.map((p, i) => (
          <div key={p.id + i} className={`est-pkg${p.active ? '' : ' is-off'}`}>
            <div className="est-pkg__head">
              <input className="crm-input" value={p.name} aria-label="Package name" onChange={(e) => set(i, { name: e.target.value })} placeholder="Package name" />
              <select className="crm-input" value={p.kind} onChange={(e) => set(i, { kind: e.target.value as Package['kind'], batteryKwh: e.target.value === 'solar_battery' ? p.batteryKwh || 5 : 0 })} aria-label="Type">
                <option value="solar">Solar only</option>
                <option value="solar_battery">Solar and battery</option>
              </select>
              <label className="est-check">
                <input type="checkbox" checked={p.active} onChange={(e) => set(i, { active: e.target.checked })} /> On sale
              </label>
            </div>
            <input className="crm-input" value={p.summary} aria-label="One-line description" onChange={(e) => set(i, { summary: e.target.value })} placeholder="One line about it" />
            <textarea className="crm-input" rows={4} aria-label="What is included" value={p.includes.join('\n')} onChange={(e) => set(i, { includes: e.target.value.split('\n') })} placeholder={'What is included, one per line'} />
            {p.kind === 'solar_battery' && (
              <div className="est-field">
                <label>Battery in this package (kWh)</label>
                <input className="crm-input" inputMode="decimal" value={p.batteryKwh || ''} onChange={(e) => set(i, { batteryKwh: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} />
              </div>
            )}
            <table className="est-bands">
              <thead>
                <tr>
                  <th>Panels</th>
                  <th>kWp</th>
                  <th>Installed price (£)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {p.bands.map((b, k) => (
                  <tr key={k}>
                    <td>
                      <input className="crm-input" inputMode="numeric" aria-label="Panels" value={b.panels || ''} onChange={(e) => set(i, { bands: p.bands.map((x, j) => (j === k ? { ...x, panels: Number(e.target.value.replace(/\D/g, '')) || 0 } : x)) })} />
                    </td>
                    <td className="crm-muted">{((b.panels * settings.panelWatts) / 1000).toFixed(2)}</td>
                    <td>
                      <input className="crm-input" inputMode="numeric" aria-label="Price" value={b.price || ''} onChange={(e) => set(i, { bands: p.bands.map((x, j) => (j === k ? { ...x, price: Number(e.target.value.replace(/\D/g, '')) || 0 } : x)) })} />
                    </td>
                    <td>
                      <button type="button" className="crm-link" onClick={() => set(i, { bands: p.bands.filter((_, j) => j !== k) })}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="est-pkg__acts">
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => set(i, { bands: [...p.bands, { panels: (p.bands.at(-1)?.panels ?? 6) + 2, price: 0 }] })}>
                + Add a size
              </button>
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => fill(i)} title="Fills the list from the fixed cost and price per kWp below, for you to adjust">
                Start from the formula
              </button>
              <button type="button" className="crm-link" onClick={() => window.confirm(`Remove ${p.name || 'this package'}?`) && setPkgs(pkgs.filter((_, j) => j !== i))}>
                Remove package
              </button>
            </div>
            {p.bands.filter((b) => b.panels && b.price).length > 0 && (
              <small className="crm-muted">
                Example: {[8, 10, 12].map((n) => `${n} panels ${gbp(priceFromBands(p.bands.filter((b) => b.panels && b.price), n) ?? 0)}`).join(' · ')}
              </small>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setPkgs([...pkgs, { id: `pkg${pkgs.length + 1}-${Date.now().toString(36)}`, kind: 'solar', name: '', summary: '', includes: [], active: true, batteryKwh: 0, bands: [] }])}>
        + Add a package
      </button>
    </section>
  );
}
