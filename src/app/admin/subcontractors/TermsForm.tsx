'use client';

import { useState } from 'react';
import { DEFAULT_RATES } from '@/lib/subcontractors/agreement';
import type { BespokeRate } from '@/lib/subcontractors/types';

export type TermsValue = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  trade: string;
  rateOption: 'default' | 'bespoke';
  bespokeRates: BespokeRate[];
};

export const EMPTY_TERMS: TermsValue = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  trade: '',
  rateOption: 'default',
  bespokeRates: [{ trade: '', rate: '', basis: '' }],
};

const TRADES = ['Electrician', 'Roofer', 'Plumber', 'Solar PV installer', 'BESS installer', 'Labourer', 'Scaffolder'];

/** Who they are + which rate clause (4.1.1 default vs 4.1.2 bespoke) goes into their agreement. */
export function TermsForm({
  initial,
  submitLabel,
  showInvite,
  onSubmit,
  onCancel,
}: {
  initial: TermsValue;
  submitLabel: string;
  showInvite?: boolean;
  onSubmit: (v: TermsValue, sendInvite: boolean) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<TermsValue>(initial);
  const [sendInvite, setSendInvite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof TermsValue) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  function setRate(i: number, k: keyof BespokeRate, val: string) {
    setV({ ...v, bespokeRates: v.bespokeRates.map((r, j) => (j === i ? { ...r, [k]: val } : r)) });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const error = await onSubmit(v, sendInvite);
    if (error) setErr(error);
    setBusy(false);
  }

  return (
    <form className="sc-form" onSubmit={submit}>
      <div className="sc-grid">
        <label>Company / trading name<input required value={v.companyName} onChange={set('companyName')} /></label>
        <label>Contact name<input required value={v.contactName} onChange={set('contactName')} /></label>
        <label>Email<input required type="email" value={v.email} onChange={set('email')} /></label>
        <label>Phone<input type="tel" value={v.phone} onChange={set('phone')} /></label>
        <label>
          Trade
          <input list="sc-trades" value={v.trade} onChange={set('trade')} placeholder="e.g. Electrician" />
          <datalist id="sc-trades">{TRADES.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
      </div>

      <fieldset className="sc-rates">
        <legend>Rates (Clause 4.1)</legend>
        <label className="sc-radio">
          <input type="radio" checked={v.rateOption === 'default'} onChange={() => setV({ ...v, rateOption: 'default' })} />
          <span>
            <strong>4.1.1 Standard default rates</strong> —{' '}
            {DEFAULT_RATES.slice(0, 3).map((r) => `${r.trade} ${r.rate}`).join(' · ')}
          </span>
        </label>
        <label className="sc-radio">
          <input type="radio" checked={v.rateOption === 'bespoke'} onChange={() => setV({ ...v, rateOption: 'bespoke' })} />
          <span><strong>4.1.2 Agreed bespoke rates</strong> — strikes out 4.1.1 for this subcontractor</span>
        </label>
        {v.rateOption === 'bespoke' && (
          <div className="sc-rate-rows">
            {v.bespokeRates.map((r, i) => (
              <div key={i} className="sc-rate-row">
                <input placeholder="Trade / description" value={r.trade} onChange={(e) => setRate(i, 'trade', e.target.value)} />
                <input placeholder="Rate e.g. £250" value={r.rate} onChange={(e) => setRate(i, 'rate', e.target.value)} />
                <input placeholder="Basis e.g. per day" value={r.basis} onChange={(e) => setRate(i, 'basis', e.target.value)} />
                <button
                  type="button"
                  className="sc-x"
                  aria-label="Remove rate"
                  onClick={() => setV({ ...v, bespokeRates: v.bespokeRates.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="sc-btn-ghost"
              onClick={() => setV({ ...v, bespokeRates: [...v.bespokeRates, { trade: '', rate: '', basis: '' }] })}
            >
              + Add rate
            </button>
          </div>
        )}
      </fieldset>

      {showInvite && (
        <label className="sc-check">
          <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
          Email them their onboarding link now
        </label>
      )}
      {err && <p className="sc-error">{err}</p>}
      <div className="sc-row">
        <button className="sc-btn" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="sc-btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
