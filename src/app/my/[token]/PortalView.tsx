'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import type { PortalData } from '@/lib/crm/portal';
import './portal.css';

const DOC_LABEL: Record<string, string> = {
  quote: 'Quote',
  invoice: 'Invoice',
  dno: 'DNO / grid connection',
  mcs: 'MCS certificate',
  warranty: 'Warranty',
  handover: 'Handover pack',
  design: 'System design',
  contract: 'Contract',
  receipt: 'Receipt',
  other: 'Document',
};

const fmtDate = (iso: string, withTime = false) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });

function daysUntil(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86_400_000);
}

export function PortalView({ data, paid = false }: { data: PortalData; paid?: boolean }) {
  const paidFlag = paid;
  const [accepted, setAccepted] = useState(data.accepted);
  const [surveyAt, setSurveyAt] = useState(data.surveyAt);
  const [signing, setSigning] = useState(false);
  const [booking, setBooking] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  // The one thing that matters most right now.
  const next = useMemo(() => {
    if (data.installAt && daysUntil(data.installAt) >= 0) {
      const n = daysUntil(data.installAt);
      return {
        big: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days`,
        text: n <= 1 ? `Your installation is ${n === 0 ? 'today' : 'tomorrow'}` : 'until your installation',
        sub: fmtDate(data.installAt, true),
      };
    }
    if (data.quote && !accepted) return { big: 'Your quote', text: 'is ready to review and accept', sub: data.quote.name };
    if (surveyAt && daysUntil(surveyAt) >= 0) {
      const n = daysUntil(surveyAt);
      return { big: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days`, text: n <= 1 ? 'Your survey' : 'until your survey', sub: fmtDate(surveyAt, true) };
    }
    return null;
  }, [data.installAt, data.quote, accepted, surveyAt]);

  const depositDue = data.deposit && !data.deposit.paidAt && !paidFlag && (accepted || ['won', 'install_booked'].includes(data.stage));

  return (
    <div className="pt">
      <header className="pt-head">
        <Image src="/assets/heliaxis-logo.png" alt="Heliaxis" width={128} height={29} style={{ width: 128, height: 'auto' }} />
        <span className="pt-head-tag">Your project</span>
      </header>

      <main className="pt-main">
        <section className="pt-hello">
          <h1>Hi {data.first}</h1>
          <p>
            {data.title}
            {data.postcode && !data.title.includes(data.postcode) ? ` · ${data.postcode}` : ''}
          </p>
        </section>

        {paidFlag && <p className="pt-banner ok">Thank you — your deposit has been paid. We’ll be in touch to confirm your installation date.</p>}

        {next && (
          <section className="pt-next">
            <b>{next.big}</b>
            <span>{next.text}</span>
            <small>{next.sub}</small>
          </section>
        )}

        {data.quote && !accepted && (
          <section className="pt-card pt-action">
            <h2>Accept your quote</h2>
            <p>Have a read through your quote. When you’re happy, accept it here and we’ll get your installation booked in.</p>
            <div className="pt-row">
              <a className="pt-btn ghost" href={`/api/my/${data.token}/doc/${data.quote.id}`} target="_blank" rel="noreferrer">
                View quote
              </a>
              <button type="button" className="pt-btn" onClick={() => setSigning(true)}>
                Accept & sign
              </button>
            </div>
          </section>
        )}
        {accepted && (
          <p className="pt-banner ok">
            ✓ Quote accepted by {accepted.name} on {fmtDate(accepted.at)}. Thank you!
          </p>
        )}

        {depositDue && data.deposit && (
          <section className="pt-card pt-action">
            <h2>Pay your deposit</h2>
            <p>
              <b>£{data.deposit.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</b> secures your installation date.
            </p>
            {data.deposit.canPay ? (
              <DepositButton token={data.token} />
            ) : (
              <p className="pt-muted">We’ll send you our bank details to pay by transfer.</p>
            )}
          </section>
        )}

        {data.canBook && !surveyAt && (
          <section className="pt-card pt-action">
            <h2>Book your free survey</h2>
            <p>Pick a time that suits you. A member of our team will visit to check your roof, fuse box and meter — it takes about an hour.</p>
            <button type="button" className="pt-btn" onClick={() => setBooking(true)}>
              Choose a time
            </button>
          </section>
        )}
        {data.canBook && surveyAt && (
          <p className="pt-banner">
            📅 Survey booked for <b>{fmtDate(surveyAt, true)}</b>.{' '}
            <button type="button" className="pt-link" onClick={() => setBooking(true)}>
              Change
            </button>
          </p>
        )}

        {data.tracker.length > 0 && (
          <section className="pt-card">
            <h2>Progress</h2>
            <ol className="pt-track">
              {data.tracker.map((s) => (
                <li key={s.key} className={s.state}>
                  <span className="pt-dot" aria-hidden="true">
                    {s.state === 'done' ? '✓' : ''}
                  </span>
                  <div>
                    <b>{s.label}</b>
                    {(s.date || s.note) && (
                      <small>
                        {[s.date ? fmtDate(s.date, s.key === 'survey' || s.key === 'install') : '', s.note].filter(Boolean).join(' · ')}
                      </small>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="pt-card">
          <h2>Your documents</h2>
          {data.documents.length === 0 ? (
            <p className="pt-muted">Your quote, invoices, grid connection (DNO) letters and certificates will appear here.</p>
          ) : (
            <ul className="pt-docs">
              {data.documents.map((d) => (
                <li key={d.id}>
                  <a href={`/api/my/${data.token}/doc/${d.id}`} target="_blank" rel="noreferrer">
                    <span className="pt-doc-ic" aria-hidden="true">
                      📄
                    </span>
                    <span className="pt-doc-main">
                      <b>{d.name}</b>
                      <small>
                        {DOC_LABEL[d.category] || 'Document'} · {fmtDate(d.at)}
                      </small>
                    </span>
                    <span className="pt-doc-open">View</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.photos.length > 0 && (
          <section className="pt-card">
            <h2>Photos</h2>
            <div className="pt-photos">
              {data.photos.map((p) =>
                p.thumb ? (
                  <button key={p.id} type="button" onClick={() => setPhoto(p.url)} aria-label={p.caption || 'Photo'}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumb} alt={p.caption || 'Installation photo'} loading="lazy" />
                  </button>
                ) : null
              )}
            </div>
          </section>
        )}

        <section className="pt-card pt-contact">
          <h2>Questions?</h2>
          <p>{data.owner ? `${data.owner} and the team are` : 'We’re'} here to help.</p>
          <div className="pt-row">
            {data.whatsapp && (
              <a className="pt-btn wa" href={`https://wa.me/${data.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                WhatsApp us
              </a>
            )}
            <a className="pt-btn ghost" href={`mailto:${data.email}`}>
              {data.email}
            </a>
          </div>
        </section>
        <p className="pt-foot">This is your private link — please don’t share it. Heliaxis Limited</p>
      </main>

      {signing && data.quote && (
        <AcceptSheet
          token={data.token}
          quote={data.quote}
          onClose={() => setSigning(false)}
          onDone={(name) => {
            setAccepted({ at: new Date().toISOString(), name });
            setSigning(false);
          }}
        />
      )}
      {booking && (
        <BookSheet
          token={data.token}
          onClose={() => setBooking(false)}
          onBooked={(at) => {
            setSurveyAt(at);
            setBooking(false);
          }}
        />
      )}
      {photo && (
        <div className="pt-sheet" onClick={() => setPhoto(null)} role="dialog" aria-modal="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pt-full" src={photo} alt="" />
        </div>
      )}
    </div>
  );
}

function DepositButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <>
      <button
        type="button"
        className="pt-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr('');
          const r = await fetch(`/api/my/${token}/deposit`, { method: 'POST' });
          const d = await r.json().catch(() => ({}));
          if (r.ok && d.url) window.location.href = d.url;
          else {
            setErr(d.error || 'Payment page unavailable');
            setBusy(false);
          }
        }}
      >
        {busy ? 'Opening secure payment…' : 'Pay by card'}
      </button>
      {err && <p className="pt-err">{err}</p>}
    </>
  );
}

function AcceptSheet({
  token,
  quote,
  onClose,
  onDone,
}: {
  token: string;
  quote: { id: string; name: string };
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/my/${token}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: quote.id, name, agree, signature: sig }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Something went wrong — please try again.');
    onDone(name);
  }
  return (
    <div className="pt-sheet" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="pt-sheet-box" onClick={(e) => e.stopPropagation()}>
        <h2>Accept your quote</h2>
        <p className="pt-muted">
          <a href={`/api/my/${token}/doc/${quote.id}`} target="_blank" rel="noreferrer">
            {quote.name}
          </a>
        </p>
        <label className="pt-label" htmlFor="pt-name">
          Your full name
        </label>
        <input id="pt-name" className="pt-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <label className="pt-label">Sign here</label>
        <SignaturePad onChange={setSig} height={150} />
        <label className="pt-check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I accept this quote and Heliaxis’s terms and conditions.
        </label>
        {err && <p className="pt-err">{err}</p>}
        <div className="pt-row">
          <button type="button" className="pt-btn" disabled={busy || !name.trim() || !sig || !agree} onClick={submit}>
            {busy ? 'Saving…' : 'Accept quote'}
          </button>
          <button type="button" className="pt-btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function BookSheet({ token, onClose, onBooked }: { token: string; onClose: () => void; onBooked: (at: string) => void }) {
  const [slots, setSlots] = useState<{ at: string; day: string; time: string }[] | null>(null);
  const [day, setDay] = useState('');
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`/api/my/${token}/slots`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const s = d.slots || [];
        setSlots(s);
        if (s[0]) setDay(s[0].day);
      })
      .catch(() => setSlots([]));
  }, [token]);
  const days = useMemo(() => [...new Set((slots ?? []).map((s) => s.day))], [slots]);
  async function book() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/my/${token}/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ at: pick }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Couldn’t book that — please try another time.');
    onBooked(pick);
  }
  return (
    <div className="pt-sheet" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="pt-sheet-box" onClick={(e) => e.stopPropagation()}>
        <h2>Choose a survey time</h2>
        {slots === null ? (
          <p className="pt-muted">Loading times…</p>
        ) : !slots.length ? (
          <p className="pt-muted">No times are free online right now — message us and we’ll fit you in.</p>
        ) : (
          <>
            <div className="pt-days">
              {days.map((d) => (
                <button key={d} type="button" className={d === day ? 'on' : ''} onClick={() => setDay(d)}>
                  {new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short' })}
                  <b>{new Date(`${d}T12:00:00Z`).getUTCDate()}</b>
                  {new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short' })}
                </button>
              ))}
            </div>
            <div className="pt-times">
              {slots
                .filter((s) => s.day === day)
                .map((s) => (
                  <button key={s.at} type="button" className={pick === s.at ? 'on' : ''} onClick={() => setPick(s.at)}>
                    {s.time}
                  </button>
                ))}
            </div>
          </>
        )}
        {err && <p className="pt-err">{err}</p>}
        <div className="pt-row">
          <button type="button" className="pt-btn" disabled={busy || !pick} onClick={book}>
            {busy ? 'Booking…' : 'Book survey'}
          </button>
          <button type="button" className="pt-btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
