'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DraftKey, HandoverSettings as Settings, ScheduleRow } from '@/lib/handover/settings-shared';
import './handover-settings.css';

/**
 * CRM settings → Handover pack (SPEC D14, 4.6): the owner's own words and numbers the pack prints
 * (the warranty, the next-inspection default, the maintenance agreement and rows), the plain drafts
 * he approves once (cover letter, completion record, switching-off page), and the product library:
 * each manual or datasheet's kind and models, and the gaps on jobs still to be installed. Hidden
 * until handover.sql has run.
 */

type Draft = { version: string; title: string; text: string };
type Gap = { model: string; jobs: { id: string; ref: string | null }[] };
type Lib = { id: string; name: string; kind: string | null; models?: string[] | null; handover_slot?: string | null; every_pack?: boolean | null; archived_at?: string | null };

const readAll = (): Promise<[Record<string, unknown>, Record<string, unknown>]> =>
  Promise.all([fetch('/api/crm/settings/handover', { cache: 'no-store' }).then((r) => r.json()), fetch('/api/crm/library', { cache: 'no-store' }).then((r) => r.json())]);

export function HandoverSettings({ isAdmin }: { isAdmin: boolean }) {
  const [s, setS] = useState<Settings | null>(null);
  const [drafts, setDrafts] = useState<Record<DraftKey, Draft> | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [ready, setReady] = useState(false);
  const [lib, setLib] = useState<Lib[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = useCallback(([h, l]: [Record<string, unknown>, Record<string, unknown>]) => {
    setS(h.settings as Settings);
    setDrafts(h.drafts as Record<DraftKey, Draft>);
    setGaps((h.gaps ?? []) as Gap[]);
    setReady(!!h.ready);
    setLib((l.items ?? []) as Lib[]);
  }, []);
  const load = useCallback(async () => apply(await readAll()), [apply]);
  useEffect(() => {
    let live = true;
    readAll()
      .then((d) => live && apply(d))
      .catch(() => live && setErr('Couldn’t load the handover settings.'));
    return () => {
      live = false;
    };
  }, [apply]);

  async function put(body: Record<string, unknown>, done = 'Saved ✓') {
    setBusy(true);
    setErr('');
    const r = await fetch('/api/crm/settings/handover', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Not saved');
    setS(d.settings);
    setMsg(done);
  }
  async function patchLib(id: string, body: Record<string, unknown>) {
    const r = await fetch(`/api/crm/library/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || 'Not saved');
    await load();
  }
  if (!s || !drafts || !ready) return null;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setMsg('');
    setS((cur) => (cur ? { ...cur, [k]: v } : cur));
  };
  const row = (i: number, p: Partial<ScheduleRow>) => set('scheduleRows', s.scheduleRows.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <>
      <section className="crm-set" id="handover">
        <h2>Handover pack</h2>
        <p className="crm-muted crm-small">Your own words and numbers for the customer’s handover pack. Nothing here is filled in for you: until it’s set, that document isn’t made.</p>
        <fieldset disabled={!isAdmin || busy} className="crm-fieldset">
          <h3 className="hs-subhead">Workmanship warranty (HX-HO-06)</h3>
          <div className="crm-grid2">
            <div>
              <label className="crm-label" htmlFor="hs-years">
                Term (years)
              </label>
              <input id="hs-years" className="crm-input" inputMode="numeric" value={s.warrantyYears ?? ''} onChange={(e) => set('warrantyYears', e.target.value ? Number(e.target.value) || null : null)} />
            </div>
            <div>
              <label className="crm-label" htmlFor="hs-start">
                Starts from
              </label>
              <select id="hs-start" className="crm-input" value={s.warrantyStart} onChange={(e) => set('warrantyStart', e.target.value as Settings['warrantyStart'])}>
                <option value="">Choose…</option>
                <option value="commissioning">The day it’s switched on</option>
                <option value="handover">The day the pack goes</option>
              </select>
            </div>
          </div>
          <label className="crm-label" htmlFor="hs-wtext">
            What’s covered, what isn’t, and how to claim
          </label>
          <textarea id="hs-wtext" className="crm-input" rows={6} value={s.warrantyText} onChange={(e) => set('warrantyText', e.target.value)} placeholder="Your warranty wording. A blank line starts a new paragraph." />

          <h3 className="hs-subhead">Next inspection, when the electrical certificate doesn’t say</h3>
          <label className="crm-label" htmlFor="hs-next">
            Years, when the electrical certificate doesn’t say
          </label>
          <input id="hs-next" className="crm-input crm-narrow" inputMode="numeric" value={s.nextInspectionYears ?? ''} onChange={(e) => set('nextInspectionYears', e.target.value ? Number(e.target.value) || null : null)} />

          <h3 className="hs-subhead">Maintenance plan (HX-HO-12)</h3>
          <textarea className="crm-input" rows={5} value={s.maintenanceText} onChange={(e) => set('maintenanceText', e.target.value)} placeholder="Your plan wording. The plan’s details are typed per job, exactly as quoted." aria-label="Maintenance plan wording" />

          <h3 className="hs-subhead">Your maintenance rows</h3>
          <p className="crm-muted crm-small">Added to every schedule, with Heliaxis as the source. Intervals for products come from the product library.</p>
          {s.scheduleRows.map((r, i) => (
            <div key={i} className="crm-grid2 hs-row">
              <input className="crm-input" value={r.item} onChange={(e) => row(i, { item: e.target.value })} placeholder="Item, e.g. Bird mesh" aria-label="Item" />
              <input className="crm-input" value={r.check} onChange={(e) => row(i, { check: e.target.value })} placeholder="What to check" aria-label="What to check" />
              <input className="crm-input" value={r.who} onChange={(e) => row(i, { who: e.target.value })} placeholder="Who" aria-label="Who" />
              <input className="crm-input" value={r.often} onChange={(e) => row(i, { often: e.target.value })} placeholder="How often" aria-label="How often" />
            </div>
          ))}
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => set('scheduleRows', [...s.scheduleRows, { item: '', check: '', who: '', often: '' }])}>
            + Add a row
          </button>

          <label className="crm-check">
            <input type="checkbox" checked={s.tellOnUpload} onChange={(e) => set('tellOnUpload', e.target.checked)} /> Tick “Tell the customer” by default when uploading into their pack
          </label>
          <div className="crm-savebar">
            <button type="button" className="crm-btn crm-btn--solar" onClick={() => void put(s)}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            {msg && <span className="crm-muted">{msg}</span>}
          </div>
        </fieldset>
        {err && <p className="crm-banner crm-banner--err">{err}</p>}

        <h3 className="hs-subhead">Wording to approve</h3>
        <p className="crm-muted crm-small">Plain drafts for you to check once. Each is only used after you’ve approved it.</p>
        {(Object.keys(drafts) as DraftKey[]).map((k) => {
          const a = s.approved[k];
          const ok = a?.version === drafts[k].version;
          return (
            <details key={k} className="hs-draft" open={!ok}>
              <summary>
                <b>{drafts[k].title}</b> <span className={ok ? 'hs-ok' : 'hs-todo'}>{ok ? `Approved${a?.by ? ` by ${a.by}` : ''}` : 'Not approved yet'}</span>
              </summary>
              <pre>{drafts[k].text}</pre>
              {isAdmin && (
                <button type="button" className={`crm-btn ${ok ? 'crm-btn--ghost' : 'crm-btn--solar'} crm-btn--small`} disabled={busy} onClick={() => void put(ok ? { unapprove: k } : { approve: k }, ok ? 'Approval taken back.' : 'Approved ✓')}>
                  {ok ? 'Take approval back' : 'Approve this wording'}
                </button>
              )}
            </details>
          );
        })}
      </section>

      <section className="crm-set">
        <h2>Product library</h2>
        <p className="crm-muted crm-small">
          Upload a manual, datasheet or start-up and shutdown procedure once (Document library, below), then say which models it’s for: every job with that model gets it in its handover pack.
        </p>
        {gaps.length > 0 && (
          <div className="hs-gaps">
            <b>Gaps on jobs still to be installed</b>
            <ul>
              {gaps.map((g) => (
                <li key={g.model}>
                  {g.model} <small>· {g.jobs.map((j) => j.ref ?? 'a job').join(', ')}</small>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="crm-plainlist hs-lib">
          {lib
            .filter((d) => !d.archived_at)
            .map((d) => (
              <li key={d.id}>
                <div>
                  <b>{d.name}</b>
                  <div className="hs-libfields">
                    <select className="crm-input" value={d.kind ?? ''} disabled={!isAdmin} onChange={(e) => void patchLib(d.id, { kind: e.target.value || null, handover_slot: e.target.value === 'procedure' ? 'HX-HO-09' : e.target.value === 'guide' ? 'HX-HO-19' : e.target.value ? 'HX-HO-17' : null })} aria-label="Kind">
                      <option value="">Not for packs</option>
                      <option value="manual">Manual</option>
                      <option value="datasheet">Datasheet</option>
                      <option value="warranty">Warranty</option>
                      <option value="procedure">Start-up and shutdown</option>
                      <option value="guide">Guide</option>
                    </select>
                    <input
                      className="crm-input"
                      defaultValue={(d.models ?? []).join('; ')}
                      disabled={!isAdmin}
                      placeholder="Models it’s for (separate with ;)"
                      aria-label="Models"
                      onBlur={(e) => e.target.value !== (d.models ?? []).join('; ') && void patchLib(d.id, { models: e.target.value.split(';') })}
                    />
                    <label className="crm-check" style={{ margin: 0 }}>
                      <input type="checkbox" checked={!!d.every_pack} disabled={!isAdmin} onChange={(e) => void patchLib(d.id, { every_pack: e.target.checked, ...(e.target.checked && !d.kind ? { kind: 'guide', handover_slot: 'HX-HO-19' } : {}) })} /> In every pack
                    </label>
                  </div>
                </div>
              </li>
            ))}
          {!lib.length && <li className="crm-muted">Nothing in the library yet.</li>}
        </ul>
      </section>
    </>
  );
}
