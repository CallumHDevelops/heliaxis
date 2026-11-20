'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormFlow, type FlowView } from '@/components/forms/FormFlow';
import type { RequestRow } from '@/lib/requests/server';
import type { Answers } from '@/lib/templates/types';
import { PlainSheet } from './RecordSheets';
import { send } from './record-shared';

/**
 * "Request installer information" and "Complete it myself" on a pack item (src/lib/requests): ask an
 * installer to fill the item's questions on their phone by a private link, or answer them here, one at
 * a time, on the same screen they'd see.
 */

type Installer = { id: string; name: string; company: string | null; email: boolean; whatsapp: boolean; trades: string[] };
type RequestsData = { requests: RequestRow[]; installers: Installer[] };

export function useRequests(projectId: string) {
  const [data, setData] = useState<RequestsData | null>(null);
  const fetchData = useCallback(
    () =>
      fetch(`/api/crm/projects/${projectId}/requests`, { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<RequestsData>) : null))
        .catch(() => null),
    [projectId]
  );
  const load = useCallback(async () => {
    const d = await fetchData();
    if (d) setData(d);
  }, [fetchData]);
  useEffect(() => {
    let live = true;
    fetchData().then((d) => {
      if (live && d) setData(d);
    });
    return () => {
      live = false;
    };
  }, [fetchData]);
  return { data, reload: load };
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** "Asked Dan, 20 Nov · opened" for an item's newest request. */
export function requestWords(r: RequestRow | undefined): string | null {
  if (!r || r.cancelled_at) return null;
  const first = r.contact_name.split(/\s+/)[0];
  if (r.submitted_at) return `${first} filled it in, ${day(r.submitted_at)}`;
  return `Asked ${first}, ${day(r.created_at)}${r.opened_at ? ' · opened' : ' · not opened yet'}`;
}

export function RequestSheet({
  projectId,
  code,
  title,
  data,
  onClose,
  onSent,
}: {
  projectId: string;
  code: string;
  title: string;
  data: RequestsData | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [q, setQ] = useState('');
  const [who, setWho] = useState<string | null>(null);
  const [email, setEmail] = useState(true);
  const [wa, setWa] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ url: string; whatsapp: string | null; notes: string[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const people = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (data?.installers ?? []).filter((p) => !k || `${p.name} ${p.company ?? ''}`.toLowerCase().includes(k)).slice(0, 40);
  }, [data, q]);
  const chosen = data?.installers.find((p) => p.id === who) ?? null;
  const open = (data?.requests ?? []).find((r) => r.target === code && !r.cancelled_at && !r.submitted_at);

  async function go() {
    if (!chosen) return setErr('Choose who to ask.');
    setBusy(true);
    setErr('');
    try {
      const via = [email && chosen.email ? 'email' : null, wa && chosen.whatsapp ? 'whatsapp' : null].filter(Boolean);
      const r = await send<{ url: string; whatsapp: string | null; notes: string[] }>(`/api/crm/projects/${projectId}/requests`, 'POST', { action: 'create', code, contact_id: chosen.id, via, note });
      setDone(r);
      if (r.whatsapp) window.open(r.whatsapp, '_blank', 'noopener');
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not sent');
    }
    setBusy(false);
  }

  return (
    <PlainSheet label="Request installer information" onClose={onClose}>
      <h2>Request installer information</h2>
      <p className="crm-muted crm-small">
        <b>{title}</b>: they get a private link and answer it on their phone, one question at a time. Their answers come straight into the pack.
      </p>
      {done ? (
        <>
          <p className="crm-banner" role="status">
            Sent to {chosen?.name}. {done.notes.join(' ')}
            {done.whatsapp ? ' WhatsApp opened with the message ready: press send there.' : ''}
          </p>
          <label className="crm-label">Their link</label>
          <div className="hv-acts__row">
            <input className="crm-input" readOnly value={done.url} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="crm-btn crm-btn--ghost crm-btn--small"
              onClick={async () => {
                await navigator.clipboard.writeText(done.url).catch(() => null);
                setCopied(true);
              }}
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            {done.whatsapp && (
              <a className="crm-btn crm-btn--ghost crm-btn--small" href={done.whatsapp} target="_blank" rel="noreferrer">
                WhatsApp again
              </a>
            )}
          </div>
          <div className="crm-actions">
            <button type="button" className="crm-btn crm-btn--solar" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          {open && (
            <p className="crm-small hv-hold">
              Already asked {open.contact_name}, {day(open.created_at)}
              {open.opened_at ? ' (opened)' : ''}. Asking again replaces that link.
            </p>
          )}
          <label className="crm-label" htmlFor="rq-q">
            Who to ask
          </label>
          <input id="rq-q" className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search installers…" />
          <ul className="rq-people" role="listbox" aria-label="Installers">
            {!data && <li className="crm-muted crm-small">Loading…</li>}
            {data && !people.length && <li className="crm-muted crm-small">No one found. Add installers on a job’s Site tab first.</li>}
            {people.map((p) => (
              <li key={p.id}>
                <button type="button" role="option" aria-selected={who === p.id} className={`rq-person${who === p.id ? ' on' : ''}`} onClick={() => setWho(p.id)}>
                  <b>{p.name}</b>
                  <small>
                    {[p.company, p.trades.join(', '), p.email ? 'email' : null, p.whatsapp ? 'WhatsApp' : null].filter(Boolean).join(' · ')}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {chosen && (
            <div className="hv-acts__row">
              <label className="crm-check">
                <input type="checkbox" checked={email && chosen.email} disabled={!chosen.email} onChange={(e) => setEmail(e.target.checked)} /> Email it
                {!chosen.email && ' (no email)'}
              </label>
              <label className="crm-check">
                <input type="checkbox" checked={wa && chosen.whatsapp} disabled={!chosen.whatsapp} onChange={(e) => setWa(e.target.checked)} /> WhatsApp it from my phone
                {!chosen.whatsapp && ' (no number)'}
              </label>
            </div>
          )}
          <label className="crm-label" htmlFor="rq-note">
            A note for them (optional)
          </label>
          <textarea id="rq-note" className="crm-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="e.g. The isolator details from Tuesday’s install, please" />
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <div className="crm-actions">
            <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !chosen} onClick={() => void go()}>
              {busy ? 'Sending…' : chosen ? `Send to ${chosen.name.split(/\s+/)[0]}` : 'Send'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}
    </PlainSheet>
  );
}

/** "Complete it myself": the step-by-step screen, full screen over the job. */
export function OfficeFill({ projectId, code, me, onClose }: { projectId: string; code: string; me: string; onClose: () => void }) {
  const [view, setView] = useState<FlowView | null>(null);
  const [err, setErr] = useState('');
  const url = `/api/crm/projects/${projectId}/fill/${encodeURIComponent(code)}`;
  useEffect(() => {
    fetch(url, { cache: 'no-store' })
      .then(async (r) => (r.ok ? setView((await r.json()) as FlowView) : setErr((await r.json().catch(() => ({}))).error || 'Couldn’t open it.')))
      .catch(() => setErr('Couldn’t open it.'));
  }, [url]);
  if (!view)
    return (
      <PlainSheet label="Opening" onClose={onClose}>
        <p className={err ? 'crm-banner crm-banner--err' : 'crm-muted'}>{err || 'Opening…'}</p>
      </PlainSheet>
    );
  return <FormFlow view={view} who={me} onClose={onClose} save={(answers: Answers) => send<FlowView>(url, 'POST', { answers })} finish={(sign) => send<FlowView>(url, 'POST', { finish: true, ...(sign ?? {}) })} />;
}
