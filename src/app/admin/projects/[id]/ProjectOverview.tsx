'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_SURVEY_MINUTES,
  DELIVERY_STAGES,
  isProjectStage,
  isSurveyType,
  minutesWords,
  money,
  noSurveyNeeded,
  PHOTO_CATEGORIES,
  STAGES,
  stageLabel,
  SURVEY_TYPES,
} from '@/lib/crm/stages';
import { checkGroupFor, type CheckView } from '@/lib/projects/checklist';
import type { EnaInfo } from '@/lib/projects/ena';
import type { TeamMember } from '@/lib/projects/server';
import { cleanDesign, DESIGN_FIELDS, designInput } from '@/lib/site/design';
import { HandoverCard } from '../../crm/[id]/HandoverCard';
import { DOC_LABEL } from '../../crm/[id]/ProjectExtras';
import { londonIso, shortDate, ukDayOf, ukTime } from '../../crm/crm-shared';
import { useMedia } from '../../crm/use-stored';
import { HANDOVER_STAGES, type RecordData, type SurveyItem, type Tab } from '../../crm/[id]/record-shared';
import { askNewOrder } from '../orders/OrdersTab';
import { KitOrdered, ordersCount } from '../orders/OrdersUi';

/** Opens RAMS already signed in (src/lib/sso.ts). Not a page here: a plain link, so it's never prefetched. */
const RAMS_URL = '/api/sso/rams';
/** A UK date and time for <input type="datetime-local">, and back. */
const ukInput = (iso: string | null | undefined) => (iso ? `${ukDayOf(iso)}T${ukTime(iso)}` : '');
const fromUkInput = (v: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? londonIso(v.slice(0, 10), v.slice(11, 16)) : null);
/** A day (date input) stored as midday UK time on that day. */
const dayInput = (iso: string | null | undefined) => (iso ? ukDayOf(iso) : '');
const fromDayInput = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? londonIso(v, '12:00') : null);
const ymd = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');
const dayWords = (v: string) => (v ? shortDate(v) : '');

/** The next stage in the pipeline (Lost has none). */
function nextStage(stage: string): { key: string; label: string } | null {
  const order = STAGES.map((s) => s.key as string).filter((k) => k !== 'lost');
  const i = order.indexOf(stage);
  return i >= 0 && i < order.length - 1 ? { key: order[i + 1], label: stageLabel(order[i + 1]) } : null;
}

export type OverviewActions = {
  patch: (b: Record<string, unknown>) => Promise<boolean>;
  checklist: (item: string, b: { done?: boolean; na?: boolean }) => Promise<string | null>;
  moveTo: (stage: string) => Promise<void> | void;
  openTab: (tab: Tab, photoCat?: string) => void;
  addDocument: (category: string) => void;
  addPhoto: (category: string) => void;
  startSurvey: (type: 'solar' | 'ashp') => void;
  bookingLink: () => void;
};

/**
 * Overview (spec 4.4): everything for this job, the stage's checklist, dates and team, the system
 * and the paperwork with its deadlines. The parts that need crm-v3.sql wait for it, with a note.
 */
export function ProjectOverview({ rec, team, today, actions }: { rec: RecordData; team: TeamMember[]; today: string; actions: OverviewActions }) {
  const p = rec.project;
  const v3 = rec.schema.crmV3;
  const delivery = isProjectStage(p.stage);
  const wide = useMedia('(min-width: 761px)');
  return (
    <div className="crmr-ov">
      <JobFile rec={rec} today={today} actions={actions} />
      {rec.schema.handover && HANDOVER_STAGES.includes(p.stage) && <HandoverCard projectId={p.id} version={p.updated_at} onOpen={() => actions.openTab('handover')} />}
      {v3 ? (
        <Checklist rec={rec} actions={actions} />
      ) : (
        <p className="crmr-grey">
          <b>Checklist, install team, system and paperwork</b> appear once crm-v3.sql has been run (see your to-do list).
        </p>
      )}
      <DatesTeam key={p.id} rec={rec} team={team} actions={actions} />
      {/* The DNO paperwork waits for crm-v3.sql, but the ENA photos only need surveys.sql. */}
      {!v3 && rec.ena && (
        <section className="crmh-card crmr-ovsec">
          <div className="crmh-card__b">
            <EnaPhotos ena={rec.ena} onStart={() => actions.startSurvey('solar')} />
          </div>
        </section>
      )}
      {v3 && (
        <>
          <details className="crmh-card crmr-ovsec" open={wide && delivery} key={`sys-${wide}`}>
            <summary>
              <h3>System details</h3>
            </summary>
            <SystemDetails key={p.id} rec={rec} actions={actions} />
          </details>
          {delivery && (
            <details className="crmh-card crmr-ovsec" open={false} key={`design-${wide}`}>
              <summary>
                <h3>Design details for site paperwork</h3>
              </summary>
              <DesignDetails key={p.id} rec={rec} actions={actions} />
            </details>
          )}
          <details className="crmh-card crmr-ovsec" open={wide && delivery} key={`paper-${wide}`}>
            <summary>
              <h3>Paperwork</h3>
              {rec.deadlines.some((d) => !d.done && d.daysLeft < 0) && <span className="crmh-tag crmh-tag--deadline">Overdue</span>}
            </summary>
            <Paperwork key={p.id} rec={rec} today={today} actions={actions} />
          </details>
        </>
      )}
    </div>
  );
}

/**
 * A form's draft of the saved values that survives the page's polls. Untouched, it follows what's
 * saved (a colleague's change, or this form's own save coming back tidied, e.g. the BUS expiry filled
 * in); once someone starts typing, their changes stay until they save or cancel. After a save,
 * `sent(f)` marks what went, so the reload that follows replaces it.
 */
function useDraft<T>(init: T) {
  const key = JSON.stringify(init);
  const [f, setF] = useState(init);
  // key: the saved values last seen; base: what the draft counts as untouched against.
  const [seen, setSeen] = useState({ key, base: key });
  if (seen.key !== key) {
    setSeen({ key, base: key });
    if (JSON.stringify(f) === seen.base) setF(init);
  }
  const sent = (v: T) => setSeen((s) => ({ ...s, base: JSON.stringify(v) }));
  return [f, setF, sent] as const;
}

/* ── Everything for this job ─────────────────────────────────────────────────── */

function Tile({
  title,
  count,
  onOpen,
  onAdd,
  foot,
  children,
}: {
  title: string;
  count?: number;
  onOpen: () => void;
  onAdd?: () => void;
  /** Buttons of its own under the summary (not inside the tile's button). */
  foot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="crmr-tile">
      <button type="button" className="crmr-tile__main" onClick={onOpen}>
        <span className="crmr-tile__h">
          <b>{title}</b>
          {count !== undefined && <span className="crmh-n">{count}</span>}
        </span>
        <span className="crmr-tile__b">{children}</span>
      </button>
      {foot}
      {onAdd && (
        <button type="button" className="crmr-tile__add" onClick={onAdd} aria-label={`Add to ${title}`}>
          + Add
        </button>
      )}
    </div>
  );
}

type JobQuote = { id: string; number: string; status: string; total: number };
const QUOTE_STATUS: Record<string, string> = { draft: 'Draft', sent: 'Sent, waiting', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };

/** The quotes made in the quote builder for this opportunity (none, or before quotes.sql has been run, is an empty list). */
function useJobQuotes(projectId: string): JobQuote[] {
  const [quotes, setQuotes] = useState<JobQuote[]>([]);
  useEffect(() => {
    let live = true;
    fetch(`/api/crm/quotes?project_id=${projectId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => live && setQuotes(Array.isArray(d.quotes) ? d.quotes : []))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectId]);
  return quotes;
}

function JobFile({ rec, today, actions }: { rec: RecordData; today: string; actions: OverviewActions }) {
  const router = useRouter();
  const jobQuotes = useJobQuotes(rec.project.id);
  const [newBusy, setNewBusy] = useState(false);
  async function newQuote() {
    setNewBusy(true);
    const r = await fetch('/api/crm/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enquiry_id: rec.project.enquiry_id, project_id: rec.project.id }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.id) router.push(`/admin/sales/quotes/${d.id}`);
    else setNewBusy(false);
  }
  const p = rec.project as RecordData['project'] & { accepted_hash?: string | null };
  const docs = rec.documents as (RecordData['documents'][number] & { signed_outside_at?: string | null })[];
  const of = (cats: string[]) => docs.filter((d) => cats.includes(d.category));
  const quoteDocs = of(['quote', 'contract']);
  const signedOut = quoteDocs.find((d) => d.signed_outside_at);
  const designDocs = of(['design']);
  const photoCounts: Record<string, number> = {};
  for (const ph of rec.photos) photoCounts[ph.category] = (photoCounts[ph.category] ?? 0) + 1;
  const docCounts: Record<string, number> = {};
  for (const d of docs) docCounts[d.category] = (docCounts[d.category] ?? 0) + 1;
  const openTasks = rec.tasks.filter((t) => t.status !== 'done').length;
  const lastWa = rec.timeline.find((e) => e.kind === 'whatsapp');
  const lastEmail = rec.timeline.find((e) => e.kind === 'email');

  return (
    <section className="crmr-file" aria-label="Everything for this job">
      <h3 className="crmr-ovh">Everything for this job</h3>
      <div className="crmr-tiles">
        <Tile
          title="Quote and contract"
          count={quoteDocs.length + jobQuotes.filter((q) => q.status === 'draft').length}
          onOpen={() => actions.openTab('docs')}
          onAdd={() => actions.addDocument('quote')}
          foot={
            <span className="crmr-quotes">
              {jobQuotes.map((q) => (
                <Link key={q.id} href={`/admin/sales/quotes/${q.id}`} className="crmr-quote">
                  <b>{q.number}</b>
                  <span className={`crmr-qstatus crmr-qstatus--${q.status}`}>{QUOTE_STATUS[q.status] ?? q.status}</span>
                  {q.total > 0 && <small>{money(q.total / 100)}</small>}
                </Link>
              ))}
              <button type="button" className="crm-link crmr-newquote" disabled={newBusy} onClick={() => void newQuote()}>
                {newBusy ? 'Starting…' : '+ New quote'}
              </button>
            </span>
          }
        >
          {p.accepted_at ? (
            <>
              <span>
                ✍ Signed by {p.accepted_name || 'the customer'} on {shortDate(ukDayOf(p.accepted_at))}
              </span>
              {p.accepted_hash && (
                <small title="A fingerprint of the exact file they signed">
                  Fingerprint {String(p.accepted_hash).slice(0, 12)} · What’s this?
                </small>
              )}
            </>
          ) : signedOut?.signed_outside_at ? (
            <span>Signed outside the portal ✓ ({shortDate(ukDayOf(signedOut.signed_outside_at))})</span>
          ) : (
            <span className="crm-muted">{quoteDocs.length ? 'Not signed yet' : jobQuotes.some((q) => q.status === 'draft') ? 'Draft quote in progress, not sent yet' : 'No quote yet'}</span>
          )}
          {p.deposit_amount ? <small>{p.deposit_paid_at ? `Deposit paid ${shortDate(ukDayOf(p.deposit_paid_at))}` : 'Deposit not paid yet'}</small> : null}
        </Tile>
        <Tile title="Designs" count={designDocs.length + (p.opensolar_url ? 1 : 0) + (p.simpliheat_url ? 1 : 0)} onOpen={() => actions.openTab('docs')} onAdd={() => actions.addDocument('design')}>
          {p.opensolar_url || p.simpliheat_url ? (
            <span>{[p.opensolar_url ? 'OpenSolar' : '', p.simpliheat_url ? 'SimpliHeat' : ''].filter(Boolean).join(' · ')} linked</span>
          ) : (
            <span className="crm-muted">No design linked yet</span>
          )}
        </Tile>
        <Tile
          title="Photos"
          count={rec.photos.length}
          onOpen={() => actions.openTab('photos')}
          onAdd={() => actions.addPhoto('site')}
          foot={
            rec.photos.length > 0 && (
              <span className="crmr-tile__chips">
                {PHOTO_CATEGORIES.filter((c) => photoCounts[c.key]).map((c) => (
                  <button key={c.key} type="button" className="crmr-minichip" onClick={() => actions.openTab('photos', c.key)}>
                    {c.label} {photoCounts[c.key]}
                  </button>
                ))}
              </span>
            )
          }
        >
          {rec.photos.length ? null : <span className="crm-muted">No photos yet</span>}
        </Tile>
        <Tile title="Documents" count={docs.length} onOpen={() => actions.openTab('docs')} onAdd={() => actions.addDocument('other')}>
          {docs.length ? (
            <span>
              {Object.entries(docCounts)
                .map(([k, n]) => `${DOC_LABEL[k] ?? k} ${n}`)
                .join(' · ')}
            </span>
          ) : (
            <span className="crm-muted">No documents yet</span>
          )}
        </Tile>
        {rec.schema.surveys && (
          <Tile title="Surveys" count={rec.surveys.length} onOpen={() => actions.openTab('surveys')} onAdd={() => actions.startSurvey('solar')}>
            {rec.surveys.length ? (
              <span>{rec.surveys.map((s) => `${s.type === 'ashp' ? 'Heat pump' : 'Solar'}: ${surveyStatus(s.status)}${s.flags.length ? ` · ${s.flags.length} flagged` : ''}`).join(' · ')}</span>
            ) : (
              <span className="crm-muted">No survey yet</span>
            )}
          </Tile>
        )}
        {/* Purchase orders (purchase-orders.sql): the kit ordered beside the job's value. */}
        {rec.orders && (isProjectStage(p.stage) || ordersCount(rec.orders) > 0) && (
          <Tile
            title="Purchase orders"
            count={ordersCount(rec.orders)}
            onOpen={() => actions.openTab('orders')}
            onAdd={() => {
              askNewOrder(p.id);
              actions.openTab('orders');
            }}
          >
            {ordersCount(rec.orders) ? (
              <KitOrdered s={rec.orders} today={today} value={p.value} />
            ) : (
              <span className="crm-muted">No orders yet{p.value ? ` · job value ${money(p.value)} inc VAT` : ''}</span>
            )}
          </Tile>
        )}
        <Tile title="Customer" onOpen={() => actions.openTab('details')}>
          <span>{rec.customer.name}</span>
          <small>
            {[rec.customer.phone, rec.customer.email].filter(Boolean).join(' · ') || 'No contact details yet'}
            {rec.customer.whatsapp_opt_in ? ' · WhatsApp agreed' : ''}
            {rec.others.length ? ` · ${rec.others.length} other job${rec.others.length === 1 ? '' : 's'}` : ''}
          </small>
        </Tile>
        <Tile title="Tasks and messages" count={openTasks} onOpen={() => actions.openTab('activity')}>
          <span>{openTasks ? `${openTasks} open task${openTasks === 1 ? '' : 's'}` : 'No open tasks'}</span>
          {lastWa && (
            <small>
              WhatsApp {shortDate(ukDayOf(lastWa.at))}: {(lastWa.body || '').slice(0, 60)}
            </small>
          )}
          {lastEmail && <small>Email {shortDate(ukDayOf(lastEmail.at))}</small>}
        </Tile>
      </div>
    </section>
  );
}

const surveyStatus = (s: string) =>
  ({ booked: 'booked', draft: 'started', in_progress: 'started', complete: 'finished', cancelled: 'cancelled' } as Record<string, string>)[s] ?? s.replace(/_/g, ' ');

/* ── Checklist ───────────────────────────────────────────────────────────────── */

function Checklist({ rec, actions }: { rec: RecordData; actions: OverviewActions }) {
  const p = rec.project;
  const group = checkGroupFor(p.stage);
  const items = rec.checklist.find((g) => g.stage === group)?.items ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const next = nextStage(p.stage);
  const missing = items.filter((i) => i.key_item && !i.done).length;
  const delivery = isProjectStage(p.stage);
  const deliveryOrder = [...DELIVERY_STAGES, 'complete'] as string[];
  const at = deliveryOrder.indexOf(p.stage);

  async function mark(i: CheckView, b: { done?: boolean; na?: boolean }) {
    setBusy(i.key);
    setErr((await actions.checklist(i.key, b)) ?? '');
    setBusy(null);
  }
  if (p.stage === 'lost') return null;

  return (
    <section className="crmh-card crmr-check" aria-label="Checklist">
      <div className="crmh-card__h">
        <h3>{delivery ? `${stageLabel(p.stage)}: checklist` : 'Sales checklist'}</h3>
        <span className="crm-muted crm-small">
          {rec.progress.done} of {rec.progress.total} done
        </span>
      </div>
      {delivery && (
        <ol className="crmr-check__stages" aria-label="Delivery stages">
          {deliveryOrder.map((k, i) => (
            <li key={k} className={i < at ? 'done' : i === at ? 'cur' : ''}>
              {stageLabel(k)}
            </li>
          ))}
        </ol>
      )}
      <ul className="crmr-check__list">
        {items.map((i) => (
          <li key={i.key} className={`${i.done ? 'done' : ''}${i.na ? ' na' : ''}`}>
            <button
              type="button"
              className="crmh-tick"
              disabled={i.auto || busy === i.key}
              aria-label={i.auto ? `${i.label}: done (the app saw it)` : i.done ? `Untick ${i.label}` : `Tick ${i.label}`}
              aria-pressed={i.done}
              onClick={() => void mark(i, i.na ? { na: false } : { done: !i.done })}
            >
              <span>{i.done ? '✓' : ''}</span>
            </button>
            <span className="crmr-check__t">
              <span>
                {i.label}
                {i.key_item && !i.done && <span className="crmr-key"> · key</span>}
              </span>
              <small>
                {i.auto
                  ? '✓ from the app'
                  : i.na
                    ? `Not needed${i.by ? ` · ${i.by}` : ''}`
                    : i.done
                      ? [i.by, i.at ? shortDate(ukDayOf(i.at)) : ''].filter(Boolean).join(' · ')
                      : i.help || ''}
              </small>
            </span>
            {!i.auto && !i.done && (
              <button type="button" className="crm-link crmr-na" disabled={busy === i.key} onClick={() => void mark(i, { na: true })}>
                Not needed
              </button>
            )}
          </li>
        ))}
      </ul>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {next && (
        <div className="crmr-check__move">
          <button
            type="button"
            className={`crm-btn${missing ? ' crm-btn--ghost' : ''}`}
            onClick={() => {
              if (missing && !window.confirm(`${missing} key item${missing === 1 ? ' isn’t' : 's aren’t'} done yet. Move to ${next.label} anyway?`)) return;
              void actions.moveTo(next.key);
            }}
          >
            {missing ? `Move to ${next.label} anyway: ${missing} key item${missing === 1 ? '' : 's'} not done` : `Move to ${next.label} →`}
          </button>
        </div>
      )}
    </section>
  );
}

/* ── Dates and team ──────────────────────────────────────────────────────────── */

function DatesTeam({ rec, team, actions }: { rec: RecordData; team: TeamMember[]; actions: OverviewActions }) {
  const p = rec.project;
  const v3 = rec.schema.crmV3;
  const hasType = 'survey_type' in p;
  const init = {
    survey_at: ukInput(p.survey_at),
    survey_type: p.survey_type || '',
    install_at: ukInput(p.install_at),
    install_days: String(p.install_days || 1),
    install_team: (p.install_team ?? []) as string[],
    scaffold_up_on: ymd(p.scaffold_up_on),
    scaffold_down_on: ymd(p.scaffold_down_on),
    commissioned_at: dayInput(p.commissioned_at),
    handover_at: dayInput(p.handover_at),
    rams_project_id: p.rams_project_id || '',
  };
  const [f, setF, sent] = useDraft(init);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const type = isSurveyType(f.survey_type) ? f.survey_type : null;
  // Infrared, an EV charger or LEDs only: a home visit, never a survey slot.
  const noSurvey = noSurveyNeeded(p);
  const minutes = noSurvey ? null : rec.booking?.minutes || (type ? DEFAULT_SURVEY_MINUTES[type] : null);
  const b = rec.booking;
  const bookingWords = !b
    ? ''
    : b.status === 'requested'
      ? 'Waiting for you to confirm'
      : b.status === 'held'
        ? 'Held while the customer picks a time'
        : b.booked_by
          ? `Booked by ${b.booked_by}`
          : 'Booked online by the customer';
  const told = { whatsapp: 'They’ll be told on WhatsApp', email: 'They’ll be told by email', call: 'We can’t WhatsApp or email them yet: give them a call' }[rec.notify];
  const cal = rec.calendar;
  const outlook = !cal.outlook
    ? 'Goes into Outlook once Microsoft 365 is connected'
    : cal.error
      ? `Couldn’t update Outlook: ${cal.error}`
      : cal.install || cal.survey
        ? 'In the Outlook calendar ✓'
        : p.install_at || p.survey_at
          ? 'Goes into Outlook in the next few minutes'
          : '';

  async function save() {
    const body: Record<string, unknown> = {};
    if (f.survey_at !== init.survey_at) body.survey_at = fromUkInput(f.survey_at);
    if (f.install_at !== init.install_at) body.install_at = fromUkInput(f.install_at);
    if (hasType && f.survey_type !== init.survey_type) body.survey_type = f.survey_type || null;
    if (v3) {
      if (f.install_days !== init.install_days) body.install_days = Number(f.install_days);
      if (JSON.stringify(f.install_team) !== JSON.stringify(init.install_team)) body.install_team = f.install_team;
      for (const k of ['scaffold_up_on', 'scaffold_down_on', 'rams_project_id'] as const) if (f[k] !== init[k]) body[k] = f[k] || null;
      if (f.commissioned_at !== init.commissioned_at) body.commissioned_at = fromDayInput(f.commissioned_at);
      if (f.handover_at !== init.handover_at) body.handover_at = fromDayInput(f.handover_at);
    }
    if (!Object.keys(body).length) return;
    setBusy(true);
    if (await actions.patch(body)) sent(f);
    setBusy(false);
  }

  return (
    <section className="crmh-card crmr-dates" id="rec-dates" aria-label="Dates and team">
      <div className="crmh-card__h">
        <h3>Dates and team</h3>
      </div>
      <form
        className="crmh-card__b"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h4 className="crmr-ovh4">{noSurvey ? 'Home visit' : 'Survey'}</h4>
        {noSurvey && (
          <p className="crm-muted crm-small">No solar, battery or heat pump on this job, so it doesn’t need a survey. Put the date of the home visit here.</p>
        )}
        <div className="crm-grid2">
          <div>
            <label className="crm-label" htmlFor="rec-survey-at">
              {noSurvey ? 'Visit date and time' : 'Date and time'}
            </label>
            <input id="rec-survey-at" className="crm-input" type="datetime-local" value={f.survey_at} onChange={set('survey_at')} />
          </div>
          {hasType && (
            <div>
              <label className="crm-label" htmlFor="rec-survey-type">
                Type
              </label>
              <select id="rec-survey-type" className="crm-input" value={f.survey_type} onChange={set('survey_type')}>
                <option value="">Not set</option>
                {SURVEY_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p className="crm-muted crm-small crmr-lines">
          {minutes ? <span>Takes {minutesWords(minutes)}, from the booking settings</span> : null}
          {b?.surveyor ? <span>Surveyor: {b.surveyor}</span> : null}
          {bookingWords ? <span>{bookingWords}</span> : null}
          {(p.survey_at || b) && <span>{told}</span>}
        </p>
        {rec.schema.booking && !noSurvey && (
          <div className="crm-actions crmr-actions--tight">
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={actions.bookingLink}>
              Send booking link
            </button>
            <Link className="crm-btn crm-btn--ghost crm-btn--small" href={`/admin/surveys?project=${p.id}`}>
              Find a time
            </Link>
          </div>
        )}

        <h4 className="crmr-ovh4">Install</h4>
        <div className="crm-grid2">
          <div>
            <label className="crm-label" htmlFor="rec-install-at">
              Starts
            </label>
            <input id="rec-install-at" className="crm-input" type="datetime-local" value={f.install_at} onChange={set('install_at')} />
          </div>
          {v3 && (
            <div>
              <label className="crm-label" htmlFor="rec-install-days">
                Working days
              </label>
              <input id="rec-install-days" className="crm-input" type="number" min={1} max={30} value={f.install_days} onChange={set('install_days')} />
            </div>
          )}
        </div>
        {rec.install && !dirty && <p className="crm-muted crm-small">{rec.install.words}</p>}
        {v3 && (
          <>
            <span className="crm-label">Team</span>
            <div className="crm-checks">
              {team.map((t) => (
                <label key={t.id} className={f.install_team.includes(t.id) ? 'on' : ''}>
                  <input
                    type="checkbox"
                    checked={f.install_team.includes(t.id)}
                    onChange={(e) => setF({ ...f, install_team: e.target.checked ? [...f.install_team, t.id] : f.install_team.filter((x) => x !== t.id) })}
                  />
                  {t.name}
                </label>
              ))}
            </div>
            <div className="crm-grid2">
              <div>
                <label className="crm-label" htmlFor="rec-scaf-up">
                  Scaffold up
                </label>
                <input id="rec-scaf-up" className="crm-input" type="date" value={f.scaffold_up_on} onChange={set('scaffold_up_on')} />
              </div>
              <div>
                <label className="crm-label" htmlFor="rec-scaf-down">
                  Scaffold down
                </label>
                <input id="rec-scaf-down" className="crm-input" type="date" value={f.scaffold_down_on} onChange={set('scaffold_down_on')} />
              </div>
              <div>
                <label className="crm-label" htmlFor="rec-comm">
                  Commissioned
                </label>
                <input id="rec-comm" className="crm-input" type="date" value={f.commissioned_at} onChange={set('commissioned_at')} />
              </div>
              <div>
                <label className="crm-label" htmlFor="rec-hand">
                  Handed over
                </label>
                <input id="rec-hand" className="crm-input" type="date" value={f.handover_at} onChange={set('handover_at')} />
              </div>
            </div>
          </>
        )}
        {outlook && <p className="crm-muted crm-small">{outlook}</p>}

        {v3 && (
          <>
            <h4 className="crmr-ovh4">Subcontractors</h4>
            <label className="crm-label" htmlFor="rec-rams">
              RAMS project ID
            </label>
            <div className="crm-linkrow">
              <input id="rec-rams" className="crm-input" value={f.rams_project_id} onChange={set('rams_project_id')} placeholder="From the RAMS app" />
              <a className="crm-btn crm-btn--ghost" href={RAMS_URL}>
                Open RAMS
              </a>
            </div>
            {rec.subcontracts.length > 0 && (
              <ul className="crmr-subs">
                {rec.subcontracts.map((s, i) => (
                  <li key={String(s.id ?? i)}>
                    {String(s.company ?? s.trade ?? 'Booking')} · {String(s.status).replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {dirty && (
          <div className="crmr-savebar">
            <button type="submit" className="crm-btn crm-btn--solar" disabled={busy}>
              {busy ? 'Saving…' : 'Save dates'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setF(init)}>
              Cancel
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

/* ── System details ──────────────────────────────────────────────────────────── */

const SYSTEM_FIELDS: { key: string; label: string; for: string[]; num?: boolean }[] = [
  { key: 'kwp', label: 'System size (kWp)', for: ['solar'], num: true },
  { key: 'panel_count', label: 'Panels', for: ['solar'], num: true },
  { key: 'panel_model', label: 'Panel model', for: ['solar'] },
  { key: 'inverter_model', label: 'Inverter', for: ['solar', 'battery'] },
  { key: 'inverter_kw', label: 'Inverter (kW)', for: ['solar', 'battery'], num: true },
  { key: 'battery_model', label: 'Battery', for: ['battery'] },
  { key: 'battery_kwh', label: 'Battery usable capacity (kWh)', for: ['battery'], num: true },
  { key: 'heat_pump_model', label: 'Heat pump', for: ['heatpump'] },
  { key: 'heat_pump_kw', label: 'Heat pump (kW)', for: ['heatpump'], num: true },
  { key: 'ev_charger_model', label: 'EV charger', for: ['ev'] },
  { key: 'export_limit_kw', label: 'Export limit (kW)', for: ['solar', 'battery'], num: true },
  { key: 'mpan', label: 'MPAN', for: ['solar', 'battery', 'heatpump', 'ev'] },
  { key: 'monitoring', label: 'Monitoring', for: ['solar', 'battery'] },
];

function SystemDetails({ rec, actions }: { rec: RecordData; actions: OverviewActions }) {
  const p = rec.project;
  const sys = (p.system ?? {}) as Record<string, unknown>;
  const fields = SYSTEM_FIELDS.filter((x) => !p.products.length || x.for.some((k) => p.products.includes(k)) || sys[x.key] != null);
  const init = Object.fromEntries(fields.map((x) => [x.key, sys[x.key] == null ? '' : String(sys[x.key])]));
  const [f, setF, sent] = useDraft<Record<string, string>>(init);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  return (
    <form
      className="crmh-card__b"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        if (await actions.patch({ system: Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== init[k])) })) sent(f);
        setBusy(false);
      }}
    >
      <div className="crmr-grid3">
        {fields.map((x) => (
          <div key={x.key}>
            <label className="crm-label" htmlFor={`rec-sys-${x.key}`}>
              {x.label}
            </label>
            <input id={`rec-sys-${x.key}`} className="crm-input" inputMode={x.num ? 'decimal' : undefined} value={f[x.key] ?? ''} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} />
          </div>
        ))}
      </div>
      {dirty && (
        <div className="crmr-savebar">
          <button type="submit" className="crm-btn crm-btn--solar" disabled={busy}>
            {busy ? 'Saving…' : 'Save system'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setF(init)}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

/* ── Design details for site paperwork (src/lib/site/design.ts) ─────────────── */

/**
 * What the designer or office records for the trades' forms and the documents made from them:
 * strings, optimisers, mounting, the battery's class and back-up, and so on. Empty stays empty: the
 * site app and the documents never guess one.
 */
function DesignDetails({ rec, actions }: { rec: RecordData; actions: OverviewActions }) {
  const p = rec.project;
  const sys = (p.system ?? {}) as Record<string, unknown>;
  const fields = DESIGN_FIELDS.filter((x) => !x.for.length || !p.products.length || x.for.some((k) => p.products.includes(k)) || sys[x.key] != null);
  const init = Object.fromEntries(fields.map((x) => [x.key, designInput(x.key, sys[x.key])]));
  const [f, setF, sent] = useDraft<Record<string, string>>(init);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const problems = Object.fromEntries(
    fields.map((x) => {
      const c = cleanDesign(x.key, f[x.key]);
      return [x.key, c.ok ? '' : c.error];
    })
  );
  const blocked = Object.values(problems).some(Boolean);
  return (
    <form
      className="crmh-card__b"
      onSubmit={async (e) => {
        e.preventDefault();
        if (blocked) return;
        setBusy(true);
        if (await actions.patch({ system: Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== init[k])) })) sent(f);
        setBusy(false);
      }}
    >
      <div className="crmr-grid3">
        {fields.map((x) => (
          <div key={x.key}>
            <label className="crm-label" htmlFor={`rec-design-${x.key}`}>
              {x.label}
            </label>
            {x.kind === 'bool' || x.kind === 'enum' ? (
              <select id={`rec-design-${x.key}`} className="crm-input" value={f[x.key] ?? ''} onChange={(e) => setF({ ...f, [x.key]: e.target.value })}>
                <option value="">Not set</option>
                {x.kind === 'bool' ? (
                  <>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </>
                ) : (
                  x.options?.map((o) => (
                    <option key={String(o.value)} value={String(o.value)}>
                      {o.label}
                    </option>
                  ))
                )}
              </select>
            ) : (
              <input
                id={`rec-design-${x.key}`}
                className="crm-input"
                inputMode={x.kind === 'number' ? 'decimal' : undefined}
                placeholder={x.placeholder}
                value={f[x.key] ?? ''}
                onChange={(e) => setF({ ...f, [x.key]: e.target.value })}
                aria-invalid={!!problems[x.key]}
              />
            )}
            {problems[x.key] ? <small className="crm-err">{problems[x.key]}</small> : x.hint ? <small className="crm-muted">{x.hint}</small> : null}
          </div>
        ))}
      </div>
      {dirty && (
        <div className="crmr-savebar">
          <button type="submit" className="crm-btn crm-btn--solar" disabled={busy || blocked}>
            {busy ? 'Saving…' : 'Save design details'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setF(init)}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

/* ── Paperwork ───────────────────────────────────────────────────────────────── */

type PaperField = { key: string; label: string; date?: boolean; heat?: boolean; solar?: boolean };
const PAPER_GROUPS: { title: string; fields: PaperField[]; heat?: boolean }[] = [
  { title: 'MCS', fields: [{ key: 'mcs_cert_no', label: 'Certificate number' }, { key: 'mcs_registered_on', label: 'Registered', date: true }] },
  { title: 'Electrical', fields: [{ key: 'eic_on', label: 'EIC done', date: true }] },
  {
    title: 'BUS grant',
    heat: true,
    fields: [
      { key: 'bus_ref', label: 'Reference' },
      { key: 'bus_applied_on', label: 'Applied', date: true },
      { key: 'bus_issued_on', label: 'Issued', date: true },
      { key: 'bus_expires_on', label: 'Expires', date: true },
      { key: 'bus_redeemed_on', label: 'Redeemed', date: true },
    ],
  },
  { title: 'Building Regs', fields: [{ key: 'building_regs_ref', label: 'Reference' }, { key: 'building_regs_on', label: 'Notified', date: true }] },
  {
    title: 'Guarantees',
    fields: [
      { key: 'ibg_provider', label: 'Guarantee provider' },
      { key: 'ibg_ref', label: 'Insurance-backed guarantee ref' },
      { key: 'ibg_registered_on', label: 'Guarantee registered', date: true },
      { key: 'warranties_registered_on', label: 'Warranties registered', date: true },
      { key: 'seg_info_sent_on', label: 'Smart Export Guarantee guidance sent', date: true, solar: true },
    ],
  },
];
const DNO_ROUTES: [string, string][] = [
  ['', 'Not decided'],
  ['g98', 'G98 (tell the DNO after)'],
  ['g99', 'G99 (apply first)'],
  ['demand', 'Demand only'],
  ['not_needed', 'Not needed'],
];

function Paperwork({ rec, today, actions }: { rec: RecordData; today: string; actions: OverviewActions }) {
  const p = rec.project;
  const paper = (p.paperwork ?? {}) as Record<string, string>;
  const heat = p.products.includes('heatpump');
  const solar = p.products.includes('solar');
  const groups = PAPER_GROUPS.filter((g) => !g.heat || heat).map((g) => ({ ...g, fields: g.fields.filter((x) => !x.solar || solar) }));
  const keys = ['dno_route', ...groups.flatMap((g) => g.fields.map((x) => x.key))];
  const init = Object.fromEntries(keys.map((k) => [k, paper[k] ?? '']));
  const [f, setF, sent] = useDraft<Record<string, string>>(init);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const open = rec.deadlines.filter((d) => !d.done);
  return (
    <form
      className="crmh-card__b"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        if (await actions.patch({ paperwork: Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== init[k])) })) sent(f);
        setBusy(false);
      }}
    >
      {rec.deadlines.length > 0 && (
        <ul className="crmr-deadlines">
          {rec.deadlines.map((d) => (
            <li key={d.key} className={d.done ? 'done' : d.daysLeft < 0 ? 'late' : d.daysLeft <= 7 ? 'soon' : ''}>
              <span>{d.label}</span>
              <b>
                {d.done
                  ? 'Done ✓'
                  : d.daysLeft < 0
                    ? `${-d.daysLeft} day${d.daysLeft === -1 ? '' : 's'} late`
                    : d.daysLeft === 0
                      ? 'Due today'
                      : `Due ${dayWords(d.due)} · in ${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'}`}
              </b>
            </li>
          ))}
        </ul>
      )}
      {!open.length && !rec.deadlines.length && today && <p className="crm-muted crm-small">Deadlines appear here once the system is commissioned.</p>}
      <label className="crm-label" htmlFor="rec-dno-route">
        DNO route
      </label>
      <select id="rec-dno-route" className="crm-input" value={f.dno_route} onChange={(e) => setF({ ...f, dno_route: e.target.value })}>
        {DNO_ROUTES.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      {rec.ena && <EnaPhotos ena={rec.ena} onStart={() => actions.startSurvey('solar')} />}
      {groups.map((g) => (
        <div key={g.title}>
          <h4 className="crmr-ovh4">{g.title}</h4>
          <div className="crmr-grid3">
            {g.fields.map((x) => (
              <div key={x.key}>
                <label className="crm-label" htmlFor={`rec-pw-${x.key}`}>
                  {x.label}
                </label>
                <input id={`rec-pw-${x.key}`} className="crm-input" type={x.date ? 'date' : 'text'} value={f[x.key] ?? ''} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {dirty && (
        <div className="crmr-savebar">
          <button type="submit" className="crm-btn crm-btn--solar" disabled={busy}>
            {busy ? 'Saving…' : 'Save paperwork'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setF(init)}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

/**
 * "For the ENA application", with the DNO paperwork: the main electric cut-out and meter photos from
 * the job's latest finished solar survey, side by side, each with Download (the original photo, named
 * after the job, e.g. HX-0042-main-cut-out.jpg). Before there's one: where to take them.
 */
function EnaPhotos({ ena, onStart }: { ena: EnaInfo; onStart: () => void }) {
  return (
    <div className="crmr-ena" role="group" aria-label="For the ENA application">
      <h4 className="crmr-ovh4">For the ENA application</h4>
      <p className="crm-muted crm-small">The photos to upload to ENA (Connect Direct) for the DNO application. Download saves the original photo, without any drawing.</p>
      <div className="crmr-ena__grid">
        {ena.photos.map((ph) => (
          <div key={ph.slot} className="crmr-ena__item">
            <b>{ph.label}</b>
            {ph.items.length ? (
              ph.items.map((it, i) => (
                <figure key={it.id}>
                  {/* Signed storage links: next/image can't optimise them. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {it.thumb ? <img src={it.thumb} alt={`${ph.label}${ph.items.length > 1 ? `, photo ${i + 1}` : ''}`} loading="lazy" /> : <span aria-hidden="true">📷</span>}
                  <figcaption>
                    {ph.items.length > 1 && <span>{`Photo ${i + 1} of ${ph.items.length}`}</span>}
                    {it.download ? (
                      <a className="crm-btn crm-btn--ghost crm-btn--small" href={it.download} download={it.name} title={it.name}>
                        ⬇ Download
                      </a>
                    ) : (
                      <span className="crm-muted crm-small">Can’t download right now. Reload the page to try again.</span>
                    )}
                  </figcaption>
                </figure>
              ))
            ) : (
              <p className="crm-muted crm-small">{ena.survey ? 'Not in the survey' : 'Not in a survey yet'}</p>
            )}
          </div>
        ))}
      </div>
      <p className="crm-small crmr-ena__from">
        {ena.survey ? (
          <>
            From the survey finished {ena.survey.completed_at ? shortDate(ukDayOf(ena.survey.completed_at)) : ''} ·{' '}
            <a className="crmh-link" href={`/admin/surveys/${ena.survey.id}/report`}>
              Open the report →
            </a>
          </>
        ) : ena.open ? (
          <>
            They’re taken in the solar survey (Electrics) ·{' '}
            <a className="crmh-link" href={`/admin/surveys/${ena.open.id}`}>
              Open the survey →
            </a>
          </>
        ) : (
          <>
            They’re taken in the solar survey (Electrics) ·{' '}
            <button type="button" className="crm-link" onClick={onStart}>
              Start solar survey
            </button>
          </>
        )}
      </p>
    </div>
  );
}

/* ── Surveys tab ─────────────────────────────────────────────────────────────── */

/** The Surveys tab: each survey with its status and red flags, plus Start solar survey and Add heat pump survey. */
export function SurveysPanel({ surveys, onStart, busy }: { surveys: SurveyItem[]; onStart: (type: 'solar' | 'ashp') => void; busy: boolean }) {
  return (
    <div className="crmr-surveys">
      <div className="crm-actions crmr-actions--tight">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => onStart('solar')}>
          Start solar survey
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" disabled={busy} onClick={() => onStart('ashp')}>
          Add heat pump survey (SimpliHeat)
        </button>
      </div>
      {surveys.length === 0 ? (
        <p className="crm-muted crm-empty">No surveys for this job yet.</p>
      ) : (
        <ul className="crmr-surveylist">
          {surveys.map((s) => (
            <li key={s.id}>
              <a href={s.status === 'complete' ? `/admin/surveys/${s.id}/report` : `/admin/surveys/${s.id}`}>
                <b>{s.type === 'ashp' ? 'Heat pump survey' : 'Solar survey'}</b>
                <span>
                  {surveyStatus(s.status).replace(/^\w/, (c) => c.toUpperCase())}
                  {s.completed_at ? ` ${shortDate(ukDayOf(s.completed_at))}` : ''}
                  {s.surveyor ? ` · ${s.surveyor}` : ''}
                </span>
                {s.flags.length > 0 && (
                  <span className="crmh-tag crmh-tag--deadline">
                    {s.flags.length} red flag{s.flags.length === 1 ? '' : 's'}
                  </span>
                )}
                <span className="crmh-link">{s.status === 'complete' ? 'Report →' : 'Open →'}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
