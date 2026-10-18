'use client';

import Link from 'next/link';
import { useEffect, useState, type ChangeEvent } from 'react';
import { decodeLeadFile, parseLeadCsv, type CsvLead } from '@/lib/meta-leads-csv';
import { mapLeadFields } from '@/lib/whatsapp/leads';
import './meta-import.css';

/**
 * Old Facebook & Instagram lead-form leads: straight from Meta (the last 90 days), or from the
 * form's CSV download for anything older. Both go through /api/crm/import/meta, which keeps their
 * dates, matches people already in the CRM and never messages or notifies anyone.
 */

type Form = { id: string; name: string; status: string | null; leads: number | null; createdTime: string | null };
type Source = { pageId: string; pageName: string; forms: (Form & { made: string })[]; error: string | null };
type Counts = { imported: number; matched: number; already: number; skipped: number; failed: number };
type Progress = { done: boolean; counts: Counts; error: string | null };
type Result = { counts: Counts; errors: string[]; stopped?: string };

const API = '/api/crm/import/meta';
const ZERO: Counts = { imported: 0, matched: 0, already: 0, skipped: 0, failed: 0 };
const BATCH = 100;
const MAX_FILE = 20 * 1024 * 1024;

const add = (a: Counts, b?: Partial<Counts>): Counts => ({
  imported: a.imported + (b?.imported ?? 0),
  matched: a.matched + (b?.matched ?? 0),
  already: a.already + (b?.already ?? 0),
  skipped: a.skipped + (b?.skipped ?? 0),
  failed: a.failed + (b?.failed ?? 0),
});
const sum = (c: Counts) => c.imported + c.matched + c.already + c.skipped + c.failed;
const num = (n: number) => n.toLocaleString('en-GB');
const day = (ms: number) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
const formKey = (pageId: string, formId: string) => `${pageId}:${formId}`;

async function post(body: unknown): Promise<{ ok: boolean; d: Record<string, unknown> }> {
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: r.ok, d: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, d: { error: 'Couldn’t reach the CRM. Check your connection and try again.' } };
  }
}

/** Keep the first few distinct error lines. */
function keep(into: string[], more: unknown) {
  for (const e of Array.isArray(more) ? more : [more]) {
    if (typeof e === 'string' && e && !into.includes(e) && into.length < 8) into.push(e);
  }
}

/** Ask before leaving the page halfway through an import. */
function useLeaveWarning(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [on]);
}

export function MetaImport() {
  return (
    <section className="imp-card">
      <h2>Facebook &amp; Instagram lead forms</h2>
      <p>
        People who filled in one of your Meta lead forms before the CRM was connected. Meta only lets apps fetch leads
        from the last 90 days, so bring those in first, then add anything older from a CSV download below.
      </p>
      <FromMeta />
      <FromCsv />
    </section>
  );
}

function FromMeta() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  useLeaveWarning(running);

  async function find() {
    setFinding(true);
    setFindError('');
    setResult(null);
    setProgress({});
    try {
      const r = await fetch(API, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) {
        setSources(null);
        setFindError(d.error || 'Couldn’t ask Meta for your lead forms. Try again.');
        return;
      }
      const pages: Source[] = (d.pages ?? []).map((p: Omit<Source, 'forms'> & { forms: Form[] }) => ({
        ...p,
        forms: p.forms.map((f) => {
          const t = f.createdTime ? Date.parse(f.createdTime) : NaN;
          return { ...f, made: Number.isFinite(t) ? day(t) : '' };
        }),
      }));
      setSources(pages);
      setPicked(new Set(pages.flatMap((p) => p.forms.map((f) => formKey(p.pageId, f.id)))));
    } catch {
      setFindError('Couldn’t reach the CRM. Check your connection and try again.');
    } finally {
      setFinding(false);
    }
  }

  function toggle(k: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function run() {
    if (!sources) return;
    const chosen = sources.flatMap((p) =>
      p.forms.filter((f) => picked.has(formKey(p.pageId, f.id))).map((f) => ({ pageId: p.pageId, form: f }))
    );
    setRunning(true);
    setResult(null);
    setProgress({});
    const show = (k: string, p: Progress) => setProgress((all) => ({ ...all, [k]: p }));
    let totals = ZERO;
    const errors: string[] = [];

    for (const { pageId, form } of chosen) {
      const k = formKey(pageId, form.id);
      let p: Progress = { done: false, counts: ZERO, error: null };
      show(k, p);
      let after: string | null = null;
      // 50 leads a call; the cap only stops a runaway loop.
      for (let i = 0; i < 2000; i++) {
        const { ok, d } = await post({ action: 'form', pageId, formId: form.id, after });
        if (!ok) {
          const error = typeof d.error === 'string' ? d.error : 'Meta stopped sending leads for this form.';
          p = { ...p, error };
          keep(errors, `${form.name}: ${error}`);
          break;
        }
        const counts = d.counts as Counts;
        p = { ...p, counts: add(p.counts, counts) };
        totals = add(totals, counts);
        keep(errors, d.errors);
        show(k, p);
        after = typeof d.next === 'string' && d.next !== after ? d.next : null;
        if (!after) break;
      }
      show(k, { ...p, done: true });
    }
    setResult({ counts: totals, errors });
    setRunning(false);
  }

  const formCount = sources?.reduce((n, p) => n + p.forms.length, 0) ?? 0;

  return (
    <div className="mi-section">
      <h3>Last 90 days, straight from Meta</h3>
      <div className="mi-actions">
        <button type="button" className={sources ? 'imp-btn-ghost' : 'imp-btn'} onClick={find} disabled={finding || running}>
          {finding ? 'Looking…' : sources ? 'Look again' : 'Find lead forms'}
        </button>
      </div>
      {findError && <p className="imp-err mi-msg">{findError}</p>}

      {sources && !sources.length && <p className="mi-muted mi-msg">Meta didn’t return any Facebook Pages.</p>}
      {sources?.map((p) => (
        <div key={p.pageId} className="mi-page">
          <div className="mi-page-name">{p.pageName}</div>
          {p.error && <p className="imp-err">{p.error}</p>}
          {!p.error && !p.forms.length && <p className="mi-muted">No lead forms on this Page.</p>}
          {p.forms.length > 0 && (
            <ul className="mi-forms">
              {p.forms.map((f) => {
                const k = formKey(p.pageId, f.id);
                const prog = progress[k];
                return (
                  <li key={f.id} className="mi-form">
                    <label className="mi-check">
                      <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} disabled={running} />
                      <span className="mi-form-text">
                        <span className="mi-form-name">{f.name}</span>
                        <span className="mi-muted">
                          {[
                            f.leads === null ? '' : `${num(f.leads)} ${f.leads === 1 ? 'lead' : 'leads'} in total`,
                            f.status && f.status !== 'ACTIVE' ? f.status.toLowerCase() : '',
                            f.made ? `made ${f.made}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </label>
                    {prog && <FormProgress p={prog} />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}

      {formCount > 0 && (
        <>
          <p className="mi-muted mi-msg">
            Lead totals include anything older than 90 days, which Meta won’t hand over. Importing again is safe: anyone
            already brought in is skipped.
          </p>
          <div className="mi-actions">
            <button type="button" className="imp-btn" onClick={run} disabled={running || !picked.size}>
              {running ? 'Importing…' : `Import selected (${picked.size})`}
            </button>
          </div>
        </>
      )}
      {result && <Summary r={result} />}
    </div>
  );
}

function FormProgress({ p }: { p: Progress }) {
  const c = p.counts;
  const parts = [
    `${num(c.imported)} added`,
    `${num(c.matched)} matched`,
    `${num(c.already)} already in`,
    c.skipped ? `${num(c.skipped)} left out` : '',
    c.failed ? `${num(c.failed)} failed` : '',
  ].filter(Boolean);
  return (
    <div className="mi-progress" role="status">
      <span className={p.done ? (p.error ? 'imp-err' : 'imp-ok') : ''}>
        {p.error ? 'Stopped' : p.done ? 'Done' : 'Importing…'}
      </span>{' '}
      {num(sum(c))} {sum(c) === 1 ? 'lead' : 'leads'}: {parts.join(', ')}
      {p.error && <div className="imp-err">{p.error}</div>}
    </div>
  );
}

type Preview = {
  file: string;
  leads: CsvLead[];
  warnings: string[];
  withPhone: number;
  withEmail: number;
  from: string;
  to: string;
  names: string[];
};

function FromCsv() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fileError, setFileError] = useState('');
  const [sent, setSent] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  useLeaveWarning(running);

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still reads it
    if (!file) return;
    setPreview(null);
    setResult(null);
    setSent(0);
    setFileError('');
    if (file.size > MAX_FILE) return setFileError('That file is over 20 MB. Download one form at a time and try again.');
    try {
      const { leads, warnings } = parseLeadCsv(decodeLeadFile(await file.arrayBuffer()));
      if (!leads.length) {
        setFileError(warnings.join(' ') || 'There are no leads in this file.');
        return;
      }
      const mapped = leads.map((l) => mapLeadFields(l.field_data));
      let lo = Infinity;
      let hi = -Infinity;
      for (const l of leads) {
        const t = Date.parse(l.created_time);
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
      setPreview({
        file: file.name,
        leads,
        warnings,
        withPhone: mapped.filter((m) => m.phone).length,
        withEmail: mapped.filter((m) => m.email).length,
        from: day(lo),
        to: day(hi),
        names: mapped
          .map((m) => m.name || m.email || m.phone)
          .filter(Boolean)
          .slice(0, 5),
      });
    } catch {
      setFileError('We couldn’t read that file. Download the leads from Meta again and choose the CSV.');
    }
  }

  async function run() {
    if (!preview) return;
    const { leads } = preview;
    setRunning(true);
    setResult(null);
    setSent(0);
    let counts = ZERO;
    const errors: string[] = [];
    let stopped: string | undefined;
    for (let i = 0; i < leads.length; i += BATCH) {
      const { ok, d } = await post({ action: 'rows', leads: leads.slice(i, i + BATCH) });
      if (!ok) {
        stopped =
          `${typeof d.error === 'string' ? d.error : 'The import stopped.'} ` +
          `Stopped after ${num(i)} of ${num(leads.length)}. Importing the same file again is safe: anyone already brought in is skipped.`;
        break;
      }
      counts = add(counts, d.counts as Counts);
      keep(errors, d.errors);
      setSent(Math.min(i + BATCH, leads.length));
    }
    setResult({ counts, errors, stopped });
    setRunning(false);
  }

  const total = preview?.leads.length ?? 0;

  return (
    <div className="mi-section">
      <h3>Older leads, from a CSV download</h3>
      <ol className="imp-steps">
        <li>
          In Meta Business Suite, go to <b>All tools → Instant forms</b> (or open the form in Ads Manager).
        </li>
        <li>
          Choose the form, then <b>Download</b> and pick CSV, with the date range set to cover everything.
        </li>
        <li>Choose the file here. You’ll see what’s in it before anything is added.</li>
      </ol>
      <label className={`imp-btn-ghost mi-file${running ? ' is-off' : ''}`}>
        {preview ? 'Choose a different file' : 'Choose a file'}
        <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" onChange={choose} disabled={running} />
      </label>
      {fileError && <p className="imp-err mi-msg">{fileError}</p>}

      {preview && (
        <div className="mi-preview">
          <div className="mi-file-name">{preview.file}</div>
          <div className="mi-stats">
            <Stat n={total} label={total === 1 ? 'lead' : 'leads'} />
            <Stat n={preview.withPhone} label="with a phone number" />
            <Stat n={preview.withEmail} label="with an email" />
            <div className="mi-stat">
              <b className="mi-dates">{preview.from === preview.to ? preview.from : `${preview.from} – ${preview.to}`}</b>
              <span>dates</span>
            </div>
          </div>
          {preview.names.length > 0 && (
            <p className="mi-muted">
              Starts with {preview.names.join(', ')}
              {total > preview.names.length ? '…' : '.'}
            </p>
          )}
          {preview.warnings.map((w) => (
            <p key={w} className="mi-warn">
              {w}
            </p>
          ))}
          {(running || sent > 0) && (
            <div className="mi-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={sent}>
              <div style={{ width: `${total ? Math.round((sent / total) * 100) : 0}%` }} />
            </div>
          )}
          <div className="mi-actions">
            <button type="button" className="imp-btn" onClick={run} disabled={running}>
              {running ? `Importing… ${num(sent)} of ${num(total)}` : `Import ${num(total)} ${total === 1 ? 'lead' : 'leads'}`}
            </button>
          </div>
        </div>
      )}
      {result && <Summary r={result} />}
    </div>
  );
}

function Stat({ n, label, bad }: { n: number; label: string; bad?: boolean }) {
  return (
    <div className={`mi-stat${bad && n ? ' is-bad' : ''}`}>
      <b>{num(n)}</b>
      <span>{label}</span>
    </div>
  );
}

function Summary({ r }: { r: Result }) {
  return (
    <div className="mi-summary" role="status">
      <div className="mi-stats">
        <Stat n={r.counts.imported} label="added" />
        <Stat n={r.counts.matched} label="matched to someone already in the CRM" />
        <Stat n={r.counts.already} label="already imported" />
        {r.counts.skipped > 0 && <Stat n={r.counts.skipped} label="left out" />}
        <Stat n={r.counts.failed} label="failed" bad />
      </div>
      {r.counts.skipped > 0 && (
        <p className="mi-muted">
          Left out: test leads made with Meta’s testing tool, and leads from the last hour, which reach Enquiries by
          themselves as new leads. If a recent one isn’t there, import again in an hour.
        </p>
      )}
      {r.stopped && <p className="imp-err">{r.stopped}</p>}
      {r.errors.length > 0 && (
        <ul className="mi-errors">
          {r.errors.slice(0, 5).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Link href="/admin/enquiries" className="imp-btn-ghost mi-link">
        Go to Enquiries
      </Link>
    </div>
  );
}
