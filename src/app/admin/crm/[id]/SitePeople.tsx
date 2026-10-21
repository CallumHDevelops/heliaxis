'use client';

import { useEffect, useState } from 'react';
import { mobileProblem } from '@/lib/site/assign';
import type { PickRow } from '@/lib/site/server';
import { TRADE_LABEL, type Trade } from '@/lib/site/types';

/**
 * Who's doing it (screen D1/D3): one box that finds a site contact or a subcontractor firm
 * ("Dave Price · Price Roofing · roofer · 07…"), that trade first, with + New person at the bottom
 * for someone who isn't in the app yet (a quick contact: name, company, email, mobile).
 */

export type NewPerson = { name: string; company: string; email: string; mobile: string; vat_number: string; whatsapp_ok: boolean };
export const EMPTY_PERSON: NewPerson = { name: '', company: '', email: '', mobile: '', vat_number: '', whatsapp_ok: false };
/** What's picked: someone already in the app, or a new person to add with the trade. */
export type Picked = { kind: 'row'; row: PickRow } | { kind: 'new'; person: NewPerson } | null;

/** The new person's problem, in words, or null when they can be saved. */
export function newPersonProblem(p: NewPerson): string | null {
  if (!p.name.trim()) return 'Add their name.';
  if (p.email.trim() && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(p.email.trim())) return 'That email address doesn’t look right.';
  return mobileProblem(p.mobile);
}

export function PersonPicker({ trade, picked, onPick, idPrefix }: { trade: Trade; picked: Picked; onPick: (p: Picked) => void; idPrefix: string }) {
  if (picked?.kind === 'row') {
    const r = picked.row;
    return (
      <div className="crmh-picked sx-picked">
        <span>
          <b>{r.name}</b>
          <small> · {[r.company, r.trades.join(', '), r.mobile].filter(Boolean).join(' · ')}</small>
          {r.firm_status && r.firm_status !== 'active' && <small className="sx-warnline"> · Their onboarding isn’t finished ({r.firm_status.replace(/_/g, ' ')})</small>}
        </span>
        <button type="button" className="crm-link" onClick={() => onPick(null)}>
          Change
        </button>
      </div>
    );
  }
  if (picked?.kind === 'new') return <NewPersonForm value={picked.person} onChange={(person) => onPick({ kind: 'new', person })} onCancel={() => onPick(null)} idPrefix={idPrefix} />;
  return <PeopleSearch trade={trade} onPick={(row) => onPick({ kind: 'row', row })} onNew={() => onPick({ kind: 'new', person: EMPTY_PERSON })} />;
}

function PeopleSearch({ trade, onPick, onNew }: { trade: Trade; onPick: (r: PickRow) => void; onNew: () => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ key: string; rows: PickRow[]; error?: string } | null>(null);
  const key = `${trade}|${q.trim()}`;
  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/crm/site-contacts?trade=${trade}&q=${encodeURIComponent(q.trim())}`, { cache: 'no-store', signal: ctl.signal });
        const d = await r.json().catch(() => ({}));
        setFound({ key: `${trade}|${q.trim()}`, rows: r.ok ? ((d.people ?? []) as PickRow[]) : [], error: r.ok ? undefined : d.error || 'Couldn’t search' });
      } catch {
        // Still typing, or offline.
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q, trade]);
  const rows = found?.key === key ? found.rows : null;
  return (
    <div className="crmh-picker">
      <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find a ${TRADE_LABEL[trade].toLowerCase()}: name, firm or mobile`} aria-label={`Find the ${TRADE_LABEL[trade].toLowerCase()}`} />
      <ul className="crmh-picker__list">
        {rows === null && <li className="crm-muted">Looking…</li>}
        {found?.key === key && found.error && <li className="crm-muted">{found.error}</li>}
        {rows?.length === 0 && !found?.error && <li className="crm-muted">{q.trim() ? `Nobody found for “${q.trim()}”.` : 'Nobody yet. Add them below.'}</li>}
        {rows?.slice(0, 8).map((r) => (
          <li key={r.contact_id ?? `firm-${r.firm_id}`}>
            <button type="button" onClick={() => onPick(r)}>
              <span>
                <b>{r.name}</b>
                <small> {[r.company, r.trades.join(', '), r.mobile].filter(Boolean).join(' · ')}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={onNew}>
        + New person
      </button>
    </div>
  );
}

function NewPersonForm({ value: p, onChange, onCancel, idPrefix }: { value: NewPerson; onChange: (p: NewPerson) => void; onCancel: () => void; idPrefix: string }) {
  const mobileErr = mobileProblem(p.mobile);
  return (
    <div className="sx-newperson">
      <div className="crm-grid2">
        <div>
          <label className="crm-label" htmlFor={`${idPrefix}-name`}>
            Name
          </label>
          <input id={`${idPrefix}-name`} className="crm-input" value={p.name} onChange={(e) => onChange({ ...p, name: e.target.value })} autoFocus />
        </div>
        <div>
          <label className="crm-label" htmlFor={`${idPrefix}-company`}>
            Company
          </label>
          <input id={`${idPrefix}-company`} className="crm-input" value={p.company} onChange={(e) => onChange({ ...p, company: e.target.value })} />
        </div>
        <div>
          <label className="crm-label" htmlFor={`${idPrefix}-mobile`}>
            Mobile
          </label>
          <input id={`${idPrefix}-mobile`} className="crm-input" type="tel" value={p.mobile} onChange={(e) => onChange({ ...p, mobile: e.target.value })} aria-invalid={!!mobileErr} />
          {mobileErr && <small className="crm-err">{mobileErr}</small>}
        </div>
        <div>
          <label className="crm-label" htmlFor={`${idPrefix}-email`}>
            Email
          </label>
          <input id={`${idPrefix}-email`} className="crm-input" type="email" value={p.email} onChange={(e) => onChange({ ...p, email: e.target.value })} />
        </div>
        <div>
          <label className="crm-label" htmlFor={`${idPrefix}-vat`}>
            VAT number (if they have one)
          </label>
          <input id={`${idPrefix}-vat`} className="crm-input" value={p.vat_number} onChange={(e) => onChange({ ...p, vat_number: e.target.value })} />
        </div>
      </div>
      <label className="crm-check">
        <input type="checkbox" checked={p.whatsapp_ok} onChange={(e) => onChange({ ...p, whatsapp_ok: e.target.checked })} /> Happy to get job messages on WhatsApp
      </label>
      <p className="crm-muted crm-small">Not verified for CIS yet, so 30% is deducted until you record their verification.</p>
      <button type="button" className="crm-link" onClick={onCancel}>
        Find someone already in the app instead
      </button>
    </div>
  );
}

/** The person as the API takes it, in an assignment. */
export function personBody(p: Picked): Record<string, unknown> {
  if (!p) return {};
  if (p.kind === 'row') return p.row.contact_id ? { contact_id: p.row.contact_id } : { firm_id: p.row.firm_id };
  return { new_contact: { ...p.person } };
}
