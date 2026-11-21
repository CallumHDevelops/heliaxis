'use client';

import { useState } from 'react';
import { cleanSettings, DEFAULT_SETTINGS, priceFromBands, type EstimatorSettings, type NumKey, type Package } from '@/lib/estimator/calc';
import { gridRouteFor, homePrice, type BatteryOption, type CostSettings, type Inverter } from '@/lib/estimator/pricing';

type Field = { key: NumKey; label: string; unit: string; help: string };
const FIELDS: { title: string; note?: string; fields: Field[] }[] = [
  {
    title: 'Markup and inverter sizing',
    note: 'Price = our cost × (1 + markup). Visitors see the low to high range (rounded to £50); payback uses the middle figure. They never see costs or the markup.',
    fields: [
      { key: 'markupLow', label: 'Markup, low end', unit: '%', help: 'The bottom of the price range.' },
      { key: 'markupMid', label: 'Markup, middle', unit: '%', help: 'Used for payback and the single "about" figure.' },
      { key: 'markupHigh', label: 'Markup, high end', unit: '%', help: 'The top of the price range.' },
      { key: 'maxDcAcRatio', label: 'Most panels per inverter', unit: '× DC/AC', help: 'An inverter takes an array up to its AC rating times this (1.35 is typical), within its own panel input limit.' },
      { key: 'batteryKwPerKwh', label: 'AC power a battery needs', unit: 'kW per kWh', help: 'An inverter below 85% of this is never chosen with a battery. 0 turns the rule off.' },
      { key: 'workmanshipYears', label: 'Workmanship warranty', unit: 'years', help: 'Shown on the quote and in "What is included". 0 leaves it out until you confirm it.' },
    ],
  },
  {
    title: 'Formula pricing (businesses, and homes when the cost build-up is off)',
    fields: [
      { key: 'homeFixed', label: 'Home: fixed cost of any installation', unit: '£', help: 'Used only when the home cost build-up is switched off.' },
      { key: 'homePerKwp', label: 'Home: price per extra kWp', unit: '£', help: 'Used only when the home cost build-up is switched off.' },
      { key: 'businessFixed', label: 'Business: fixed cost', unit: '£', help: 'Businesses are priced by formula.' },
      { key: 'businessPerKwp', label: 'Business: price per extra kWp', unit: '£', help: 'Larger systems cost less per kW.' },
      { key: 'batteryPerKwh', label: 'Battery: price per kWh of storage', unit: '£', help: 'Formula pricing and price-list packages only.' },
      { key: 'batteryKwh', label: 'Default battery size', unit: 'kWh', help: 'The size used when a visitor adds a battery without choosing one.' },
      { key: 'panelWatts', label: 'Panel size', unit: 'W', help: 'Used to count panels and size the system.' },
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

const COST_FIELDS: { key: keyof Omit<CostSettings, 'scaffoldingOn'>; label: string; unit: string }[] = [
  { key: 'panel', label: 'Panel', unit: '£ per panel' },
  { key: 'mounting', label: 'Mounting (hooks and rail)', unit: '£ per panel' },
  { key: 'labourPerDay', label: 'Fitting labour', unit: '£ per day' },
  { key: 'panelsPerDay', label: 'Panels fitted in a day', unit: 'panels' },
  { key: 'electrical', label: 'Electrical installation', unit: '£ per job' },
  { key: 'admin', label: 'Admin (design, grid application, MCS, handover)', unit: '£ per job' },
  { key: 'ancillaryPerWatt', label: 'Ancillaries and miscellaneous', unit: '£ per watt' },
  { key: 'scaffolding', label: 'Scaffolding', unit: '£ per job' },
];

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const gbp50 = (n: number) => gbp(Math.round(n / 50) * 50);

/** The estimator's prices and assumptions. What is saved is used by the website straight away (within a few minutes). */
export function EstimatorSettingsForm({ initial }: { initial: EstimatorSettings }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries((Object.keys(DEFAULT_SETTINGS) as string[]).filter((k) => typeof DEFAULT_SETTINGS[k as keyof EstimatorSettings] === 'number').map((k) => [k, String(initial[k as keyof EstimatorSettings])])));
  const [pkgs, setPkgs] = useState<Package[]>(initial.packages.length ? initial.packages : STARTERS);
  const [costs, setCosts] = useState<CostSettings>(initial.costs);
  const [inverters, setInverters] = useState<Inverter[]>(initial.inverters);
  const [batteries, setBatteries] = useState<BatteryOption[]>(initial.batteries);
  const [flags, setFlags] = useState({ homeUsesCostModel: initial.homeUsesCostModel, solarOnlyInverter: initial.solarOnlyInverter, pdfShowLinePrices: initial.pdfShowLinePrices });
  const [notices, setNotices] = useState(initial.notices);
  const [award, setAward] = useState(initial.award);
  const [finance, setFinance] = useState(initial.finance);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const payload = () => ({
    ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? undefined : Number(x)])),
    ...flags,
    packages: pkgs.filter((p) => p.name.trim()),
    costs,
    inverters,
    batteries,
    notices,
    award,
    finance,
  });
  const cfg = cleanSettings(payload());

  async function save() {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/crm/estimator-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? 'Saved. The website uses these within a few minutes.' : d.error || 'Not saved');
  }
  const setCost = (k: keyof CostSettings, x: string) => setCosts({ ...costs, [k]: Number(x.replace(/[^0-9.]/g, '')) || 0 });

  return (
    <div className="est-admin">
      <section className="qb-card">
        <b>How homes are priced</b>
        <p className="crm-muted" style={{ margin: '0 0 10px' }}>
          Placeholder costs and generic GoodWe names are filled in so the page works. Replace them with your real figures, check the preview table, then save.
        </p>
        <label className="est-check">
          <input type="checkbox" checked={flags.homeUsesCostModel} onChange={(e) => setFlags({ ...flags, homeUsesCostModel: e.target.checked })} /> Price homes from our costs plus markup (untick to go back to the fixed cost plus price per kWp)
        </label>
        <label className="est-check">
          <input type="checkbox" checked={flags.solarOnlyInverter} onChange={(e) => setFlags({ ...flags, solarOnlyInverter: e.target.checked })} /> Allow a solar-only (non-hybrid) inverter on a home with no battery
        </label>
        <label className="est-check">
          <input type="checkbox" checked={flags.pdfShowLinePrices} onChange={(e) => setFlags({ ...flags, pdfShowLinePrices: e.target.checked })} /> Show a price against each line of &ldquo;What is included&rdquo; on the PDF quote (otherwise ticks only)
        </label>
      </section>

      <section className="qb-card">
        <b>Our costs</b>
        <div className="est-grid">
          {COST_FIELDS.map((f) => (
            <div key={f.key} className="est-field">
              <label htmlFor={`co-${f.key}`}>{f.label}</label>
              <div className="est-input">
                <input id={`co-${f.key}`} className="crm-input" inputMode="decimal" value={String(costs[f.key])} onChange={(e) => setCost(f.key, e.target.value)} />
                <span>{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
        <label className="est-check">
          <input type="checkbox" checked={costs.scaffoldingOn} onChange={(e) => setCosts({ ...costs, scaffoldingOn: e.target.checked })} /> Scaffolding needed (untick for, say, a ground mount)
        </label>
      </section>

      <section className="qb-card">
        <b>Inverters</b>
        <p className="crm-muted" style={{ margin: '0 0 10px' }}>
          The smallest active inverter that takes the array is chosen. AC rating 3.68 kW or less on a single phase is a G98 job; bigger is G99.
        </p>
        <table className="est-bands">
          <thead>
            <tr>
              <th>Model name</th>
              <th>AC kW</th>
              <th>Phase</th>
              <th>Max panels kWp</th>
              <th>Hybrid</th>
              <th>Cost £</th>
              <th>On</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {inverters.map((iv, i) => {
              const set = (p: Partial<Inverter>) => setInverters(inverters.map((x, j) => (j === i ? { ...x, ...p } : x)));
              const n = (s: string) => Number(s.replace(/[^0-9.]/g, '')) || 0;
              return (
                <tr key={iv.id + i}>
                  <td><input className="crm-input" aria-label="Model name" value={iv.name} onChange={(e) => set({ name: e.target.value })} /></td>
                  <td><input className="crm-input" aria-label="AC kW" inputMode="decimal" value={iv.acKw || ''} onChange={(e) => set({ acKw: n(e.target.value) })} /></td>
                  <td>
                    <select className="crm-input" aria-label="Phase" value={iv.phase} onChange={(e) => set({ phase: e.target.value as Inverter['phase'] })}>
                      <option value="single">Single</option>
                      <option value="three">Three</option>
                    </select>
                  </td>
                  <td><input className="crm-input" aria-label="Maximum panels in kWp" inputMode="decimal" value={iv.maxPvKwp || ''} onChange={(e) => set({ maxPvKwp: n(e.target.value) })} /></td>
                  <td><input type="checkbox" aria-label="Hybrid" checked={iv.hybrid} onChange={(e) => set({ hybrid: e.target.checked })} /></td>
                  <td><input className="crm-input" aria-label="Cost in pounds" inputMode="decimal" value={iv.cost || ''} onChange={(e) => set({ cost: n(e.target.value) })} /></td>
                  <td><input type="checkbox" aria-label="Active" checked={iv.active} onChange={(e) => set({ active: e.target.checked })} /></td>
                  <td><button type="button" className="crm-link" onClick={() => setInverters(inverters.filter((_, j) => j !== i))}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="est-pkg__acts">
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setInverters([...inverters, { id: `inv${Date.now().toString(36)}`, name: '', acKw: 5, phase: 'single', maxPvKwp: 7.5, hybrid: true, cost: 0, active: true }])}>
            + Add an inverter
          </button>
        </div>
      </section>

      <section className="qb-card">
        <b>Batteries</b>
        <table className="est-bands">
          <thead>
            <tr>
              <th>Name</th>
              <th>kWh</th>
              <th>Cost £</th>
              <th>On</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batteries.map((b, i) => {
              const set = (p: Partial<BatteryOption>) => setBatteries(batteries.map((x, j) => (j === i ? { ...x, ...p } : x)));
              const n = (s: string) => Number(s.replace(/[^0-9.]/g, '')) || 0;
              return (
                <tr key={b.id + i}>
                  <td><input className="crm-input" aria-label="Battery name" value={b.name} onChange={(e) => set({ name: e.target.value })} /></td>
                  <td><input className="crm-input" aria-label="Battery kWh" inputMode="decimal" value={b.kwh || ''} onChange={(e) => set({ kwh: n(e.target.value) })} /></td>
                  <td><input className="crm-input" aria-label="Cost in pounds" inputMode="decimal" value={b.cost || ''} onChange={(e) => set({ cost: n(e.target.value) })} /></td>
                  <td><input type="checkbox" aria-label="Active" checked={b.active} onChange={(e) => set({ active: e.target.checked })} /></td>
                  <td><button type="button" className="crm-link" onClick={() => setBatteries(batteries.filter((_, j) => j !== i))}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="est-pkg__acts">
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setBatteries([...batteries, { id: `bat${Date.now().toString(36)}`, name: '', kwh: 5, cost: 0, active: true }])}>
            + Add a battery
          </button>
        </div>
      </section>

      <PreviewTable cfg={cfg} />

      <PackagesEditor pkgs={pkgs} setPkgs={setPkgs} settings={cfg} />

      {FIELDS.map((g) => (
        <section key={g.title} className="qb-card">
          <b>{g.title}</b>
          {g.note && <p className="crm-muted" style={{ margin: '0 0 10px' }}>{g.note}</p>}
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

      <section className="qb-card">
        <b>&ldquo;Why now&rdquo; lines</b>
        <p className="crm-muted" style={{ margin: '0 0 10px' }}>
          Each line hides itself after its expiry date. The price-rise line must say it is a forecast and name its source until Ofgem announces; then put Ofgem&rsquo;s actual figure in and move the date on.
        </p>
        <div className="est-grid">
          <div className="est-field">
            <label htmlFor="n-vat">VAT line</label>
            <input id="n-vat" className="crm-input" value={notices.vatLine} onChange={(e) => setNotices({ ...notices, vatLine: e.target.value })} />
          </div>
          <div className="est-field">
            <label htmlFor="n-vatx">Hide after</label>
            <input id="n-vatx" className="crm-input" type="date" value={notices.vatExpires} onChange={(e) => setNotices({ ...notices, vatExpires: e.target.value })} />
          </div>
          <div className="est-field">
            <label htmlFor="n-pr">Price-rise line</label>
            <input id="n-pr" className="crm-input" value={notices.priceRiseLine} onChange={(e) => setNotices({ ...notices, priceRiseLine: e.target.value })} />
          </div>
          <div className="est-field">
            <label htmlFor="n-prx">Hide after</label>
            <input id="n-prx" className="crm-input" type="date" value={notices.priceRiseExpires} onChange={(e) => setNotices({ ...notices, priceRiseExpires: e.target.value })} />
          </div>
        </div>
      </section>

      <section className="qb-card">
        <b>GoodWe award block (off until confirmed)</b>
        <p className="crm-muted" style={{ margin: '0 0 10px' }}>
          Put the exact title and wording from the award here, word for word. The block stays hidden until it is ticked on and the wording is filled in. No claim stronger than the award itself says.
        </p>
        <div className="est-grid">
          <div className="est-field">
            <label htmlFor="aw-t">Award title</label>
            <input id="aw-t" className="crm-input" value={award.title} onChange={(e) => setAward({ ...award, title: e.target.value })} />
          </div>
          <div className="est-field">
            <label htmlFor="aw-w">Exact wording</label>
            <textarea id="aw-w" className="crm-input" rows={3} value={award.wording} onChange={(e) => setAward({ ...award, wording: e.target.value })} />
          </div>
          <div className="est-field">
            <label htmlFor="aw-l">Link (optional)</label>
            <input id="aw-l" className="crm-input" value={award.link} onChange={(e) => setAward({ ...award, link: e.target.value })} placeholder="https://" />
          </div>
          <div className="est-field">
            <label htmlFor="aw-i">Award image address (optional)</label>
            <input id="aw-i" className="crm-input" value={award.imageUrl} onChange={(e) => setAward({ ...award, imageUrl: e.target.value })} placeholder="https://" />
          </div>
        </div>
        <label className="est-check">
          <input type="checkbox" checked={award.on} onChange={(e) => setAward({ ...award, on: e.target.checked })} /> Show the award on the page, the quote and the PDF
        </label>
      </section>

      <section className="qb-card">
        <b>Finance (off until confirmed)</b>
        <p className="crm-muted" style={{ margin: '0 0 10px' }}>
          Only tick these once you know Heliaxis&rsquo;s position on credit broking and which areas the Warm Homes Loan covers. The first shows one line and a link, no figures. The second adds &ldquo;from £X a month&rdquo; with a representative example, and needs a rate.
        </p>
        <label className="est-check">
          <input type="checkbox" checked={finance.askOn} onChange={(e) => setFinance({ ...finance, askOn: e.target.checked })} /> Show &ldquo;Ask us about paying monthly, including the Warm Homes Loan&rdquo;
        </label>
        <label className="est-check">
          <input type="checkbox" checked={finance.figuresOn} onChange={(e) => setFinance({ ...finance, figuresOn: e.target.checked })} /> Show monthly figures with a representative example
        </label>
        <div className="est-grid">
          <div className="est-field">
            <label htmlFor="fi-a">Representative APR</label>
            <div className="est-input">
              <input id="fi-a" className="crm-input" inputMode="decimal" value={String(finance.aprPct || '')} onChange={(e) => setFinance({ ...finance, aprPct: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} />
              <span>%</span>
            </div>
          </div>
          <div className="est-field">
            <label htmlFor="fi-l">Official scheme page (https://)</label>
            <input id="fi-l" className="crm-input" value={finance.link} onChange={(e) => setFinance({ ...finance, link: e.target.value })} placeholder="https://" />
          </div>
          <div className="est-field">
            <label htmlFor="fi-t">Term</label>
            <div className="est-input">
              <input id="fi-t" className="crm-input" inputMode="numeric" value={String(finance.termYears)} onChange={(e) => setFinance({ ...finance, termYears: Number(e.target.value.replace(/\D/g, '')) || 10 })} />
              <span>years</span>
            </div>
          </div>
        </div>
      </section>

      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="crm-btn crm-btn--ghost"
          onClick={() => {
            setV(Object.fromEntries((Object.keys(DEFAULT_SETTINGS) as string[]).filter((k) => typeof DEFAULT_SETTINGS[k as keyof EstimatorSettings] === 'number').map((k) => [k, String(DEFAULT_SETTINGS[k as keyof EstimatorSettings])])));
            setCosts(DEFAULT_SETTINGS.costs);
            setInverters(DEFAULT_SETTINGS.inverters);
            setBatteries(DEFAULT_SETTINGS.batteries);
            setNotices(DEFAULT_SETTINGS.notices);
          }}
        >
          Reset to the starting values
        </button>
        {msg && <span className="crm-small">{msg}</span>}
      </div>
    </div>
  );
}

/** What each size of system would cost and be priced at, so the numbers can be checked before saving. */
function PreviewTable({ cfg }: { cfg: EstimatorSettings }) {
  const sizes = [6, 8, 10, 12, 14, 16, 20];
  const options: { label: string; kwh: number }[] = [{ label: 'No battery', kwh: 0 }, ...cfg.batteries.filter((b) => b.active).map((b) => ({ label: `+ ${b.kwh} kWh`, kwh: b.kwh }))];
  return (
    <section className="qb-card">
      <b>Preview: what a visitor would be priced</b>
      <p className="crm-muted" style={{ margin: '0 0 10px' }}>
        Updates as you type. Only you see the cost column: visitors see the low to high range, rounded to £50. A single-phase supply takes up to {cfg.inverters.filter((i) => i.active && i.phase === 'single').length ? Math.max(...cfg.inverters.filter((i) => i.active && i.phase === 'single').map((i) => Math.min(i.acKw * cfg.maxDcAcRatio, i.maxPvKwp))).toFixed(1) : '0'} kWp.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="est-bands est-preview">
          <thead>
            <tr>
              <th>Panels</th>
              <th>kWp</th>
              <th>Battery</th>
              <th>Our cost</th>
              <th>Low</th>
              <th>Middle</th>
              <th>High</th>
              <th>Inverter</th>
              <th>Grid</th>
            </tr>
          </thead>
          <tbody>
            {sizes.flatMap((n) =>
              options.map((o, k) => {
                const p = homePrice(cfg, n, { phase: 'single', batteryKwh: o.kwh });
                return (
                  <tr key={`${n}-${o.kwh}`} className={k === 0 ? 'est-preview__first' : ''}>
                    <td>{k === 0 ? n : ''}</td>
                    <td className="crm-muted">{k === 0 ? ((n * cfg.panelWatts) / 1000).toFixed(2) : ''}</td>
                    <td>{o.label}</td>
                    <td>{gbp(p.cost)}</td>
                    <td>{gbp50(p.low)}</td>
                    <td>{gbp50(p.mid)}</td>
                    <td>{gbp50(p.high)}</td>
                    <td>{p.inverter ? `${p.inverter.name}${p.capped ? ' (array too big for single phase)' : ''}` : 'None active'}</td>
                    <td>{p.inverter ? gridRouteFor(p.inverter.acKw) : ''}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const STARTERS: Package[] = [
  { id: 'solar', kind: 'solar', name: 'Solar', summary: 'Solar panels, a GoodWe hybrid inverter and fitting, fully installed.', includes: [], active: true, batteryKwh: 0, pricing: 'costModel', bands: [] },
  { id: 'solar-battery', kind: 'solar_battery', name: 'Solar + battery', summary: 'Solar panels with a home battery, so you keep more of what you make.', includes: [], active: true, batteryKwh: 5, pricing: 'costModel', bands: [] },
];

/**
 * The packages: what the cards on the website say. Each is priced from the cost build-up above, or (set to "Fixed price list") from a hand-typed
 * list of prices by panel count, for a promotional price.
 */
function PackagesEditor({ pkgs, setPkgs, settings }: { pkgs: Package[]; setPkgs: (p: Package[]) => void; settings: EstimatorSettings }) {
  const set = (i: number, patch: Partial<Package>) => setPkgs(pkgs.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const fill = (i: number) => {
    const p = pkgs[i];
    const bands = [6, 8, 10, 12, 14, 16, 18, 20].map((panels) => ({ panels, price: Math.round(homePrice(settings, panels, { batteryKwh: p.kind === 'solar_battery' ? p.batteryKwh || settings.batteryKwh : 0 }).mid / 50) * 50 }));
    set(i, { bands });
  };
  return (
    <section className="qb-card">
      <b>Packages (what the cards say)</b>
      <p className="crm-muted" style={{ margin: '0 0 10px' }}>
        The name, one-line description and &ldquo;what is included&rdquo; shown on the cards. Leave &ldquo;what is included&rdquo; empty to use the standard list. Prices come from the cost build-up unless a package is set to a fixed price list.
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
              <select className="crm-input" value={p.pricing} onChange={(e) => set(i, { pricing: e.target.value as Package['pricing'] })} aria-label="How it is priced">
                <option value="costModel">Cost build-up</option>
                <option value="bands">Fixed price list</option>
              </select>
              <label className="est-check">
                <input type="checkbox" checked={p.active} onChange={(e) => set(i, { active: e.target.checked })} /> On sale
              </label>
            </div>
            <input className="crm-input" value={p.summary} aria-label="One-line description" onChange={(e) => set(i, { summary: e.target.value })} placeholder="One line about it" />
            <textarea className="crm-input" rows={4} aria-label="What is included" value={p.includes.join('\n')} onChange={(e) => set(i, { includes: e.target.value.split('\n') })} placeholder={'What is included, one per line (empty: the standard list)'} />
            {p.kind === 'solar_battery' && (
              <div className="est-field">
                <label>Battery in this package (kWh)</label>
                <input className="crm-input" inputMode="decimal" value={p.batteryKwh || ''} onChange={(e) => set(i, { batteryKwh: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} />
              </div>
            )}
            {p.pricing === 'bands' && (
              <>
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
                  <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => fill(i)} title="Fills the list from the cost build-up (middle price), for you to adjust">
                    Start from the cost build-up
                  </button>
                </div>
                {p.bands.filter((b) => b.panels && b.price).length > 0 && (
                  <small className="crm-muted">
                    Example: {[8, 10, 12].map((n) => `${n} panels ${gbp(priceFromBands(p.bands.filter((b) => b.panels && b.price), n) ?? 0)}`).join(' · ')}
                  </small>
                )}
              </>
            )}
            <div className="est-pkg__acts">
              <button type="button" className="crm-link" onClick={() => window.confirm(`Remove ${p.name || 'this package'}?`) && setPkgs(pkgs.filter((_, j) => j !== i))}>
                Remove package
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setPkgs([...pkgs, { id: `pkg${pkgs.length + 1}-${Date.now().toString(36)}`, kind: 'solar', name: '', summary: '', includes: [], active: true, batteryKwh: 0, pricing: 'costModel', bands: [] }])}>
        + Add a package
      </button>
    </section>
  );
}
