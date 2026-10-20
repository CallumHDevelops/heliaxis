'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { guessProducts, SALES_STAGES, stageLabel, STAGES } from '@/lib/crm/stages';
import type { Pipeline, TeamMember } from '@/lib/projects/server';
import type { SchemaReady } from '@/lib/schema-ready';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { useNow } from '@/lib/use-now';
import { ContactedCatchUp } from '@/components/admin/ContactedCatchUp';
import { NewProjectSheet } from '../projects/NewProjectSheet';
import { CrmBoardView } from './CrmBoardView';
import { CrmHome } from './CrmHome';
import { NoteSheet } from './LatestNotes';
import { QuickTask } from './MyWork';
import { CrmListView } from './CrmListView';
import { CrmSearch } from './CrmSearch';
import { Icon, SalesProjects, Sheet } from './CrmUi';
import {
  agoShort,
  hasNoNextStep,
  isDue,
  isLive,
  isSales,
  matchesSearch,
  moneyShort,
  notContacted,
  rememberView,
  ukDayOf,
  ukTime,
  weekdayOf,
  wonRecently,
  type PipelineProject,
} from './crm-shared';
import { openDock, useWaActive } from './dock-link';
import { useMedia, useStored, writeStored } from './use-stored';
import './crm.css';

export type CrmView = 'home' | 'board' | 'list';
/** The chips over the Board and List. */
export type ListFilter = 'live' | 'mine' | 'due' | 'nostep' | 'fresh';
export type ListSort = 'queue' | 'oldest' | 'survey';
type Enquiry = Pipeline['unassigned'][number];

const VIEW_COOKIE = 'hx-crm-view';
const SCOPES = ['mine', 'all'] as const;

/**
 * The CRM page: header (Sales | Projects, search, Home · Board · List), the five counts, the stage
 * strip and the "to sort" line, then the chosen view. Home is My work and Latest notes, with the
 * WhatsApp dock as the column on the right (open on Home, the strip on Board and List).
 */
export function CrmBoard({
  me,
  initialView,
  initial,
  schema,
  team,
  today: serverToday,
  canTasks,
  canInbox,
}: {
  me: string;
  initialView: CrmView;
  initial: Pipeline | null;
  schema: SchemaReady;
  team: TeamMember[];
  today: string;
  canTasks: boolean;
  canInbox: boolean;
}) {
  const router = useRouter();
  const now = useNow(60_000);
  const today = now ? ukDayOf(now) : serverToday;
  const [data, setData] = useState<Pipeline | null>(initial);
  const [error, setError] = useState('');
  const [view, setView] = useState<CrmView>(initialView);
  const [filter, setFilter] = useState<ListFilter>('live');
  const [stage, setStage] = useState('');
  const [sort, setSort] = useState<ListSort>('queue');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [boardStage, setBoardStage] = useState<{ key: string; n: number } | null>(null);
  const [workDue, setWorkDue] = useState(false);
  const [dueAll, setDueAll] = useState(false);
  // The phone's + button: its menu, and the task and note sheets it opens.
  const [fab, setFab] = useState<null | 'menu' | 'task' | 'note' | 'call'>(null);
  const [homeTick, setHomeTick] = useState(0);
  const [workScope, setWorkScope] = useStored(`hx-crm-work:${me.slice(0, 8)}`, 'mine', SCOPES);
  // Board was the old desktop default: tell those people once where it went.
  const [oldView] = useStored('hx-crm-view', '', ['', 'board', 'list'] as const);
  const [hintSeen, setHintSeen] = useStored('hx-crm-hint-view', '', ['', '1'] as const);
  const wideBoard = useMedia('(min-width: 1024px)', true);
  const wa = useWaActive(40);

  // The server sent the first copy; after that, every minute while the tab is on screen and on coming back to it.
  const skipFirst = useRef(!!initial);
  const load = useCallback(async () => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return true;
    }
    try {
      const r = await fetch('/api/crm/projects', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load opportunities');
      setData(d as Pipeline);
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load opportunities');
      return false;
    }
  }, []);
  const { reload } = useLiveRefresh(load, 60_000);

  const all = useMemo(() => data?.projects ?? [], [data]);
  const unassigned = data?.unassigned ?? [];
  const counts = data?.counts ?? null;
  const sales = all.filter((p) => isSales(p.stage));
  const atLead = sales.filter((p) => p.stage === 'lead').length;

  /** save: only the person's own pick (the Home · Board · List switch) changes where the CRM opens next
   * time. A count card, the strip or the search changes the view for this visit, in the address bar. */
  function pickView(v: CrmView, save = true) {
    setView(v);
    rememberView('view', v, save ? VIEW_COOKIE : undefined);
  }
  /** List with a filter (the count cards, the nudge, the search box). */
  function openList(f: ListFilter, opts: { stage?: string; sort?: ListSort; q?: string } = {}) {
    setFilter(f);
    setStage(opts.stage ?? '');
    setSort(opts.sort ?? (f === 'fresh' || f === 'nostep' ? 'oldest' : 'queue'));
    setQ(opts.q ?? '');
    pickView('list', false);
  }
  /** A stage in the strip: the Board at that column (List filtered to it below 1024px). */
  function openStage(key: string) {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setFilter('live');
      setQ('');
      setBoardStage((b) => ({ key, n: (b?.n ?? 0) + 1 }));
      pickView('board', false);
    } else openList('live', { stage: key === 'won30' ? '' : key });
  }
  function onFollowUps() {
    // Everyone's (that's what the card counts), for this visit only: Mine | Everyone keeps its own choice.
    setDueAll(true);
    setWorkDue(true);
    if (view !== 'home') pickView('home', false);
    if (!window.matchMedia('(min-width: 1024px)').matches) document.getElementById('crmh-tasks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function onUnread() {
    if (openDock({ tab: 'chats', filter: 'unread' })) return;
    if (view !== 'home') pickView('home', false);
    document.getElementById('crmh-needs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function onSurveys() {
    if (schema.booking) router.push('/admin/surveys');
    else openList('live', { stage: 'survey_booked', sort: 'survey' });
  }

  async function fromLead(l: Enquiry) {
    setBusy(l.id);
    const r = await fetch('/api/crm/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiry_id: l.id, products: guessProducts(l.interest) }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (r.ok) router.push(`/admin/crm/${d.id}`);
    else setError(d.error || 'Could not create the opportunity');
  }

  async function moveTo(id: string, to: string) {
    const p = all.find((x) => x.id === id);
    if (!p || p.stage === to) return;
    const at = new Date().toISOString();
    setData((d) => (d ? { ...d, projects: d.projects.map((x) => (x.id === id ? { ...x, stage: to, stage_changed_at: at, updated_at: at } : x)) } : d));
    const r = await fetch(`/api/crm/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: to }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error || 'Couldn’t move that opportunity. Try again.');
    }
    void reload();
  }

  // The chips over the Board and List, and the search box.
  const byFilter = (p: PipelineProject) => {
    switch (filter) {
      case 'mine':
        return isLive(p) && p.owner_id === me;
      case 'due':
        return isDue(p, today);
      case 'nostep':
        return hasNoNextStep(p) && isSales(p.stage);
      case 'fresh':
        return notContacted(p);
      default:
        return isLive(p);
    }
  };
  const searched = all.filter((p) => matchesSearch(p, q));
  // A stage picked in List shows that stage, Complete and Lost too; the other chips still narrow it.
  const filtered = searched.filter((p) => (stage ? p.stage === stage && (filter === 'live' || byFilter(p)) : byFilter(p)));

  const waUnread = wa.missing ? sales.filter((p) => p.wa_unread > 0).length : (wa.counts?.unread ?? null);
  const waNeeds = wa.missing ? null : (wa.counts?.needsReply ?? null);
  // Phones and small tablets have no Board: a board link there shows the List.
  const shown: CrmView = view === 'board' && !wideBoard ? 'list' : view;
  const showHint = !hintSeen && oldView === 'board' && view !== 'board';

  // The £ and "won" parts only show where the header has room for them (crm.css), and never while they're zero.
  const summary = [
    { text: `${sales.length} open`, extra: false },
    { text: atLead ? `${atLead} at Lead` : '', extra: false },
    { text: counts?.quotesValue ? `${moneyShort(counts.quotesValue)} quoted` : '', extra: true },
    { text: counts?.wonLast30 ? `${counts.wonLast30} won in 30 days` : '', extra: true },
  ].filter((x) => x.text);

  const viewSwitch = (
    <div className="crmh-seg crmh-views" role="group" aria-label="View">
      {(['home', 'board', 'list'] as const).map((v) => (
        <button key={v} type="button" className={`${shown === v ? 'on' : ''} crmh-view--${v}`} aria-pressed={shown === v} onClick={() => pickView(v)}>
          {v === 'home' ? 'Home' : v === 'board' ? 'Board' : 'List'}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`crm crmh${searchOpen ? ' is-searching' : ''}`} data-view={shown}>
      <div className="crmh-head">
        <div className="crmh-head__l">
          <h1 className="crmh-h1">CRM</h1>
          <SalesProjects on="sales" className="crmh-sp" />
          <span className="crmh-sum" title={summary.map((x) => x.text).join(' · ')}>
            {data &&
              summary.map((x, i) => (
                <span key={x.text} className={x.extra ? 'crmh-sum__x' : undefined}>
                  {i ? ' · ' : ''}
                  {x.text}
                </span>
              ))}
          </span>
          <span className="crmh-icons">
            <button
              type="button"
              className="crmh-iconbtn"
              aria-label="Search"
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((o) => !o);
                // Once it's on screen, put the cursor in it (keyboard up on a phone).
                requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.crmh-search input')?.focus());
              }}
            >
              <Icon k="search" size={20} />
            </button>
            <Link href="/admin/crm/settings" className="crmh-iconbtn" aria-label="CRM settings">
              <Icon k="gear" size={20} />
            </Link>
          </span>
        </div>
        <CrmSearch
          className="crmh-search"
          projects={all}
          onSubmit={(text) => {
            setSearchOpen(false);
            openList('live', { q: text });
          }}
        />
        <div className="crmh-head__r">
          {viewSwitch}
          <Link href="/admin/crm/reports" className="crm-btn crm-btn--ghost crmh-reports">
            Reports
          </Link>
          <Link href="/admin/crm/settings" className="crm-btn crm-btn--ghost crmh-gear" aria-label="CRM settings" title="CRM settings">
            <Icon k="gear" />
          </Link>
          <button type="button" className="crm-btn crm-btn--solar crmh-new" onClick={() => setAdding(true)}>
            + New
          </button>
        </div>
      </div>

      {showHint && (
        <p className="crm-banner crmh-hint">
          The Board is now under <b>View</b>, next to Home and List.{' '}
          <button
            type="button"
            className="crm-link"
            onClick={() => {
              setHintSeen('1');
              // The old per-device view (before the cookie) isn't used any more.
              writeStored('hx-crm-view', null);
            }}
          >
            OK
          </button>
        </p>
      )}
      {error && <p className="crm-banner crm-banner--err">{error}</p>}

      <div className="crmh-counts" role="group" aria-label="Today’s numbers">
        <CountCard
          label="Follow-ups due"
          n={counts?.followUpsDue}
          sub={counts ? (counts.overdue ? `${counts.overdue} overdue` : 'Nothing overdue') : ''}
          tone={counts?.overdue ? 'hot' : ''}
          onClick={onFollowUps}
        />
        <CountCard
          label="Unread WhatsApp"
          n={waUnread ?? undefined}
          sub={waNeeds === null ? (wa.missing ? 'jobs with new messages' : '') : waNeeds ? `${waNeeds} need${waNeeds === 1 ? 's' : ''} a reply` : 'All replied'}
          tone="wa"
          onClick={onUnread}
        />
        <CountCard
          label="New enquiries"
          n={counts?.newEnquiries}
          sub={counts ? `${counts.newToday} today` : ''}
          onClick={() => openList('fresh')}
        />
        <CountCard
          label="Surveys this week"
          n={counts?.surveysThisWeek}
          sub={counts?.nextSurvey ? `Next: ${weekdayOf(ukDayOf(counts.nextSurvey.at))} ${ukTime(counts.nextSurvey.at)} · ${counts.nextSurvey.name}` : counts ? 'None booked' : ''}
          onClick={onSurveys}
        />
        <CountCard
          label="Quotes out"
          n={counts?.quotesOut}
          sub={counts ? (counts.quotesOut ? `${moneyShort(counts.quotesValue)}${counts.oldestQuoteDays != null ? ` · oldest ${counts.oldestQuoteDays} day${counts.oldestQuoteDays === 1 ? '' : 's'}` : ''}` : 'None out') : ''}
          onClick={() => openList('live', { stage: 'quote_sent' })}
        />
      </div>

      <nav className="crmh-strip" aria-label="Pipeline">
        {SALES_STAGES.map((k) => (
          <span key={k} className="crmh-strip__seg">
            <button type="button" onClick={() => openStage(k)}>
              <i className={`crmh-dot ph-${k === 'lead' || k === 'contacted' ? 'y' : 'b'}`} aria-hidden="true" />
              {stageLabel(k)} <b>{all.filter((p) => p.stage === k).length}</b>
            </button>
            <span className="crmh-strip__sep" aria-hidden="true">
              ›
            </span>
          </span>
        ))}
        <span className="crmh-strip__seg">
          <button type="button" onClick={() => openStage('won30')}>
            <i className="crmh-dot ph-g" aria-hidden="true" />
            Won (30 days) <b>{all.filter((p) => wonRecently(p, now)).length}</b>
          </button>
        </span>
        <button type="button" className="crmh-strip__board" onClick={() => (view === 'board' ? openStage('lead') : pickView('board'))}>
          Open board →
        </button>
      </nav>

      {unassigned.length > 0 && (
        <p className="crm-banner crmh-tosort">
          <span>
            <b>
              {unassigned.length} enquir{unassigned.length === 1 ? 'y isn’t' : 'ies aren’t'}
            </b>{' '}
            in the CRM yet
          </span>
          <button type="button" className="crm-link" onClick={() => setSorting(true)}>
            Review
          </button>
        </p>
      )}

      {/* Imported WhatsApp chats with messages from us: move those customers on from Lead (admins). */}
      <ContactedCatchUp
        onMoved={() => {
          void reload();
          setHomeTick((n) => n + 1);
        }}
      />

      {data === null && !error ? (
        <p className="crm-muted">Loading…</p>
      ) : view === 'home' ? (
        <CrmHome
          me={me}
          projects={all}
          team={team}
          today={today}
          now={now}
          schema={schema}
          canTasks={canTasks}
          canInbox={canInbox}
          wa={wa}
          scope={dueAll ? 'all' : workScope}
          onScope={(s) => {
            setWorkScope(s);
            setWorkDue(false);
            setDueAll(false);
          }}
          dueOnly={workDue}
          onDueOnly={(d) => {
            setWorkDue(d);
            if (!d) setDueAll(false);
          }}
          onNudge={() => openList('nostep')}
          onList={() => openList('live')}
          onChanged={reload}
          refreshKey={homeTick}
        />
      ) : (
        <>
          <FilterBar
            filter={filter}
            onFilter={(f) => {
              setFilter(f);
              setSort(f === 'fresh' || f === 'nostep' ? 'oldest' : 'queue');
            }}
            stage={shown === 'list' ? stage : null}
            onStage={setStage}
            q={q}
            onClearQ={() => setQ('')}
            counts={{
              live: searched.filter(isLive).length,
              due: searched.filter((p) => isDue(p, today)).length,
              nostep: searched.filter((p) => hasNoNextStep(p) && isSales(p.stage)).length,
              fresh: searched.filter(notContacted).length,
            }}
          />
          {all.length === 0 ? (
            <div className="crm-emptystate">
              <b>No opportunities yet</b>
              <p>Every new enquiry (website, Meta or WhatsApp) becomes one automatically. Use “+ New” for anyone else.</p>
            </div>
          ) : shown === 'board' ? (
            <CrmBoardView
              projects={filter === 'live' ? searched : searched.filter(byFilter)}
              now={now}
              today={today}
              chats={wa.rows}
              focus={boardStage}
              onMove={moveTo}
            />
          ) : (
            <CrmListView projects={filtered} now={now} today={today} chats={wa.rows} sort={sort} onMove={moveTo} />
          )}
        </>
      )}

      {/* Phones: the + for new things sits by your thumb (the header's + New is in the far corner). */}
      {shown !== 'board' && (
        <div className="crm-fabs crmh-fabs">
          <button type="button" className="crm-fab" aria-label="Add something new" aria-haspopup="dialog" onClick={() => setFab('menu')}>
            +
          </button>
        </div>
      )}

      {adding && (
        <NewProjectSheet
          mode="opportunity"
          me={me}
          team={team}
          onClose={() => setAdding(false)}
          onCreated={(id) => router.push(`/admin/crm/${id}`)}
        />
      )}
      {fab === 'menu' && (
        <Sheet title="Add" onClose={() => setFab(null)}>
          <div className="crm-menu crmh-fabmenu">
            <button
              type="button"
              onClick={() => {
                setFab(null);
                setAdding(true);
              }}
            >
              <span className="crm-menu-icon">＋</span>
              New opportunity
            </button>
            <button type="button" onClick={() => setFab('task')}>
              <span className="crm-menu-icon">✓</span>
              Task
            </button>
            <button type="button" onClick={() => setFab('note')}>
              <span className="crm-menu-icon">✎</span>
              Note
            </button>
            <button type="button" onClick={() => setFab('call')}>
              <span className="crm-menu-icon">☎</span>
              Log a call
            </button>
            {schema.booking && (
              <Link href="/admin/surveys?add=1" className="crmh-fabmenu__link" onClick={() => setFab(null)}>
                <span className="crm-menu-icon">▦</span>
                Add to my diary
              </Link>
            )}
          </div>
        </Sheet>
      )}
      {fab === 'task' && (
        <Sheet title="New task" onClose={() => setFab(null)}>
          <QuickTask
            me={me}
            projects={all}
            team={team}
            today={today}
            canTasks={canTasks}
            onDone={() => {
              setFab(null);
              setHomeTick((n) => n + 1);
            }}
            onCancel={() => setFab(null)}
          />
        </Sheet>
      )}
      {(fab === 'note' || fab === 'call') && (
        <NoteSheet
          projects={all}
          kind={fab}
          onClose={() => setFab(null)}
          onSaved={() => {
            setFab(null);
            setHomeTick((n) => n + 1);
            void reload();
          }}
        />
      )}
      {sorting && (
        <Sheet title="Enquiries without an opportunity" onClose={() => setSorting(false)} wide>
          <p className="crm-muted">These came in but haven’t been added to the CRM yet. Create an opportunity to start working on one.</p>
          <ul className="crmh-sortlist">
            {unassigned.map((l) => (
              <li key={l.id}>
                <span>
                  <b>{l.name}</b>
                  <small>{[l.postcode, l.source_label, l.created_at ? agoShort(l.created_at, now) : ''].filter(Boolean).join(' · ')}</small>
                </span>
                <button type="button" className="crm-btn crm-btn--small" disabled={busy === l.id} onClick={() => fromLead(l)}>
                  {busy === l.id ? '…' : 'Create opportunity'}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}

function CountCard({ label, n, sub, tone = '', onClick }: { label: string; n: number | undefined; sub: string; tone?: string; onClick: () => void }) {
  return (
    <button type="button" className={`crmh-count${tone ? ` crmh-count--${tone}` : ''}`} onClick={onClick}>
      <span className="crmh-count__lab">{label}</span>
      <span className="crmh-count__row">
        <b>{n ?? '–'}</b>
        <span className="crmh-count__sub">{sub}</span>
      </span>
    </button>
  );
}

const CHIPS: { key: ListFilter; label: string; count?: 'live' | 'due' | 'nostep' | 'fresh' }[] = [
  { key: 'live', label: 'Live', count: 'live' },
  { key: 'mine', label: 'Mine' },
  { key: 'due', label: 'Due', count: 'due' },
  { key: 'nostep', label: 'No next step', count: 'nostep' },
  { key: 'fresh', label: 'Not contacted', count: 'fresh' },
];

function FilterBar({
  filter,
  onFilter,
  stage,
  onStage,
  q,
  onClearQ,
  counts,
}: {
  filter: ListFilter;
  onFilter: (f: ListFilter) => void;
  /** null: no stage picker (the Board has a column per stage). */
  stage: string | null;
  onStage: (s: string) => void;
  q: string;
  onClearQ: () => void;
  counts: Record<'live' | 'due' | 'nostep' | 'fresh', number>;
}) {
  return (
    <div className="crmh-filters">
      <div className="crm-stages crmh-chips" role="group" aria-label="Show">
        {CHIPS.map((c) => (
          <button key={c.key} type="button" className={`${filter === c.key ? 'on' : ''}${c.key === 'due' && counts.due ? ' warn' : ''}`} aria-pressed={filter === c.key} onClick={() => onFilter(c.key)}>
            {c.label}
            {c.count && <span>{counts[c.count]}</span>}
          </button>
        ))}
      </div>
      {stage !== null && (
        <select className="crm-input crmh-stagepick" value={stage} onChange={(e) => onStage(e.target.value)} aria-label="Stage">
          <option value="">Every stage</option>
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      )}
      {q && (
        <span className="crmh-qchip">
          Search: <b>{q}</b>
          <button type="button" onClick={onClearQ} aria-label="Clear the search">
            ✕
          </button>
        </span>
      )}
    </div>
  );
}

