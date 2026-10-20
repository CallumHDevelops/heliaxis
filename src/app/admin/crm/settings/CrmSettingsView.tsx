'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CrmSettings, SequenceStep } from '@/lib/crm/settings-shared';
import '../crm.css';

type Team = { id: string; name: string }[];
type Snippet = { id: string; title: string; body: string };
type Lib = { id: string; name: string; description: string | null };
type Connected = { whatsapp: boolean; email: string | null; stripe: boolean; meta: boolean };

export function CrmSettingsView({ isAdmin }: { isAdmin: boolean }) {
  const [s, setS] = useState<CrmSettings | null>(null);
  const [team, setTeam] = useState<Team>([]);
  const [conn, setConn] = useState<Connected | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/crm/settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setS(d.settings);
        setTeam(d.team || []);
        setConn(d.connected || null);
      })
      .catch(() => setErr('Could not load settings'));
  }, []);

  const set = <K extends keyof CrmSettings>(k: K, v: CrmSettings[K]) => {
    setMsg('');
    setS((cur) => (cur ? { ...cur, [k]: v } : cur));
  };
  async function save() {
    if (!s) return;
    setBusy(true);
    setErr('');
    const r = await fetch('/api/crm/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Not saved');
    setS(d.settings);
    setMsg('Saved ✓');
  }
  const step = (i: number, patch: Partial<SequenceStep>) => set('sequence', s!.sequence.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="crm crm-settings">
      <Link href="/admin/crm" className="crm-back">
        ← CRM
      </Link>
      <div className="crm-head">
        <div>
          <h1>CRM settings</h1>
          <p>What the CRM sends and does by itself. {isAdmin ? '' : 'Only admins can change these.'}</p>
        </div>
        <Link href="/admin/crm/reports" className="crm-btn crm-btn--ghost">
          Reports
        </Link>
      </div>

      {conn && (
        <section className="crm-set">
          <h2>Connections</h2>
          <ul className="crm-conn">
            <li className={conn.whatsapp ? 'ok' : ''}>
              <b>WhatsApp</b> {conn.whatsapp ? 'connected' : 'not connected — WHATSAPP_SETUP.md'}
            </li>
            <li className={conn.email ? 'ok' : ''}>
              <b>Microsoft 365 email</b> {conn.email ? `sending as ${conn.email}` : 'not connected — CRM_GUIDE.md'}
            </li>
            <li className={conn.stripe ? 'ok' : ''}>
              <b>Card deposits (Stripe)</b> {conn.stripe ? 'connected' : 'not connected — CRM_GUIDE.md'}
            </li>
            <li className={conn.meta ? 'ok' : ''}>
              <b>Meta conversions</b> {conn.meta ? 'sending stages to Meta' : 'not connected — CRM_GUIDE.md'}
            </li>
          </ul>
        </section>
      )}

      <Link href="/admin/surveys/settings" className="crm-set" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
        <h2>Survey booking and diary →</h2>
        <p className="crm-muted crm-small">Online survey booking, your hours, travel between appointments, and your own diary entries.</p>
      </Link>

      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {!s ? (
        <p className="crm-muted">Loading…</p>
      ) : (
        <fieldset disabled={!isAdmin} className="crm-fieldset">
          <section className="crm-set">
            <h2>New leads</h2>
            <label className="crm-label">Share new leads between (in turn)</label>
            <div className="crm-checks">
              {team.map((t) => (
                <label key={t.id} className={s.leadRotation.includes(t.id) ? 'on' : ''}>
                  <input
                    type="checkbox"
                    checked={s.leadRotation.includes(t.id)}
                    onChange={(e) => set('leadRotation', e.target.checked ? [...s.leadRotation, t.id] : s.leadRotation.filter((x) => x !== t.id))}
                  />
                  {t.name}
                </label>
              ))}
            </div>
            <p className="crm-muted crm-small">Each new enquiry is given to the next person, who gets a notification. Nobody ticked = unassigned.</p>
            <label className="crm-label">Alert if a new lead hasn’t been contacted within (minutes, 0 = off)</label>
            <input className="crm-input crm-narrow" type="number" min={0} value={s.firstResponseMinutes} onChange={(e) => set('firstResponseMinutes', Number(e.target.value))} />
          </section>

          <section className="crm-set">
            <h2>Install & survey reminders (WhatsApp)</h2>
            <p className="crm-muted crm-small">
              A confirmation goes out as soon as a date is booked, then countdowns. Inside 24h of their last message it’s a free WhatsApp; otherwise the template below (≈2p).
            </p>
            <div className="crm-grid2">
              <div>
                <label className="crm-label">Install: days before</label>
                <input className="crm-input" value={s.installReminderDays.join(', ')} onChange={(e) => set('installReminderDays', e.target.value.split(',').map(Number).filter((n) => Number.isFinite(n)))} />
              </div>
              <div>
                <label className="crm-label">Survey: days before</label>
                <input className="crm-input" value={s.surveyReminderDays.join(', ')} onChange={(e) => set('surveyReminderDays', e.target.value.split(',').map(Number).filter((n) => Number.isFinite(n)))} />
              </div>
            </div>
            <label className="crm-label">Send at (UK hour)</label>
            <input className="crm-input crm-narrow" type="number" min={7} max={20} value={s.reminderHour} onChange={(e) => set('reminderHour', Number(e.target.value))} />
            <div className="crm-grid2">
              <div>
                <label className="crm-label">Install template</label>
                <input className="crm-input" placeholder="install_reminder" value={s.installTemplate} onChange={(e) => set('installTemplate', e.target.value)} />
              </div>
              <div>
                <label className="crm-label">Survey template</label>
                <input className="crm-input" placeholder="survey_reminder" value={s.surveyTemplate} onChange={(e) => set('surveyTemplate', e.target.value)} />
              </div>
            </div>
            <p className="crm-muted crm-small">
              Templates: {'{{1}}'} first name, {'{{2}}'} “in 3 days” / “tomorrow” / “booked for …”, {'{{3}}'} the date and time.{' '}
              <Link href="/admin/enquiries/templates" className="crm-link">
                Send them to Meta and choose them in WhatsApp templates →
              </Link>
            </p>
          </section>

          <section className="crm-set">
            <h2>Review requests</h2>
            <label className="crm-label">Google review link</label>
            <input className="crm-input" placeholder="https://g.page/r/…/review" value={s.reviewUrl} onChange={(e) => set('reviewUrl', e.target.value)} />
            <div className="crm-grid2">
              <div>
                <label className="crm-label">Days after Complete</label>
                <input className="crm-input" type="number" min={0} value={s.reviewDelayDays} onChange={(e) => set('reviewDelayDays', Number(e.target.value))} />
              </div>
              <div>
                <label className="crm-label">Template ({'{{1}}'} name, {'{{2}}'} link)</label>
                <input className="crm-input" placeholder="review_request" value={s.reviewTemplate} onChange={(e) => set('reviewTemplate', e.target.value)} />
              </div>
            </div>
          </section>

          <section className="crm-set">
            <h2>Follow-up sequence for new leads</h2>
            <label className="crm-check">
              <input type="checkbox" checked={s.sequenceEnabled} onChange={(e) => set('sequenceEnabled', e.target.checked)} /> On — stops the moment they reply, or when the
              opportunity moves past Contacted
            </label>
            {s.sequence.map((st, i) => (
              <div key={i} className="crm-step">
                <div className="crm-step-head">
                  <b>Step {i + 1}</b>
                  <button type="button" className="crm-link" onClick={() => set('sequence', s.sequence.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </div>
                <div className="crm-grid2">
                  <div>
                    <label className="crm-label">Hours after enquiry</label>
                    <input className="crm-input" type="number" min={1} value={st.afterHours} onChange={(e) => step(i, { afterHours: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="crm-label">Send by</label>
                    <select className="crm-input" value={st.channel} onChange={(e) => step(i, { channel: e.target.value as SequenceStep['channel'] })}>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                    </select>
                  </div>
                </div>
                {st.channel === 'email' ? (
                  <>
                    <label className="crm-label">Subject</label>
                    <input className="crm-input" value={st.subject || ''} onChange={(e) => step(i, { subject: e.target.value })} />
                  </>
                ) : (
                  <>
                    <label className="crm-label">Template if outside 24h ({'{{1}}'} first name)</label>
                    <input className="crm-input" value={st.template || ''} onChange={(e) => step(i, { template: e.target.value })} />
                  </>
                )}
                <label className="crm-label">Message ({'{first_name}'})</label>
                <textarea className="crm-input" rows={3} value={st.text} onChange={(e) => step(i, { text: e.target.value })} />
              </div>
            ))}
            <button
              type="button"
              className="crm-btn crm-btn--ghost"
              onClick={() => set('sequence', [...s.sequence, { afterHours: (s.sequence.at(-1)?.afterHours || 0) + 48, channel: 'whatsapp', text: 'Hi {first_name}, ' }])}
            >
              + Add step
            </button>
          </section>

          <section className="crm-set">
            <h2>Purchase orders</h2>
            <label className="crm-label" htmlFor="set-office-addr">
              Office / warehouse delivery address
            </label>
            <textarea
              id="set-office-addr"
              className="crm-input"
              rows={3}
              value={s.officeAddress ?? ''}
              onChange={(e) => set('officeAddress', e.target.value)}
              placeholder={'Unit and street\nTown'}
            />
            <label className="crm-label" htmlFor="set-office-pc">
              Postcode
            </label>
            <input id="set-office-pc" className="crm-input crm-narrow" value={s.officePostcode ?? ''} onChange={(e) => set('officePostcode', e.target.value)} />
            <p className="crm-muted crm-small">Where kit can be delivered instead of the job’s site. Until it’s set, “To the office” can’t be picked on an order.</p>
          </section>

          <div className="crm-savebar">
            <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
            {msg && <span className="crm-muted">{msg}</span>}
          </div>
        </fieldset>
      )}

      <Snippets />
      <Library />
    </div>
  );
}

function Snippets() {
  const [items, setItems] = useState<Snippet[] | null>(null);
  const [edit, setEdit] = useState<Partial<Snippet> | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(
    () =>
      fetch('/api/crm/snippets', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => setItems(d.items || [])),
    []
  );
  useEffect(() => {
    load();
  }, [load]);
  async function save() {
    if (!edit) return;
    setErr('');
    const r = await fetch(edit.id ? `/api/crm/snippets/${edit.id}` : '/api/crm/snippets', {
      method: edit.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: edit.title, body: edit.body }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(d.error || 'Not saved');
    setEdit(null);
    load();
  }
  return (
    <section className="crm-set">
      <div className="crm-step-head">
        <h2>Saved replies</h2>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setEdit({ title: '', body: '' })}>
          + New
        </button>
      </div>
      <p className="crm-muted crm-small">One tap in the WhatsApp and email composers. Use {'{first_name}'}, and {'{portal_link}'} for customers whose job has started.</p>
      {edit && (
        <div className="crm-step">
          <label className="crm-label">Title</label>
          <input className="crm-input" value={edit.title || ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <label className="crm-label">Message</label>
          <textarea className="crm-input" rows={4} value={edit.body || ''} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <div className="crm-actions">
            <button type="button" className="crm-btn crm-btn--solar" onClick={save}>
              Save
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <ul className="crm-plainlist">
        {(items ?? []).map((s) => (
          <li key={s.id}>
            <div>
              <b>{s.title}</b>
              <small>{s.body}</small>
            </div>
            <span>
              <button type="button" className="crm-link" onClick={() => setEdit(s)}>
                Edit
              </button>
              <button
                type="button"
                className="crm-link crm-danger"
                style={{ margin: '0 0 0 0.6rem' }}
                onClick={async () => {
                  if (!window.confirm(`Delete “${s.title}”?`)) return;
                  await fetch(`/api/crm/snippets/${s.id}`, { method: 'DELETE' });
                  load();
                }}
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Library() {
  const [items, setItems] = useState<Lib[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(
    () =>
      fetch('/api/crm/library', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => setItems(d.items || [])),
    []
  );
  useEffect(() => {
    load();
  }, [load]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr('');
    try {
      for (const f of Array.from(files)) {
        const prep = await fetch('/api/crm/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'prepare', name: f.name, mime: f.type, size: f.size }),
        });
        const p = await prep.json();
        if (!prep.ok) throw new Error(p.error || 'Upload failed');
        const up = await createClient().storage.from(p.bucket).uploadToSignedUrl(p.path, p.token, f, { contentType: f.type });
        if (up.error) throw new Error(up.error.message);
        await fetch('/api/crm/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save', path: p.path, name: f.name.replace(/\.[a-z0-9]+$/i, ''), mime: f.type, size: f.size }),
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    load();
  }
  return (
    <section className="crm-set">
      <div className="crm-step-head">
        <h2>Document library</h2>
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Uploading…' : '⬆ Upload'}
        </button>
        <input ref={input} type="file" hidden multiple accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => upload(e.target.files)} />
      </div>
      <p className="crm-muted crm-small">Guides and packs you send to lots of customers — EV access guide, intro pack, finance options. Anyone can send them by WhatsApp or email from an opportunity.</p>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <ul className="crm-plainlist">
        {(items ?? []).map((d) => (
          <li key={d.id}>
            <a href={`/api/crm/library/${d.id}`} target="_blank" rel="noreferrer">
              <b>📚 {d.name}</b>
            </a>
            <button
              type="button"
              className="crm-link crm-danger"
              style={{ margin: 0 }}
              onClick={async () => {
                if (!window.confirm(`Delete “${d.name}” from the library?`)) return;
                await fetch(`/api/crm/library/${d.id}`, { method: 'DELETE' });
                load();
              }}
            >
              Delete
            </button>
          </li>
        ))}
        {items && !items.length && <li className="crm-muted">Nothing yet.</li>}
      </ul>
    </section>
  );
}
