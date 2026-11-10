'use client';
/**
 * Estimator: pick a package, describe a roof and a home, and see the rough
 * scaffolding cost and the estimated yearly saving side by side. Rates can be
 * tried out here and saved as the defaults.
 */
import { useState } from 'react';
import { estimateSavings, generationFromYield } from '@/lib/prospectpv/estimates';
import { anyOf, money, oneDp, pence } from '@/lib/prospectpv/format';
import { estimateScaffolding, type ScaffoldRates } from '@/lib/prospectpv/scaffolding';
import type { ActionResult } from '@/lib/prospectpv/server/actionTypes';
import type { AdminSettings } from '@/lib/prospectpv/settings';
import type { HomePattern } from '@/lib/prospectpv/savings';
import type { PackageRow } from '@/lib/prospectpv/types';
import { asNum, Field, Toggle } from './ui';
import Link from 'next/link';

export type EstimatorActions = { saveRates: (raw: Record<string, unknown>) => Promise<ActionResult> };

const orNull = (s: string) => (Number.isFinite(asNum(s)) ? asNum(s) : null);
const trim = (n: number) => oneDp(n).replace(/\.0$/, '');

export function Estimator({ packages, settings, actions, canEdit, onChanged }: {
  packages: PackageRow[]; settings: AdminSettings; actions: EstimatorActions; canEdit: boolean; onChanged: () => void;
}) {
  const first = packages.find((p) => p.active) ?? packages[0];
  const [pkgId, setPkgId] = useState(first?.id ?? '');
  const pkg = packages.find((p) => p.id === pkgId);
  const [panels, setPanels] = useState(String(first?.min_panels ?? 12));
  const [storeys, setStoreys] = useState('2');
  const [width, setWidth] = useState('9');
  const [elevations, setElevations] = useState('1');
  const [manualKwh, setManualKwh] = useState('');
  const [usage, setUsage] = useState(String(settings.inputs.usage_default));
  const [bill, setBill] = useState(String(settings.inputs.bill_default));
  const [home, setHome] = useState<HomePattern>(settings.inputs.home_default);
  const [diverter, setDiverter] = useState(false);
  const sc = settings.scaffolding;
  const [rate, setRate] = useState(sc.rate_per_m2_gbp === null ? '' : String(sc.rate_per_m2_gbp));
  const [fixed, setFixed] = useState(sc.fixed_fee_gbp === null ? '' : String(sc.fixed_fee_gbp));
  const [min, setMin] = useState(sc.min_charge_gbp === null ? '' : String(sc.min_charge_gbp));
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | string>('idle');

  const rates: ScaffoldRates = { ...sc, rate_per_m2_gbp: orNull(rate), fixed_fee_gbp: orNull(fixed), min_charge_gbp: orNull(min) };
  const n = asNum(panels);
  const kwp = pkg?.panel_watts && n > 0 ? Math.round((n * pkg.panel_watts) / 10) / 100 : null;
  const yieldKwh = kwp ? generationFromYield(kwp, settings.generation.yield_kwh_per_kwp) : null;
  const generation = Number.isFinite(asNum(manualKwh)) && asNum(manualKwh) > 0 ? asNum(manualKwh) : yieldKwh;
  const price = pkg?.price_inc_vat !== null && pkg?.price_inc_vat !== undefined ? Number(pkg.price_inc_vat) : null;

  const scaffold = estimateScaffolding({ storeys: asNum(storeys) || 2, elevationWidthM: asNum(width), elevations: asNum(elevations) || 1 }, rates);
  const savings = pkg && generation !== null && pkg.usable_kwh !== null && price !== null
    ? estimateSavings({ usageKwh: asNum(usage) || 0, monthlyBill: asNum(bill) || 0, homePattern: home, diverter }, { generationKwh: generation, batteryKwh: Number(pkg.usable_kwh), price }, settings)
    : null;
  const ratesChanged = rate !== (sc.rate_per_m2_gbp === null ? '' : String(sc.rate_per_m2_gbp)) || fixed !== (sc.fixed_fee_gbp === null ? '' : String(sc.fixed_fee_gbp)) || min !== (sc.min_charge_gbp === null ? '' : String(sc.min_charge_gbp));

  async function saveRates() {
    setSaved('saving');
    const r = await actions.saveRates({
      'scaffolding::rate_per_m2_gbp': rate, 'scaffolding::fixed_fee_gbp': fixed, 'scaffolding::min_charge_gbp': min,
      'scaffolding::storey_height_m': String(sc.storey_height_m), 'scaffolding::top_lift_m': String(sc.top_lift_m), 'scaffolding::end_return_m': String(sc.end_return_m),
    });
    if (r.ok) { setSaved('saved'); onChanged(); } else setSaved(Object.values(r.errors ?? {})[0] ?? r.message ?? 'Couldn’t save.');
  }

  return (
    <>
      <div className="pva-head">
        <div><h1>Estimator</h1><p>Try a package on a roof and a home. See a rough scaffolding cost and the saving the customer could expect. Nothing here is saved except the rates, if you choose.</p></div>
      </div>

      <div className="pva-bench">
        <div className="pva-form">
          <fieldset className="pva-card pva-fs">
            <legend>Package and roof</legend>
            <div className="pva-grid pva-grid--3">
              <Field label="Package">
                <select value={pkgId} onChange={(e) => { setPkgId(e.target.value); const p = packages.find((x) => x.id === e.target.value); if (p) setPanels(String(p.min_panels)); }}>
                  {packages.length === 0 ? <option value="">No packages yet</option> : null}
                  {packages.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (off)'}</option>)}
                </select>
              </Field>
              <Field label="Number of panels"><input type="number" min={1} value={panels} onChange={(e) => setPanels(e.target.value)} /></Field>
              <Field label="Yearly generation" unit="kWh" help={yieldKwh && !manualKwh ? `From ${settings.generation.yield_kwh_per_kwp} kWh per kWp.` : yieldKwh ? undefined : 'Type a figure, or set the yearly yield in Settings.'}>
                <input type="number" min={0} step={10} value={manualKwh} placeholder={yieldKwh ? String(yieldKwh) : ''} onChange={(e) => setManualKwh(e.target.value)} />
              </Field>
              <Field label="Storeys"><select value={storeys} onChange={(e) => setStoreys(e.target.value)}>{[1, 2, 3, 4].map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Width of the wall to scaffold" unit="m" help="The elevation the panels sit above."><input type="number" min={0} step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} /></Field>
              <Field label="Elevations to scaffold" help="2 if panels go on two sides."><select value={elevations} onChange={(e) => setElevations(e.target.value)}>{[1, 2, 3, 4].map((x) => <option key={x}>{x}</option>)}</select></Field>
            </div>
          </fieldset>

          <fieldset className="pva-card pva-fs">
            <legend>Scaffolding rates</legend>
            <div className="pva-grid pva-grid--3">
              <Field label="Rate" unit="£ per m²"><input type="text" inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value); setSaved('idle'); }} /></Field>
              <Field label="Fixed fee" unit="£"><input type="text" inputMode="decimal" value={fixed} onChange={(e) => { setFixed(e.target.value); setSaved('idle'); }} /></Field>
              <Field label="Minimum charge" unit="£"><input type="text" inputMode="decimal" value={min} onChange={(e) => { setMin(e.target.value); setSaved('idle'); }} /></Field>
            </div>
            <div className="pva-actions" style={{ marginTop: 12 }}>
              {canEdit ? <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!ratesChanged || saved === 'saving'} onClick={() => void saveRates()}>{saved === 'saving' ? 'Saving…' : 'Save as default rates'}</button> : null}
              {saved === 'saved' && !ratesChanged ? <span className="pva-ok">Saved ✓</span> : null}
              {saved !== 'idle' && saved !== 'saving' && saved !== 'saved' ? <span className="pva-err" role="alert">{saved}</span> : null}
              <span className="pva-note">Storey height {sc.storey_height_m} m, {sc.top_lift_m} m at the top, {sc.end_return_m} m extra each end. Change these in <Link href="/admin/sales/prospectpv/settings#scaffolding">Settings</Link>.</span>
            </div>
          </fieldset>

          <fieldset className="pva-card pva-fs">
            <legend>The home</legend>
            <div className="pva-grid pva-grid--3">
              <Field label="Electricity use" unit="kWh a year"><input type="number" min={0} step={100} value={usage} onChange={(e) => setUsage(e.target.value)} /></Field>
              <Field label="Monthly bill" unit="£"><input type="number" min={0} step={5} value={bill} onChange={(e) => setBill(e.target.value)} /></Field>
              <Field label="Who’s home in the day?"><select value={home} onChange={(e) => setHome(e.target.value as HomePattern)}><option value="out">Mostly out</option><option value="some">Some days</option><option value="all">Home all day</option></select></Field>
            </div>
            <div style={{ marginTop: 12 }}><Toggle label="Hot water diverter" help="Sends spare solar to the immersion heater." checked={diverter} onChange={setDiverter} /></div>
          </fieldset>
        </div>

        <aside className="pva-side" aria-live="polite">
          <div className="pva-card">
            <h2>Scaffolding</h2>
            {scaffold.cost !== null ? (
              <>
                <div className="pva-big">~£{money(scaffold.rough ?? scaffold.cost)}</div>
                <div className="pva-sum" style={{ marginTop: 10 }}>
                  <div><span>Length</span><strong>{trim(scaffold.lengthM)} m</strong></div>
                  <div><span>Height</span><strong>{trim(scaffold.heightM)} m</strong></div>
                  <div><span>Scaffold face</span><strong>{trim(scaffold.totalAreaM2)} m²</strong></div>
                  <div><span>Scaffold</span><strong>£{money(scaffold.areaCost ?? 0)}</strong></div>
                  {scaffold.fixedFee ? <div><span>Fixed fee</span><strong>£{money(scaffold.fixedFee)}</strong></div> : null}
                  {scaffold.minApplied ? <div><span>Minimum charge applied</span><strong>£{money(scaffold.cost)}</strong></div> : null}
                </div>
                {price ? <p className="pva-note" style={{ marginTop: 10 }}>About {Math.round((scaffold.cost / price) * 100)}% of the £{money(price)} package price.</p> : null}
              </>
            ) : <p className="pva-note">Enter {anyOf(scaffold.missing)} to see a figure.</p>}
          </div>

          <div className="pva-dark pv-xh pv-xh--dark">
            <div className="pva-eyebrow">Estimated saving</div>
            {savings ? (
              <>
                <div className="pva-figs">
                  <div>Saving per year<b className="gold">£{money(savings.annualSaving)}</b></div>
                  <div>New monthly bill<b>£{money(savings.newMonthlyBill)}</b></div>
                  <div>Export earnings<b style={{ fontSize: 20 }}>£{money(savings.exportEarnings)}/yr</b></div>
                  <div>Payback<b style={{ fontSize: 20 }}>{savings.paybackYears === null ? '–' : `~${oneDp(savings.paybackYears)} yrs`}</b></div>
                </div>
                <p className="pva-note pva-muted" style={{ marginTop: 12 }}>
                  Assumes export at {pence(settings.assumptions.seg_rate_gbp_per_kwh!)}p/kWh, a {pence(settings.assumptions.off_peak_spread_gbp_per_kwh!)}p/kWh smart tariff saving and a £{money(settings.assumptions.standing_charge_gbp_per_year!)} standing charge. Indicative only.
                </p>
              </>
            ) : (
              <p className="pva-note pva-muted" style={{ marginTop: 6 }}>
                {settings.assumptions.seg_rate_gbp_per_kwh === null || settings.assumptions.off_peak_spread_gbp_per_kwh === null || settings.assumptions.standing_charge_gbp_per_year === null
                  ? <>Set the <Link href="/admin/sales/prospectpv/settings#savings" style={{ color: 'var(--solar)' }}>savings assumptions</Link> to see this.</>
                  : generation === null ? 'Enter the yearly generation, or set the yearly yield in Settings.' : 'Choose a package with a battery size and price.'}
              </p>
            )}
          </div>

          {pkg ? (
            <div className="pva-card">
              <h2>{pkg.name}</h2>
              <div className="pva-sum">
                <div><span>Array</span><strong>{kwp ? `${trim(kwp)} kWp` : '–'}</strong></div>
                <div><span>Battery</span><strong>{pkg.usable_kwh !== null ? `${Number(pkg.usable_kwh)} kWh` : '–'}</strong></div>
                <div><span>Price</span><strong>{price !== null ? `£${money(price)}` : '–'}</strong></div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}
