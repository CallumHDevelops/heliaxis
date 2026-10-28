'use client';

import { useEffect, useState } from 'react';
import { PRODUCTS, PROJECT_START_STAGES, stageLabel } from '@/lib/crm/stages';
import type { TeamMember } from '@/lib/projects/server';
import { Sheet } from '../crm/CrmUi';
import { productsShort } from '../crm/crm-shared';
import { londonSlot } from '@/lib/booking/engine';
import { AddressFinder } from './AddressFinder';
import { AutoNotice, useBookingPeople } from './AutoNotice';
import { NewProjectTrades, rowsFor, tradesBody, useVatDefault, type TradeRow } from './NewProjectTrades';

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  customer_ref: string | null;
  projects: number;
  latest: { address: string | null; postcode: string | null; products: string[] } | null;
  possible_duplicate: { name: string; project_ref: string | null } | null;
  /** Someone added under CRM › Contacts (not yet a customer): their customer record is made when the job is. */
  contact?: boolean;
};

const OPPORTUNITY_STARTS = [
  { key: 'appointment', label: 'Appointment arranged: I’ve agreed a time with them' },
  { key: 'lead', label: 'New enquiry: needs a survey and quote' },
  { key: 'surveyed', label: 'Surveyed: needs a quote' },
] as const;
const PROJECT_LABEL: Record<string, string> = { won: 'Won (just sold)' };

/**
 * New project (Projects page) or new opportunity (CRM "+ New"), for an existing customer or a new one
 * (a phone call, a referral). A project can start at the stage the job has really got to, so jobs
 * already under way can be loaded in; an opportunity starts as a new enquiry or after the survey.
 */
export function NewProjectSheet({
  mode,
  me,
  team,
  customer: preset,
  siteApp = false,
  onClose,
  onCreated,
}: {
  mode: 'project' | 'opportunity';
  me: string;
  team: TeamMember[];
  /** Start with this customer chosen ("New project for Jane" on a job). */
  customer?: Customer | null;
  /** site-commissioning.sql has run: a project can have its trades added here. */
  siteApp?: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(preset ?? null);
  const [fresh, setFresh] = useState(false);
  const [person, setPerson] = useState({ name: '', phone: '', email: '', postcode: '' });
  const [products, setProducts] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [site, setSite] = useState({ address: preset?.latest?.address ?? '', postcode: preset?.latest?.postcode ?? preset?.postcode ?? '' });
  const [value, setValue] = useState('');
  // For someone added by hand (a phone call): how they got in touch, what was said, and that we have spoken to them.
  const [how, setHow] = useState('Phone call');
  const [note, setNote] = useState('');
  const [spoken, setSpoken] = useState(true);
  // Where the address lookup put the pin, and the appointment when one has been arranged.
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [aDay, setADay] = useState(() => new Date().toISOString().slice(0, 10));
  const [aTime, setATime] = useState('10:00');
  const [aWho, setAWho] = useState('');
  const [tell, setTell] = useState(true);
  const [waOk, setWaOk] = useState(true);
  const [owner, setOwner] = useState(me);
  const [start, setStart] = useState<string>(mode === 'project' ? 'won' : 'lead');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Who's doing the work (projects, once site-commissioning.sql has run).
  const trades = siteApp && mode === 'project';
  const [tradeRows, setTradeRows] = useState<TradeRow[]>([]);
  const vatDefault = useVatDefault(trades);
  const appointment = mode === 'opportunity' && start === 'appointment';
  const people = useBookingPeople(appointment);

  const postcode = fresh ? person.postcode.trim().toUpperCase() : site.postcode.trim().toUpperCase();
  const defaultTitle = [productsShort(products), postcode].filter(Boolean).join(' · ');
  const starts = mode === 'project' ? PROJECT_START_STAGES.map((k) => ({ key: k as string, label: PROJECT_LABEL[k] ?? stageLabel(k) })) : OPPORTUNITY_STARTS;
  const ready = fresh ? !!person.name.trim() : !!customer;

  function choose(c: Customer) {
    setCustomer(c);
    setSite({ address: c.latest?.address ?? '', postcode: c.latest?.postcode ?? c.postcode ?? '' });
  }

  function pickProducts(next: string[]) {
    setProducts(next);
    if (trades) setTradeRows((rows) => rowsFor(next, rows));
  }

  async function save() {
    if (!ready) return;
    const t = trades ? tradesBody(tradeRows, vatDefault) : ({ ok: true, assignments: [] } as const);
    if (!t.ok) {
      setErr(t.error);
      return;
    }
    if (appointment) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(aDay) || !/^\d{2}:\d{2}$/.test(aTime)) return setErr('Pick the day and time of the appointment.');
      if (postcode.replace(/\s/g, '').length < 5) return setErr('An appointment needs the postcode: use Find the address, or type it in.');
    }
    setBusy(true);
    setErr('');
    const body: Record<string, unknown> = {
      products,
      title: title.trim() || defaultTitle || undefined,
      address: site.address.trim(),
      value: value.trim() === '' ? null : value.replace(/[£,\s]/g, ''),
      owner_id: owner || null,
      start_stage: appointment ? 'lead' : start,
      ...(pin ? { site_lat: pin.lat, site_lng: pin.lng } : {}),
      ...(appointment && tell && waOk ? { whatsapp_ok: true } : {}),
      ...(appointment ? { appointment: { start: new Date(londonSlot(aDay, aTime)).toISOString(), surveyor_key: aWho || undefined, ...(tell ? {} : { notify: { email: false, whatsapp: false, sms: false } }) } } : {}),
      source: fresh ? how : 'crm',
      ...(mode === 'opportunity' ? { spoken, note: note.trim() || undefined } : {}),
      ...(t.assignments.length ? { assignments: t.assignments } : {}),
    };
    if (fresh) Object.assign(body, { name: person.name.trim(), phone: person.phone.trim(), email: person.email.trim(), postcode });
    else if (customer!.contact) Object.assign(body, { contact_id: customer!.id, postcode });
    else Object.assign(body, { enquiry_id: customer!.id, postcode });
    const r = await fetch('/api/crm/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok && d.id) {
      // Made, but a trade wasn't added: say so on the job.
      if (d.warning) window.alert(d.warning);
      // What went out (and what didn't) when they were told about the appointment.
      else if (Array.isArray(d.notices) && d.notices.some((n: string) => /NOT sent/.test(n))) window.alert(`Appointment booked.\n\n${d.notices.join('\n')}`);
      onCreated(d.id);
    } else setErr(d.error || 'Not created. Try again.');
  }

  const noun = mode === 'project' ? 'project' : 'opportunity';
  return (
    <Sheet title={mode === 'project' ? 'New project' : 'New opportunity'} onClose={onClose} wide>
      <p className="crm-muted">
        {mode === 'project'
          ? 'For a job that’s already been sold, or an extra job for someone you’ve worked for (an add-on battery, a callback). It gets its own number.'
          : 'For someone who didn’t come in as an enquiry. Website, Meta and WhatsApp enquiries become opportunities by themselves.'}
      </p>

      <label className="crm-label">Customer</label>
      {fresh ? (
        <div className="nps-fresh">
          <input className="crm-input" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} placeholder="Full name" aria-label="Customer name" autoFocus />
          <input className="crm-input" type="tel" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} placeholder="Mobile" aria-label="Mobile" />
          <input className="crm-input" type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} placeholder="Email" aria-label="Email" />
          <label className="crm-label" htmlFor="nps-how">
            How did they get in touch?
          </label>
          <select id="nps-how" className="crm-input" value={how} onChange={(e) => setHow(e.target.value)}>
            {['Phone call', 'Referral', 'Word of mouth', 'Existing customer', 'Walk-in or event', 'Other'].map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
          <button type="button" className="crm-link nps-switch" onClick={() => setFresh(false)}>
            Find someone already in the CRM instead
          </button>
        </div>
      ) : customer ? (
        <div className="crmh-picked">
          <span>
            <b>{customer.name}</b>
            <small>
              {' '}
              · {[customer.contact ? 'From Contacts' : customer.customer_ref, customer.postcode, customer.projects ? `${customer.projects} job${customer.projects === 1 ? '' : 's'}` : 'no jobs yet'].filter(Boolean).join(' · ')}
            </small>
          </span>
          {!preset && (
            <button type="button" className="crm-link" onClick={() => setCustomer(null)}>
              Change
            </button>
          )}
        </div>
      ) : (
        <CustomerSearch
          onPick={choose}
          onNew={(name) => {
            setPerson((p) => ({ ...p, name: name || p.name }));
            setFresh(true);
          }}
        />
      )}
      {customer?.possible_duplicate && !fresh && (
        <p className="crm-banner">
          Possible duplicate of {customer.possible_duplicate.name}
          {customer.possible_duplicate.project_ref ? ` (${customer.possible_duplicate.project_ref})` : ''}: check it’s the right person.
        </p>
      )}

      <label className="crm-label">Products</label>
      <div className="crm-checks">
        {PRODUCTS.map((p) => (
          <label key={p.key} className={products.includes(p.key) ? 'on' : ''}>
            <input
              type="checkbox"
              checked={products.includes(p.key)}
              onChange={(e) => pickProducts(e.target.checked ? [...products, p.key] : products.filter((x) => x !== p.key))}
            />
            {p.label}
          </label>
        ))}
      </div>

      <label className="crm-label" htmlFor="nps-title">
        Name for the job
      </label>
      <input id="nps-title" className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle || 'e.g. Solar + battery · NP20 4AB'} />

      <AddressFinder
        onPick={(a) => {
          setSite({ address: a.address, postcode: a.postcode });
          setPerson((p) => ({ ...p, postcode: a.postcode }));
          setPin(a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null);
        }}
      />
      <label className="crm-label" htmlFor="nps-address">
        Site address
      </label>
      <input
        id="nps-address"
        className="crm-input"
        value={site.address}
        onChange={(e) => {
          setSite({ ...site, address: e.target.value });
          setPin(null);
        }}
        placeholder={customer?.latest ? 'Same as their last job' : 'Where the work is'}
      />
      <label className="crm-label" htmlFor="nps-postcode">
        Site postcode
      </label>
      <input
        id="nps-postcode"
        className="crm-input"
        value={fresh ? person.postcode : site.postcode}
        onChange={(e) => (fresh ? setPerson({ ...person, postcode: e.target.value }) : setSite({ ...site, postcode: e.target.value }))}
      />

      {mode === 'opportunity' && (
        <>
          <label className="crm-label" htmlFor="nps-note">
            What was said? (optional)
          </label>
          <textarea id="nps-note" className="crm-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Andy wants solar and a battery, has a south-facing roof, free Thursdays" />
          <label className="crm-check">
            <input type="checkbox" checked={spoken} onChange={(e) => setSpoken(e.target.checked)} /> I’ve spoken to them already (marks them contacted, no chasers)
          </label>
        </>
      )}

      <div className="crm-grid2">
        <div>
          <label className="crm-label" htmlFor="nps-value">
            Value £ (optional)
          </label>
          <input id="nps-value" className="crm-input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div>
          <label className="crm-label" htmlFor="nps-owner">
            Owner
          </label>
          <select id="nps-owner" className="crm-input" value={owner} onChange={(e) => setOwner(e.target.value)}>
            {team
              .filter((t) => t.crm)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id === me ? `${t.name} (me)` : t.name}
                </option>
              ))}
            {!team.some((t) => t.id === me && t.crm) && <option value={me}>Me</option>}
          </select>
        </div>
      </div>

      <fieldset className="nps-starts">
        <legend className="crm-label">Where is it up to?</legend>
        {starts.map((s) => (
          <label key={s.key} className={start === s.key ? 'on' : ''}>
            <input type="radio" name="nps-start" checked={start === s.key} onChange={() => setStart(s.key)} />
            {s.label}
          </label>
        ))}
      </fieldset>

      {appointment && (
        <div className="nps-appt">
          <div className="crm-grid2">
            <div>
              <label className="crm-label" htmlFor="nps-aday">
                Day
              </label>
              <input id="nps-aday" className="crm-input" type="date" value={aDay} onChange={(e) => setADay(e.target.value)} />
            </div>
            <div>
              <label className="crm-label" htmlFor="nps-atime">
                Arrive at
              </label>
              <input id="nps-atime" className="crm-input" type="time" step={900} value={aTime} onChange={(e) => setATime(e.target.value)} />
            </div>
          </div>
          {(people?.surveyors.length ?? 0) > 1 && (
            <>
              <label className="crm-label" htmlFor="nps-awho">
                Who is going
              </label>
              <select id="nps-awho" className="crm-input" value={aWho} onChange={(e) => setAWho(e.target.value)}>
                <option value="">First free surveyor</option>
                {people!.surveyors.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <AutoNotice
            on={tell}
            onChange={setTell}
            channels={people?.channels ?? null}
            hasEmail={fresh ? /^\S+@\S+\.\S+$/.test(person.email.trim()) : !!customer?.email}
            hasMobile={fresh ? person.phone.replace(/\D/g, '').length >= 10 : !!customer?.phone}
          />
          {tell && (
            <label className="crm-check">
              <input type="checkbox" checked={waOk} onChange={(e) => setWaOk(e.target.checked)} /> They’ve said it’s fine to message them on WhatsApp (WhatsApp needs their OK)
            </label>
          )}
        </div>
      )}

      {trades && tradeRows.length > 0 && <NewProjectTrades rows={tradeRows} onChange={setTradeRows} vatDefault={vatDefault} />}

      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !ready} onClick={() => void save()}>
          {busy ? 'Creating…' : `Create ${noun}`}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

/** Type to find a customer (name, email, phone, postcode or HX-ref), or add a new one. */
function CustomerSearch({ onPick, onNew }: { onPick: (c: Customer) => void; onNew: (name: string) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ q: string; rows: Customer[] }>({ q: '', rows: [] });
  const t = q.trim();
  useEffect(() => {
    if (t.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/crm/customers?contacts=1&q=${encodeURIComponent(t)}`, { cache: 'no-store', signal: ctl.signal });
        const d = await r.json().catch(() => ({}));
        if (r.ok) setFound({ q: t, rows: (d.customers ?? []) as Customer[] });
      } catch {
        // Still typing, or offline.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [t]);
  const rows = found.q === t ? found.rows : null;
  return (
    <div className="crmh-picker">
      <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, email, postcode or HX-ref" aria-label="Find the customer" autoFocus />
      {t.length >= 2 && (
        <ul className="crmh-picker__list">
          {rows === null && <li className="crm-muted">Looking…</li>}
          {rows?.length === 0 && <li className="crm-muted">Nobody found for “{t}”.</li>}
          {rows?.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)}>
                <span>
                  <b>{c.name}</b>
                  <small>
                    {[c.contact ? 'From Contacts' : c.customer_ref, c.postcode, c.phone, c.projects ? `${c.projects} job${c.projects === 1 ? '' : 's'}` : 'no jobs yet'].filter(Boolean).join(' · ')}
                    {c.possible_duplicate ? ' · possible duplicate' : ''}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="crm-btn crm-btn--small nps-new" onClick={() => onNew(t)}>
        {t.length >= 2 ? `+ Add “${t}” as a new customer` : '+ New customer'}
      </button>
    </div>
  );
}
