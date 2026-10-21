'use client';

import { useEffect, useState } from 'react';
import { suggestedTrades } from '@/lib/site/trades';
import { BASIS_LABEL, penceToInput, poundsToPence, VAT_WORDS, type RateBasis, type VatTreatment } from '@/lib/site/money';
import { TRADE_LABEL, TRADES, type Trade } from '@/lib/site/types';
import { newPersonProblem, PersonPicker, personBody, type Picked } from '../crm/[id]/SitePeople';

/**
 * New project's optional "Who's doing the work" block (screen D1): one row per trade the products
 * suggest (solar → scaffolder, roofer, electrician; battery, EV or heat pump → electrician), each
 * with the person, the agreed rate and how it's paid, and the start date, plus Add another trade.
 * The rows go to POST /api/crm/projects as `assignments`, made once the job is.
 */

export type TradeRow = { key: string; trade: Trade; picked: Picked; rate: string; basis: RateBasis | ''; qty: string; starts_on: string; vat: VatTreatment | '' };

const newRow = (trade: Trade): TradeRow => ({ key: `${trade}-${Math.random().toString(36).slice(2, 8)}`, trade, picked: null, rate: '', basis: '', qty: '', starts_on: '', vat: '' });

/** The rows suggested for these products, keeping any already filled in. */
export function rowsFor(products: string[], rows: TradeRow[]): TradeRow[] {
  const keep = rows.filter((r) => r.picked || r.rate);
  const want = suggestedTrades(products).filter((t) => !keep.some((r) => r.trade === t));
  return [...keep, ...want.map(newRow)];
}

/** Rows with a person chosen, as the API takes them; or the first problem in words. */
export function tradesBody(rows: TradeRow[], vatDefault: string): { ok: true; assignments: Record<string, unknown>[] } | { ok: false; error: string } {
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (!r.picked) continue;
    const who = TRADE_LABEL[r.trade].toLowerCase();
    if (r.picked.kind === 'new') {
      const p = newPersonProblem(r.picked.person);
      if (p) return { ok: false, error: `The ${who}: ${p}` };
    }
    const pence = poundsToPence(r.rate);
    if (pence === undefined) return { ok: false, error: `The ${who}’s rate isn’t an amount. Type pounds and pence, e.g. 30.00.` };
    if (pence != null && !r.basis) return { ok: false, error: `Say how the ${who} is paid: fixed, per panel, per day or per hour.` };
    if ((r.basis === 'per_day' || r.basis === 'per_hour') && pence != null && !r.qty.trim()) return { ok: false, error: `How many ${r.basis === 'per_day' ? 'days' : 'hours'} were agreed with the ${who}?` };
    const registered = r.picked.kind === 'row' ? r.picked.row.vat_registered : !!r.picked.person.vat_number.trim();
    if (registered && !r.vat && !vatDefault) return { ok: false, error: `The ${who} is VAT registered. Choose the VAT for this job.` };
    out.push({
      trade: r.trade,
      ...personBody(r.picked),
      rate_pence: pence,
      rate_basis: r.basis || null,
      rate_qty: r.basis === 'per_day' || r.basis === 'per_hour' ? r.qty || null : null,
      starts_on: r.starts_on || null,
      ...(registered && r.vat ? { vat_treatment: r.vat } : {}),
    });
  }
  return { ok: true, assignments: out };
}

export function NewProjectTrades({ rows, onChange, vatDefault }: { rows: TradeRow[]; onChange: (rows: TradeRow[]) => void; vatDefault: string }) {
  const set = (key: string, p: Partial<TradeRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));
  return (
    <fieldset className="nps-trades">
      <legend className="crm-label">Who’s doing the work (optional)</legend>
      <p className="crm-muted crm-small">Each one gets a job pack on their phone and signs off when they’re done; their PO is raised from the rate.</p>
      {rows.map((r) => {
        const registered = r.picked?.kind === 'row' ? r.picked.row.vat_registered : r.picked?.kind === 'new' ? !!r.picked.person.vat_number.trim() : false;
        return (
          <div key={r.key} className="nps-trade">
            <div className="nps-trade__head">
              <select className="crm-input" value={r.trade} onChange={(e) => set(r.key, { trade: e.target.value as Trade, picked: null })} aria-label="Trade">
                {TRADES.filter((t) => t !== 'other').map((t) => (
                  <option key={t} value={t}>
                    {TRADE_LABEL[t]}
                  </option>
                ))}
              </select>
              <button type="button" className="crm-link" onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
                Remove
              </button>
            </div>
            <PersonPicker
              trade={r.trade}
              picked={r.picked}
              idPrefix={`nps-${r.key}`}
              onPick={(picked) => set(r.key, { picked, ...(picked?.kind === 'row' && picked.row.rate && !r.rate ? { rate: penceToInput(picked.row.rate.pence), basis: picked.row.rate.basis } : {}) })}
            />
            {r.picked && (
              <div className="nps-trade__money">
                <span className="nps-pounds">
                  <span aria-hidden="true">£</span>
                  <input className="crm-input" inputMode="decimal" value={r.rate} onChange={(e) => set(r.key, { rate: e.target.value })} placeholder="Rate" aria-label={`${TRADE_LABEL[r.trade]}: rate ex VAT`} />
                </span>
                <select className="crm-input" value={r.basis} onChange={(e) => set(r.key, { basis: e.target.value as RateBasis | '' })} aria-label={`${TRADE_LABEL[r.trade]}: how it’s paid`}>
                  <option value="">How is it paid?</option>
                  {(Object.keys(BASIS_LABEL) as RateBasis[]).map((b) => (
                    <option key={b} value={b}>
                      {BASIS_LABEL[b]}
                    </option>
                  ))}
                </select>
                {(r.basis === 'per_day' || r.basis === 'per_hour') && (
                  <input className="crm-input nps-qty" inputMode="decimal" value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value })} placeholder={r.basis === 'per_day' ? 'Days' : 'Hours'} aria-label="How many" />
                )}
                <input className="crm-input" type="date" value={r.starts_on} onChange={(e) => set(r.key, { starts_on: e.target.value })} aria-label={`${TRADE_LABEL[r.trade]}: start date`} />
                {registered ? (
                  <select className="crm-input" value={r.vat} onChange={(e) => set(r.key, { vat: e.target.value as VatTreatment | '' })} aria-label="VAT">
                    <option value="">{vatDefault ? `Company default: ${VAT_WORDS[vatDefault as VatTreatment]}` : 'Choose the VAT'}</option>
                    {(['reverse_charge', 'standard', 'zero'] as VatTreatment[]).map((v) => (
                      <option key={v} value={v}>
                        {VAT_WORDS[v]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="nps-novat">No VAT</span>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => onChange([...rows, newRow('electrician')])}>
        + Add another trade
      </button>
    </fieldset>
  );
}

/** The company's VAT default for VAT-registered subcontractors ('' = choose each time). */
export function useVatDefault(on: boolean): string {
  const [v, setV] = useState('');
  useEffect(() => {
    if (!on) return;
    let live = true;
    fetch('/api/crm/site-contacts?meta=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d && typeof d.vatDefault === 'string') setV(d.vatDefault);
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [on]);
  return v;
}
