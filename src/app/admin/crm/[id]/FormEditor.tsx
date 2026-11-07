'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { progress as progressOf } from '@/lib/templates/answers';
import type { formView } from '@/lib/templates/forms';
import { allFields, fillMerge, visibility } from '@/lib/templates/rules';
import type { Answers, DocTemplate, FieldsSection, TemplateField, TextSection } from '@/lib/templates/types';
import { YESNO } from '@/lib/templates/types';
import './mcs.css';

type FormView = ReturnType<typeof formView>;
type Loaded = { template: DocTemplate; form: FormView; merge: Record<string, string> };
type Saving = 'idle' | 'saving' | 'saved' | 'error';

const SOURCE: Record<string, string> = { hap: 'HAP', simpliheat: 'SimpliHeat' };
const day = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }).format(new Date(iso));
  } catch {
    return '';
  }
};
const STATUS_WORDS: Record<string, string> = { none: 'Not started', draft: 'Being filled in', signed: 'Signed', superseded: 'Replaced' };

/**
 * One form of the MCS pack, filled in on screen (the heat pump commissioning record, the cylinder record, the handover
 * certificate). Answers save as they are entered, each remembering who gave it and from where; what SimpliHeat has for the
 * same question that differs shows beside it to accept. A signed form is the record: read-only until an admin starts a
 * revision. The PDF button opens the same answers in the Heliaxis document style.
 */
export function FormEditor({ projectId, code, isAdmin, me, onBack, onChanged }: { projectId: string; code: string; isAdmin: boolean; me: string; onBack: () => void; onChanged: () => void }) {
  const base = `/api/crm/projects/${projectId}/forms/${encodeURIComponent(code)}`;
  const [data, setData] = useState<Loaded | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [saving, setSaving] = useState<Saving>('idle');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<Record<string, string | number | null>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    fetch(base, { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!live) return;
        if (!ok) return setErr(d.error || 'Could not open the form.');
        setData(d as Loaded);
        setAnswers((d as Loaded).form.answers);
      })
      .catch(() => live && setErr('Could not open the form.'));
    return () => {
      live = false;
    };
  }, [base]);

  /** Send what has been typed. Waits for a save already under way, so answers never arrive out of order. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inflight.current) await inflight.current.catch(() => null);
    const patch = pending.current;
    if (!Object.keys(patch).length) return true;
    pending.current = {};
    setSaving('saving');
    let ok = true;
    const run = (async () => {
      try {
        const r = await fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: patch }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Not saved');
        setData((cur) => (cur ? { ...cur, form: d.form } : cur));
        // Keep what has been typed since; take what the server holds for the rest.
        setAnswers({ ...(d.form as FormView).answers, ...pending.current });
        setErr(Array.isArray(d.problems) && d.problems.length ? d.problems.join(' ') : '');
        setSaving('saved');
        onChanged();
      } catch (e) {
        ok = false;
        pending.current = { ...patch, ...pending.current };
        setErr(e instanceof Error ? e.message : 'Not saved');
        setSaving('error');
      }
    })();
    inflight.current = run;
    await run;
    inflight.current = null;
    return ok;
  }, [base, onChanged]);

  // Leaving the form saves what is left.
  useEffect(
    () => () => {
      if (!Object.keys(pending.current).length) return;
      void fetch(base, { method: 'PATCH', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: pending.current }) }).catch(() => null);
    },
    [base],
  );

  function set(key: string, value: string | number | null) {
    setAnswers((a) => {
      const next = { ...a };
      if (value === null || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
    pending.current[key] = value === '' ? null : value;
    setSaving('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setErr('');
    try {
      if (!(await flush())) return;
      const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not do that');
      setData((cur) => (cur ? { ...cur, form: d.form } : cur));
      setAnswers((d.form as FormView).answers);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not do that');
    } finally {
      setBusy(false);
    }
  }

  const t = data?.template ?? null;
  const vis = useMemo(() => (t ? visibility(t, answers) : null), [t, answers]);
  const prog = useMemo(() => (t ? progressOf(t, answers) : null), [t, answers]);
  if (!data || !t || !vis || !prog) {
    return (
      <div className="mcs">
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={onBack}>
          Back to In-House
        </button>
        <p className="mcs-note">{err || 'Opening the form…'}</p>
      </div>
    );
  }

  const form = data.form;
  const locked = form.status === 'signed';
  const left = allFields(t).filter((f) => vis.fields.has(f.key) && !f.prefill && String(answers[f.key] ?? '').trim() === '');
  const jump = () => {
    const el = left[0] && document.getElementById(`mcs-f-${left[0].key}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el.querySelector('input,select,textarea,button') as HTMLElement | null)?.focus({ preventScroll: true });
    }
  };

  return (
    <div className="mcs mcs-form">
      <div className="mcs-formtop">
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => void flush().then(onBack)}>
          Back to In-House
        </button>
        <div className="mcs-formtop__acts">
          <span className="mcs-saving" role="status" aria-live="polite">
            {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : saving === 'error' ? 'Not saved' : ''}
          </span>
          <a className="crm-btn crm-btn--ghost crm-btn--small" href={`${base}/pdf`} target="_blank" rel="noreferrer">
            Open PDF
          </a>
        </div>
      </div>

      <header className="mcs-formhead">
        <p className="mcs-eyebrow">{t.code}</p>
        <h3>{t.title}</h3>
        {t.purpose && <p className="mcs-note">{t.purpose}</p>}
        <p className="mcs-meta">
          <span className={`hv-state hv-state--${form.status === 'signed' ? 'complete' : form.status === 'draft' ? 'waiting' : 'missing'}`}>{STATUS_WORDS[form.status] ?? form.status}</span>
          <span>
            {prog.answered} of {prog.asked} answered
          </span>
          <span>{form.issue}</span>
          {form.revision > 1 && <span>Revision {form.revision}</span>}
          {left.length > 0 && !locked && (
            <button type="button" className="crm-link" onClick={jump}>
              Go to the next unanswered
            </button>
          )}
        </p>
        <span className="hv-bar" aria-hidden="true">
          <span style={{ width: `${prog.asked ? Math.round((prog.answered / prog.asked) * 100) : 0}%` }} />
        </span>
        {locked && (
          <p className="mcs-locked">
            This form is signed, so it is the record and can’t be changed.{' '}
            {isAdmin ? (
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy} onClick={() => void act({ action: 'revise' })}>
                {busy ? 'Starting…' : 'Start a revision'}
              </button>
            ) : (
              'An admin can start a revision if something has to change.'
            )}
          </p>
        )}
        {err && (
          <p className="mcs-err" role="alert">
            {err}
          </p>
        )}
      </header>

      {t.intro && <p className="mcs-note">{fillMerge(t.intro, data.merge)}</p>}

      {t.sections.map((s, i) => {
        if (!vis.sections[i]) return null;
        if (s.type === 'text') return <TextBlock key={i} s={s} merge={data.merge} />;
        if (s.type === 'sign')
          return (
            <section key={i} className="mcs-sec" aria-label={s.title || 'Signatures'}>
              {s.title && <h4>{s.title}</h4>}
              <div className="mcs-signs">
                {s.signers.map((g) => (
                  <SignLine key={g.key} label={g.label} signed={form.signed[g.key]} isAdmin={isAdmin} me={me} busy={busy} onSign={(name, image) => act({ action: 'sign', line: g.key, name, image })} />
                ))}
              </div>
            </section>
          );
        return <FieldsBlock key={i} s={s} vis={vis.fields} answers={answers} form={form} merge={data.merge} locked={locked} onSet={set} onBlur={() => void flush()} />;
      })}
    </div>
  );
}

function TextBlock({ s, merge }: { s: TextSection; merge: Record<string, string> }) {
  const paras = fillMerge(s.body, merge)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <section className="mcs-sec">
      {s.title && <h4>{s.title}</h4>}
      {paras.map((p, i) => {
        const lines = p.split('\n').map((l) => l.trim());
        return lines.every((l) => l.startsWith('- ')) ? (
          <ul key={i} className="mcs-list">
            {lines.map((l) => (
              <li key={l}>{l.slice(2)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="mcs-note">
            {p}
          </p>
        );
      })}
    </section>
  );
}

function FieldsBlock({
  s,
  vis,
  answers,
  form,
  merge,
  locked,
  onSet,
  onBlur,
}: {
  s: FieldsSection;
  vis: Set<string>;
  answers: Answers;
  form: FormView;
  merge: Record<string, string>;
  locked: boolean;
  onSet: (key: string, v: string | number | null) => void;
  onBlur: () => void;
}) {
  const shown = s.fields.filter((f) => vis.has(f.key));
  if (!shown.length) return null;
  return (
    <section className="mcs-sec">
      <h4>{s.title}</h4>
      {s.intro && <p className="mcs-note">{s.intro}</p>}
      <div className={`mcs-fields mcs-fields--${s.columns ?? 1}`}>
        {shown.map((f) => (
          <Field key={f.key} f={f} value={answers[f.key]} prefilled={f.prefill ? fillMerge(f.prefill, merge).trim() : ''} prov={form.provenance[f.key]} locked={locked} onSet={onSet} onBlur={onBlur} />
        ))}
      </div>
    </section>
  );
}

function Field({
  f,
  value,
  prefilled,
  prov,
  locked,
  onSet,
  onBlur,
}: {
  f: TemplateField;
  value: string | number | null | undefined;
  prefilled: string;
  prov: FormView['provenance'][string] | undefined;
  locked: boolean;
  onSet: (key: string, v: string | number | null) => void;
  onBlur: () => void;
}) {
  const id = `mcs-f-${f.key}`;
  const text = value === null || value === undefined ? '' : String(value);
  const other = prov?.other;
  return (
    <div className="mcs-field" id={id}>
      {f.kind === 'yesno' ? (
        <>
          <span className="crm-label" id={`${id}-l`}>
            {f.label}
          </span>
          <div className="mcs-yn" role="group" aria-labelledby={`${id}-l`}>
            {YESNO.filter((o) => !(f.noNa && o.value === 'na')).map((o) => (
              <button
                key={o.value}
                type="button"
                className={`crm-btn crm-btn--ghost crm-btn--small${text === o.value ? ' is-on' : ''}`}
                aria-pressed={text === o.value}
                disabled={locked}
                onClick={() => {
                  onSet(f.key, text === o.value ? null : o.value);
                  onBlur();
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <label className="crm-label" htmlFor={`${id}-i`}>
            {f.label}
            {f.unit ? ` (${f.unit})` : ''}
          </label>
          {f.kind === 'long' ? (
            <textarea id={`${id}-i`} className="crm-input" rows={3} value={text} disabled={locked} onChange={(e) => onSet(f.key, e.target.value)} onBlur={onBlur} />
          ) : f.kind === 'choice' ? (
            <select
              id={`${id}-i`}
              className="crm-input"
              value={text}
              disabled={locked}
              onChange={(e) => {
                onSet(f.key, e.target.value || null);
                onBlur();
              }}
            >
              <option value="">Not answered</option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${id}-i`}
              className="crm-input"
              type={f.kind === 'date' ? 'date' : 'text'}
              inputMode={f.kind === 'number' ? 'decimal' : undefined}
              value={text}
              placeholder={prefilled || undefined}
              disabled={locked}
              onChange={(e) => onSet(f.key, e.target.value)}
              onBlur={onBlur}
            />
          )}
        </>
      )}
      {f.hint && <small className="mcs-hint">{f.hint}</small>}
      {prefilled && !text && <small className="mcs-hint">From the job: it prints as “{prefilled}” unless you type something else.</small>}
      {prov && text && (
        <small className="mcs-prov">
          {SOURCE[prov.source] ?? prov.source}
          {prov.by && prov.source === 'hap' ? ` · ${prov.by}` : ''} · {day(prov.at)}
        </small>
      )}
      {other && !locked && (
        <small className="mcs-other">
          SimpliHeat has {String(other.value)} for this ({day(other.at)}).{' '}
          <button type="button" className="crm-link" onClick={() => onSet(f.key, other.value)}>
            Use that
          </button>
        </small>
      )}
    </div>
  );
}

function SignLine({
  label,
  signed,
  isAdmin,
  me,
  busy,
  onSign,
}: {
  label: string;
  signed: FormView['signed'][string] | undefined;
  isAdmin: boolean;
  me: string;
  busy: boolean;
  onSign: (name: string, image: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(me);
  const [image, setImage] = useState<string | null>(null);
  if (signed)
    return (
      <div className="mcs-sign is-signed">
        <b>{label}</b>
        <span>
          Signed by {signed.name} · {day(signed.at)}
          {signed.source === 'device' || signed.source === 'remote' ? ' · on the SimpliHeat app' : ''}
        </span>
      </div>
    );
  return (
    <div className="mcs-sign">
      <b>{label}</b>
      {!isAdmin ? (
        <span className="mcs-hint">Waiting to be signed. An admin signs it here, or it arrives from SimpliHeat.</span>
      ) : !open ? (
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setOpen(true)}>
          Sign
        </button>
      ) : (
        <div className="mcs-signbox">
          <label className="crm-label" htmlFor={`mcs-sn-${label}`}>
            Name
          </label>
          <input id={`mcs-sn-${label}`} className="crm-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <SignaturePad onChange={setImage} height={140} />
          <div className="mcs-signbox__btns">
            <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={busy || !name.trim() || !image} onClick={() => void onSign(name.trim(), image).then(() => setOpen(false))}>
              {busy ? 'Signing…' : 'Sign'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
