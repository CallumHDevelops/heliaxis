'use client';
/** Settings: brand images first (so letters and pages can use them), then each group of settings. */
import { useState } from 'react';
import { ASSET_SLOTS, type ActionResult } from '@/lib/prospectpv/server/actionTypes';
import { fieldId, readSection, SETTINGS_SECTIONS, type FieldDef, type FormValues, type SectionDef } from '@/lib/prospectpv/settingsSchema';
import { Field, Toggle } from './ui';
import { FileButton } from '@/app/admin/crm/CrmUi';

export type SettingsActions = {
  saveSection: (sectionId: string, raw: Record<string, unknown>) => Promise<ActionResult>;
  upload: (fd: FormData) => Promise<ActionResult<{ url: string }>>;
  remove: (slot: string) => Promise<ActionResult>;
};

export function SettingsPanels({ rawSettings, assetUrls, actions, onChanged, canEdit }: {
  rawSettings: Record<string, unknown>; assetUrls: Record<string, string | null>; actions: SettingsActions; onChanged: () => void; canEdit: boolean;
}) {
  return (
    <>
      <div className="pva-head">
        <div><h1>Settings</h1><p>Everything letters and landing pages draw on. Items left blank are simply not shown, and anything letters need is flagged when you create one.</p></div>
      </div>
      {!canEdit ? <div className="pva-alert" style={{ marginBottom: 16 }}>You can see settings here, but only ProspectPV admins can change them.</div> : null}
      <div className="pva-sections">
        <section className="pva-card pva-section" id="images" aria-labelledby="images-h">
          <h2 id="images-h">Brand images</h2>
          <p className="pva-blurb">Upload once and they appear on every letter and landing page, including letters you’ve already made. PNG, JPG or WebP, up to 3 MB. For print, use images at least 600 px wide.</p>
          <div className="pva-assets">
            {ASSET_SLOTS.map((s) => <AssetCard key={s.slot} slot={s.slot} label={s.label} help={s.help} url={assetUrls[s.slot] ?? null} actions={actions} onChanged={onChanged} canEdit={canEdit} />)}
          </div>
        </section>
        {SETTINGS_SECTIONS.map((s) => <SectionForm key={s.id} section={s} raw={rawSettings} actions={actions} onChanged={onChanged} canEdit={canEdit} />)}
      </div>
    </>
  );
}

function AssetCard({ slot, label, help, url, actions, onChanged, canEdit }: { slot: string; label: string; help: string; url: string | null; actions: SettingsActions; onChanged: () => void; canEdit: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(url);
  const dark = slot === 'logo_white';
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.set('slot', slot); fd.set('file', file);
    const r = await actions.upload(fd);
    setBusy(false);
    if (r.ok) { setShown(r.url); onChanged(); } else setMsg(r.message ?? 'Couldn’t upload.');
  }
  return (
    <div className="pva-asset">
      <h3>{label}</h3>
      <div className={`pva-thumb ${dark ? 'pva-thumb--dark' : ''}`}>{shown ? <img src={shown} alt={`${label}, current`} /> : <span style={dark ? { color: 'var(--muted-d)' } : undefined}>Not uploaded</span>}</div>
      <p className="pva-note" style={{ margin: 0 }}>{help}</p>
      {msg ? <div className="pva-err" role="alert">{msg}</div> : null}
      {canEdit ? (
        <div className="pva-actions">
          <FileButton label={busy ? 'Uploading…' : shown ? 'Replace' : 'Upload'} accept="image/png,image/jpeg,image/webp" busy={busy} onFiles={(files) => void pick(files[0])} />
          {shown ? <button type="button" className="crm-btn crm-btn--small crm-btn--ghost" disabled={busy} onClick={async () => { setBusy(true); const r = await actions.remove(slot); setBusy(false); if (r.ok) { setShown(null); onChanged(); } else setMsg(r.message ?? 'Couldn’t remove.'); }}>Remove</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function SectionForm({ section, raw, actions, onChanged, canEdit }: { section: SectionDef; raw: Record<string, unknown>; actions: SettingsActions; onChanged: () => void; canEdit: boolean }) {
  const initial = readSection(section, raw);
  const [v, setV] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const set = (id: string, val: string | boolean) => { setV((s) => ({ ...s, [id]: val })); setState('idle'); };

  async function save() {
    setState('saving'); setErrors({}); setMessage(null);
    const r = await actions.saveSection(section.id, v);
    if (r.ok) { setState('saved'); onChanged(); return; }
    setState('idle'); setErrors(r.errors ?? {}); setMessage(r.message ?? 'Fix the highlighted fields and save again.');
  }

  const render = (fd: FieldDef) => {
    const id = fieldId(fd);
    const err = errors[id];
    if (fd.type === 'bool') return <div key={id}><Toggle label={fd.label} help={fd.help} checked={v[id] === true} disabled={!canEdit} onChange={(c) => set(id, c)} />{err ? <div className="pva-err" role="alert">{err}</div> : null}</div>;
    const common = { 'aria-invalid': !!err, disabled: !canEdit } as const;
    return (
      <Field key={id} label={fd.label} help={fd.help} error={err} unit={fd.type === 'number' ? fd.unit : undefined} className={fd.type === 'longtext' ? 'pva-span2' : ''}>
        {fd.type === 'longtext' ? <textarea {...common} value={String(v[id])} onChange={(e) => set(id, e.target.value)} />
          : fd.type === 'select' ? <select {...common} value={String(v[id])} onChange={(e) => set(id, e.target.value)}>{fd.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          : <input {...common} type={fd.type === 'number' ? 'number' : 'text'} step={fd.step} min={fd.min} max={fd.max} value={String(v[id])} placeholder={fd.placeholder} onChange={(e) => set(id, e.target.value)} />}
      </Field>
    );
  };

  return (
    <section className="pva-card pva-section" id={section.id} aria-labelledby={`${section.id}-h`}>
      <h2 id={`${section.id}-h`}>{section.title}</h2>
      <p className="pva-blurb">{section.blurb}</p>
      <form className="pva-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <div className="pva-grid pva-grid--3">{section.fields.map(render)}</div>
        {message ? <div className="pva-alert pva-alert--err" role="alert">{message}</div> : null}
        {canEdit ? (
          <div className="pva-actions">
            <button type="submit" className="crm-btn crm-btn--solar" disabled={!dirty || state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save'}</button>
            {state === 'saved' && !dirty ? <span className="pva-ok">Saved ✓</span> : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
