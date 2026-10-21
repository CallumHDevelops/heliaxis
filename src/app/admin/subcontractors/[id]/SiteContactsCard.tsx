'use client';

import { useCallback, useEffect, useState } from 'react';
import { mobileProblem } from '@/lib/site/phone';
import type { ContactRow } from '@/lib/site/server';
import { TRADE_LABEL, type Trade } from '@/lib/site/types';

type Operative = { id: string; full_name: string; phone: string | null; email: string | null };

/**
 * The firm's people who go to site (site-commissioning.sql): one place for their mobile number and
 * "Happy to get job messages on WhatsApp", which job packs and POs go to. The firm's main contact is
 * added from their own details the first time the firm is put on a job; anyone from their team can
 * be added here.
 */
export function SiteContactsCard({ firmId }: { firmId: string }) {
  const [contacts, setContacts] = useState<ContactRow[] | null>(null);
  const [operatives, setOperatives] = useState<Operative[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState('');

  const load = useCallback(async () => {
    const r = await fetch(`/api/crm/site-contacts?firm=${firmId}`, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(d.error || 'Couldn’t load their site contacts.');
    setContacts(d.contacts as ContactRow[]);
    setOperatives(d.operatives as Operative[]);
  }, [firmId]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function call(method: 'POST' | 'PATCH', body: Record<string, unknown>) {
    setBusy(true);
    setErr('');
    const r = await fetch('/api/crm/site-contacts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setErr(d.error || 'Not saved. Try again.');
    await load();
    setBusy(false);
    return r.ok;
  }

  const listed = new Set((contacts ?? []).map((c) => c.operative_id).filter(Boolean));
  const hasMain = (contacts ?? []).some((c) => !c.operative_id);
  const addable = operatives.filter((o) => !listed.has(o.id));
  return (
    <section className="sc-card">
      <h2>Site contacts</h2>
      <p className="sc-muted">Who goes to site for them. Job packs and POs go to these mobiles and emails.</p>
      {err && <p className="sc-error">{err}</p>}
      {!contacts ? (
        <p className="sc-muted">Loading…</p>
      ) : (
        <ul className="sc-list">
          {contacts.length === 0 && <li className="sc-muted">Nobody yet. Their main contact is added the first time they’re put on a job.</li>}
          {contacts.map((c) => (
            <SiteContactRow key={c.id} c={c} busy={busy} onSave={(b) => call('PATCH', { id: c.id, ...b })} />
          ))}
        </ul>
      )}
      <div className="sc-row-between" style={{ marginTop: '0.6rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        {!hasMain && contacts && (
          <button type="button" className="sc-btn-ghost" disabled={busy} onClick={() => void call('POST', { firm_id: firmId })}>
            Add their main contact
          </button>
        )}
        {addable.length > 0 && (
          <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Add someone from their team">
              <option value="">Add someone from their team…</option>
              {addable.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="sc-btn-ghost"
              disabled={busy || !adding}
              onClick={async () => {
                if (await call('POST', { firm_id: firmId, operative_id: adding })) setAdding('');
              }}
            >
              Add
            </button>
          </span>
        )}
      </div>
    </section>
  );
}

function SiteContactRow({ c, busy, onSave }: { c: ContactRow; busy: boolean; onSave: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [mobile, setMobile] = useState(c.mobile ?? '');
  const [email, setEmail] = useState(c.email ?? '');
  const problem = mobileProblem(mobile);
  return (
    <li>
      <span>
        <strong>{c.name}</strong>
        <span className="sc-sub">
          {[c.trades.map((t) => TRADE_LABEL[t as Trade] ?? t).join(', '), c.mobile, c.email].filter(Boolean).join(' · ') || 'No mobile or email yet'}
        </span>
        {editing && (
          <span className="sc-grid" style={{ marginTop: '0.4rem' }}>
            <label>
              Mobile
              <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
              {problem && <span className="sc-sub is-bad">{problem}</span>}
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'end' }}>
              <button
                type="button"
                className="sc-btn"
                disabled={busy || !!problem}
                onClick={async () => {
                  if (await onSave({ mobile, email })) setEditing(false);
                }}
              >
                Save
              </button>
              <button type="button" className="sc-btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </span>
          </span>
        )}
        <label className="sc-sub" style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginTop: '0.3rem' }}>
          <input type="checkbox" checked={c.whatsapp_ok} disabled={busy} onChange={(e) => void onSave({ whatsapp_ok: e.target.checked })} />
          Happy to get job messages on WhatsApp
          {c.whatsapp_ok && c.whatsapp_ok_at ? ` (recorded ${new Date(c.whatsapp_ok_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})` : ''}
        </label>
      </span>
      {!editing && (
        <button type="button" className="sc-btn-ghost" onClick={() => setEditing(true)}>
          Edit
        </button>
      )}
    </li>
  );
}
