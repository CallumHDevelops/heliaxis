'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { BrandLogo } from '@/components/theme/BrandLogo';
import { ThemeChoice } from '@/components/theme/ThemeChoice';
import type { PortalData } from '@/lib/crm/portal';
import { isWonStage } from '@/lib/crm/stages';
import { useNow } from '@/lib/use-now';
import { HandoverSection } from './HandoverSection';
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
export function PortalView({ data, paid = false, themePref = 'system' }: { data: PortalData; paid?: boolean; themePref?: ThemePref }) {
  return data.mode === 'quote' ? <QuotePage data={data} themePref={themePref} /> : <FullPortal data={data} paid={paid} themePref={themePref} />;
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
  );
}

const quoteWord = (q: { category: string }) => (q.category === 'contract' ? 'contract' : 'quote');

/* ── Quote sent: just the quote, to read and sign ──────────────────────────── */

function QuotePage({ data, themePref }: { data: PortalData; themePref: ThemePref }) {
  const q = data.quote;
  return (
    <Shell tag="Your quote" themePref={themePref}>
      <section className="pt-hello">
        <h1>Hi {data.first}</h1>
        <p>{data.title}</p>
      </section>

      {data.accepted ? (
        <section className="pt-card">
          <p className="pt-banner ok">
            ✓ Signed by {data.accepted.name} on {fmtDate(data.accepted.at)}. Thank you!
          </p>
          {data.accepted.document && (
            <a className="pt-btn ghost" href={`/api/my/${data.token}/doc/${data.accepted.document.id}`} target="_blank" rel="noreferrer">
              View what you signed
            </a>
          )}
          <p className="pt-muted">We’ll be in touch shortly about the next steps.</p>
          {data.deposit && !data.deposit.paidAt && <Deposit token={data.token} deposit={data.deposit} />}
        </section>
      ) : q ? (
        <section className="pt-card pt-action pt-quote">
          <h2>Your {quoteWord(q)} from Heliaxis</h2>
          <p>Have a read through. When you’re happy, sign it below and we’ll get your installation booked in.</p>
          <a className="pt-btn ghost" href={`/api/my/${data.token}/doc/${q.id}`} target="_blank" rel="noreferrer">
            View {quoteWord(q)}
            {q.pdf ? ' (PDF)' : ''}
          </a>
          <div className="pt-sign">
            <SignForm token={data.token} quote={q} onDone={() => window.location.reload()} />
          </div>
        </section>
      ) : (
        <section className="pt-card">
          <h2>Your quote</h2>
          <p className="pt-muted">We’re just finishing your quote and will send it over shortly.</p>
        </section>
      )}

      <Contact data={data} />
    </Shell>
  );
}

/* ── Won onwards: the full portal ──────────────────────────────────────────── */

function FullPortal({ data, paid, themePref }: { data: PortalData; paid: boolean; themePref: ThemePref }) {
  const [signing, setSigning] = useState(false);
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

      {paid && <p className="pt-banner ok">Thank you, your deposit has been paid. We’ll be in touch to confirm your installation date.</p>}

      {next && (
        <section className="pt-next">
          <b>{next.big}</b>
          <span>{next.text}</span>
          <small>{next.sub}</small>
        </section>
      )}

      {data.quote && !accepted && (
        <section className="pt-card pt-action">
          <h2>Sign your {quoteWord(data.quote)}</h2>
          <p>Have a read through. When you’re happy, sign it here and we’ll get your installation booked in.</p>
          <div className="pt-row">
            <a className="pt-btn ghost" href={`/api/my/${data.token}/doc/${data.quote.id}`} target="_blank" rel="noreferrer">
              View {quoteWord(data.quote)}
            </a>
            <button type="button" className="pt-btn" onClick={() => setSigning(true)}>
              Accept and sign
            </button>
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

      <Contact data={data} />

      {signing && data.quote && (
        <div className="pt-sheet" role="dialog" aria-modal="true" onClick={() => setSigning(false)}>
          <div className="pt-sheet-box" onClick={(e) => e.stopPropagation()}>
            <h2>Sign your {quoteWord(data.quote)}</h2>
            <p className="pt-muted">
              <a href={`/api/my/${data.token}/doc/${data.quote.id}`} target="_blank" rel="noreferrer">
                {data.quote.name}
              </a>
            </p>
            <SignForm token={data.token} quote={data.quote} onDone={() => window.location.reload()} onCancel={() => setSigning(false)} />
          </div>
        </div>
      )}
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
function SignForm({ token, quote, onDone, onCancel }: { token: string; quote: Quote; onDone: () => void; onCancel?: () => void }) {
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
    if (r?.ok || r?.status === 409) return onDone();
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
          {busy ? 'Saving…' : `Sign and accept`}
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
