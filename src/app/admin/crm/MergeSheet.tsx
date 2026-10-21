'use client';

import { useEffect, useState } from 'react';
import { stageLabel } from '@/lib/crm/stages';
import { cancelledWords, type Choices, type FieldRow, type JoinView } from '@/lib/crm/merge-rules';
import type { CustomerCard, MergeDone, MergePreview } from '@/lib/crm/merge';
import { Sheet, StageChip } from './CrmUi';
import { firstName, shortDate, ukDayOf } from './crm-shared';
import './crm.css';
import './merge.css';

/**
 * Merging two customers, or joining two of one customer's jobs (src/lib/crm/merge.ts). Used by the
 * record page (⋯, and the possible-duplicate badge) and Enquiries → Select. Every change of choice asks
 * the server again, which works the merge out with the database's own dry run, so what it says will
 * move is what will. The person's choices are one state object; the defaults come from the preview.
 */

export type MergeStart = {
  /** The customer it was opened from (or the first one ticked). */
  a: string;
  /** The other customer, when known (a duplicate's Merge…, or the second one ticked). */
  b?: string | null;
  /** Joining two of a's jobs instead: [this job, the other ('' to pick it from `jobs`)]. */
  jobPair?: [string, string] | null;
  /** The customer's other jobs, to pick from. */
  jobs?: { id: string; ref: string | null; title: string | null; stage: string }[];
  /** Their name, for the title while it loads. */
  name?: string;
};

type Found = { id: string; name: string; customer_ref: string | null; postcode: string | null; phone: string | null; projects: number; was?: string | null };

const NOTICE_KEY = 'hx-merge-notice';
/** The line the kept record's page shows after a merge ("Merged. HX-0069 now finds …"), carried across the page change. */
export const mergeNotice = {
  set(text: string) {
    try {
      sessionStorage.setItem(NOTICE_KEY, text);
    } catch {
      // The page still opens; it just doesn't say so.
    }
  },
  read(): string {
    try {
      return typeof window === 'undefined' ? '' : (sessionStorage.getItem(NOTICE_KEY) ?? '');
    } catch {
      return '';
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(NOTICE_KEY);
    } catch {
      // Nothing kept.
    }
  },
};

/** "Merged. HX-0069 now finds Robert Evans HX-0080." */
export function mergedWords(done: MergeDone, p: MergePreview): string {
  const gone = p.b ? (p.keep === 'a' ? p.b : p.a) : null;
  if (!gone) return `Joined. ${p.joins.map((j) => j.job.ref).filter(Boolean).join(', ') || 'The old job'} now opens ${done.kept.name}’s job.`;
  return `Merged. ${gone.ref ?? gone.name} now finds ${[done.kept.name, done.kept.ref].filter(Boolean).join(' ')}.`;
}

export function MergeSheet({ start, isAdmin, onClose, onDone }: { start: MergeStart; isAdmin: boolean; onClose: () => void; onDone: (done: MergeDone, preview: MergePreview) => void }) {
  const jobMode = !!start.jobPair;
  const [other, setOther] = useState<string | null>(start.b ?? null);
  const [pair, setPair] = useState<[string, string] | null>(start.jobPair?.[1] ? start.jobPair : null);
  const [choices, setChoices] = useState<Partial<Choices>>({});
  const [ticked, setTicked] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Bumped to ask again with the same choices (something changed on the server).
  const [round, setRound] = useState(0);

  // What's asked for; the preview answering it, or the last one while the next is on its way.
  const ask = (other && !jobMode) || pair ? JSON.stringify({ a: start.a, b: jobMode ? null : other, jobPair: pair, choices, round }) : '';
  const [got, setGot] = useState<{ key: string; preview: MergePreview | null; error: string }>({ key: '', preview: null, error: '' });
  useEffect(() => {
    if (!ask) return;
    const ctl = new AbortController();
    (async () => {
      try {
        const r = await fetch('/api/crm/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...JSON.parse(ask), round: undefined, preview: true }),
          signal: ctl.signal,
        });
        const d = await r.json().catch(() => ({}));
        setGot((g) => ({ key: ask, preview: r.ok ? (d as MergePreview) : g.preview, error: r.ok ? '' : d.error || 'Couldn’t work out the merge. Try again.' }));
      } catch {
        // Replaced by a newer choice, or offline: the last answer stays.
      }
    })();
    return () => ctl.abort();
  }, [ask]);
  const loading = !!ask && got.key !== ask;
  const p = got.preview;
  const kept = p ? (p.keep === 'a' ? p.a : p.b) : null;
  const gone = p?.b ? (p.keep === 'a' ? p.b : p.a) : null;
  const ticks = (p?.warnings ?? []).filter((w) => w.tick);
  const allTicked = ticks.every((w) => ticked.includes(w.text));
  const typedOk = !p?.confirmRef || typed.trim().toUpperCase() === p.confirmRef.toUpperCase();
  const adminOnly = !!p?.needsAdmin && !isAdmin;
  const nothingToJoin = jobMode && !!p && !p.joins.some((j) => j.with);
  const canMerge = !!p && !loading && !busy && !got.error && allTicked && typedOk && !adminOnly && !nothingToJoin;
  const set = (c: Partial<Choices>) => setChoices((x) => ({ ...x, ...c }));
  /** Keep the other one: the details, jobs and credit start again from its defaults. */
  const keepSide = (k: 'a' | 'b') => {
    if (p?.keep === k) return;
    set({ keep: k, fields: {}, joins: undefined, credit: {} });
    setTicked([]);
  };

  async function merge() {
    if (!p || !canMerge) return;
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/crm/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a: start.a, b: jobMode ? null : other, jobPair: pair, choices: p.choices, check: p.check, confirm: typed, ticked: ticks.length }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || 'Not merged. Try again.');
        // Something changed: ask again, so the summary is up to date.
        if (r.status === 409) setRound((n) => n + 1);
        return;
      }
      onDone(d as MergeDone, p);
    } catch {
      setErr('Not merged: no connection. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  const title = jobMode ? 'Join two jobs' : other ? `Merge ${p ? 'two records' : start.name ? `${start.name}’s records` : 'two records'}` : `Merge ${start.name || 'this customer'} with…`;
  return (
    <Sheet title={title} onClose={onClose} wide>
      <div className="mrg" data-loading={loading ? '1' : undefined}>
        {!other && !jobMode && <Picker not={start.a} onPick={setOther} />}
        {jobMode && !pair && (
          <div className="crmh-picker">
            <p className="crm-label">Which job is the same work as this one?</p>
            <ul className="crmh-picker__list">
              {(start.jobs ?? []).map((j) => (
                <li key={j.id}>
                  <button type="button" onClick={() => setPair([start.jobPair![0], j.id])}>
                    <span>
                      <b>{j.ref ?? j.title ?? 'Job'}</b>
                      <small>{[j.title, stageLabel(j.stage)].filter(Boolean).join(' · ')}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ask && !p && !got.error && <p className="crm-muted">Working out what would happen…</p>}
        {got.error && <p className="crm-banner crm-banner--err">{got.error}</p>}

        {p && kept && (
          <>
            {p.b && gone && (
              <section className="mrg-sec" aria-label="Which record stays">
                <h3>Which record stays</h3>
                <div className="mrg-cards">
                  {(['a', 'b'] as const).map((k) => (
                    <Card key={k} c={k === 'a' ? p.a : p.b!} on={p.keep === k} onPick={() => keepSide(k)} />
                  ))}
                </div>
                <p className="mrg-why">
                  {kept.ref ?? kept.name} stays{p.keepWhy.startsWith('Suggested') ? `: ${p.keepWhy.replace(/^Suggested: /, '')}` : ' (you picked it)'}. {gone.ref ?? gone.name}’s things move to it, and {gone.ref ?? 'the other'} keeps finding it.{' '}
                  <button type="button" className="crm-link" onClick={() => keepSide(p.keep === 'a' ? 'b' : 'a')}>
                    Swap
                  </button>
                </p>
              </section>
            )}

            {p.b && gone && p.fields.length > 0 && (
              <section className="mrg-sec" aria-label="Details">
                <h3>Details</h3>
                <div className="mrg-fields">
                  {p.fields.map((f) => (
                    <Field key={f.key} f={f} keptRef={kept.ref ?? kept.name} goneRef={gone.ref ?? gone.name} onPick={(v) => set({ fields: { ...p.choices.fields, ...choices.fields, [f.key]: v } })} />
                  ))}
                </div>
                {p.whatsapp.otherNumbers.length > 0 && (
                  <p className="mrg-why">
                    Other numbers kept for search and WhatsApp: <b>{p.whatsapp.otherNumbers.join(', ')}</b>
                  </p>
                )}
              </section>
            )}

            {p.joins.length > 0 && (
              <section className="mrg-sec" aria-label="Jobs">
                <h3>{jobMode ? 'The jobs' : `${gone?.ref ?? 'Their'} jobs`}</h3>
                {p.joins.map((j) => (
                  <Join
                    key={j.job.id}
                    j={j}
                    jobMode={jobMode}
                    onWith={(w) => set({ joins: { ...Object.fromEntries(p.joins.map((x) => [x.job.id, x.with])), [j.job.id]: w } })}
                    onCredit={() => set({ credit: { ...p.choices.credit, [j.job.id]: j.credit === 'into' ? 'from' : 'into' } })}
                  />
                ))}
              </section>
            )}

            <section className="mrg-sec" aria-label="What happens">
              <h3>What happens</h3>
              <ul className="mrg-list">
                <li>
                  {p.moves ? (
                    <>
                      Moves to {kept.name} {kept.ref}: <b>{p.moves}</b>.
                    </>
                  ) : (
                    'Nothing else to move.'
                  )}
                </li>
                {cancelledWords(p.cancelled) && <li>Cancelled: {cancelledWords(p.cancelled)}.</li>}
                {p.warnings
                  .filter((w) => !w.tick)
                  .map((w) => (
                    <li key={w.text}>{w.text}</li>
                  ))}
              </ul>
              {ticks.map((w) => (
                <label key={w.text} className="mrg-tick">
                  <input type="checkbox" checked={ticked.includes(w.text)} onChange={(e) => setTicked((t) => (e.target.checked ? [...t, w.text] : t.filter((x) => x !== w.text)))} />
                  <span>
                    {w.text} <b>{w.tick}</b>
                  </span>
                </label>
              ))}
              {p.confirmRef && (
                <>
                  <label className="crm-label" htmlFor="mrg-typed">
                    Both have signed paperwork. Type {p.confirmRef} to merge them
                  </label>
                  <input id="mrg-typed" className="crm-input mrg-typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
                </>
              )}
              {adminOnly && <p className="crm-banner">Only an admin can merge records with a signed quote, a paid deposit or kit ordered.</p>}
              <p className="mrg-why">This can’t be undone. It’s all recorded on {firstName(kept.name) || kept.name}’s timeline.</p>
            </section>
          </>
        )}

        {err && <p className="crm-banner crm-banner--err">{err}</p>}
        <div className="mrg-foot">
          {ask && (
            <button type="button" className="crm-btn crm-btn--solar" disabled={!canMerge} onClick={() => void merge()} title={!allTicked ? 'Tick the boxes above first' : undefined}>
              {busy ? 'Merging…' : jobMode ? 'Join the jobs' : 'Merge'}
            </button>
          )}
          {other && !start.b && (
            <button
              type="button"
              className="crm-btn crm-btn--ghost"
              onClick={() => {
                setOther(null);
                setChoices({});
                setTicked([]);
              }}
            >
              Pick someone else
            </button>
          )}
          <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          {loading && p && <span className="crm-muted crm-small">Updating…</span>}
        </div>
      </div>
    </Sheet>
  );
}

const day = (iso: string | null | undefined) => (iso ? shortDate(ukDayOf(iso)) : '');

function Card({ c, on, onPick }: { c: CustomerCard; on: boolean; onPick: () => void }) {
  return (
    <label className={`mrg-card${on ? ' on' : ''}`}>
      <input type="radio" name="mrg-keep" checked={on} onChange={onPick} />
      <span className="mrg-card__b">
        <span className="mrg-card__h">
          {c.ref && <span className="crmr-ref">{c.ref}</span>}
          <b>{c.name}</b>
          {on && <em>Stays</em>}
        </span>
        <span className="crm-muted crm-small">
          {c.source} · came in {day(c.cameIn)}
          {c.postcode ? ` · ${c.postcode}` : ''}
        </span>
        <span className="mrg-card__jobs">
          {c.jobs.length ? (
            c.jobs.map((j) => (
              <span key={j.id}>
                {j.ref ?? 'Job'} <StageChip stage={j.stage} />
                {j.contract && <small> signed</small>}
              </span>
            ))
          ) : (
            <span className="crm-muted crm-small">No jobs</span>
          )}
        </span>
        <span className="crm-muted crm-small">{c.messages ? `${c.messages} WhatsApp message${c.messages === 1 ? '' : 's'}` : 'No WhatsApp chat'}</span>
      </span>
    </label>
  );
}

function Field({ f, keptRef, goneRef, onPick }: { f: FieldRow; keptRef: string; goneRef: string; onPick: (v: 'keep' | 'merge') => void }) {
  if (f.same) {
    return (
      <div className="mrg-field is-same">
        <span className="mrg-field__l">{f.label}</span>
        <span className="mrg-field__same">
          {f.kept} <small>Same on both</small>
        </span>
      </div>
    );
  }
  const opt = (v: 'keep' | 'merge', value: string, ref: string) => (
    <label className={`mrg-opt${f.pick === v ? ' on' : ''}`}>
      <input type="radio" name={`mrg-${f.key}`} checked={f.pick === v} onChange={() => onPick(v)} disabled={!value} />
      <span>
        {value || <i>None</i>}
        <small>{ref}</small>
      </span>
    </label>
  );
  return (
    <div className="mrg-field">
      <span className="mrg-field__l">{f.label}</span>
      {opt('keep', f.kept, keptRef)}
      {opt('merge', f.other, goneRef)}
      <span className="mrg-field__why">{f.why}</span>
    </div>
  );
}

function Join({ j, jobMode, onWith, onCredit }: { j: JoinView; jobMode: boolean; onWith: (w: string | null) => void; onCredit: () => void }) {
  const label = (o: { ref: string | null; title: string | null; stage: string }) => `${o.ref ?? o.title ?? 'Job'} (${stageLabel(o.stage)})`;
  const stays = j.stays === j.job.id ? j.job : j.options.find((o) => o.id === j.stays);
  return (
    <div className="mrg-job">
      <div className="mrg-job__h">
        <b>{j.job.ref ?? j.job.title ?? 'Job'}</b>
        <StageChip stage={j.job.stage} />
        {j.job.title && j.job.ref && <span className="crm-muted crm-small">{j.job.title}</span>}
      </div>
      {jobMode ? (
        <p className="mrg-why">{j.with ? `Joined with ${label(j.options[0])}.` : `Can’t be joined: ${j.why}`}</p>
      ) : (
        <>
          <select className="crm-input mrg-job__pick" value={j.with ?? ''} onChange={(e) => onWith(e.target.value || null)} aria-label={`What happens to ${j.job.ref ?? 'this job'}`}>
            {j.options.map((o) => (
              <option key={o.id} value={o.id} disabled={o.blocked.length > 0}>
                Join into {label(o)}
                {o.blocked.length ? ': can’t be joined' : ''}
              </option>
            ))}
            <option value="">Keep as its own job</option>
          </select>
          <p className="mrg-why">{j.with ? (j.notes.length ? j.notes.join(' ') : '') : `Kept as its own job (${j.why.replace(/\.$/, '')}).`}</p>
        </>
      )}
      {j.with && stays && j.creditWords && j.creditWords.into !== j.creditWords.from && (
        <p className="mrg-credit">
          Reports: both leads still count. The sale counts for <b>{j.credit === 'into' ? j.creditWords.into : j.creditWords.from}</b>.{' '}
          <button type="button" className="crm-link" onClick={onCredit}>
            Count it for {j.credit === 'into' ? j.creditWords.from : j.creditWords.into} instead
          </button>
        </p>
      )}
    </div>
  );
}

/** Who's the other record: the same customer search as the New project sheet, without this one. */
function Picker({ not, onPick }: { not: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ q: string; rows: Found[] }>({ q: '', rows: [] });
  const t = q.trim();
  useEffect(() => {
    if (t.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/crm/customers?q=${encodeURIComponent(t)}`, { cache: 'no-store', signal: ctl.signal });
        const d = await r.json().catch(() => ({}));
        if (r.ok) setFound({ q: t, rows: (d.customers ?? []) as Found[] });
      } catch {
        // Still typing, or offline.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [t]);
  const rows = found.q === t ? found.rows.filter((c) => c.id !== not) : null;
  return (
    <div className="crmh-picker">
      <label className="crm-label" htmlFor="mrg-find">
        Find the other record
      </label>
      <input id="mrg-find" className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, email, postcode or HX-ref" autoFocus />
      {t.length >= 2 && (
        <ul className="crmh-picker__list">
          {rows === null && <li className="crm-muted">Looking…</li>}
          {rows?.length === 0 && <li className="crm-muted">Nobody else found for “{t}”.</li>}
          {rows?.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c.id)}>
                <span>
                  <b>{c.name}</b>
                  <small>
                    {[c.customer_ref, c.was ? `was ${c.was}` : '', c.postcode, c.phone, c.projects ? `${c.projects} job${c.projects === 1 ? '' : 's'}` : 'no jobs yet'].filter(Boolean).join(' · ')}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
