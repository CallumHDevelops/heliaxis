'use client';
/**
 * Create a letter by hand. The right-hand panel updates as you type: package,
 * price, whether the roof can hold that many panels, yearly generation,
 * a typical-home saving and a rough scaffolding cost.
 */
import { useMemo, useState } from 'react';
import { anyOf, money, oneDp } from '@/lib/prospectpv/format';
import { estimateSavings, generationFromYield, typicalHome } from '@/lib/prospectpv/estimates';
import { ASPECT_OPTIONS, maxPanelsOnRoof, roofCapacity, scaffoldInputFor, type ManualLetterForm } from '@/lib/prospectpv/manualLetter';
import { matchPackage } from '@/lib/prospectpv/packages';
import type { Readiness } from '@/lib/prospectpv/readiness';
import { estimateScaffolding } from '@/lib/prospectpv/scaffolding';
import type { ActionResult } from '@/lib/prospectpv/server/actionTypes';
import type { AdminSettings } from '@/lib/prospectpv/settings';
import type { PackageRow } from '@/lib/prospectpv/types';
import { asNum, Field, ScaledFrame } from './ui';
import Link from 'next/link';

export type NewLetterActions = {
  preview: (raw: Record<string, unknown>) => Promise<ActionResult<{ html: string; missing: { label: string; href: string }[] }>>;
  create: (raw: Record<string, unknown>) => Promise<ActionResult<{ id: string; code: string }>>;
};

type V = Record<'batchName' | 'line1' | 'line2' | 'town' | 'postcode' | 'uprn' | 'panelCount' | 'packageId' | 'templateKey' | 'aspect' | 'roofShape' | 'widthM' | 'depthM' | 'rotationDeg' | 'storeys' | 'annualKwh' | 'usableAreaM2', string>;

export function NewLetterForm({ packages, templates, settings, readiness, actions, onCreated }: {
  packages: PackageRow[];
  templates: { template_key: number; name: string }[];
  settings: AdminSettings;
  readiness: Readiness;
  actions: NewLetterActions;
  onCreated: (id: string) => void;
}) {
  const [v, setV] = useState<V>({
    batchName: '', line1: '', line2: '', town: '', postcode: '', uprn: '', panelCount: '12', packageId: '',
    templateKey: String(settings.letters.default_template), aspect: 'S', roofShape: 'Pitched', widthM: '', depthM: '',
    rotationDeg: '0', storeys: '2', annualKwh: '', usableAreaM2: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<{ label: string; href: string }[] | null>(null);
  const [busy, setBusy] = useState<'preview' | 'create' | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const set = (k: keyof V) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const panels = asNum(v.panelCount);
  const suggested = Number.isInteger(panels) && panels > 0 ? matchPackage(panels, packages) : null;
  const pkg = packages.find((p) => p.id === v.packageId) ?? (suggested?.status === 'matched' ? suggested.package : null);

  const roof = useMemo(
    () => ({ widthM: asNum(v.widthM), depthM: asNum(v.depthM), rotationDeg: asNum(v.rotationDeg) || 0, aspect: v.aspect as ManualLetterForm['aspect'], roofShape: v.roofShape as ManualLetterForm['roofShape'] }),
    [v.widthM, v.depthM, v.rotationDeg, v.aspect, v.roofShape],
  );
  const roofKnown = roof.widthM >= 3 && roof.depthM >= 3 && Number.isInteger(panels) && panels > 0;
  const fit = useMemo(() => (roofKnown ? roofCapacity({ ...roof, panelCount: panels }) : null), [roofKnown, roof, panels]);
  const maxFit = useMemo(() => (fit && !fit.fits ? maxPanelsOnRoof(roof) : null), [fit, roof]);

  const watts = pkg?.panel_watts ?? null;
  const kwp = watts && panels > 0 ? Math.round((panels * watts) / 10) / 100 : null;
  const yieldKwh = kwp ? generationFromYield(kwp, settings.generation.yield_kwh_per_kwp) : null;
  const annual = asNum(v.annualKwh);
  const savings = pkg && pkg.usable_kwh !== null && pkg.price_inc_vat !== null && annual > 0
    ? estimateSavings(typicalHome(settings.inputs), { generationKwh: annual, batteryKwh: Number(pkg.usable_kwh), price: Number(pkg.price_inc_vat) }, settings)
    : null;
  const scaffold = estimateScaffolding(scaffoldInputFor({ aspect: roof.aspect, widthM: roof.widthM, depthM: roof.depthM, storeys: asNum(v.storeys) || 2 }), settings.scaffolding);
  const belowMin = !!pkg && panels > 0 && panels < pkg.min_panels;
  const aboveMax = !!pkg && pkg.max_panels !== null && panels > pkg.max_panels;

  const raw = () => ({ ...v, packageId: pkg?.id ?? '' });
  const run = async (kind: 'preview' | 'create') => {
    setBusy(kind);
    setErrors({});
    setMessage(null);
    setBlocking(null);
    try {
      if (kind === 'preview') {
        const r = await actions.preview(raw());
        if (r.ok) setPreviewHtml(r.html);
        else { setErrors(r.errors ?? {}); setMessage(r.message ?? (r.errors ? 'Fix the highlighted fields to see the preview.' : null)); }
      } else {
        const r = await actions.create(raw());
        if (r.ok) return onCreated(r.id);
        setErrors(r.errors ?? {});
        setMessage(r.message ?? (r.errors ? 'Fix the highlighted fields and try again.' : null));
        setBlocking(r.blocking ?? null);
      }
    } catch {
      setMessage('Something went wrong. Check your connection and try again.');
    }
    setBusy(null);
  };

  const none = packages.length === 0;
  return (
    <div>
      {readiness.blocking.length > 0 ? (
        <div className="pva-alert" style={{ marginBottom: 18 }}>
          <strong>Letters can’t be created yet.</strong> These still need setting up, then you can create letters. You can still preview a letter now.
          <ul>{readiness.blocking.map((b) => <li key={b.label}><a href={b.href}>{b.label}</a></li>)}</ul>
        </div>
      ) : null}
      {none ? (
        <div className="pva-alert" style={{ marginBottom: 18 }}>No packages are switched on yet. <Link href="/admin/sales/prospectpv/packages">Add a package</Link> first.</div>
      ) : null}

      <div className="pva-bench">
        <form className="pva-form" onSubmit={(e) => { e.preventDefault(); void run('create'); }} noValidate>
          <fieldset className="pva-card pva-fs">
            <legend>Address</legend>
            <div className="pva-grid">
              <Field label="First line" error={errors.line1}><input type="text" value={v.line1} onChange={set('line1')} autoComplete="off" aria-invalid={!!errors.line1} placeholder="12 Transton Road" /></Field>
              <Field label="Second line (optional)"><input type="text" value={v.line2} onChange={set('line2')} /></Field>
              <Field label="Town" error={errors.town}><input type="text" value={v.town} onChange={set('town')} aria-invalid={!!errors.town} /></Field>
              <Field label="Postcode" error={errors.postcode}><input type="text" value={v.postcode} onChange={set('postcode')} aria-invalid={!!errors.postcode} autoCapitalize="characters" /></Field>
              <Field label="UPRN (optional)" error={errors.uprn} help="Leave blank if you don’t have one. We’ll keep track of the address anyway."><input type="text" inputMode="numeric" value={v.uprn} onChange={set('uprn')} aria-invalid={!!errors.uprn} /></Field>
              <Field label="Batch name (optional)" help="Groups letters together. Defaults to “Manual letters”."><input type="text" value={v.batchName} onChange={set('batchName')} /></Field>
            </div>
          </fieldset>

          <fieldset className="pva-card pva-fs">
            <legend>The roof</legend>
            <div className="pva-grid pva-grid--3">
              <Field label="Number of panels" error={errors.panelCount}><input type="number" min={1} max={60} value={v.panelCount} onChange={set('panelCount')} aria-invalid={!!errors.panelCount} /></Field>
              <Field label="Roof faces" error={errors.aspect}>
                <select value={v.aspect} onChange={set('aspect')}>{ASPECT_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
              </Field>
              <Field label="Roof shape">
                <select value={v.roofShape} onChange={set('roofShape')}><option>Pitched</option><option>Flat</option></select>
              </Field>
              <Field label="House width" unit="m" error={errors.widthM} help="East to west."><input type="number" step="0.1" min={3} max={40} value={v.widthM} onChange={set('widthM')} aria-invalid={!!errors.widthM} /></Field>
              <Field label="House depth" unit="m" error={errors.depthM} help="North to south."><input type="number" step="0.1" min={3} max={30} value={v.depthM} onChange={set('depthM')} aria-invalid={!!errors.depthM} /></Field>
              <Field label="Storeys" error={errors.storeys} help="Used for scaffolding."><select value={v.storeys} onChange={set('storeys')}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></Field>
              <Field label="Turned from north" unit="°" error={errors.rotationDeg} help="Clockwise. Usually 0."><input type="number" step="1" min={-89} max={89} value={v.rotationDeg} onChange={set('rotationDeg')} aria-invalid={!!errors.rotationDeg} /></Field>
              <Field label="Usable roof area (optional)" unit="m²" error={errors.usableAreaM2} help="Shown on the roof report letter only."><input type="number" min={1} max={500} value={v.usableAreaM2} onChange={set('usableAreaM2')} /></Field>
              <Field label="Yearly generation" unit="kWh" error={errors.annualKwh} help={yieldKwh ? undefined : 'From your MCS or PVGIS estimate.'}>
                <input type="number" min={500} max={30000} step={10} value={v.annualKwh} onChange={set('annualKwh')} aria-invalid={!!errors.annualKwh} />
              </Field>
            </div>
            {yieldKwh ? (
              <p className="pva-note" style={{ marginTop: 10 }}>
                At {settings.generation.yield_kwh_per_kwp} kWh per kWp, {kwp} kWp makes about {money(yieldKwh)} kWh a year.{' '}
                <button type="button" className="crm-btn crm-btn--small crm-btn--ghost" onClick={() => setV((s) => ({ ...s, annualKwh: String(yieldKwh) }))}>Use {money(yieldKwh)}</button>
              </p>
            ) : null}
            {fit ? (
              <p className={`pva-fit ${fit.fits ? '' : 'pva-fit--bad'}`} style={{ marginTop: 10 }} role="status">
                {fit.fits ? `✓ This roof can show ${panels} panels.` : `✗ A roof this size only fits about ${maxFit} panels. Check the size or lower the panel count.`}
              </p>
            ) : null}
          </fieldset>

          <fieldset className="pva-card pva-fs">
            <legend>Package and letter</legend>
            <div className="pva-grid">
              <Field label="Package" error={errors.packageId} help={suggested?.status === 'matched' && !v.packageId ? `Suggested for ${panels} panels.` : suggested?.status === 'too_small' ? 'This roof is smaller than any live package.' : undefined}>
                <select value={pkg?.id ?? ''} onChange={set('packageId')} aria-invalid={!!errors.packageId}>
                  <option value="" disabled>Choose a package</option>
                  {packages.map((p) => <option key={p.id} value={p.id}>{p.name}{p.max_panels === null ? ` (${p.min_panels}+ panels)` : ` (${p.min_panels}–${p.max_panels} panels)`}</option>)}
                </select>
              </Field>
              <Field label="Letter template" error={errors.templateKey}>
                <select value={v.templateKey} onChange={set('templateKey')}>{templates.map((t) => <option key={t.template_key} value={t.template_key}>{t.name}</option>)}</select>
              </Field>
            </div>
            {belowMin ? <p className="pva-fit pva-fit--bad" style={{ marginTop: 10 }} role="alert">✗ {pkg!.name} starts at {pkg!.min_panels} panels.</p> : null}
            {aboveMax ? <p className="pva-note" style={{ marginTop: 10 }}>This roof has more panels than {pkg!.name} usually covers ({pkg!.max_panels}). Check a bigger package isn’t a better fit.</p> : null}
          </fieldset>

          {message ? <div className="pva-alert pva-alert--err" role="alert">{message}</div> : null}
          {blocking?.length ? (
            <div className="pva-alert" role="alert">Still needed:<ul>{blocking.map((b) => <li key={b.label}><a href={b.href}>{b.label}</a></li>)}</ul></div>
          ) : null}
          <div className="pva-actions">
            <button type="button" className="crm-btn crm-btn--ghost" disabled={busy !== null || none} onClick={() => void run('preview')}>{busy === 'preview' ? 'Making preview…' : 'Preview letter'}</button>
            <button type="submit" className="crm-btn crm-btn--solar" disabled={busy !== null || none || readiness.blocking.length > 0}>{busy === 'create' ? 'Creating…' : 'Create letter'}</button>
          </div>
        </form>

        <aside className="pva-side" aria-label="Estimate for this letter">
          <div className="pva-card">
            <h2>This letter</h2>
            {pkg ? (
              <div className="pva-sum">
                <div><span>Package</span><strong>{pkg.name}</strong></div>
                <div><span>Panels</span><strong>{Number.isInteger(panels) ? panels : '–'}{pkg.panel_model ? ` × ${pkg.panel_model}` : ''}</strong></div>
                <div><span>Array size</span><strong>{kwp ? `${oneDp(kwp).replace(/\.0$/, '')} kWp` : '–'}</strong></div>
                <div><span>Battery</span><strong>{pkg.usable_kwh !== null ? `${Number(pkg.usable_kwh)} kWh` : '–'}</strong></div>
                <div><span>Inverter</span><strong>{pkg.esa_inverter_model ?? '–'}</strong></div>
                <div><span>Price on the letter</span><strong>{pkg.price_inc_vat !== null ? `£${money(Number(pkg.price_inc_vat))}` : '–'}</strong></div>
              </div>
            ) : <p className="pva-note">Enter the number of panels and a package is suggested.</p>}
          </div>

          <div className="pva-dark pv-xh pv-xh--dark">
            <div className="pva-eyebrow">Typical home saving</div>
            {savings ? (
              <>
                <div className="pva-figs">
                  <div>Saving per year<b className="gold">£{money(savings.annualSaving)}</b></div>
                  <div>Payback<b>{savings.paybackYears === null ? '–' : `~${oneDp(savings.paybackYears)} yrs`}</b></div>
                </div>
                <p className="pva-note pva-muted" style={{ marginTop: 10 }}>At {money(settings.inputs.usage_default)} kWh and £{settings.inputs.bill_default} a month. The customer sees their own on the landing page. Letters don’t show savings.</p>
              </>
            ) : (
              <p className="pva-note pva-muted" style={{ marginTop: 6 }}>
                {readiness.advisory.some((a) => a.label.startsWith('Savings assumptions')) ? <>Set the <Link href="/admin/sales/prospectpv/settings#savings" style={{ color: 'var(--solar)' }}>savings assumptions</Link> to see this.</> : 'Enter the yearly generation and a package to see this.'}
              </p>
            )}
          </div>

          <div className="pva-card">
            <h2>Scaffolding</h2>
            {scaffold.cost !== null ? (
              <>
                <div className="pva-big">~£{money(scaffold.rough ?? scaffold.cost)}</div>
                <p className="pva-note" style={{ marginTop: 6 }}>
                  {oneDp(scaffold.lengthM).replace(/\.0$/, '')} m long × {oneDp(scaffold.heightM).replace(/\.0$/, '')} m high, {oneDp(scaffold.totalAreaM2).replace(/\.0$/, '')} m² ({scaffold.storeys} storey{scaffold.storeys === 1 ? '' : 's'}).
                  {scaffold.minApplied ? ' Minimum charge applied.' : ''} Included in the package price.
                </p>
                {pkg?.price_inc_vat ? <p className="pva-note">That’s about {Math.round((scaffold.cost / Number(pkg.price_inc_vat)) * 100)}% of the package price.</p> : null}
              </>
            ) : (
              <p className="pva-note">
                {scaffold.missing.includes('rate per m²') ? <>Add your <Link href="/admin/sales/prospectpv/settings#scaffolding">scaffolding rate</Link> to see a figure.</> : `Enter the ${anyOf(scaffold.missing)} to see a figure.`}
              </p>
            )}
          </div>
        </aside>
      </div>

      {previewHtml ? (
        <section className="pva-card" style={{ marginTop: 24 }} aria-label="Letter preview">
          <h2>Preview</h2>
          <p className="pva-blurb">Front on the left, back on the right. The QR code in this preview isn’t a real link. Items marked [TBC] are still to be set up.</p>
          <ScaledFrame html={previewHtml} width={1612} height={1123} title="Letter preview, front and back" />
        </section>
      ) : null}
    </div>
  );
}
