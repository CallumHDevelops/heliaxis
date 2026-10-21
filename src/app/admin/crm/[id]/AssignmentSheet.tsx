'use client';

import { useState } from 'react';
import { moneyLine, vatFor } from '@/lib/site/assign';
import { ELECTRICIAN_FORMS, FORM_LABEL, formsFor } from '@/lib/site/forms';
import { defaultCertRoute } from '@/lib/site/forms/electrician/cert';
import { basesFor, BASIS_LABEL, CIS_RATES, penceToInput, poundsToPence, VAT_WORDS, type CisRate, type RateBasis, type VatTreatment } from '@/lib/site/money';
import type { AssignmentView, SiteTabData } from '@/lib/site/server';
import { TRADE_LABEL, TRADES, type Trade } from '@/lib/site/types';
import { Sheet } from '../CrmUi';
import { send } from './record-shared';
import { newPersonProblem, PersonPicker, personBody, type Picked } from './SitePeople';

/**
 * A trade on the job (screen D3): who, the trade, what they're doing and when, the agreed rate and
 * how it's paid, the VAT (locked to "no VAT" when they aren't VAT registered), the CIS deduction
 * (with "Change for this job"), whether a PO is raised, and for an electrician the paperwork. The
 * PO preview at the bottom shows once every figure is known: "£480.00 · no VAT · CIS −£96.00 ·
 * pays £384.00".
 */

const CERT_ROUTES: [string, string][] = [
  ['eic', 'EIC in the app (design, construction, inspection and testing)'],
  ['eic_single', 'EIC in the app, one person did all three'],
  ['meiwc', 'Minor Works certificate'],
  ['own', 'They upload their own NAPIT / NICEIC certificate'],
];
const VAT_CHOICES: VatTreatment[] = ['reverse_charge', 'standard', 'zero'];
const CIS_CHOICE: Record<CisRate, string> = { gross: 'Gross: no deduction', net: 'Net: 20% deducted', higher: 'Higher rate: 30% deducted' };

type Draft = {
  trade: Trade;
  trade_label: string;
  scope: string;
  starts_on: string;
  days: string;
  rate: string;
  rate_basis: RateBasis | '';
  rate_qty: string;
  raise_po: boolean;
  vat_treatment: VatTreatment | '';
  vat_note: string;
  cis_override: CisRate | '';
  share_customer_phone: boolean;
  note_to_trade: string;
  forms: string[];
  cert_route: string;
};

export function AssignmentSheet({
  data,
  existing,
  preset,
  onClose,
  onSaved,
}: {
  data: SiteTabData;
  existing?: AssignmentView | null;
  /** A new one: start with this trade. */
  preset?: Trade | null;
  onClose: () => void;
  onSaved: (d: SiteTabData) => void;
}) {
  const products = data.job.products;
  const start: Draft = existing
    ? {
        trade: existing.trade,
        trade_label: existing.trade_label ?? '',
        scope: existing.scope ?? '',
        starts_on: existing.starts_on ?? '',
        days: existing.days == null ? '' : String(existing.days),
        rate: penceToInput(existing.rate_pence),
        rate_basis: existing.rate_basis ?? '',
        rate_qty: existing.rate_qty == null ? '' : String(existing.rate_qty),
        raise_po: existing.raise_po,
        vat_treatment: existing.vat_treatment ?? '',
        vat_note: existing.vat_note ?? '',
        cis_override: existing.cis_override ?? '',
        share_customer_phone: existing.share_customer_phone,
        note_to_trade: existing.note_to_trade ?? '',
        forms: existing.forms,
        cert_route: existing.cert_route,
      }
    : {
        trade: preset ?? 'roofer',
        trade_label: '',
        scope: '',
        starts_on: '',
        days: '',
        rate: '',
        rate_basis: '',
        rate_qty: '',
        raise_po: true,
        vat_treatment: '',
        vat_note: '',
        cis_override: '',
        share_customer_phone: true,
        note_to_trade: '',
        forms: formsFor(products),
        cert_route: defaultCertRoute(),
      };
  const [d, setD] = useState<Draft>(start);
  const [picked, setPicked] = useState<Picked>(null);
  const [changeCis, setChangeCis] = useState(!!start.cis_override);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const signed = existing?.status === 'signed' || existing?.status === 'done';
  // Signed off, the money can still be put right while the PO waits for the office; once it has
  // gone, reopen the sign-off to change it.
  const fixed = signed && !!existing?.po && (existing.po.status !== 'draft' || existing.po.version > 0);

  // Who it is, for the VAT and CIS lines.
  const person = existing
    ? { vatRegistered: existing.contact.vat_registered, cis: existing.contact.cis_facts, agreed: existing.agreed }
    : picked?.kind === 'row'
      ? { vatRegistered: picked.row.vat_registered, cis: picked.row.cis_facts, agreed: picked.row.rate }
      : picked?.kind === 'new'
        ? { vatRegistered: !!picked.person.vat_number.trim(), cis: { verifiedOn: null, rate: null }, agreed: null }
        : null;
  const ratePence = poundsToPence(d.rate);
  const vat = person ? vatFor(person.vatRegistered, d.vat_treatment || null, data.vatDefault as '' | 'reverse_charge' | 'standard' | 'zero') : null;
  const money = person
    ? moneyLine({
        rate_pence: typeof ratePence === 'number' ? ratePence : null,
        rate_basis: d.rate_basis || null,
        rate_qty: d.rate_qty ? Number(d.rate_qty) : null,
        vat_treatment: vat?.ok ? vat.value : null,
        raise_po: d.raise_po,
        cis: { ...person.cis, override: d.cis_override || null },
      })
    : null;
  const fromAgreement = !!person?.agreed && ratePence === person.agreed.pence && d.rate_basis === person.agreed.basis;

  function pick(p: Picked) {
    setPicked(p);
    // Their agreed rate, when it's plain and nothing's typed yet.
    if (p?.kind === 'row' && p.row.rate && !d.rate) set({ rate: penceToInput(p.row.rate.pence), rate_basis: p.row.rate.basis });
  }

  async function save() {
    setErr('');
    if (!existing) {
      if (!picked) return setErr('Choose who’s doing it.');
      if (picked.kind === 'new') {
        const problem = newPersonProblem(picked.person);
        if (problem) return setErr(problem);
      }
    }
    if (ratePence === undefined) return setErr('The rate isn’t an amount. Type pounds and pence, e.g. 30.00.');
    if (vat && !vat.ok) return setErr(vat.error);
    const body: Record<string, unknown> = {
      trade_label: d.trade === 'other' ? d.trade_label : null,
      scope: d.scope,
      starts_on: d.starts_on || null,
      days: d.days || null,
      share_customer_phone: d.share_customer_phone,
      note_to_trade: d.note_to_trade,
      ...(d.trade === 'electrician' ? { forms: d.forms, cert_route: d.cert_route } : {}),
      ...(fixed
        ? {}
        : {
            rate_pence: ratePence,
            rate_basis: d.rate_basis || null,
            rate_qty: d.rate_basis === 'per_day' || d.rate_basis === 'per_hour' ? d.rate_qty || null : null,
            raise_po: d.raise_po,
            vat_treatment: d.vat_treatment || null,
            vat_note: d.vat_note,
            cis_override: changeCis ? d.cis_override || null : null,
          }),
    };
    setBusy(true);
    try {
      const out = existing
        ? await send<SiteTabData>(`/api/crm/site-assignments/${existing.id}`, 'PATCH', body)
        : await send<SiteTabData>(`/api/crm/projects/${data.job.id}/site`, 'POST', { assignments: [{ ...body, trade: d.trade, ...personBody(picked) }] });
      onSaved(out);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved. Try again.');
    }
    setBusy(false);
  }

  return (
    <Sheet title={existing ? `${existing.title}: ${existing.contact.name}` : 'Add a trade'} onClose={onClose} wide>
      {!existing && (
        <>
          <label className="crm-label">Trade</label>
          <div className="crm-checks" role="radiogroup" aria-label="Trade">
            {TRADES.map((t) => (
              <label key={t} className={d.trade === t ? 'on' : ''}>
                <input type="radio" name="sx-trade" checked={d.trade === t} onChange={() => set({ trade: t })} />
                {TRADE_LABEL[t]}
              </label>
            ))}
          </div>
          {d.trade === 'other' && <input className="crm-input" value={d.trade_label} onChange={(e) => set({ trade_label: e.target.value })} placeholder="Which trade? e.g. Plasterer" aria-label="Which trade" />}
          <label className="crm-label">Who</label>
          <PersonPicker trade={d.trade} picked={picked} onPick={pick} idPrefix="sx-new" />
        </>
      )}
      {existing && (
        <p className="crm-muted">
          {[existing.contact.company, existing.contact.mobile, existing.contact.email].filter(Boolean).join(' · ')}
          {existing.contact.firm_ref ? ` · ${existing.contact.firm_ref}` : ''}
        </p>
      )}

      <label className="crm-label" htmlFor="sx-scope">
        What they’re doing (printed on the PO)
      </label>
      <input id="sx-scope" className="crm-input" value={d.scope} onChange={(e) => set({ scope: e.target.value })} placeholder={d.trade === 'roofer' ? 'e.g. Mount and wire 16 panels, rear roof' : 'e.g. Erect and strike scaffold, front and rear'} />

      <div className="crm-grid2">
        <div>
          <label className="crm-label" htmlFor="sx-start">
            Start date
          </label>
          <input id="sx-start" className="crm-input" type="date" value={d.starts_on} onChange={(e) => set({ starts_on: e.target.value })} />
        </div>
        <div>
          <label className="crm-label" htmlFor="sx-days">
            Days on site
          </label>
          <input id="sx-days" className="crm-input" inputMode="decimal" value={d.days} onChange={(e) => set({ days: e.target.value })} placeholder="1" />
        </div>
      </div>

      <fieldset className="sx-fs" disabled={fixed}>
        <legend className="crm-label">
          Agreed rate{' '}
          {fixed ? (
            <small className="crm-muted">(fixed: the PO has gone. Reopen the sign-off to change it)</small>
          ) : (
            signed && <small className="crm-muted">(signed off: the PO waits for this)</small>
          )}
        </legend>
        <div className="sx-rate">
          <span className="sx-money">
            <span aria-hidden="true">£</span>
            <input className="crm-input" inputMode="decimal" value={d.rate} onChange={(e) => set({ rate: e.target.value })} placeholder="0.00" aria-label="Rate in pounds, ex VAT" />
          </span>
          <select className="crm-input" value={d.rate_basis} onChange={(e) => set({ rate_basis: e.target.value as RateBasis | '' })} aria-label="How the rate is paid">
            <option value="">How is it paid?</option>
            {/* Per panel for the roofer only; an older one on another trade still shows, to be changed. */}
            {[...basesFor(d.trade), ...(d.rate_basis === 'per_panel' && d.trade !== 'roofer' ? (['per_panel'] as RateBasis[]) : [])].map((b) => (
              <option key={b} value={b}>
                {BASIS_LABEL[b]}
              </option>
            ))}
          </select>
          {(d.rate_basis === 'per_day' || d.rate_basis === 'per_hour') && (
            <input className="crm-input sx-qty" inputMode="decimal" value={d.rate_qty} onChange={(e) => set({ rate_qty: e.target.value })} placeholder={d.rate_basis === 'per_day' ? 'Days' : 'Hours'} aria-label={d.rate_basis === 'per_day' ? 'Days agreed' : 'Hours agreed'} />
          )}
        </div>
        {fromAgreement && <span className="sx-chip">From their agreement</span>}
        {d.rate_basis === 'per_panel' && <p className="crm-muted crm-small">The PO uses the number of panels the roofer signs for.</p>}
        <label className="crm-check">
          <input type="checkbox" checked={d.raise_po} onChange={(e) => set({ raise_po: e.target.checked })} /> Raise a PO when they sign off (untick for Heliaxis staff)
        </label>

        <label className="crm-label">VAT</label>
        {!person ? (
          <p className="crm-muted crm-small">Choose who’s doing it first.</p>
        ) : !person.vatRegistered ? (
          <p className="sx-locked">Not VAT registered: no VAT</p>
        ) : (
          <>
            <select className="crm-input" value={d.vat_treatment} onChange={(e) => set({ vat_treatment: e.target.value as VatTreatment | '' })} aria-label="VAT">
              <option value="">{data.vatDefault ? `Company default: ${VAT_WORDS[data.vatDefault as VatTreatment]}` : 'Choose the VAT'}</option>
              {VAT_CHOICES.map((v) => (
                <option key={v} value={v}>
                  {VAT_WORDS[v]}
                </option>
              ))}
            </select>
            <input className="crm-input" value={d.vat_note} onChange={(e) => set({ vat_note: e.target.value })} placeholder="Note on the VAT (optional)" aria-label="Note on the VAT" />
          </>
        )}

        <label className="crm-label">CIS</label>
        {money && <p className="sx-line">{money.cis}</p>}
        {!changeCis ? (
          <button type="button" className="crm-link" onClick={() => setChangeCis(true)}>
            Change for this job
          </button>
        ) : (
          <select className="crm-input" value={d.cis_override} onChange={(e) => set({ cis_override: e.target.value as CisRate | '' })} aria-label="CIS for this job">
            <option value="">As their verification says</option>
            {CIS_RATES.map((c) => (
              <option key={c} value={c}>
                {CIS_CHOICE[c]}
              </option>
            ))}
          </select>
        )}
      </fieldset>

      {d.trade === 'electrician' && (
        <>
          <label className="crm-label">Paperwork</label>
          <div className="crm-checks">
            {ELECTRICIAN_FORMS.map((f) => (
              <label key={f} className={d.forms.includes(f) ? 'on' : ''}>
                <input type="checkbox" checked={d.forms.includes(f)} onChange={(e) => set({ forms: e.target.checked ? [...d.forms, f] : d.forms.filter((x) => x !== f) })} />
                {FORM_LABEL[f]}
              </label>
            ))}
          </div>
          <label className="crm-label" htmlFor="sx-cert">
            Electrical certificate
          </label>
          <select id="sx-cert" className="crm-input" value={d.cert_route} onChange={(e) => set({ cert_route: e.target.value })}>
            {CERT_ROUTES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <p className="sx-meta">They can change it on their phone if the job turns out different; they’re asked why, and it’s flagged for you.</p>
        </>
      )}

      <label className="crm-check">
        <input type="checkbox" checked={d.share_customer_phone} onChange={(e) => set({ share_customer_phone: e.target.checked })} /> Show the customer’s mobile in their job pack
      </label>
      <label className="crm-label" htmlFor="sx-note">
        Note to the trade (top of their job pack)
      </label>
      <textarea id="sx-note" className="crm-input" rows={2} value={d.note_to_trade} onChange={(e) => set({ note_to_trade: e.target.value })} placeholder="e.g. Key safe 1234 is on the side gate. Bring a 6 m ladder." />

      {money && (
        <p className={`sx-preview${money.preview ? '' : ' is-wait'}`}>
          {money.preview ?? money.missing ?? [money.rate, money.qty].filter(Boolean).join(' · ')}
        </p>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : existing ? 'Save' : 'Add to the job'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

