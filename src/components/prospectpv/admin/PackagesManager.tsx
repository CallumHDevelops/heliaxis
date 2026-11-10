'use client';
/**
 * Packages: add as many as you like, each with its panels, panel model and
 * warranty, inverter, battery storage and price. A package can only be
 * switched on once everything a letter prints is filled in.
 */
import { useState } from 'react';
import { CLAIM_ORDER, BENEFITS } from '@/lib/prospectpv/claims';
import { money } from '@/lib/prospectpv/format';
import { bandLabel, bandWarnings, bySize, EMPTY_PACKAGE, REQUIRED_FOR_ACTIVE, rowToForm, type PackageForm } from '@/lib/prospectpv/packageForm';
import type { ActionResult } from '@/lib/prospectpv/server/actionTypes';
import type { ExtraAdminRow } from '@/lib/prospectpv/server/data';
import type { PackageRow } from '@/lib/prospectpv/types';
import { Field, Toggle } from './ui';

export type PackageActions = {
  save: (raw: Record<string, unknown>) => Promise<ActionResult>;
  remove: (id: string) => Promise<ActionResult>;
  duplicate: (id: string) => Promise<ActionResult>;
  saveExtra: (raw: { id: string; name: string; description: string; price: string | number | null; active: boolean }) => Promise<ActionResult>;
};

type Draft = Record<string, string | boolean | string[]>;

const toDraft = (f: PackageForm): Draft => ({
  id: f.id ?? '', name: f.name, minPanels: String(f.minPanels), maxPanels: f.maxPanels === null ? '' : String(f.maxPanels),
  panelModel: f.panelModel, panelWatts: f.panelWatts === null ? '' : String(f.panelWatts),
  panelWarrantyYrs: f.panelWarrantyYrs === null ? '' : String(f.panelWarrantyYrs), inverterModel: f.inverterModel,
  batteryKwh: f.batteryKwh === null ? '' : String(f.batteryKwh), batteryModuleModel: f.batteryModuleModel,
  batteryModuleCount: f.batteryModuleCount === null ? '' : String(f.batteryModuleCount),
  batteryWarrantyYrs: f.batteryWarrantyYrs === null ? '' : String(f.batteryWarrantyYrs),
  workmanshipYrs: f.workmanshipYrs === null ? '' : String(f.workmanshipYrs), heatedModule: f.heatedModule, backupIncluded: f.backupIncluded,
  mounting: f.mounting, monitoringApp: f.monitoringApp, price: f.price === null ? '' : String(f.price), financeExample: f.financeExample,
  description: f.description, claims: f.claims, active: f.active, displayOrder: String(f.displayOrder),
});

export function PackagesManager({ packages, extras, actions, onChanged, canEdit }: {
  packages: PackageRow[]; extras: ExtraAdminRow[]; actions: PackageActions; onChanged: () => void; canEdit: boolean;
}) {
  const forms = packages.map(rowToForm).sort(bySize);
  const warnings = bandWarnings(forms);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (f: PackageForm) => { setDraft(toDraft(f)); setErrors({}); setMessage(null); window.scrollTo?.({ top: 0, behavior: 'smooth' }); };
  const set = (k: string) => (e: { target: { value: string } }) => setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));
  const flag = (k: string) => (v: boolean) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const missing = draft ? REQUIRED_FOR_ACTIVE.filter(({ key }) => String(draft[key] ?? '').trim() === '').map((r) => r.label) : [];

  async function save() {
    if (!draft) return;
    setBusy(true); setErrors({}); setMessage(null);
    const r = await actions.save(draft);
    setBusy(false);
    if (r.ok) { setDraft(null); onChanged(); return; }
    setErrors(r.errors ?? {});
    setMessage(r.message ?? 'Fix the highlighted fields and save again.');
  }
  async function act(fn: () => Promise<ActionResult>) {
    const r = await fn();
    if (!r.ok) setMessage(r.message ?? 'That didn’t work.');
    else onChanged();
  }

  return (
    <>
      <div className="pva-head">
        <div>
          <h1>Packages</h1>
          <p>Each package is a kit and a price. A roof is offered the largest package whose panel count it can reach.</p>
        </div>
        {canEdit ? <button type="button" className="crm-btn crm-btn--solar" onClick={() => open({ ...EMPTY_PACKAGE, displayOrder: forms.length + 1 })}>Add package</button> : null}
      </div>

      {!canEdit ? <div className="pva-alert" style={{ marginBottom: 16 }}>You can see packages here, but only ProspectPV admins can change them.</div> : null}
      {warnings.length ? <div className="pva-alert" style={{ marginBottom: 16 }}><strong>Check the panel counts.</strong><ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul></div> : null}
      {message && !draft ? <div className="pva-alert pva-alert--err" style={{ marginBottom: 16 }} role="alert">{message}</div> : null}

      {draft ? (
        <form className="pva-card pva-editor" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate aria-label={draft.id ? 'Edit package' : 'New package'}>
          <h2>{draft.id ? `Edit ${String(draft.name) || 'package'}` : 'New package'}</h2>
          <div className="pva-form" style={{ marginTop: 14 }}>
            <fieldset className="pva-fs">
              <legend>The kit</legend>
              <div className="pva-grid pva-grid--3">
                <Field label="Package name" error={errors.name}><input type="text" value={String(draft.name)} onChange={set('name')} aria-invalid={!!errors.name} placeholder="Home" /></Field>
                <Field label="Number of panels, from" error={errors.minPanels} help="The smallest roof it suits."><input type="number" min={1} value={String(draft.minPanels)} onChange={set('minPanels')} aria-invalid={!!errors.minPanels} /></Field>
                <Field label="Number of panels, up to" error={errors.maxPanels} help="Leave blank for no upper limit."><input type="number" min={1} value={String(draft.maxPanels)} onChange={set('maxPanels')} aria-invalid={!!errors.maxPanels} /></Field>
                <Field label="Panel model" error={errors.panelModel}><input type="text" value={String(draft.panelModel)} onChange={set('panelModel')} placeholder="Aiko Neostar 2P" /></Field>
                <Field label="Panel watts" unit="W" error={errors.panelWatts}><input type="number" value={String(draft.panelWatts)} onChange={set('panelWatts')} aria-invalid={!!errors.panelWatts} /></Field>
                <Field label="Panel warranty" unit="years" error={errors.panelWarrantyYrs}><input type="number" value={String(draft.panelWarrantyYrs)} onChange={set('panelWarrantyYrs')} aria-invalid={!!errors.panelWarrantyYrs} /></Field>
                <Field label="Inverter" error={errors.inverterModel} help="For example GW5K-ESA."><input type="text" value={String(draft.inverterModel)} onChange={set('inverterModel')} /></Field>
                <Field label="Battery storage" unit="kWh" error={errors.batteryKwh} help="Usable capacity."><input type="number" step="0.1" value={String(draft.batteryKwh)} onChange={set('batteryKwh')} aria-invalid={!!errors.batteryKwh} /></Field>
                <Field label="Price, fully installed" unit="£ inc. VAT" error={errors.price} help="Includes scaffolding."><input type="text" inputMode="decimal" value={String(draft.price)} onChange={set('price')} aria-invalid={!!errors.price} /></Field>
              </div>
            </fieldset>

            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 700, minHeight: 32 }}>More details printed on the letter</summary>
              <div className="pva-form" style={{ marginTop: 14 }}>
                <div className="pva-grid pva-grid--3">
                  <Field label="Battery warranty" unit="years" error={errors.batteryWarrantyYrs}><input type="number" value={String(draft.batteryWarrantyYrs)} onChange={set('batteryWarrantyYrs')} /></Field>
                  <Field label="Workmanship warranty" unit="years" error={errors.workmanshipYrs}><input type="number" value={String(draft.workmanshipYrs)} onChange={set('workmanshipYrs')} /></Field>
                  <Field label="Monitoring app" error={errors.monitoringApp}><input type="text" value={String(draft.monitoringApp)} onChange={set('monitoringApp')} placeholder="SEMS+" /></Field>
                  <Field label="Battery module" error={errors.batteryModuleModel}><input type="text" value={String(draft.batteryModuleModel)} onChange={set('batteryModuleModel')} /></Field>
                  <Field label="Number of modules" error={errors.batteryModuleCount}><input type="number" value={String(draft.batteryModuleCount)} onChange={set('batteryModuleCount')} /></Field>
                  <Field label="Mounting"><input type="text" value={String(draft.mounting)} onChange={set('mounting')} placeholder="In-roof black frame mounting" /></Field>
                </div>
                <div className="pva-grid">
                  <Toggle label="Heated battery module" help="Lets the letter say “Winter-ready”." checked={!!draft.heatedModule} onChange={flag('heatedModule')} />
                  <Toggle label="Backup power included" help="Lets the letter say “Backup power”. Otherwise it’s sold as an extra." checked={!!draft.backupIncluded} onChange={flag('backupIncluded')} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Benefits to show on the letter</div>
                  <div className="pva-checks">
                    {CLAIM_ORDER.map((k) => {
                      const unavailable = (k === 'heating' && !draft.heatedModule) || (k === 'backup' && !draft.backupIncluded);
                      return (
                        <label key={k} title={unavailable ? 'Needs the matching option above' : undefined} style={unavailable ? { opacity: 0.5 } : undefined}>
                          <input type="checkbox" checked={(draft.claims as string[]).includes(k)} onChange={(e) => setDraft((d) => d && ({ ...d, claims: e.target.checked ? [...(d.claims as string[]), k] : (d.claims as string[]).filter((x) => x !== k) }))} />
                          {BENEFITS[k].title}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <Field label="One line about this package" error={errors.description}><input type="text" value={String(draft.description)} onChange={set('description')} placeholder="Solar and a 10 kWh battery for a typical family home." /></Field>
                <Field label="Finance example (from the lender)" error={errors.financeExample} help="Only shown once finance is switched on in Settings. Must be the lender-approved wording."><textarea value={String(draft.financeExample)} onChange={set('financeExample')} /></Field>
              </div>
            </details>

            <Toggle label="Switch on" help={missing.length ? `Still needed first: ${missing.join(', ')}.` : 'Letters can be created with this package.'} checked={!!draft.active && missing.length === 0} disabled={missing.length > 0} onChange={flag('active')} />
            {errors.active ? <div className="pva-err" role="alert">{errors.active}</div> : null}
            {message ? <div className="pva-alert pva-alert--err" role="alert">{message}</div> : null}
            <div className="pva-actions">
              <button type="submit" className="crm-btn crm-btn--solar" disabled={busy}>{busy ? 'Saving…' : 'Save package'}</button>
              <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </div>
        </form>
      ) : null}

      {forms.length === 0 && !draft ? (
        <div className="pva-empty"><h2>No packages yet</h2><p>Add your first package: the panels, inverter and battery, with a price.</p></div>
      ) : (
        <div className="pva-pkgs">
          {forms.map((p) => {
            const miss = REQUIRED_FOR_ACTIVE.filter(({ key }) => { const v = p[key]; return v === null || v === ''; });
            return (
              <article key={p.id} className={`pva-pkg ${p.active ? '' : 'pva-pkg--off'}`}>
                <div className="pva-pkg-head">
                  <div><h3>{p.name}</h3><div className="band">{bandLabel(p)}</div></div>
                  {p.active ? <span className="pva-chip pva-chip--live">Live</span> : miss.length ? <span className="pva-chip pva-chip--warn">Incomplete</span> : <span className="pva-chip">Off</span>}
                </div>
                <ul className="pva-kit">
                  <li><span>Panels</span><span>{p.panelModel ? `${p.panelModel}${p.panelWatts ? `, ${p.panelWatts} W` : ''}` : <em className="pva-muted">not set</em>}</span></li>
                  <li><span>Panel warranty</span><span>{p.panelWarrantyYrs !== null ? `${p.panelWarrantyYrs} years` : <em className="pva-muted">not set</em>}</span></li>
                  <li><span>Inverter</span><span>{p.inverterModel || <em className="pva-muted">not set</em>}</span></li>
                  <li><span>Battery</span><span>{p.batteryKwh !== null ? `${p.batteryKwh} kWh` : <em className="pva-muted">not set</em>}</span></li>
                </ul>
                {!p.active && miss.length ? <p className="pva-note">Needs: {miss.map((m) => m.label).join(', ')}.</p> : null}
                <div className="pva-pkg-foot">
                  <div className="pva-price">{p.price !== null ? `£${money(p.price)}` : <span className="pva-muted">No price</span>}</div>
                  {canEdit ? (
                    <div className="pva-actions">
                      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => open(p)}>Edit</button>
                      <button type="button" className="crm-btn crm-btn--small crm-btn--ghost" onClick={() => void act(() => actions.duplicate(p.id!))}>Duplicate</button>
                      <button type="button" className="crm-btn crm-btn--small crm-btn--ghost pv-danger" onClick={() => { if (window.confirm(`Delete ${p.name}? This can’t be undone.`)) void act(() => actions.remove(p.id!)); }}>Delete</button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section className="pva-card" style={{ marginTop: 24 }} aria-labelledby="extras-h">
        <h2 id="extras-h">Extras</h2>
        <p className="pva-blurb">Optional add-ons customers can tick on their landing page. An extra only shows once it has a price and is switched on.</p>
        {extras.map((x) => <ExtraRow key={x.id} extra={x} save={actions.saveExtra} onChanged={onChanged} canEdit={canEdit} />)}
      </section>
    </>
  );
}

function ExtraRow({ extra, save, onChanged, canEdit }: { extra: ExtraAdminRow; save: PackageActions['saveExtra']; onChanged: () => void; canEdit: boolean }) {
  const [name, setName] = useState(extra.name);
  const [description, setDescription] = useState(extra.description ?? '');
  const [price, setPrice] = useState(extra.price === null ? '' : String(extra.price));
  const [active, setActive] = useState(extra.active);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirty = name !== extra.name || description !== (extra.description ?? '') || price !== (extra.price === null ? '' : String(extra.price)) || active !== extra.active;
  return (
    <div className="pva-xrow">
      <Field label="Name" error={errors.name}><input type="text" value={name} disabled={!canEdit} onChange={(e) => { setName(e.target.value); setState('idle'); }} /></Field>
      <Field label="Description"><input type="text" value={description} disabled={!canEdit} onChange={(e) => { setDescription(e.target.value); setState('idle'); }} /></Field>
      <Field label="Price" unit="£" error={errors.price}><input type="text" inputMode="decimal" value={price} disabled={!canEdit} onChange={(e) => { setPrice(e.target.value); setState('idle'); }} aria-invalid={!!errors.price} /></Field>
      <div style={{ paddingTop: 26 }}><Toggle label="On" checked={active} disabled={!canEdit} onChange={(v) => { setActive(v); setState('idle'); }} /></div>
      <div style={{ paddingTop: 22 }}>
        {canEdit ? (
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!dirty || state === 'saving'} onClick={async () => {
            setState('saving'); setErrors({});
            const r = await save({ id: extra.id, name, description, price: price === '' ? null : price, active });
            if (r.ok) { setState('saved'); onChanged(); } else { setErrors(r.errors ?? { price: r.message ?? 'Couldn’t save.' }); setState('idle'); }
          }}>{state === 'saving' ? 'Saving…' : state === 'saved' && !dirty ? 'Saved ✓' : 'Save'}</button>
        ) : null}
      </div>
    </div>
  );
}
