'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { BrandLogo } from '@/components/theme/BrandLogo';
import { ThemeChoice } from '@/components/theme/ThemeChoice';
import type { PortalData } from '@/lib/crm/portal';
import { isWonStage } from '@/lib/crm/stages';
import { HOLD_MESSAGE } from '@/lib/proposal/messages';
import type { CalendarDay } from '@/lib/install-dates';
import { useNow } from '@/lib/use-now';
import { THEME_GROUP_LABEL, type ThemePref } from '@/lib/theme/shared';
import { forgetProject, InstallApp, registerPortalWorker, rememberProject } from '../InstallApp';
import { HandoverSection, SignCard } from './HandoverSection';
import { Hestia } from './Hestia';
import { ComingRow, dayParts, dayText, DocGroup, DocRow, Icon, money, whenText } from './parts';
import { useEngagement } from './useEngagement';
import './portal.css';

type Quote = NonNullable<PortalData['quote']>;
type Tab = 'home' | 'docs' | 'system' | 'money' | 'help';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'docs', label: 'Documents', icon: 'docs' },
  { key: 'system', label: 'My system', icon: 'system' },
  { key: 'money', label: 'Payments', icon: 'money' },
  { key: 'help', label: 'Help', icon: 'help' },
];

/** Whole UK days from now to the date of `iso` (0 = today). */
function daysUntil(iso: string, now: number) {
  const a = dayParts(iso);
  const b = dayParts(new Date(now).toISOString());
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return Math.round((Date.UTC(a.year, M.indexOf(a.month), a.day) - Date.UTC(b.year, M.indexOf(b.month), b.day)) / 86_400_000);
}

const CANCEL_NOTE = 'You can change your mind and cancel within 14 days of signing, free of charge.';
const fmtDate = (iso: string, withTime = false) => whenText(iso, withTime);

/**
 * The customer's private link, phone first. At Quote sent it's one page: the quote to read and sign,
 * with the proposal pack beside it. From Won it's their project in five tabs: Home (the next thing to
 * do, where it's up to, dates and photos), Documents (proposal pack, handover pack, invoices, the rest,
 * each with View and Download), My system (equipment, serial numbers, warranties), Payments (the price,
 * what's paid, the balance) and Help (Hestia, messages, call / WhatsApp / email, log a complaint).
 * `themePref`: their Light / Dark / Match phone as the server rendered it. `preview`: staff looking.
 */
export function PortalView({
  data,
  paid = false,
  justAccepted = false,
  openAccept = false,
  themePref = 'system',
  preview = false,
  base = '/my',
}: {
  data: PortalData;
  /** '/my', or '' on portal.heliaxis.co.uk. */ base?: string;
  paid?: boolean;
  justAccepted?: boolean;
  /** Came from the quote's Accept button: the sign box opens straight away. */ openAccept?: boolean;
  themePref?: ThemePref;
  preview?: boolean;
}) {
  // This phone remembers their project, so /my and the home-screen icon open it again (never for staff previewing).
  useEffect(() => {
    if (!preview) rememberProject(data.token);
    registerPortalWorker();
  }, [data.token, preview]);
  return (
    <BaseContext.Provider value={base}>
      {data.mode === 'quote' ? <QuotePage data={data} openAccept={openAccept} themePref={themePref} /> : <FullPortal data={data} paid={paid} justAccepted={justAccepted} openAccept={openAccept} themePref={themePref} />}
    </BaseContext.Provider>
  );
}

/** Where the portal's pages are: '/my', or '' on portal.heliaxis.co.uk. */
const BaseContext = createContext('/my');

function Shell({ data, themePref, nav, children }: { data: PortalData; themePref: ThemePref; nav?: ReactNode; children: ReactNode }) {
  const ref = data.extras?.ref;
  const base = useContext(BaseContext);
  return (
    <div className={`pt${nav ? ' has-nav' : ''}`}>
      <header className="pt-head">
        <BrandLogo width={118} />
        <span className="pt-head-tag">{ref ? `Project ${ref}` : 'Your project'}</span>
      </header>
      <main className="pt-main">
        {children}
        <footer className="pt-footer">
          {/* Light / Dark / Match phone: kept on this phone (cookie and storage), no account needed. */}
          <div className="pt-theme">
            <span className="pt-theme-label" aria-hidden="true">
              {THEME_GROUP_LABEL}
            </span>
            <ThemeChoice size="sm" serverPref={themePref} />
          </div>
          <p className="pt-foot">This is your private link. Please don’t share it. Heliaxis Limited</p>
          <button
            type="button"
            className="pt-foot-link"
            onClick={() => {
              forgetProject();
              window.location.assign(base ? `${base}?signout=1` : '/?signout=1');
            }}
          >
            Not your project? Forget it on this device
          </button>
        </footer>
      </main>
      {nav}
    </div>
  );
}

/** The band at the top: who it's for, where it's up to and, when it's close, a countdown. */
function Hero({ data, kicker, headline, sub, step, count }: { data: PortalData; kicker: string; headline: string; sub?: string; step?: { at: number; of: number; label: string }; count?: { big: string; text: string; sub: string } | null }) {
  return (
    <section className="pt-hero">
      <span className="pt-hero-kicker">{kicker}</span>
      <h1>{headline}</h1>
      <p className="pt-hero-sub">
        {sub ?? data.title}
        {data.postcode && !data.title.includes(data.postcode) && !sub ? ` · ${data.postcode}` : ''}
      </p>
      {step && (
        <div className="pt-hero-step" aria-label={`Step ${step.at} of ${step.of}: ${step.label}`}>
          <div className="pt-hero-bar" aria-hidden="true">
            {Array.from({ length: step.of }, (_, i) => (
              <i key={i} className={i < step.at - 1 ? 'done' : i === step.at - 1 ? 'now' : ''} />
            ))}
          </div>
          <small>
            Step {step.at} of {step.of} · <b>{step.label}</b>
          </small>
        </div>
      )}
      {count && (
        <div className="pt-count">
          <b>{count.big}</b>
          <span>
            {count.text}
            <small>{count.sub}</small>
          </span>
        </div>
      )}
    </section>
  );
}

function ContactCard({ data, onMessage, onComplaint }: { data: PortalData; onMessage: () => void; onComplaint: () => void }) {
  const wa = data.whatsapp ? `https://wa.me/${data.whatsapp.replace(/\D/g, '').replace(/^0/, '44')}` : null;
  return (
    <section className="pt-card pt-contact" data-track="contact" aria-label="Contact us">
      <h2>Talk to us</h2>
      <p className="pt-muted">{data.owner ? `${data.owner} and the team are` : 'The team is'} here Monday to Friday.</p>
      <div className="pt-contact-grid">
        {data.phone && (
          <a className="pt-tile" href={`tel:${data.phone.replace(/\s/g, '')}`}>
            <Icon name="phone" />
            <span>Call</span>
          </a>
        )}
        {wa && (
          <a className="pt-tile wa" href={wa} target="_blank" rel="noreferrer">
            <Icon name="chat" />
            <span>WhatsApp</span>
          </a>
        )}
        <a className="pt-tile" href={`mailto:${data.email}`}>
          <Icon name="mail" />
          <span>Email</span>
        </a>
        <button type="button" className="pt-tile" onClick={onMessage}>
          <Icon name="help" />
          <span>Message</span>
        </button>
      </div>
      <button type="button" className="pt-complain" onClick={onComplaint}>
        <Icon name="flag" size={18} />
        <span>
          <b>Log a complaint</b>
          <small>Something not right? Tell us and we’ll deal with it under our complaints procedure.</small>
        </span>
      </button>
    </section>
  );
}

/** "Log a complaint": goes to the team marked as a complaint, and into the Messages thread. */
function ComplaintSheet({ token, procedure, onClose, onSent }: { token: string; procedure: { id: string; name: string } | null; onClose: () => void; onSent: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  async function send() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/my/${token}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, kind: 'complaint' }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setErr(d.error || 'Something went wrong. Please try again, or call us.');
    setDone(true);
    onSent();
  }
  return (
    <div className="pt-sheet" role="dialog" aria-modal="true" aria-label="Log a complaint" onClick={onClose}>
      <div className="pt-sheet-box" onClick={(e) => e.stopPropagation()}>
        <h2>{done ? 'We’ve logged your complaint' : 'Log a complaint'}</h2>
        {done ? (
          <>
            <p>Thank you for telling us. It has gone straight to the team as a complaint, and we’ll reply in Messages under our complaints procedure.</p>
            <button type="button" className="pt-btn" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <p className="pt-muted">We’re sorry something isn’t right. Tell us what happened and what you’d like us to do. It goes to the team marked as a complaint.</p>
            {procedure && (
              <a className="pt-linkbtn" href={`/api/my/${token}/doc/${procedure.id}`} target="_blank" rel="noreferrer">
                Read our complaints procedure
              </a>
            )}
            <label className="pt-label" htmlFor="pt-complaint">
              Your complaint
            </label>
            <textarea id="pt-complaint" className="pt-input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened, when, and what you’d like us to do" autoFocus />
            {err && <p className="pt-err">{err}</p>}
            <div className="pt-row">
              <button type="button" className="pt-btn" disabled={busy || text.trim().length < 5} onClick={() => void send()}>
                {busy ? 'Sending…' : 'Send complaint'}
              </button>
              <button type="button" className="pt-btn ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Tell Heliaxis a step was reached (opened the link, started to accept, ...). Quiet, and never in the customer's way. */
function track(token: string, type: 'opened' | 'sign_started' | 'decline_started' | 'dates_started') {
  try {
    void fetch(`/api/my/${token}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
      keepalive: true,
    }).catch(() => null);
  } catch {
    // Tracking must never get in the way.
  }
}

/**
 * After they accept: straight on to the card payment page for the deposit if there is one; otherwise (or if
 * card payment isn't available) back to their portal, which shows what is left to do.
 */
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

/**
 * Accept. With the proposal pack switched on, the server first says whether the contract can be signed
 * yet (api/my/[token]/accept-intent): "hold" thanks them while the paperwork is being finished. With it
 * off, or on any hiccup, it is the signature sheet exactly as it always was.
 */
function useAcceptIntent(data: PortalData, open: () => void) {
  const [held, setHeld] = useState(data.pack.held);
  const [busy, setBusy] = useState(false);
  async function accept() {
    if (!data.pack.on) return open();
    setBusy(true);
    const r = await fetch(`/api/my/${data.token}/accept-intent`, {
      method: 'POST',
    }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (d.path === 'hold') return setHeld(true);
    if (d.path === 'signed') return window.location.reload();
    open();
  }
  return { held, busy, accept };
}

const quoteWord = (q: { category: string }) => (q.category === 'contract' ? 'contract' : 'quote');

/** Everything about the quote in one place: read it, explore it, accept, ask, or decline. Shared by both modes. */
function useQuoteFlow(data: PortalData, openAccept: boolean) {
  const q = data.quote;
  const [signing, setSigningRaw] = useState(openAccept && !!q && !data.pack.on);
  const [declining, setDeclining] = useState(false);
  useEngagement(data.token, !!q || !!data.accepted);
  const setSigning = (v: boolean) => {
    if (v) track(data.token, 'sign_started');
    setSigningRaw(v);
  };
  const { held, busy, accept } = useAcceptIntent(data, () => setSigning(true));
  // Came from the quote's Accept button (?accept): the same check, without a second press.
  const auto = useRef(false);
  useEffect(() => {
    if (q) track(data.token, 'opened');
    if (openAccept && q && !data.pack.on) track(data.token, 'sign_started');
  }, [data.token, openAccept, q, data.pack.on]);
  useEffect(() => {
    if (auto.current) return;
    auto.current = true;
    if (openAccept && data.pack.on && q && !held) void accept();
  }, [openAccept, data.pack.on, q, held, accept]);
  const openDecline = () => {
    track(data.token, 'decline_started');
    setDeclining(true);
  };
  const sheets = (
    <>
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
    </>
  );
  return { q, held, busy, accept, openDecline, sheets };
}

function QuoteCard({ data, flow, onQuery }: { data: PortalData; flow: ReturnType<typeof useQuoteFlow>; onQuery: () => void }) {
  const q = flow.q!;
  const base = useContext(BaseContext);
  const href = `/api/my/${data.token}/doc/${q.id}`;
  if (flow.held)
    return (
      <section className="pt-card pt-action" data-track="quote-held">
        <p className="pt-banner ok">{HOLD_MESSAGE}</p>
        <div className="pt-row">
          <a className="pt-btn ghost" href={href} target="_blank" rel="noreferrer">
            <Icon name="view" size={18} /> View {quoteWord(q)}
          </a>
        </div>
      </section>
    );
  return (
    <section className="pt-card pt-action pt-quote" data-track="quote">
      <span className="pt-badge">Your next step</span>
      <h2>Read and sign your {quoteWord(q)}</h2>
      <p>Have a read through. When you’re happy, press Accept. You’ll sign on screen, then pay your deposit and choose your installation date.</p>
      <div className="pt-row pt-row-2">
        <a className="pt-btn ghost" href={href} target="_blank" rel="noreferrer">
          <Icon name="view" size={18} /> View {quoteWord(q)}
        </a>
        <button type="button" className="pt-btn" disabled={flow.busy} onClick={() => void flow.accept()}>
          <Icon name="pen" size={18} /> {flow.busy ? 'One moment…' : `Accept ${quoteWord(q)}`}
        </button>
      </div>
      {data.hasProposal && (
        <a className="pt-btn ghost pt-wide" href={`${base}/${data.token}/proposal`}>
          <Icon name="spark" size={18} /> Explore your design and savings
        </a>
      )}
      <ol className="pt-steps" data-track="steps">
        <li className="now">Accept and sign</li>
        <li>Pay your deposit by card</li>
        <li>Choose your installation date</li>
      </ol>
      <div className="pt-row pt-quiet">
        <button type="button" className="pt-linkbtn" onClick={onQuery}>
          Ask a question about it
        </button>
        <button type="button" className="pt-linkbtn" onClick={flow.openDecline}>
          Decline
        </button>
      </div>
    </section>
  );
}

/** The proposal pack in its groups, each document with View and Download. */
function ProposalPack({ data, signedNote }: { data: PortalData; signedNote?: string }) {
  const pp = data.extras?.proposal;
  if (!pp) return null;
  return (
    <section className="pt-card" aria-label="Your proposal pack" id="pt-proposal">
      <div className="pt-card-head">
        <h2>Your proposal pack</h2>
        <p className="pt-muted">{signedNote ?? 'Your quotation, contract and the information you need before you sign.'}</p>
      </div>
      {pp.groups.map((g) => (
        <DocGroup key={g.title} title={g.title}>
          {g.items.flatMap((i) => (i.coming ? [<ComingRow key={i.code} title={i.title} line={i.line} />] : i.docs.map((d) => <DocRow key={d.id} token={data.token} doc={d} label={i.title} line={i.line} />)))}
        </DocGroup>
      ))}
    </section>
  );
}

const complaintsDoc = (data: PortalData) => {
  const d = data.extras?.proposal?.groups.flatMap((g) => g.items).find((i) => i.code === 'HX-PP-08')?.docs[0];
  return d ? { id: d.id, name: d.name } : null;
};

/* ── Quote sent: the quote to read and sign, and the pack beside it ─────────── */

function QuotePage({ data, openAccept, themePref }: { data: PortalData; openAccept: boolean; themePref: ThemePref }) {
  const flow = useQuoteFlow(data, openAccept);
  const [query, setQuery] = useState(0);
  const [prefill, setPrefill] = useState('');
  const [complaint, setComplaint] = useState(false);
  const ask = (text: string) => {
    setPrefill(text);
    setQuery((n) => n + 1);
  };
  const q = flow.q;
  return (
    <Shell data={data} themePref={themePref}>
      <Hero data={data} kicker={`Hi ${data.first}`} headline={data.accepted ? 'Thank you! Your quote is accepted' : q ? `Your ${quoteWord(q)} is ready` : 'Your quote is on its way'} />

      <Split
        side={
          <>
            {data.hestia && <Hestia token={data.token} suggestions={['What happens after I sign?', 'Can I cancel if I change my mind?', 'How does the deposit work?']} onHandoff={ask} />}
            <ContactCard data={data} onMessage={() => ask('')} onComplaint={() => setComplaint(true)} />
            <InstallApp compact />
          </>
        }
      >
        {data.accepted ? (
          <section className="pt-card pt-action">
            <p className="pt-banner ok">
              ✓ Accepted by {data.accepted.name} on {fmtDate(data.accepted.at)}.
            </p>
            {data.accepted.document && (
              <ul className="pt-docs">
                <DocRow
                  token={data.token}
                  doc={{
                    id: data.accepted.document.id,
                    name: data.accepted.document.name,
                  }}
                  label="What you signed"
                  line={data.accepted.document.name}
                />
              </ul>
            )}
            {data.deposit && !data.deposit.paidAt && <Deposit token={data.token} deposit={data.deposit} />}
            <InstallDates token={data.token} pref={data.installPref} />
          </section>
        ) : q ? (
          <QuoteCard data={data} flow={flow} onQuery={() => ask('I have a question about my quote: ')} />
        ) : (
          <section className="pt-card">
            <h2>Your quote</h2>
            <p className="pt-muted">We’re just finishing your quote and will send it over shortly.</p>
          </section>
        )}

        <ProposalPack data={data} />
        <PortalMessages token={data.token} first={data.first} focus={query} prefill={prefill || 'I have a question about my quote: '} />
      </Split>
      {complaint && <ComplaintSheet token={data.token} procedure={complaintsDoc(data)} onClose={() => setComplaint(false)} onSent={() => setQuery((n) => n)} />}
      {flow.sheets}
    </Shell>
  );
}

/* ── Won onwards: their project, in five tabs ──────────────────────────────── */

const HEADLINE: Record<string, string> = {
  won: 'Your order is confirmed',
  design: 'We’re designing your system',
  ready: 'Getting ready to book you in',
  install_booked: 'Your installation is booked',
  installing: 'Installation under way',
  commissioning: 'Your system is switched on',
  handover: 'Finishing your paperwork',
  complete: 'All done. Enjoy your system',
};
const DOING: Record<string, string> = {
  won: 'We’re checking the design and starting the paperwork. We’ll be in touch about dates.',
  design: 'We’re finalising your design and, where needed, applying to the electricity network (DNO).',
  ready: 'Approvals are sorted. We’re lining up installers and scaffolding for your dates.',
  install_booked: 'Everything is booked. We’ll remind you before the day.',
  installing: 'Our team is on site. Photos will appear here as the work goes on.',
  commissioning: 'Your system is tested and on. We’re putting your certificates and handover pack together.',
  handover: 'Your certificates and handover pack are being finished. They’ll appear in Documents.',
  complete: 'Your project is complete. Everything is kept here for you.',
};

function FullPortal({ data, paid, justAccepted, openAccept, themePref }: { data: PortalData; paid: boolean; justAccepted: boolean; openAccept: boolean; themePref: ThemePref }) {
  const flow = useQuoteFlow(data, openAccept);
  const [tab, setTabRaw] = useState<Tab>('home');
  const [query, setQuery] = useState(0);
  const [prefill, setPrefill] = useState('');
  const [complaint, setComplaint] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const now = useNow(60_000);
  const accepted = data.accepted;
  const x = data.extras;

  // The tab lives in the address (#documents …), so Back and a shared link land where they were.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace('#', '') as Tab;
      if (TABS.some((t) => t.key === h)) setTabRaw(h);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const setTab = useCallback((t: Tab) => {
    setTabRaw(t);
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${t === 'home' ? '' : `#${t}`}`);
    window.scrollTo({ top: 0 });
  }, []);
  const ask = (text: string) => {
    setTab('help');
    setPrefill(text);
    setTimeout(() => setQuery((n) => n + 1), 50);
  };

  // Where it's up to: the tracker's current step (or the last done one).
  const steps = data.tracker;
  const cur = steps.findIndex((s) => s.state === 'current');
  const at = cur >= 0 ? cur + 1 : Math.max(1, steps.filter((s) => s.state === 'done').length);
  const step = steps.length ? { at, of: steps.length, label: steps[at - 1]?.label ?? '' } : undefined;

  // The countdown (worked out once the clock is known, in the browser).
  const count = useMemo(() => {
    if (!now) return null;
    for (const [iso, what] of [
      [data.installAt, 'installation'],
      [data.surveyAt, 'survey'],
    ] as const) {
      if (!iso) continue;
      const n = daysUntil(iso, now);
      if (n < 0) continue;
      return {
        big: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days`,
        text: n <= 1 ? `Your ${what}` : `until your ${what}`,
        sub: fmtDate(iso, true),
      };
    }
    return null;
  }, [now, data.installAt, data.surveyAt]);

  const depositDue = !!data.deposit && !data.deposit.paidAt && !paid && (!!accepted || isWonStage(data.stage));
  const pack = data.handover && (data.handover.groups.length || data.handover.signs.length) ? data.handover : null;
  const late = ['commissioning', 'handover', 'complete'].includes(data.stage);
  const invoiceIds = new Set((x?.money?.invoices ?? []).map((i) => i.id));
  const others = data.documents.filter((d) => !invoiceIds.has(d.id));
  const balanceDue = !!x?.money?.balance && x.money.balance > 0 && late;

  // The next thing for them to do, first. Anything else waits below.
  const todo: ReactNode[] = [];
  if (flow.q && !accepted) todo.push(<QuoteCard key="quote" data={data} flow={flow} onQuery={() => ask('I have a question about my quote: ')} />);
  if (depositDue && data.deposit)
    todo.push(
      <section key="deposit" className="pt-card pt-action">
        <span className="pt-badge">Your next step</span>
        <h2>Pay your deposit</h2>
        <Deposit token={data.token} deposit={data.deposit} />
      </section>,
    );
  if (accepted && !data.installAt)
    todo.push(
      <section key="dates" className="pt-card pt-action">
        <span className="pt-badge">{todo.length ? 'Then' : 'Your next step'}</span>
        <h2>Choose your installation date</h2>
        <InstallDates token={data.token} pref={data.installPref} />
      </section>,
    );
  for (const s of pack?.signs ?? [])
    todo.push(
      <section key={`sign-${s.kind}`} className="pt-card pt-action">
        <span className="pt-badge">Your next step</span>
        <SignCard token={data.token} sign={s} />
      </section>,
    );
  if (pack?.pack)
    todo.push(
      <section key="pack" className="pt-card pt-ready">
        <span className="pt-badge ok">Ready</span>
        <h2>Your handover pack is ready</h2>
        <p className="pt-muted">Your certificates, warranties and guides, all together.</p>
        <button type="button" className="pt-btn" onClick={() => setTab('docs')}>
          <Icon name="docs" size={18} /> Open your documents
        </button>
      </section>,
    );
  if (balanceDue && x?.money?.balance)
    todo.push(
      <section key="balance" className="pt-card pt-action">
        <span className="pt-badge">To pay</span>
        <h2>{money(x.money.balance)} left to pay</h2>
        <p className="pt-muted">Your invoice and the payments we’ve received are in Payments.</p>
        <button type="button" className="pt-btn ghost" onClick={() => setTab('money')}>
          <Icon name="money" size={18} /> See payments and invoices
        </button>
      </section>,
    );

  const nav = (
    <nav className="pt-nav" aria-label="Your project">
      {TABS.map((t) => (
        <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} aria-current={tab === t.key ? 'page' : undefined} onClick={() => setTab(t.key)}>
          <Icon name={t.icon} size={22} />
          <span>{t.label}</span>
        </button>
      ))}
      {data.phone && (
        <div className="pt-nav-foot">
          <small>Questions?</small>
          <a href={`tel:${data.phone.replace(/\s/g, '')}`}>
            <Icon name="phone" size={16} /> {data.phone}
          </a>
          <button type="button" onClick={() => ask('')}>
            <Icon name="help" size={16} /> Message the team
          </button>
        </div>
      )}
    </nav>
  );

  return (
    <Shell data={data} themePref={themePref} nav={nav}>
      {tab === 'home' && (
        <>
          <Hero data={data} kicker={`Hi ${data.first}`} headline={HEADLINE[data.stage] ?? 'Your project'} step={step} count={count} />
          <Split
            side={
              <>
                <QuickLinks data={data} setTab={setTab} />
                <InstallApp compact />
              </>
            }
          >
            {paid && <p className="pt-banner ok">Thank you, your deposit has been paid. {accepted && !data.installAt ? 'Last step: choose your installation date below.' : ''}</p>}
            {justAccepted && !paid && <p className="pt-banner ok">Thank you, your quote is accepted.</p>}
            {accepted && !justAccepted && data.stage === 'won' && (
              <p className="pt-banner ok">
                ✓ Accepted by {accepted.name} on {fmtDate(accepted.at)}.
              </p>
            )}
            {todo.length ? (
              todo
            ) : (
              <section className="pt-card pt-calm">
                <span className="pt-calm-ic" aria-hidden="true">
                  <Icon name="check" size={22} />
                </span>
                <div>
                  <h2>Nothing for you to do right now</h2>
                  <p className="pt-muted">{DOING[data.stage] ?? 'We’ll be in touch about the next step.'}</p>
                </div>
              </section>
            )}

            {steps.length > 0 && (
              <section className="pt-card">
                <h2>Your journey</h2>
                <ol className="pt-track">
                  {steps.map((s) => (
                    <li key={s.key} className={s.state}>
                      <span className="pt-dot" aria-hidden="true">
                        {s.state === 'done' ? <Icon name="check" size={13} /> : ''}
                      </span>
                      <div>
                        <b>{s.label}</b>
                        {(s.date || s.note) && <small>{[s.date ? fmtDate(s.date, s.key === 'survey' || s.key === 'install') : '', s.note].filter(Boolean).join(' · ')}</small>}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

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
                    ) : null,
                  )}
                </div>
              </section>
            )}
          </Split>
        </>
      )}

      {tab === 'docs' && (
        <>
          <TabTitle title="Documents" sub="Everything we’ve given you, in one place. View any document, or download it to keep." />
          <div className="pt-narrow">
            {late && pack && <HandoverSection token={data.token} data={pack} signs={false} />}
            <ProposalPack data={data} signedNote={accepted ? `What you agreed to${accepted ? ` on ${dayText(accepted.at)}` : ''}, and the information that came with it.` : undefined} />
            {!data.extras?.proposal && accepted?.document && (
              <section className="pt-card">
                <h2>What you signed</h2>
                <ul className="pt-docs">
                  <DocRow
                    token={data.token}
                    doc={{
                      id: accepted.document.id,
                      name: accepted.document.name,
                      at: accepted.at,
                    }}
                    line={`Signed by ${accepted.name}`}
                  />
                </ul>
              </section>
            )}
            {!late && pack && <HandoverSection token={data.token} data={pack} signs={false} />}
            {(x?.money?.invoices.length ?? 0) > 0 && (
              <section className="pt-card">
                <DocGroup title="Invoices and receipts">
                  {x!.money!.invoices.map((d) => (
                    <DocRow key={d.id} token={data.token} doc={d} />
                  ))}
                </DocGroup>
              </section>
            )}
            <section className="pt-card">
              <DocGroup title={pack || x?.proposal ? 'Other documents' : 'Your documents'}>
                {others.length ? (
                  others.map((d) => <DocRow key={d.id} token={data.token} doc={{ id: d.id, name: d.name, at: d.at, print: d.print }} line={DOC_LABEL[d.category]} />)
                ) : (
                  <li className="pt-empty">Your grid connection (DNO) letters, certificates and other documents will appear here.</li>
                )}
              </DocGroup>
            </section>
          </div>
        </>
      )}

      {tab === 'system' && <SystemTab data={data} />}

      {tab === 'money' && (
        <>
          <TabTitle title="Payments" sub="What your project costs, what you’ve paid and what’s left, with your invoices." />
          <MoneyTab data={data} depositDue={depositDue} />
        </>
      )}

      {tab === 'help' && (
        <>
          <TabTitle title="Help" sub="Ask Hestia for a quick answer, or talk to the team." />
          <Split
            side={
              <>
                <ContactCard data={data} onMessage={() => ask('')} onComplaint={() => setComplaint(true)} />
                <InstallApp />
              </>
            }
          >
            {data.hestia && <Hestia token={data.token} suggestions={helpSuggestions(data)} onHandoff={ask} />}
            <PortalMessages token={data.token} first={data.first} focus={query} prefill={prefill} />
          </Split>
        </>
      )}

      {complaint && <ComplaintSheet token={data.token} procedure={complaintsDoc(data)} onClose={() => setComplaint(false)} onSent={() => setQuery((n) => n)} />}
      {flow.sheets}
      {photo && (
        <div className="pt-sheet" onClick={() => setPhoto(null)} role="dialog" aria-modal="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pt-full" src={photo} alt="" />
        </div>
      )}
    </Shell>
  );
}

const DOC_LABEL: Record<string, string> = {
  quote: 'Quote',
  invoice: 'Invoice',
  dno: 'Grid connection (DNO)',
  mcs: 'MCS certificate',
  warranty: 'Warranty',
  handover: 'Handover pack',
  design: 'System design',
  contract: 'Contract',
  receipt: 'Receipt',
  proposal: 'Proposal',
  other: 'Document',
};

function helpSuggestions(data: PortalData): string[] {
  if (['commissioning', 'handover', 'complete'].includes(data.stage)) return ['How do I apply for the SEG?', 'What warranties do I have?', 'Where is my MCS certificate?'];
  if (data.installAt) return ['What happens on installation day?', 'Do I need to be home?', 'How long will it take?'];
  return ['What happens next?', 'When will I get a date?', 'What is a DNO application?'];
}

/** Phone: one column (main, then side). Desktop: the main column with a narrower one beside it. */
function Split({ children, side }: { children: ReactNode; side: ReactNode }) {
  return (
    <div className="pt-split">
      <div className="pt-split-main">{children}</div>
      <aside className="pt-split-side">{side}</aside>
    </div>
  );
}

function TabTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="pt-tabtitle">
      <h1>{title}</h1>
      <p className="pt-muted">{sub}</p>
    </div>
  );
}

/** Shortcuts on Home to what's behind the other tabs, with a number where there is one. */
function QuickLinks({ data, setTab }: { data: PortalData; setTab: (t: Tab) => void }) {
  const x = data.extras;
  const docs = data.documents.length + (x?.proposal?.ids.length ?? 0) + (data.handover?.ids.length ?? 0);
  const next = x?.events.find((e) => e.planned);
  const items: { tab: Tab; icon: string; title: string; line: string }[] = [
    {
      tab: 'docs',
      icon: 'docs',
      title: 'Documents',
      line: docs ? `${docs} to view or download` : 'Your packs and certificates',
    },
    {
      tab: 'system',
      icon: 'system',
      title: 'My system',
      line: x?.equipment.length ? `${x.equipment.length} items, serials and warranties` : 'Equipment and warranties',
    },
    {
      tab: 'money',
      icon: 'money',
      title: 'Payments',
      line: x?.money?.total ? (x.money.balance ? `${money(x.money.balance)} left to pay` : 'Paid in full') : 'Price, payments and invoices',
    },
    {
      tab: 'help',
      icon: 'help',
      title: 'Help',
      line: data.hestia ? 'Ask Hestia or message the team' : 'Message, call or email us',
    },
  ];
  return (
    <>
      {next && (
        <section className="pt-card pt-nextdate">
          <Icon name="calendar" />
          <div>
            <small>Coming up</small>
            <b>{next.label}</b>
            <span>{whenText(next.at, true)}</span>
          </div>
        </section>
      )}
      <div className="pt-quick">
        {items.map((i) => (
          <button key={i.tab} type="button" onClick={() => setTab(i.tab)}>
            <Icon name={i.icon} />
            <b>{i.title}</b>
            <small>{i.line}</small>
          </button>
        ))}
      </div>
    </>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="pt-copy"
      aria-label={`Copy ${text}`}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={15} />
    </button>
  );
}

function SystemTab({ data }: { data: PortalData }) {
  const x = data.extras;
  const eq = x?.equipment ?? [];
  const events = x?.events ?? [];
  const [all, setAll] = useState(false);
  return (
    <>
      <TabTitle title="My system" sub="What we installed, its serial numbers and warranties, and every date on your project." />
      <Split
        side={
          <>
            <section className="pt-card">
              <h2>Every date on your project</h2>
              {events.length ? (
                <>
                  <ol className="pt-timeline">
                    {(all ? events : events.slice(-8)).map((e, i) => (
                      <li key={`${e.key}-${i}`} className={e.planned ? 'planned' : ''}>
                        <time>{dayText(e.at)}</time>
                        <b>
                          {e.label}
                          {e.planned && <em> planned</em>}
                        </b>
                        {e.detail && <small>{e.detail}</small>}
                      </li>
                    ))}
                  </ol>
                  {events.length > 8 && !all && (
                    <button type="button" className="pt-linkbtn" onClick={() => setAll(true)}>
                      Show all {events.length} dates
                    </button>
                  )}
                </>
              ) : (
                <p className="pt-muted">Dates appear here as your project goes along.</p>
              )}
            </section>
          </>
        }
      >
        <section className="pt-card">
          <h2>Your equipment</h2>
          {eq.length ? (
            <ul className="pt-equip">
              {eq.map((e) => (
                <li key={e.what}>
                  <div className="pt-equip-top">
                    <b>{e.what}</b>
                    {(e.rating || e.count) && <span className="pt-pill">{[e.count ? `${e.count} ×` : '', e.rating].filter(Boolean).join(' ')}</span>}
                  </div>
                  {e.model && <span className="pt-equip-model">{e.model}</span>}
                  {e.serials.length > 0 && (
                    <div className="pt-serials">
                      <small>Serial number{e.serials.length > 1 ? 's' : ''}</small>
                      {e.serials.map((s) => (
                        <span key={s} className="pt-serial">
                          <code>{s}</code>
                          <CopyButton text={s} />
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="pt-muted">Your equipment and its serial numbers appear here once your system is designed and installed.</p>
          )}
        </section>

        <section className="pt-card">
          <h2>Your warranties</h2>
          {x?.warranties.length ? (
            <ul className="pt-warr">
              {x.warranties.map((w) => (
                <li key={w.title}>
                  <Icon name="shield" />
                  <div>
                    <b>{w.title}</b>
                    <span>{w.term}</span>
                    <small>{w.detail}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pt-muted">Your warranty details appear here once your system is installed. The documents themselves are in your handover pack.</p>
          )}
        </section>
      </Split>
    </>
  );
}

function MoneyTab({ data, depositDue }: { data: PortalData; depositDue: boolean }) {
  const m = data.extras?.money;
  const pct = m?.total ? Math.min(100, Math.round((m.paid / m.total) * 100)) : 0;
  return (
    <>
      <Split
        side={
          <>
            <section className="pt-card">
              <DocGroup title="Invoices and receipts">{m?.invoices.length ? m.invoices.map((d) => <DocRow key={d.id} token={data.token} doc={d} />) : <li className="pt-empty">Your invoices and receipts will appear here.</li>}</DocGroup>
            </section>
            <p className="pt-muted pt-center">A question about a payment? Ask in Help, or call us.</p>
          </>
        }
      >
        <section className="pt-card pt-moneycard">
          {m?.total ? (
            <>
              <div className="pt-money-row">
                <span>Agreed price (inc. VAT)</span>
                <b>{money(m.total)}</b>
              </div>
              <div className="pt-money-bar" role="img" aria-label={`${pct}% paid`}>
                <i style={{ width: `${pct}%` }} />
              </div>
              <div className="pt-money-split">
                <div>
                  <small>Paid</small>
                  <b>{money(m.paid)}</b>
                </div>
                <div>
                  <small>Left to pay</small>
                  <b className={m.balance ? 'due' : 'ok'}>{m.balance ? money(m.balance) : 'Nothing'}</b>
                </div>
              </div>
            </>
          ) : (
            <p className="pt-muted">Your agreed price will show here once it’s on your account. Your payments and invoices are below.</p>
          )}
        </section>
        {depositDue && data.deposit && (
          <section className="pt-card pt-action">
            <span className="pt-badge">To pay now</span>
            <h2>Your deposit</h2>
            <Deposit token={data.token} deposit={data.deposit} />
          </section>
        )}
        <section className="pt-card">
          <h2>Payments received</h2>
          {m?.payments.length ? (
            <ul className="pt-pays">
              {m.payments.map((p, i) => (
                <li key={i}>
                  <span>
                    <b>{p.label}</b>
                    <small>
                      {dayText(p.on)}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </small>
                  </span>
                  <b>{money(p.amount)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pt-muted">No payments recorded yet.</p>
          )}
        </section>
      </Split>
    </>
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
      body: JSON.stringify({
        documentId: quote.id,
        name,
        agree,
        signature: sig,
        startEarly,
      }),
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
        <input type="checkbox" checked={startEarly} onChange={(e) => setStartEarly(e.target.checked)} /> Please start work within the 14 days. I understand I may have to pay for work already done if I then cancel.
      </label>
      <label className="pt-check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I accept this {what} and Heliaxis’s terms and conditions.
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
    const r = await fetch(`/api/my/${token}/decline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }).catch(() => null);
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

const wordsOf = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
const shortOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDate();

/**
 * After accepting: a calendar of the next three weeks, free days to tap. Picking one is a provisional booking: the day is held
 * for them and the office confirms it. Weekends and bank holidays are greyed, as are days with no room.
 */
function InstallDates({ token, pref }: { token: string; pref: PortalData['installPref'] }) {
  const [cal, setCal] = useState<{
    days: CalendarDay[];
    from: string;
    prev: string | null;
    next: string | null;
  } | null>(null);
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
      void fetch(`/api/my/${token}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dates_started' }),
        keepalive: true,
      }).catch(() => null);
    }
    setPick(d);
  }
  async function save() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/my/${token}/install-dates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dates: [pick],
        flexible,
        notes,
        provisional: true,
      }),
    }).catch(() => null);
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
                    <button
                      key={d.day}
                      type="button"
                      disabled={off}
                      aria-pressed={pick === d.day}
                      aria-label={`${wordsOf(d.day)}${d.state === 'full' ? ', fully booked' : d.state === 'closed' ? ', not available' : d.state === 'few' ? ', last place' : ''}`}
                      className={`pt-cal-day is-${d.state}${pick === d.day ? ' on' : ''}`}
                      onClick={() => choose(d.day)}
                    >
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

type Msg = {
  id: string;
  direction: 'in' | 'out';
  body: string;
  created_at: string;
  by: string | null;
};

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
    const r = await fetch(`/api/my/${token}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setErr(d.error || 'Something went wrong. Please try again.');
    setText('');
    setSent(true);
    await load();
  }
  const when = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
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
