'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { BrandLogo } from '@/components/theme/BrandLogo';
import { ThemeChoice } from '@/components/theme/ThemeChoice';
import type { PortalData } from '@/lib/crm/portal';
import { isWonStage } from '@/lib/crm/stages';
import type { CalendarDay } from '@/lib/install-dates';
import { useNow } from '@/lib/use-now';
import { HandoverSection } from './HandoverSection';
import { useEngagement } from './useEngagement';
import './portal.css';
import { PRINT_LABEL, PRINT_TITLE, printHref } from '@/lib/documents/print-shared';
import { shortDate, ukDayOf, ukTime } from '@/app/admin/crm/crm-shared';
import { THEME_GROUP_LABEL, type ThemePref } from '@/lib/theme/shared';

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

type Quote = NonNullable<PortalData['quote']>;
type Doc = PortalData['documents'][number];

/**
 * "Sun 20 Sep", or "Tue 3 Nov, 08:00" with the time: spelt out by the UK date helpers, never by
 * toLocaleString, because the server's Intl data and the browser's disagree ("Sept" or "Sep", a comma
 * after the weekday) and the page rendered on the server then fails to hydrate (React #418).
 */
const fmtDate = (iso: string, withTime = false) => `${shortDate(ukDayOf(iso))}${withTime ? `, ${ukTime(iso)}` : ''}`;

/** Whole UK days from now to the date of `iso` (0 = today). */
function daysUntil(iso: string, now: number) {
  return Math.round((Date.parse(`${ukDayOf(iso)}T12:00:00Z`) - Date.parse(`${ukDayOf(now)}T12:00:00Z`)) / 86_400_000);
}

const CANCEL_NOTE = 'You can change your mind and cancel within 14 days of signing, free of charge.';

/**
 * The customer's private link. At Quote sent it's a quote-only page (read and sign); from Won it's
 * their portal: progress, dates, documents, photos and the deposit. `themePref`: their Light / Dark /
 * Match phone as the server rendered it (from this phone's cookie), so the toggle hydrates as drawn.
 */
export function PortalView({ data, paid = false, justAccepted = false, openAccept = false, themePref = 'system' }: { data: PortalData; paid?: boolean; justAccepted?: boolean; /** Came from the quote's Accept button: the sign box opens straight away. */ openAccept?: boolean; themePref?: ThemePref }) {
  return data.mode === 'quote' ? <QuotePage data={data} openAccept={openAccept} themePref={themePref} /> : <FullPortal data={data} paid={paid} justAccepted={justAccepted} openAccept={openAccept} themePref={themePref} />;
}

function Shell({ tag, themePref, children }: { tag: string; themePref: ThemePref; children: ReactNode }) {
  return (
    <div className="pt">
      <header className="pt-head">
        <BrandLogo width={128} />
        <span className="pt-head-tag">{tag}</span>
      </header>
      <main className="pt-main">
        {children}
        {/* Light / Dark / Match phone: kept on this phone (cookie and storage), no account needed. */}
        <div className="pt-theme">
          <span className="pt-theme-label" aria-hidden="true">
            {THEME_GROUP_LABEL}
          </span>
          <ThemeChoice size="sm" serverPref={themePref} />
        </div>
        <p className="pt-foot">This is your private link. Please don’t share it. Heliaxis Limited</p>
      </main>
    </div>
  );
}

function Contact({ data }: { data: PortalData }) {
  return (
    <section className="pt-card pt-contact" data-track="contact">
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
  );
}

/**
 * After they accept: straight on to the card payment page for the deposit if there is one; otherwise (or if
 * card payment isn't available) back to their portal, which shows what is left to do.
 */
/** Tell Heliaxis a step was reached (opened the link, started to accept, ...). Quiet, and never in the customer's way. */
function track(token: string, type: 'opened' | 'sign_started' | 'decline_started' | 'dates_started') {
  try {
    void fetch(`/api/my/${token}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }), keepalive: true }).catch(() => null);
  } catch {
    // Tracking must never get in the way.
  }
}

async function afterAccept(token: string, d: { deposit?: boolean }) {
  if (d.deposit) {
    const r = await fetch(`/api/my/${token}/deposit`, { method: 'POST' }).catch(() => null);
    const p = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && p.url) {
      window.location.href = p.url;
      return;
    }
  }
  window.location.href = `${window.location.pathname}?accepted=1`;
}

const quoteWord = (q: { category: string }) => (q.category === 'contract' ? 'contract' : 'quote');

/* ── Quote sent: just the quote, to read and sign ──────────────────────────── */

function QuotePage({ data, openAccept, themePref }: { data: PortalData; openAccept: boolean; themePref: ThemePref }) {
  const q = data.quote;
  const [signing, setSigningRaw] = useState(openAccept && !!q);
  const [declining, setDeclining] = useState(false);
  const [query, setQuery] = useState(0);
  useEffect(() => {
    track(data.token, 'opened');
    if (openAccept && q) track(data.token, 'sign_started');
  }, [data.token, openAccept, q]);
  useEngagement(data.token, !!q || !!data.accepted);
  const setSigning = (v: boolean) => {
    if (v) track(data.token, 'sign_started');
    setSigningRaw(v);
  };
  const openDecline = () => {
    track(data.token, 'decline_started');
    setDeclining(true);
  };
  return (
    <Shell tag="Your quote" themePref={themePref}>
      <section className="pt-hello">
        <h1>Hi {data.first}</h1>
        <p>{data.title}</p>
      </section>

      {data.accepted ? (
        <section className="pt-card">
          <p className="pt-banner ok">
            ✓ Accepted by {data.accepted.name} on {fmtDate(data.accepted.at)}. Thank you!
          </p>
          {data.accepted.document && (
            <a className="pt-btn ghost" href={`/api/my/${data.token}/doc/${data.accepted.document.id}`} target="_blank" rel="noreferrer">
              View what you signed
            </a>
          )}
          {data.deposit && !data.deposit.paidAt && <Deposit token={data.token} deposit={data.deposit} />}
          <InstallDates token={data.token} pref={data.installPref} />
        </section>
      ) : q ? (
        <section className="pt-card pt-action pt-quote" data-track="quote">
          <h2>Your {quoteWord(q)} from Heliaxis</h2>
          <p>Have a read through. When you’re happy, press Accept quote. You will sign, then pay your deposit and choose your installation date.</p>
          <div className="pt-row">
            <a className="pt-btn ghost" href={`/api/my/${data.token}/doc/${q.id}`} target="_blank" rel="noreferrer">
              View {quoteWord(q)}
              {q.pdf ? ' (PDF)' : ''}
            </a>
            <button type="button" className="pt-btn" onClick={() => setSigning(true)}>
              Accept quote
            </button>
            <button type="button" className="pt-btn ghost" onClick={() => setQuery((n) => n + 1)}>
              Raise a query
            </button>
            <button type="button" className="pt-btn ghost" onClick={openDecline}>
              Decline
            </button>
            {data.hasProposal && (
              <a className="pt-btn ghost" href={`/my/${data.token}/proposal`}>
                Explore your proposal
              </a>
            )}
          </div>
          <ol className="pt-steps" data-track="steps">
            <li>Accept and sign</li>
            <li>Pay your deposit by card</li>
            <li>Choose your installation date</li>
          </ol>
        </section>
      ) : (
        <section className="pt-card">
          <h2>Your quote</h2>
          <p className="pt-muted">We’re just finishing your quote and will send it over shortly.</p>
        </section>
      )}

      <PortalMessages token={data.token} first={data.first} focus={query} prefill="I have a question about my quote: " />

      <Contact data={data} />

      {signing && q && (
        <div className="pt-sheet" role="dialog" aria-modal="true" onClick={() => setSigning(false)}>
          <div className="pt-sheet-box" onClick={(e) => e.stopPropagation()}>
            <h2>Accept your {quoteWord(q)}</h2>
            <p className="pt-muted">
              <a href={`/api/my/${data.token}/doc/${q.id}`} target="_blank" rel="noreferrer">
                {q.name}
              </a>
            </p>
            <SignForm token={data.token} quote={q} onDone={(d) => void afterAccept(data.token, d)} onCancel={() => setSigning(false)} />
          </div>
        </div>
      )}
      {declining && q && <DeclineSheet token={data.token} word={quoteWord(q)} onClose={() => setDeclining(false)} />}
    </Shell>
  );
}

/* ── Won onwards: the full portal ──────────────────────────────────────────── */

function FullPortal({ data, paid, justAccepted, openAccept, themePref }: { data: PortalData; paid: boolean; justAccepted: boolean; openAccept: boolean; themePref: ThemePref }) {
  const [signing, setSigningRaw] = useState(openAccept && !!data.quote);
  const [declining, setDeclining] = useState(false);
  const [query, setQuery] = useState(0);
  useEffect(() => {
    if (data.quote) track(data.token, 'opened');
  }, [data.token, data.quote]);
  useEngagement(data.token, !!data.quote || !!data.accepted);
  const setSigning = (v: boolean) => {
    if (v) track(data.token, 'sign_started');
    setSigningRaw(v);
  };
  const [photo, setPhoto] = useState<string | null>(null);
  const now = useNow(60_000);
  const accepted = data.accepted;

  // The one thing that matters most right now (worked out once the clock is known, in the browser).
  const next = useMemo(() => {
    if (!now) return null;
    if (data.installAt && daysUntil(data.installAt, now) >= 0) {
      const n = daysUntil(data.installAt, now);
      return {
        big: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days`,
        text: n <= 1 ? `Your installation is ${n === 0 ? 'today' : 'tomorrow'}` : 'until your installation',
        sub: fmtDate(data.installAt, true),
      };
    }
    if (data.quote && !accepted) return { big: `Your ${quoteWord(data.quote)}`, text: 'is ready to read and sign', sub: data.quote.name };
    if (data.surveyAt && daysUntil(data.surveyAt, now) >= 0) {
      const n = daysUntil(data.surveyAt, now);
      return { big: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days`, text: n <= 1 ? 'Your survey' : 'until your survey', sub: fmtDate(data.surveyAt, true) };
    }
    return null;
  }, [now, data.installAt, data.quote, accepted, data.surveyAt]);

  const depositLeft = !!data.deposit && !data.deposit.paidAt && !paid;
  const depositDue = data.deposit && !data.deposit.paidAt && !paid && (accepted || isWonStage(data.stage));
  // Once handover.sql has run the pack is its own section (data.handover), and the documents list is the rest.
  const pack = data.handover && (data.handover.groups.length || data.handover.signs.length) ? data.handover : null;
  const handover = data.handover ? [] : data.documents.filter((d) => d.category === 'handover');
  const others = data.handover ? data.documents : data.documents.filter((d) => d.category !== 'handover');

  return (
    <Shell tag="Your project" themePref={themePref}>
      <section className="pt-hello">
        <h1>Hi {data.first}</h1>
        <p>
          {data.title}
          {data.postcode && !data.title.includes(data.postcode) ? ` · ${data.postcode}` : ''}
        </p>
      </section>

      {paid && <p className="pt-banner ok">Thank you, your deposit has been paid. Last step: choose your installation date below.</p>}
      {justAccepted && !paid && <p className="pt-banner ok">Thank you, your quote is accepted. {depositLeft ? 'Next: pay your deposit, then choose your installation date.' : 'Next: choose your installation date.'}</p>}

      {next && (
        <section className="pt-next">
          <b>{next.big}</b>
          <span>{next.text}</span>
          <small>{next.sub}</small>
        </section>
      )}

      {data.quote && !accepted && (
        <section className="pt-card pt-action" data-track="quote">
          <h2>Your {quoteWord(data.quote)}</h2>
          <p>Have a read through. When you’re happy, press Accept quote. You will sign, then pay your deposit and choose your installation date.</p>
          <div className="pt-row">
            <a className="pt-btn ghost" href={`/api/my/${data.token}/doc/${data.quote.id}`} target="_blank" rel="noreferrer">
              View {quoteWord(data.quote)}
            </a>
            <button type="button" className="pt-btn" onClick={() => setSigning(true)}>
              Accept quote
            </button>
            <button type="button" className="pt-btn ghost" onClick={() => setQuery((n) => n + 1)}>
              Raise a query
            </button>
            <button
              type="button"
              className="pt-btn ghost"
              onClick={() => {
                track(data.token, 'decline_started');
                setDeclining(true);
              }}
            >
              Decline
            </button>
            {data.hasProposal && (
              <a className="pt-btn ghost" href={`/my/${data.token}/proposal`}>
                Explore your proposal
              </a>
            )}
          </div>
        </section>
      )}
      {accepted && (
        <p className="pt-banner ok">
          ✓ Quote accepted by {accepted.name} on {fmtDate(accepted.at)}. Thank you!
          {accepted.document && (
            <>
              {' '}
              <a className="pt-link" href={`/api/my/${data.token}/doc/${accepted.document.id}`} target="_blank" rel="noreferrer">
                View it
              </a>
            </>
          )}
        </p>
      )}

      {depositDue && data.deposit && (
        <section className="pt-card pt-action">
          <h2>Pay your deposit</h2>
          <Deposit token={data.token} deposit={data.deposit} />
        </section>
      )}

      {accepted && !data.installAt && (
        <section className="pt-card pt-action">
          <h2>Choose your installation date</h2>
          <InstallDates token={data.token} pref={data.installPref} />
        </section>
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
                    <small>{[s.date ? fmtDate(s.date, s.key === 'survey' || s.key === 'install') : '', s.note].filter(Boolean).join(' · ')}</small>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {pack && <HandoverSection token={data.token} data={pack} />}

      {handover.length > 0 && (
        <section className="pt-card pt-handover">
          <h2>Your handover pack</h2>
          <p className="pt-muted">Your certificates, warranties and guides. Keep these safe: you may need them if you sell your home.</p>
          <DocList token={data.token} docs={handover} />
        </section>
      )}

      <section className="pt-card">
        <h2>{handover.length || pack ? 'Other documents' : 'Your documents'}</h2>
        {others.length === 0 ? (
          <p className="pt-muted">Your quote, invoices, grid connection (DNO) letters and certificates will appear here.</p>
        ) : (
          <DocList token={data.token} docs={others} />
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

      <PortalMessages token={data.token} first={data.first} focus={query} prefill={data.quote && !accepted ? 'I have a question about my quote: ' : ''} />

      <Contact data={data} />

      {signing && data.quote && (
        <div className="pt-sheet" role="dialog" aria-modal="true" onClick={() => setSigning(false)}>
          <div className="pt-sheet-box" onClick={(e) => e.stopPropagation()}>
            <h2>Accept your {quoteWord(data.quote)}</h2>
            <p className="pt-muted">
              <a href={`/api/my/${data.token}/doc/${data.quote.id}`} target="_blank" rel="noreferrer">
                {data.quote.name}
              </a>
            </p>
            <SignForm token={data.token} quote={data.quote} onDone={(d) => void afterAccept(data.token, d)} onCancel={() => setSigning(false)} />
          </div>
        </div>
      )}
      {declining && data.quote && <DeclineSheet token={data.token} word={quoteWord(data.quote)} onClose={() => setDeclining(false)} />}
      {photo && (
        <div className="pt-sheet" onClick={() => setPhoto(null)} role="dialog" aria-modal="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pt-full" src={photo} alt="" />
        </div>
      )}
    </Shell>
  );
}

function DocList({ token, docs }: { token: string; docs: Doc[] }) {
  return (
    <ul className="pt-docs">
      {docs.map((d) => (
        <li key={d.id}>
          <a href={`/api/my/${token}/doc/${d.id}`} target="_blank" rel="noreferrer">
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
          {d.print && (
            <a className="pt-doc-print" href={printHref(`/api/my/${token}/doc/${d.id}`)} target="_blank" rel="noreferrer" title={PRINT_TITLE}>
              {PRINT_LABEL}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function Deposit({ token, deposit }: { token: string; deposit: NonNullable<PortalData['deposit']> }) {
  return (
    <>
      <p>
        <b>£{deposit.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</b> secures your installation date.
      </p>
      {deposit.canPay ? <DepositButton token={token} /> : <p className="pt-muted">We’ll send you our bank details to pay by transfer.</p>}
    </>
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

/** Typed name, signature, the 14-day wording and the "start within 14 days" box. */
function SignForm({ token, quote, onDone, onCancel }: { token: string; quote: Quote; onDone: (d: { deposit?: boolean }) => void; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [startEarly, setStartEarly] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const what = quoteWord(quote);
  async function submit() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/my/${token}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: quote.id, name, agree, signature: sig, startEarly }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    // 409: it's already been signed (another tap or another phone), so show the signed page.
    if (r?.ok) return onDone(d);
    if (r?.status === 409) return onDone({});
    setBusy(false);
    setErr(d.error || 'Something went wrong. Please try again.');
  }
  return (
    <div className="pt-signform">
      <label className="pt-label" htmlFor="pt-name">
        Your full name
      </label>
      <input id="pt-name" className="pt-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <label className="pt-label">Sign here</label>
      {/* A white sheet in both themes: what's drawn is kept as ink on paper. */}
      <div className="hx-light">
        <SignaturePad onChange={setSig} height={150} />
      </div>
      <p className="pt-cancel">{CANCEL_NOTE}</p>
      <label className="pt-check">
        <input type="checkbox" checked={startEarly} onChange={(e) => setStartEarly(e.target.checked)} /> Please start work within the 14 days. I
        understand I may have to pay for work already done if I then cancel.
      </label>
      <label className="pt-check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I accept this {what} and Heliaxis’s terms and
        conditions.
      </label>
      {err && <p className="pt-err">{err}</p>}
      <div className="pt-row">
        <button type="button" className="pt-btn" disabled={busy || name.trim().length < 3 || !sig || !agree} onClick={submit}>
          {busy ? 'Saving…' : 'Accept quote'}
        </button>
        {onCancel && (
          <button type="button" className="pt-btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/** Declining the quote: a comment (what put them off), then the team is told. The quote stays open to them until they decide. */
function DeclineSheet({ token, word, onClose }: { token: string; word: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  async function send() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/my/${token}/decline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setErr(d.error || 'Something went wrong. Please try again.');
    setDone(true);
  }
  return (
    <div className="pt-sheet" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="pt-sheet-box" onClick={(e) => e.stopPropagation()}>
        <h2>{done ? 'Thank you for letting us know' : `Decline your ${word}`}</h2>
        {done ? (
          <>
            <p>We’ve passed your comments to the team. Someone may be in touch to see whether anything could be changed. If you change your mind, your {word} is still here.</p>
            <button type="button" className="pt-btn" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <p className="pt-muted">We’re sorry it isn’t right. Could you tell us why? It helps us, and we may be able to change the quote.</p>
            <label className="pt-label" htmlFor="pt-decline">
              Your comments
            </label>
            <textarea id="pt-decline" className="pt-input" rows={5} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. the price is higher than I expected, or I would like fewer panels" autoFocus />
            {err && <p className="pt-err">{err}</p>}
            <div className="pt-row">
              <button type="button" className="pt-btn" disabled={busy} onClick={() => void send()}>
                {busy ? 'Sending…' : 'Send and decline'}
              </button>
              <button type="button" className="pt-btn ghost" onClick={onClose}>
                Go back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const wordsOf = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDate();

/**
 * After accepting: a calendar of the next three weeks, free days to tap. Picking one is a provisional booking: the day is held
 * for them and the office confirms it. Weekends and bank holidays are greyed, as are days with no room.
 */
function InstallDates({ token, pref }: { token: string; pref: PortalData['installPref'] }) {
  const [cal, setCal] = useState<{ days: CalendarDay[]; from: string; prev: string | null; next: string | null } | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [pick, setPick] = useState(pref?.dates?.[0] ?? '');
  const [flexible, setFlexible] = useState(pref?.flexible ?? false);
  const [notes, setNotes] = useState(pref?.notes ?? '');
  const [editing, setEditing] = useState(!pref);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(!!pref);
  const started = useRef(false);

  useEffect(() => {
    if (!editing) return;
    let gone = false;
    fetch(`/api/my/${token}/install-availability${from ? `?from=${from}` : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !gone && d && setCal(d))
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [token, from, editing]);

  function choose(d: string) {
    if (!started.current) {
      started.current = true;
      void fetch(`/api/my/${token}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'dates_started' }), keepalive: true }).catch(() => null);
    }
    setPick(d);
  }
  async function save() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/my/${token}/install-dates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dates: [pick], flexible, notes, provisional: true }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) {
      if (r?.status === 409) setFrom(cal?.from ?? null);
      setPick('');
      return setErr(d.error || 'Something went wrong. Please try again.');
    }
    setDone(true);
    setEditing(false);
  }
  if (done && !editing) {
    return (
      <div>
        <p className="pt-banner ok">
          ✓ Provisionally booked for {pick ? wordsOf(pick) : pref?.dates?.[0] ? wordsOf(pref.dates[0]) : 'your chosen date'}
          {flexible ? ' (flexible)' : ''}. We’ll check it against our installers and scaffolding and confirm it with you.
        </p>
        <button type="button" className="pt-btn ghost" onClick={() => setEditing(true)}>
          Change my date
        </button>
      </div>
    );
  }
  const weeks: CalendarDay[][] = [];
  if (cal) for (let i = 0; i < cal.days.length; i += 7) weeks.push(cal.days.slice(i, i + 7).slice(0, 5));
  return (
    <div className="pt-signform" data-track="dates">
      <p>Pick a day for your installation. It’s a provisional booking: we hold the day for you and confirm it once we’ve checked our installers and scaffolding. We install Monday to Friday.</p>
      {!cal ? (
        <p className="pt-muted">Loading the available dates…</p>
      ) : (
        <>
          <div className="pt-cal" role="group" aria-label="Available installation dates">
            <div className="pt-cal-head" aria-hidden="true">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            {weeks.map((wk) => (
              <div key={wk[0].day} className="pt-cal-week">
                {wk.map((d) => {
                  const off = d.state === 'closed' || d.state === 'full';
                  return (
                    <button key={d.day} type="button" disabled={off} aria-pressed={pick === d.day} aria-label={`${wordsOf(d.day)}${d.state === 'full' ? ', fully booked' : d.state === 'closed' ? ', not available' : d.state === 'few' ? ', last place' : ''}`} className={`pt-cal-day is-${d.state}${pick === d.day ? ' on' : ''}`} onClick={() => choose(d.day)}>
                      <small>{new Date(`${d.day}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</small>
                      <b>{shortOf(d.day)}</b>
                      {d.state === 'few' && <i>last place</i>}
                      {d.state === 'full' && <i>full</i>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="pt-row">
            <button type="button" className="pt-btn ghost" disabled={!cal.prev} onClick={() => setFrom(cal.prev)}>
              Earlier dates
            </button>
            <button type="button" className="pt-btn ghost" disabled={!cal.next} onClick={() => setFrom(cal.next)}>
              Next three weeks
            </button>
          </div>
        </>
      )}
      <label className="pt-check">
        <input type="checkbox" checked={flexible} onChange={(e) => setFlexible(e.target.checked)} /> I am flexible: a day or two either side is fine.
      </label>
      <label className="pt-label" htmlFor="pt-inst-notes">
        Anything we should know? (optional)
      </label>
      <textarea id="pt-inst-notes" className="pt-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. away the first week of December" />
      {err && <p className="pt-err">{err}</p>}
      <div className="pt-row">
        <button type="button" className="pt-btn" disabled={busy || !pick} onClick={() => void save()}>
          {busy ? 'Booking…' : pick ? `Book ${wordsOf(pick)} provisionally` : 'Choose a day'}
        </button>
        {pref && (
          <button type="button" className="pt-btn ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

type Msg = { id: string; direction: 'in' | 'out'; body: string; created_at: string; by: string | null };

/**
 * The customer's conversation with Heliaxis: what they send comes straight to the team and is logged against
 * them. `focus` goes up each time "Raise a query" is pressed: the card scrolls into view with the box ready
 * (and `prefill` started for them).
 */
function PortalMessages({ token, first, focus, prefill }: { token: string; first: string; focus: number; prefill: string }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const card = useRef<HTMLElement>(null);
  const load = () =>
    fetch(`/api/my/${token}/messages`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .catch(() => setMessages([]));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => {
    if (!focus) return;
    setText((t) => t || prefill);
    card.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => box.current?.focus(), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  async function send() {
    setBusy(true);
    setErr('');
    setSent(false);
    const r = await fetch(`/api/my/${token}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setErr(d.error || 'Something went wrong. Please try again.');
    setText('');
    setSent(true);
    await load();
  }
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <section className="pt-card pt-msgs" id="pt-messages" ref={card} data-track="messages">
      <h2>Messages</h2>
      <p className="pt-muted">Ask us anything about your quote or your installation. {first ? `${first}, ` : ''}your message comes straight to the team and we will reply here.</p>
      {messages && messages.length > 0 && (
        <ul className="pt-thread">
          {messages.map((m) => (
            <li key={m.id} className={m.direction === 'in' ? 'me' : 'them'}>
              <small>
                {m.direction === 'in' ? 'You' : m.by || 'Heliaxis'} · {when(m.created_at)}
              </small>
              <span>{m.body}</span>
            </li>
          ))}
        </ul>
      )}
      <textarea ref={box} className="pt-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your message" aria-label="Your message" />
      {err && <p className="pt-err">{err}</p>}
      {sent && <p className="pt-banner ok">Thank you, we have your message and will reply here.</p>}
      <div className="pt-row">
        <button type="button" className="pt-btn" disabled={busy || !text.trim()} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </section>
  );
}
