'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AssignPicker, type Picked } from '@/components/admin/AssignPicker';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { boardKey, circuitKey, INSTRUMENTS } from '@/lib/site/forms/electrician/eic-model';
import type { EicView, FieldView } from '@/lib/eic-manual/server';
import '../../crm/crm.css';
import { EicBoards } from '../Boards';
import { Control } from '../Controls';
import '../eic-manual.css';

type Patch = { set?: Record<string, unknown>; unset?: string[]; [k: string]: unknown };

/**
 * One EIC certificate, made by hand: the certificate's own questions in the model form's order, the boards and circuits, the signatures, and
 * the PDF. Everything is saved a moment after it is typed; what is still needed is listed, and it can't be issued until nothing is.
 */
export function EicEditor({ id, admin }: { id: string; admin: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<EicView | null>(null);
  const [err, setErr] = useState('');
  const [step, setStep] = useState('');
  const [saving, setSaving] = useState<'' | 'saving' | 'saved'>('');
  const [busy, setBusy] = useState('');
  const [picking, setPicking] = useState(false);
  const [local, setLocal] = useState<Record<string, unknown>>({});
  const pending = useRef<{ set: Record<string, unknown>; unset: string[] }>({ set: {}, unset: [] });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const take = useCallback((d: EicView) => {
    setView(d);
    setStep((s) => (s && d.steps.some((x) => x.key === s) ? s : d.steps[0]?.key ?? ''));
  }, []);
  useEffect(() => {
    void fetch(`/api/crm/eic/${id}`, { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => (ok ? take(d as EicView) : setErr(d.error || 'Couldn’t open the certificate.')));
  }, [id, take]);

  /** One request after another, so two quick edits never arrive out of order. */
  const patch = useCallback(
    (body: Patch): Promise<boolean> => {
      const run = chain.current.then(async () => {
        setSaving('saving');
        const r = await fetch(`/api/crm/eic/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
        const d = r ? await r.json().catch(() => ({})) : {};
        if (!r || !r.ok) {
          setSaving('');
          setErr(d.error || 'Couldn’t save. Check your connection; what you typed is still on this page.');
          return false;
        }
        setErr('');
        take(d as EicView);
        // What was typed while that was saving stays as typed.
        setLocal((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k in pending.current.set || pending.current.unset.includes(k))));
        setSaving('saved');
        return true;
      });
      chain.current = run.catch(() => null);
      return run;
    },
    [id, take]
  );
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!Object.keys(p.set).length && !p.unset.length) return;
    pending.current = { set: {}, unset: [] };
    await patch(p);
  }, [patch]);
  const change = useCallback(
    (key: string, v: unknown) => {
      if (v === undefined) {
        delete pending.current.set[key];
        pending.current.unset = [...new Set([...pending.current.unset, key])];
      } else {
        pending.current.unset = pending.current.unset.filter((k) => k !== key);
        pending.current.set[key] = v;
      }
      setLocal((l) => ({ ...l, [key]: v }));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 600);
    },
    [flush]
  );
  /** A change that must be on the server before the page goes on (a board added). */
  const send = useCallback(
    async (p: { set?: Record<string, unknown>; unset?: string[] }) => {
      await flush();
      await patch(p);
    },
    [flush, patch]
  );
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  const locked = view?.status === 'issued';
  const boards = useMemo(() => {
    if (!view?.boards) return null;
    const over = (key: string, rec: Record<string, unknown>, rid: string) => (key in local && local[key] && typeof local[key] === 'object' ? { ...(local[key] as Record<string, unknown>), id: rid } : rec);
    return {
      ...view.boards,
      boards: view.boards.boards.map((b) => ({ ...b, rec: over(boardKey(b.id), b.rec, b.id), circuits: b.circuits.map((c) => ({ ...c, rec: over(circuitKey(c.id), c.rec, c.id) })) })),
    };
  }, [view, local]);
  const valueOf = (f: FieldView) => (f.key in local ? local[f.key] : f.value);

  async function post(path: string, body: unknown) {
    const r = await fetch(`/api/crm/eic/${id}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'That didn’t work.');
    take(d as EicView);
  }
  async function act(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setErr('');
    try {
      await flush();
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That didn’t work.');
    } finally {
      setBusy('');
    }
  }
  const sign = (slot: string, dataUrl: string) => act('sign', () => post('sign', { slot, dataUrl }));
  const unsign = (slot: string) =>
    act('sign', async () => {
      const r = await fetch(`/api/crm/eic/${id}/sign?slot=${slot}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Couldn’t take it off.');
      take(d as EicView);
    });
  const pick = (f: Picked) => void patch({ enquiry_id: f.enquiry_id, project_id: f.project_id }).then(() => setPicking(false));
  async function remove() {
    if (!view || !window.confirm(`Delete ${view.number}? This can’t be undone.`)) return;
    const r = await fetch(`/api/crm/eic/${id}`, { method: 'DELETE' });
    if (r.ok) router.push('/admin/eic');
    else setErr((await r.json().catch(() => ({}))).error || 'Couldn’t delete it.');
  }

  if (!view) return <div className="em-page">{err ? <p className="crm-banner crm-banner--err">{err}</p> : <p className="crm-muted">Opening…</p>}</div>;
  const cur = view.steps.find((s) => s.key === step) ?? view.steps[0];
  const stillNeeded = view.missing.length + (view.designNeeded && !view.sigs.eic_design ? 1 : 0);

  const sigBox = (slot: string, label: string) => (
    <div className="em-sig">
      <b>{label}</b>
      {view.sigs[slot] ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view.sigs[slot]!} alt={`${label}, signed`} />
          {!locked && (
            <button type="button" className="crm-link" disabled={busy === 'sign'} onClick={() => void unsign(slot)}>
              Sign again
            </button>
          )}
        </>
      ) : locked ? (
        <small>Not signed.</small>
      ) : (
        <SignPad busy={busy === 'sign'} onSave={(u) => void sign(slot, u)} />
      )}
    </div>
  );

  const widget = (f: FieldView) => {
    switch (f.widget) {
      case 'eic-boards':
        return boards ? <EicBoards data={boards} change={change} send={send} locked={!!locked} /> : null;
      case 'eic-sources': {
        const list = Array.isArray(valueOf(f)) ? (valueOf(f) as string[]) : [];
        return (
          <div className="em-sources">
            {list.map((x, i) => (
              <div key={i} className="em-source">
                <input className="crm-input" value={x} disabled={locked} aria-label={`Other source ${i + 1}`} onChange={(e) => change(f.key, list.map((y, j) => (j === i ? e.target.value : y)))} />
                {!locked && (
                  <button type="button" className="crm-link" onClick={() => change(f.key, list.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {!locked && (
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => change(f.key, [...list, ''])}>
                + Add a source
              </button>
            )}
          </div>
        );
      }
      case 'eic-instruments': {
        const o = (valueOf(f) && typeof valueOf(f) === 'object' ? valueOf(f) : {}) as Record<string, string>;
        return (
          <div className="em-props">
            {INSTRUMENTS.map((i) => (
              <div key={i.k} className="em-prop">
                <label>{i.label}</label>
                <input className="crm-input" value={o[i.k] ?? ''} disabled={locked} placeholder="Serial or asset number" onChange={(e) => change(f.key, { ...o, [i.k]: e.target.value })} />
              </div>
            ))}
          </div>
        );
      }
      case 'eic-sign':
        return sigBox(f.key, f.label);
      default:
        return null;
    }
  };

  const design = (view.design ?? {}) as Partial<NonNullable<EicView['design']>>;
  const setDesign = (k: string, v: unknown) => change('eic_design', { name: '', company: '', address: '', postcode: '', tel: '', next_n: 5, next_unit: 'years', departures: null, signed_at: new Date().toISOString(), path: 'manual', by: null, ...design, ...(local.eic_design as object | undefined), [k]: v });
  const dv = { ...design, ...((local.eic_design as object | undefined) ?? {}) } as Partial<NonNullable<EicView['design']>>;

  return (
    <div className="em-page">
      <div className="em-top">
        <Link href="/admin/eic" className="em-back">
          ← EIC certificates
        </Link>
        <h1>
          {view.number}
          {view.title ? ` · ${view.title}` : ''}
        </h1>
        <span className={`em-status em-status--${view.status}`}>{view.status === 'issued' ? `Issued ${view.issued_on ?? ''}` : 'Draft'}</span>
        <span className="em-grow" />
        <span className="em-saved" role="status">
          {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : ''}
        </span>
        <a className="crm-btn crm-btn--ghost crm-btn--small" href={`/api/crm/eic/${id}/pdf?inline=1`} target="_blank" rel="noreferrer" onClick={() => void flush()}>
          Preview PDF
        </a>
        <a className="crm-btn crm-btn--ghost crm-btn--small" href={`/api/crm/eic/${id}/pdf`}>
          Download PDF
        </a>
        {view.status === 'draft' ? (
          <button
            type="button"
            className="crm-btn crm-btn--solar crm-btn--small"
            disabled={!view.complete || busy === 'issue'}
            title={view.complete ? 'Make it final, date it and file it in the job’s Docs' : 'Finish what is still needed first'}
            onClick={() => window.confirm(`Issue ${view.number}? It will be dated today${view.project ? ' and filed in the job’s Docs' : ''}, and locked.`) && void act('issue', () => post('issue', { action: 'issue' }))}
          >
            {busy === 'issue' ? 'Issuing…' : 'Issue certificate'}
          </button>
        ) : (
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy === 'reopen'} onClick={() => void act('reopen', () => post('issue', { action: 'reopen' }))}>
            Reopen to edit
          </button>
        )}
      </div>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}

      <div className="em-split">
        <aside className="em-side">
          <div className="em-card">
            <div className="em-lab">Assigned to</div>
            <div className="em-who">
              <small>Customer</small>
              <b>{view.customer?.name ?? 'No customer'}</b>
            </div>
            <div className="em-who">
              <small>Job</small>
              <b>{view.project ? `${view.project.ref ? `${view.project.ref} · ` : ''}${view.project.title ?? ''}` : 'No job'}</b>
            </div>
            {!locked && (
              <div className="em-tools">
                <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setPicking((p) => !p)}>
                  {view.customer || view.project ? 'Change' : 'Assign to a customer or job'}
                </button>
                {view.project && (
                  <button type="button" className="crm-link" onClick={() => void patch({ project_id: null })}>
                    Clear job
                  </button>
                )}
                {(view.customer || view.project) && (
                  <button type="button" className="crm-link" onClick={() => void patch({ enquiry_id: null, project_id: null })}>
                    Clear all
                  </button>
                )}
              </div>
            )}
            {picking && <AssignPicker onPick={pick} />}
            <label className="em-lab" htmlFor="em-addr">
              Installation address
            </label>
            <input id="em-addr" className="crm-input" disabled={locked} defaultValue={view.address} key={view.address} placeholder="Taken from the job if there is one" onBlur={(e) => e.target.value.trim() !== view.address && void patch({ address: e.target.value })} />
          </div>

          <nav className="em-steps" aria-label="Certificate sections">
            {view.steps.map((s) => (
              <button key={s.key} type="button" className={`em-step${cur?.key === s.key ? ' on' : ''}`} onClick={() => setStep(s.key)}>
                <span>{s.title}</span>
                {s.open > 0 ? <em className="em-todo">{s.open} to do</em> : <em className="em-ok">done</em>}
              </button>
            ))}
          </nav>

          <div className="em-card">
            <div className="em-lab">{view.complete ? 'Ready to issue' : `Still needed (${stillNeeded})`}</div>
            {view.designNeeded && !view.sigs.eic_design && <p className="em-miss">Design part: signature</p>}
            {view.missing.slice(0, 12).map((m, i) => (
              <button key={i} type="button" className="em-miss" onClick={() => setStep(m.step)}>
                <b>{m.label}</b>
                <small>{m.why}</small>
              </button>
            ))}
            {view.missing.length > 12 && <small className="crm-muted">and {view.missing.length - 12} more</small>}
            {view.flags.length > 0 && <div className="em-lab" style={{ marginTop: 8 }}>Check these</div>}
            {view.flags.map((f, i) => (
              <p key={i} className={`em-flag em-flag--${f.severity}`}>
                {f.text}
              </p>
            ))}
          </div>
          {admin && (
            <button type="button" className="crm-link" onClick={() => void remove()}>
              Delete this certificate
            </button>
          )}
        </aside>

        <main className="em-main">
          {cur && (
            <>
              <h2>{cur.title}</h2>
              {cur.intro && <p className="em-intro">{cur.intro}</p>}
              <div className="em-fields">
                {cur.fields.map((f) => {
                  const w = widget(f);
                  return (
                    <div key={f.key} className={`em-field${f.parent ? ' is-child' : ''}${f.open ? ' is-open' : ''}`} data-wide={w ? '1' : undefined}>
                      <label>
                        {f.label}
                        {f.level === 'must' ? <b title="Needed"> *</b> : null}
                      </label>
                      {w ?? <Control c={f} value={valueOf(f)} onChange={(v) => !locked && change(f.key, v)} />}
                      {f.suggest && valueOf(f) === undefined && !locked && !f.widget && (
                        <button type="button" className="em-suggest" onClick={() => change(f.key, f.suggest!.v)}>
                          Use {f.suggest.text}
                        </button>
                      )}
                      {f.hint && <small>{f.hint}</small>}
                      {f.note && <small className="em-note">{f.note}</small>}
                    </div>
                  );
                })}
              </div>
              {cur.key === 'eic-sign' && view.designNeeded && (
                <section className="em-design">
                  <h3>The design part (Section B and D)</h3>
                  <p className="em-intro">The designer signs for the design, and sets the next inspection. Whoever designed it fills this in.</p>
                  <div className="em-props">
                    {(['name', 'company', 'address', 'postcode', 'tel'] as const).map((k) => (
                      <div key={k} className="em-prop">
                        <label>{{ name: 'Designer’s name', company: 'Company', address: 'Address', postcode: 'Postcode', tel: 'Phone' }[k]}</label>
                        <input className="crm-input" disabled={locked} value={(dv[k] as string) ?? ''} onChange={(e) => setDesign(k, e.target.value)} />
                      </div>
                    ))}
                    <div className="em-prop">
                      <label>Next inspection: an interval of not more than</label>
                      <div className="em-inline">
                        <input className="crm-input" inputMode="numeric" disabled={locked} value={dv.next_n ?? ''} onChange={(e) => setDesign('next_n', Number(e.target.value.replace(/\D/g, '')) || 0)} />
                        <select className="crm-input" disabled={locked} value={dv.next_unit ?? 'years'} onChange={(e) => setDesign('next_unit', e.target.value)}>
                          <option value="years">years</option>
                          <option value="months">months</option>
                        </select>
                      </div>
                    </div>
                    <div className="em-prop">
                      <label>Departures from BS 7671 in the design (if any)</label>
                      <input className="crm-input" disabled={locked} value={(dv.departures as string) ?? ''} onChange={(e) => setDesign('departures', e.target.value || null)} />
                    </div>
                  </div>
                  {sigBox('eic_design', 'Designer’s signature')}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/** Draw, then save: the pad gives a trimmed PNG; nothing is sent until Save. */
function SignPad({ onSave, busy }: { onSave: (dataUrl: string) => void; busy: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  return (
    <div className="em-pad">
      <SignaturePad onChange={setUrl} height={130} />
      <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!url || busy} onClick={() => url && onSave(url)}>
        {busy ? 'Saving…' : 'Save signature'}
      </button>
    </div>
  );
}

