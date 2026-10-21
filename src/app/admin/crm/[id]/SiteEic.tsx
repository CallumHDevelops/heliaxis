'use client';

import { useCallback, useEffect, useState } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { DECLARATION, DEPARTURES, editionWords, EXCEPTIONS } from '@/lib/site/fixed/iet-eic';
import { ROUTE_LABEL } from '@/lib/site/forms/electrician/eic-model';
import type { CertStatus } from '@/lib/site/eic/server';
import { shortDate } from '../crm-shared';
import { Sheet } from '../CrmUi';
import { copyText, send } from './record-shared';
import './site-eic.css';

type Office = { name: string; company: string; address: string; postcode: string; tel: string };
type Status = CertStatus & { office: Office };

const STATE: Record<CertStatus['state'], { text: string; tone: 'ok' | 'wait' | 'todo' }> = {
  own: { text: 'Their own certificate: they upload it with its number', tone: 'wait' },
  not_started: { text: 'Not started yet', tone: 'todo' },
  in_progress: { text: 'The electrician is filling it in', tone: 'wait' },
  to_sign_off: { text: 'Filled in: waiting for their sign-off', tone: 'wait' },
  to_design: { text: 'Sign the design part to finish it', tone: 'todo' },
  complete: { text: 'Complete: in the handover pack (Electrical certificate)', tone: 'ok' },
  data_sheet: { text: 'Minor Works data sheets made: their signed Minor Works goes in the pack', tone: 'wait' },
};

/**
 * The electrician's certificate on their Site tab card (SPEC 3.2–3.4): where it stands, the design
 * part (signed here by Heliaxis's designer, with the next inspection), the PDF to download or look at,
 * and Notify building control: who notifies, the values to copy into the scheme's portal, and the
 * reference once it's notified (which closes the 30-day deadline).
 */
export function SiteEic({ assignmentId, projectId, onChanged }: { assignmentId: string; projectId: string; onChanged: () => void }) {
  const [st, setSt] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);
  const [notice, setNotice] = useState('');
  const [on, setOn] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<{ part_p_by: 'self' | 'heliaxis' | ''; scheme: string; scheme_number: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/crm/site-assignments/${assignmentId}/eic`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Couldn’t load the certificate.');
      setSt(d as Status);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the certificate.');
    }
  }, [assignmentId]);
  useEffect(() => {
    // Loaded once the card shows, and again after each change below.
    queueMicrotask(() => void load());
  }, [load]);

  if (!st) return <div className="sx-eic">{error ? <p className="crm-banner crm-banner--err">{error}</p> : <p className="crm-muted crm-small">Loading the certificate…</p>}</div>;
  const s = STATE[st.state];
  const n = st.notify;
  const notifiedOn = on ?? n.notified_on ?? '';
  const notifiedRef = ref ?? n.notified_ref ?? '';
  const copy = async (label: string, v: string | null) => {
    if (!v) return;
    await copyText(v);
    setNotice(`${label} copied.`);
  };

  async function remake(visible: boolean) {
    if (visible && !window.confirm('The customer can already see this certificate. Replace it with the new one?')) return;
    setBusy(true);
    setError('');
    try {
      await send(`/api/crm/site-assignments/${assignmentId}/eic`, 'POST', { action: 'make', force: visible });
      setNotice('Made again.');
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not made. Try again.');
    }
    setBusy(false);
  }

  async function saveWho() {
    if (!who || !st) return;
    setBusy(true);
    setError('');
    try {
      await send('/api/crm/site-contacts', 'PATCH', { id: st.notify.contact_id, part_p_by: who.part_p_by || null, scheme: who.scheme, scheme_number: who.scheme_number });
      setWho(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved. Try again.');
    }
    setBusy(false);
  }

  async function saveNotified() {
    setBusy(true);
    setError('');
    try {
      await send(`/api/crm/projects/${projectId}`, 'PATCH', { paperwork: { building_regs_on: notifiedOn || null, building_regs_ref: notifiedRef.trim() || null } });
      setNotice(notifiedRef.trim() ? 'Saved. The building control to-do is done.' : 'Saved.');
      setOn(null);
      setRef(null);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved. Try again.');
    }
    setBusy(false);
  }

  return (
    <div className="sx-eic">
      <div className="sx-eic-head">
        <div>
          <span className="sx-trade">Electrical certificate</span>
          <h5>
            {ROUTE_LABEL[st.route]}
            {st.ref && st.route !== 'own' ? ` · ${st.ref}` : ''}
          </h5>
          {st.route !== st.office_route && <small>Changed by the electrician from {ROUTE_LABEL[st.office_route]}.</small>}
        </div>
        <span className={`sx-eic-state is-${s.tone}`}>{s.text}</span>
      </div>
      {st.state === 'in_progress' && st.missing.length > 0 && (
        <details className="sx-eic-missing">
          <summary>
            {st.missing.length} still to come from the electrician
          </summary>
          <ul>
            {st.missing.slice(0, 12).map((m) => (
              <li key={`${m.key}-${m.label}`}>
                {m.label}
                {m.why && m.why !== 'Not answered' ? <small> · {m.why}</small> : null}
              </li>
            ))}
            {st.missing.length > 12 && <li>and {st.missing.length - 12} more</li>}
          </ul>
        </details>
      )}
      {st.route === 'eic' && (
        <p className="sx-eic-line">
          {st.design ? (
            <>
              Design part signed by <b>{st.design.name}</b> on {shortDate(st.design.signed_at.slice(0, 10))} · next inspection within {st.design.next}.
            </>
          ) : (
            <>The design part is signed here by Heliaxis’s designer, with the next inspection.</>
          )}
        </p>
      )}
      {st.doc?.stale && (
        <p className="sx-eic-line sx-eic-stale">
          Changed since the {st.doc.final ? 'certificate' : 'draft'} was made.{' '}
          <button type="button" className="crm-link" disabled={busy} onClick={() => void remake(st.doc!.visible)}>
            Make it again
          </button>
        </p>
      )}
      {notice && (
        <p className="crm-banner" role="status">
          {notice}{' '}
          <button type="button" className="crm-link" onClick={() => setNotice('')}>
            OK
          </button>
        </p>
      )}
      {error && <p className="crm-banner crm-banner--err">{error}</p>}
      <div className="sx-actions">
        {st.route === 'eic' && (
          <button type="button" className={st.design ? 'crm-chipbtn' : 'crm-btn crm-btn--solar crm-btn--small'} onClick={() => setSigning(true)}>
            {st.design ? 'Sign the design part again' : 'Sign the design part'}
          </button>
        )}
        {st.doc?.url && (
          <a className="crm-btn crm-btn--small" href={st.doc.url}>
            Download the {st.route === 'meiwc' ? 'sheets' : st.doc.final ? 'EIC' : 'draft EIC'}
          </a>
        )}
        {st.sheets.map((x) => (
          <a key={x.id} className="crm-chipbtn" href={x.url ?? '#'}>
            {x.name}
          </a>
        ))}
        {st.route !== 'own' && st.state !== 'not_started' && (
          <a className="crm-chipbtn" href={`/api/crm/site-assignments/${assignmentId}/eic?pdf=1`} target="_blank" rel="noreferrer">
            Look at it as it stands
          </a>
        )}
      </div>

      <section className="sx-eic-notify" aria-label="Notify building control">
        <h5>Notify building control</h5>
        <p className="crm-small">
          {n.who === 'self'
            ? `Ask ${n.contact.split(/\s+/)[0] || 'the electrician'} to notify ${n.scheme || 'their scheme'}${n.scheme_number ? ` (${n.scheme_number})` : ''} and send you the reference. Within 30 days of finishing.`
            : n.who === 'heliaxis'
              ? 'Heliaxis notifies this one, within 30 days of finishing. Copy these into the scheme’s portal:'
              : `Who notifies for ${n.contact || 'this electrician'}: their own scheme, or Heliaxis? Meanwhile, the details:`}{' '}
          {!who && (
            <button type="button" className="crm-link" onClick={() => setWho({ part_p_by: n.who ?? '', scheme: n.scheme ?? '', scheme_number: n.scheme_number ?? '' })}>
              {n.who ? 'Change' : 'Choose'}
            </button>
          )}
        </p>
        {who && (
          <div className="sx-eic-who">
            <div className="crm-checks" role="radiogroup" aria-label="Who notifies building control">
              <label className={who.part_p_by === 'self' ? 'on' : ''}>
                <input type="radio" name={`who-${assignmentId}`} checked={who.part_p_by === 'self'} onChange={() => setWho({ ...who, part_p_by: 'self' })} />
                Their own scheme
              </label>
              <label className={who.part_p_by === 'heliaxis' ? 'on' : ''}>
                <input type="radio" name={`who-${assignmentId}`} checked={who.part_p_by === 'heliaxis'} onChange={() => setWho({ ...who, part_p_by: 'heliaxis' })} />
                Heliaxis
              </label>
            </div>
            {who.part_p_by === 'self' && (
              <div className="crm-grid2">
                <input className="crm-input" value={who.scheme} onChange={(e) => setWho({ ...who, scheme: e.target.value })} placeholder="Scheme (NAPIT, NICEIC…)" aria-label="Scheme" />
                <input className="crm-input" value={who.scheme_number} onChange={(e) => setWho({ ...who, scheme_number: e.target.value })} placeholder="Registration number" aria-label="Registration number" />
              </div>
            )}
            <div className="sx-actions">
              <button type="button" className="crm-btn crm-btn--small" disabled={busy || !who.part_p_by} onClick={() => void saveWho()}>
                Save for {n.contact.split(/\s+/)[0] || 'them'}
              </button>
              <button type="button" className="crm-chipbtn" onClick={() => setWho(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {n.who !== 'self' && (
          <dl className="sx-eic-copy">
            {(
              [
                ['Installation address', n.address],
                ['Type of work', n.work],
                ['Completion date', n.completed ? shortDate(n.completed) : null],
                ['Certificate reference', n.reference],
              ] as [string, string | null][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || <span className="crm-muted">Not yet</span>}</dd>
                <button type="button" className="crm-chipbtn" disabled={!v} onClick={() => void copy(k, v)}>
                  Copy
                </button>
              </div>
            ))}
          </dl>
        )}
        <div className="sx-eic-notified">
          <div>
            <label className="crm-label" htmlFor={`bc-on-${assignmentId}`}>
              Notified on
            </label>
            <input id={`bc-on-${assignmentId}`} className="crm-input" type="date" value={notifiedOn} onChange={(e) => setOn(e.target.value)} />
          </div>
          <div>
            <label className="crm-label" htmlFor={`bc-ref-${assignmentId}`}>
              Reference
            </label>
            <input id={`bc-ref-${assignmentId}`} className="crm-input" value={notifiedRef} onChange={(e) => setRef(e.target.value)} placeholder="e.g. NAPIT notification number" />
          </div>
          <button type="button" className="crm-btn crm-btn--small" disabled={busy || (on === null && ref === null)} onClick={() => void saveNotified()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
        {n.notified_ref && <p className="sx-eic-done">Notified{n.notified_on ? ` ${shortDate(n.notified_on)}` : ''} · {n.notified_ref} ✓</p>}
      </section>

      {signing && (
        <DesignSheet
          assignmentId={assignmentId}
          office={st.office}
          edition={st.edition}
          exceptions={st.exceptions}
          onClose={() => setSigning(false)}
          onDone={(next) => {
            setSt({ ...next, office: st.office });
            setSigning(false);
            setNotice(next.state === 'complete' ? 'Design part signed. The EIC is complete and in the handover pack.' : 'Design part signed. The EIC completes once the electrician signs off.');
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/** Sign the design part: the designer's particulars, the next inspection (no default), design departures, the declaration and the signature. */
function DesignSheet({
  assignmentId,
  office,
  edition,
  exceptions,
  onClose,
  onDone,
}: {
  assignmentId: string;
  office: Office;
  edition: string | null;
  exceptions: CertStatus['exceptions'];
  onClose: () => void;
  onDone: (s: CertStatus) => void;
}) {
  const [d, setD] = useState({ ...office, next_n: '', next_unit: '', dep: '' as '' | 'none' | 'yes', departures: '' });
  const [signature, setSignature] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const missing = [
    !d.name.trim() && 'the designer’s name',
    (!d.company.trim() || !d.address.trim() || !d.postcode.trim() || !d.tel.trim()) && 'the company details',
    (!d.next_n || !d.next_unit) && 'the next inspection',
    !d.dep && 'whether there are departures',
    d.dep === 'yes' && !d.departures.trim() && 'the departures',
    !signature && 'the signature',
  ].filter(Boolean) as string[];

  async function sign() {
    setBusy(true);
    setErr('');
    try {
      const r = await send<{ ok: true; status: CertStatus }>(`/api/crm/site-assignments/${assignmentId}/sign-design`, 'POST', {
        name: d.name,
        company: d.company,
        address: d.address,
        postcode: d.postcode,
        tel: d.tel,
        next_n: Number(d.next_n),
        next_unit: d.next_unit,
        departures: d.dep === 'yes' ? d.departures : null,
        signature,
      });
      onDone(r.status);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not signed. Try again.');
    }
    setBusy(false);
  }

  return (
    <Sheet title="Sign the design part of the EIC" onClose={onClose} wide>
      <p className="crm-small sx-eic-decl">{DECLARATION.design(editionWords(edition))}</p>
      <div className="crm-grid2">
        <div>
          <label className="crm-label" htmlFor="dz-name">
            Designer’s name
          </label>
          <input id="dz-name" className="crm-input" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div>
          <label className="crm-label" htmlFor="dz-co">
            Company
          </label>
          <input id="dz-co" className="crm-input" value={d.company} onChange={(e) => set({ company: e.target.value })} />
        </div>
        <div>
          <label className="crm-label" htmlFor="dz-addr">
            Address
          </label>
          <input id="dz-addr" className="crm-input" value={d.address} onChange={(e) => set({ address: e.target.value })} />
        </div>
        <div className="crm-grid2">
          <div>
            <label className="crm-label" htmlFor="dz-pc">
              Postcode
            </label>
            <input id="dz-pc" className="crm-input" value={d.postcode} onChange={(e) => set({ postcode: e.target.value })} />
          </div>
          <div>
            <label className="crm-label" htmlFor="dz-tel">
              Phone
            </label>
            <input id="dz-tel" className="crm-input" value={d.tel} onChange={(e) => set({ tel: e.target.value })} />
          </div>
        </div>
      </div>
      <label className="crm-label" htmlFor="dz-next">
        Next inspection recommended within
      </label>
      <div className="sx-eic-next">
        <input id="dz-next" className="crm-input" inputMode="numeric" value={d.next_n} onChange={(e) => set({ next_n: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="e.g. 10" aria-label="How many" />
        <div className="crm-checks" role="radiogroup" aria-label="Years or months">
          {(['years', 'months'] as const).map((u) => (
            <label key={u} className={d.next_unit === u ? 'on' : ''}>
              <input type="radio" name="dz-unit" checked={d.next_unit === u} onChange={() => set({ next_unit: u })} />
              {u === 'years' ? 'Years' : 'Months'}
            </label>
          ))}
        </div>
      </div>
      <p className="crm-muted crm-small">The designer’s call: there’s no default. Agree it with the installer, and think about how well the installation will be looked after.</p>
      <label className="crm-label">Departures from BS 7671 in the design</label>
      <p className="crm-muted crm-small">{DEPARTURES}</p>
      <div className="crm-checks" role="radiogroup" aria-label="Departures">
        <label className={d.dep === 'none' ? 'on' : ''}>
          <input type="radio" name="dz-dep" checked={d.dep === 'none'} onChange={() => set({ dep: 'none' })} />
          None
        </label>
        <label className={d.dep === 'yes' ? 'on' : ''}>
          <input type="radio" name="dz-dep" checked={d.dep === 'yes'} onChange={() => set({ dep: 'yes' })} />
          Yes
        </label>
      </div>
      {d.dep === 'yes' && <textarea className="crm-input" rows={3} value={d.departures} onChange={(e) => set({ departures: e.target.value })} placeholder="What, and why (Regulations 120.3, 133.1.2, 133.1.3 and 133.5)" aria-label="The departures" />}
      <label className="crm-label">Permitted exceptions (Regulation 411.3.3)</label>
      {exceptions ? (
        <div className="crm-small">
          <p className="crm-muted">{EXCEPTIONS}</p>
          <p>
            <b>From the electrician:</b> {exceptions.text || 'Not described yet.'}
          </p>
          <p className="crm-muted">
            {exceptions.photos ? `Risk assessment: ${exceptions.photos} photo${exceptions.photos === 1 ? '' : 's'}, attached to the certificate.` : 'No risk assessment photo yet.'} These go in your design part. Check them before you sign.
          </p>
        </div>
      ) : (
        <p className="crm-muted crm-small">None from the electrician (N/A on the certificate).</p>
      )}
      <label className="crm-label">Signature</label>
      <SignaturePad onChange={setSignature} height={150} />
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {missing.length > 0 && <p className="crm-muted crm-small">To sign: {missing.join(', ')}.</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || missing.length > 0} onClick={() => void sign()}>
          {busy ? 'Signing…' : 'Sign the design part'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
