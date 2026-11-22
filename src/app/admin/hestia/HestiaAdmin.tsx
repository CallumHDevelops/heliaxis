'use client';

import { useCallback, useEffect, useState } from 'react';
import { BrandIcon } from '../crm/CrmUi';
import { DIAGNOSES, DIAGNOSIS_LABEL, type Diagnosis } from '@/lib/hestia/learning';
import '../crm/crm.css';
import './hestia.css';

type Row = {
  id: string;
  at: string;
  question: string;
  answer: string;
  model: string;
  rating: number | null;
  status: string;
  facts_used: string[];
  facts: Record<string, unknown> | null;
  examples_used: string[];
  diagnosis: Diagnosis | null;
  diagnosis_note: string | null;
  cause: Diagnosis | null;
  cause_note: string | null;
  example_q: string | null;
  example_a: string | null;
  reviewed_by: string | null;
};
type Cause = { cause: Diagnosis; cause_note: string | null };
type Tab = 'review' | 'candidate' | 'approved' | 'rejected';

const TABS: { key: Tab; label: string; blurb: string }[] = [
  { key: 'review', label: 'Thumbs down', blurb: 'Customers said these answers weren’t helpful. Work out what went wrong, write the answer Hestia should have given, and approve it to reuse it.' },
  { key: 'candidate', label: 'Thumbs up', blurb: 'Customers liked these, and they look general (no names, dates, prices or references). Approve the ones worth keeping as examples. You can tidy the wording first.' },
  { key: 'approved', label: 'Approved examples', blurb: 'What Hestia is given, a few at a time, when a customer asks something similar. Retire one if it turns out to be wrong.' },
  { key: 'rejected', label: 'Not kept', blurb: 'Answers you decided not to reuse, with the cause you noted.' },
];

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

/** CRM › Hestia. */
export function HestiaAdmin() {
  const [tab, setTab] = useState<Tab>('review');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [causes, setCauses] = useState<Cause[]>([]);
  const [err, setErr] = useState('');

  const load = useCallback(async (t: Tab) => {
    const r = await fetch(`/api/crm/hestia?tab=${t}`, { cache: 'no-store' }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setErr(d.missing ? 'Hestia learning isn’t set up yet. Run supabase/hestia-learning.sql in the Supabase SQL editor once.' : d.error || 'Couldn’t load the answers.');
      setRows([]);
      return;
    }
    setErr('');
    setRows(d.rows as Row[]);
    setCounts(d.counts ?? {});
    setCauses((d.causes ?? []) as Cause[]);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the list is this effect's job
    void load(tab);
  }, [tab, load]);

  const causeTally = DIAGNOSES.map((k) => ({ k, n: causes.filter((c) => c.cause === k).length, notes: causes.filter((c) => c.cause === k && c.cause_note).slice(0, 3).map((c) => c.cause_note as string) })).filter((c) => c.n > 0);
  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="hst-page">
      <header>
        <h1>
          <BrandIcon k="quote" size={22} /> Hestia
        </h1>
        <p className="crm-muted">
          Customers rate each of Hestia’s answers in their portal. Nothing is reused until you approve it, and only general answers can be kept, so one customer’s details never reach another. She still works from each customer’s own facts and still hands off to the team when unsure.
        </p>
      </header>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}

      <div className="hst-tabs" role="tablist" aria-label="Hestia answers">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`crm-chipbtn${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label} <b>{counts[t.key] ?? 0}</b>
          </button>
        ))}
      </div>
      <p className="crm-muted hst-blurb">{current.blurb}</p>

      {causeTally.length > 0 && tab === 'review' && (
        <section className="hst-card">
          <h2>Causes found so far</h2>
          <p className="crm-muted">The root causes you have noted. Fix these at the source (a missing portal fact, a gap in her instructions) and the same mistake stops happening.</p>
          <ul className="hst-causes">
            {causeTally.map((c) => (
              <li key={c.k}>
                <b>{DIAGNOSIS_LABEL[c.k]}</b> <span className="crm-muted">× {c.n}</span>
                {c.notes.map((n) => (
                  <em key={n}>{n}</em>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows === null ? (
        <p className="crm-muted">Loading…</p>
      ) : rows.length === 0 && !err ? (
        <p className="crm-muted">Nothing here yet.</p>
      ) : (
        <ul className="hst-list">
          {rows.map((r) => (
            <Item key={r.id} row={r} tab={tab} onDone={() => load(tab)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Item({ row, tab, onDone }: { row: Row; tab: Tab; onDone: () => Promise<void> }) {
  const [q, setQ] = useState(row.example_q ?? row.question);
  const [a, setA] = useState(row.example_a ?? (tab === 'candidate' ? row.answer : ''));
  const [cause, setCause] = useState<Diagnosis | ''>(row.cause ?? row.diagnosis ?? '');
  const [note, setNote] = useState(row.cause_note ?? '');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [facts, setFacts] = useState(false);

  async function act(action: 'approve' | 'reject' | 'retire') {
    setBusy(action);
    setMsg('');
    const r = await fetch('/api/crm/hestia', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, action, question: q, answer: a, cause: cause || undefined, cause_note: note }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy('');
    if (r?.ok) await onDone();
    else setMsg(d.error || 'Couldn’t save that.');
  }

  const editable = tab === 'review' || tab === 'candidate';
  return (
    <li className="hst-item">
      <div className="hst-meta">
        <span>{when(row.at)}</span>
        <span>{row.model}</span>
        {row.rating === -1 && <span className="hst-pill is-down">Thumbs down</span>}
        {row.rating === 1 && <span className="hst-pill is-up">Thumbs up</span>}
        {row.examples_used.length > 0 && <span>Used {row.examples_used.length} approved example{row.examples_used.length === 1 ? '' : 's'}</span>}
      </div>
      <div className="hst-qa">
        <p className="hst-q">
          <b>Customer asked</b>
          {row.question}
        </p>
        <p className="hst-a">
          <b>Hestia answered</b>
          {row.answer}
        </p>
      </div>

      {tab === 'review' && row.diagnosis && (
        <p className="hst-diag">
          <b>Suggested diagnosis: {DIAGNOSIS_LABEL[row.diagnosis]}.</b> {row.diagnosis_note}
        </p>
      )}

      {row.facts && (
        <div>
          <button type="button" className="crm-link" aria-expanded={facts} onClick={() => setFacts((v) => !v)}>
            {facts ? 'Hide the facts she had' : 'Show the facts she had'}
          </button>
          {facts && (
            <>
              <p className="crm-muted hst-used">She had something for: {row.facts_used.join(', ') || 'nothing'}.</p>
              <pre className="hst-facts">{JSON.stringify(row.facts, null, 2)}</pre>
            </>
          )}
        </div>
      )}

      {tab === 'approved' && (
        <>
          <p className="hst-a">
            <b>Example question</b>
            {row.example_q}
          </p>
          <p className="hst-a">
            <b>Example answer</b>
            {row.example_a}
          </p>
          {row.reviewed_by && <p className="crm-muted">Approved by {row.reviewed_by}.</p>}
        </>
      )}

      {tab === 'rejected' && row.cause && (
        <p className="hst-diag">
          <b>Cause: {DIAGNOSIS_LABEL[row.cause]}.</b> {row.cause_note}
        </p>
      )}

      {editable && (
        <div className="hst-edit">
          <label>
            Question to match (edit so it holds no names or details)
            <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={600} />
          </label>
          <label>
            {tab === 'review' ? 'The answer Hestia should have given' : 'Answer to keep'}
            <textarea className="crm-input" rows={4} value={a} onChange={(e) => setA(e.target.value)} maxLength={2000} placeholder="Plain, warm and general. No names, dates, prices or references." />
          </label>
          {tab === 'review' && (
            <>
              <label>
                What went wrong
                <select className="crm-input" value={cause} onChange={(e) => setCause(e.target.value as Diagnosis)}>
                  <option value="">Not sure</option>
                  {DIAGNOSES.map((k) => (
                    <option key={k} value={k}>
                      {DIAGNOSIS_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                What to fix at the source (for example “add the DNO status to the portal facts”)
                <input className="crm-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
              </label>
            </>
          )}
          <div className="hst-btns">
            <button type="button" className="crm-btn crm-btn--solar" disabled={!!busy || !a.trim()} onClick={() => void act('approve')}>
              {busy === 'approve' ? 'Saving…' : tab === 'review' ? 'Approve this answer' : 'Keep as an example'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy} onClick={() => void act('reject')}>
              {busy === 'reject' ? 'Saving…' : tab === 'review' ? 'Done, don’t reuse' : 'Don’t keep'}
            </button>
          </div>
        </div>
      )}
      {tab === 'approved' && (
        <div className="hst-btns">
          <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy} onClick={() => void act('retire')}>
            {busy === 'retire' ? 'Saving…' : 'Retire this example'}
          </button>
        </div>
      )}
      {msg && <p className="crm-banner crm-banner--err">{msg}</p>}
    </li>
  );
}
