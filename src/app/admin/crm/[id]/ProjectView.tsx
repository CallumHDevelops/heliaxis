'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isProjectStage, noSurveyNeeded } from '@/lib/crm/stages';
import { primaryActionFor, type ActionKey, type PrimaryAction } from '@/lib/projects/primary-action';
import type { SchemaReady } from '@/lib/schema-ready';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { useNow } from '@/lib/use-now';
import { NewProjectSheet } from '../../projects/NewProjectSheet';
import { OrdersTab } from '../../projects/orders/OrdersTab';
import { ordersCount } from '../../projects/orders/OrdersUi';
import { ProjectOverview, SurveysPanel, type OverviewActions } from '../../projects/[id]/ProjectOverview';
import { firstName, phaseOf, ukDayOf } from '../crm-shared';
import { DOCK, openDock, sendDockJob, useDockState, type DockJob } from '../dock-link';
import { MergeSheet, mergedWords, mergeNotice, type MergeStart } from '../MergeSheet';
import { useMedia } from '../use-stored';
import { ActivityTab } from './ActivityTab';
import { CompactCustomer, CustomerColumn } from './CustomerColumn';
import { PhotosTab } from './PhotosTab';
import { HandoverTab } from './HandoverTab';
import { DocumentsTab, EmailComposerV2, SEND_QUOTE } from './ProjectExtras';
import { RecordFabs } from './RecordFabs';
import { RecordHeader } from './RecordHeader';
import { SiteTab } from './SiteTab';
import {
  ActionMenu,
  CallPrompt,
  DeleteSheet,
  LinkSheet,
  LogComposer,
  NextStepEditor,
  nextStepTimes,
  PhotoQuick,
  PlainSheet,
  StageSheet,
  TaskEditor,
  WhatsAppComposer,
  type SheetKey,
} from './RecordSheets';
import { TasksCard } from './TasksCard';
import {
  defaultTab,
  HANDOVER_STAGES,
  nextDateWords,
  phoneShown,
  refOf,
  send,
  siteOf,
  TABS,
  ukWhen,
  type Area,
  type Entry,
  type LightData,
  type Project,
  type RecordData,
  type Tab,
} from './record-shared';
import '../crm.css';

/** Signed photo links last an hour: read everything again after 50 minutes. */
const PHOTO_LINKS_MS = 50 * 60_000;
/** "Log the call?" when you come back within 30 minutes of tapping Call. */
const CALL_PROMPT_MS = 30 * 60_000;

/**
 * The jobs seen in this tab, so coming back to one (Back from its chat page) shows it straight away
 * at the same scroll position, while it reads it again.
 */
const seen = new Map<string, RecordData>();
const SCROLL_KEY = (id: string) => `hx-rec-scroll:${id}`;

/** Newer entries win; newest first. A poll re-reads the newest messages (for their ticks), so nothing new keeps the old list. */
function mergeTimeline(old: Entry[], fresh: Entry[]): Entry[] {
  const byId = new Map(old.map((e) => [e.id, e]));
  const changed = fresh.filter((e) => {
    const was = byId.get(e.id);
    return !was || JSON.stringify(was) !== JSON.stringify(e);
  });
  if (!changed.length) return old;
  for (const e of changed) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Where a light poll picks up: a minute before the newest entry, so nothing saved meanwhile is missed (ids weed out repeats). */
const cursorFrom = (timeline: Entry[]) => {
  const newest = timeline[0]?.at;
  return newest ? new Date(Date.parse(newest) - 60_000).toISOString() : null;
};

/**
 * The job record page (`/admin/crm/{id}` and `/admin/projects/{id}`): the header, then the customer on
 * the left, the job in the centre (next step and the tabs) and Tasks on the right. With the WhatsApp
 * dock open (from 1280px) the dock is the right-hand column and the Tasks card moves into it (over the
 * job's chat on This job, under the list on Chats); folded, Tasks is the page's third column. Tablets get a band of customer and tasks above the
 * tabs (plus a Details tab), phones the stacked layout of research 2.5. CSS does the layout from
 * `.hx-frame[data-dock]`, so the first paint is right.
 *
 * The page itself never marks WhatsApp read (the dock and the chat pages do), never scrolls by itself,
 * and polls lightly: every 30s while it's on screen, without signing the photo links again.
 */
export function ProjectView({
  id,
  me,
  isAdmin,
  canInbox,
  area = 'crm',
  initialTab = null,
  entry = null,
  schema: serverSchema,
}: {
  id: string;
  me: string;
  isAdmin: boolean;
  canInbox: boolean;
  area?: Area;
  initialTab?: Tab | null;
  entry?: string | null;
  schema: SchemaReady;
}) {
  const router = useRouter();
  const now = useNow(60_000);
  const today = now ? ukDayOf(now) : '';
  const wide1280 = useMedia('(min-width: 1280px)');
  const wide761 = useMedia('(min-width: 761px)');
  const dock = useDockState();

  const [rec, setRec] = useState<RecordData | null>(() => seen.get(id) ?? null);
  const [error, setError] = useState('');
  // After a merge that opened this job: "Merged. HX-0069 now finds Robert Evans HX-0080."
  const [notice, setNotice] = useState(() => mergeNotice.read());
  const [merging, setMerging] = useState<MergeStart | null>(null);
  /** This job was joined into another while open (a merge elsewhere). */
  const [joined, setJoined] = useState<{ id: string; ref: string | null } | null>(null);
  const [tabSel, setTabSel] = useState<Tab | null>(initialTab && TABS.includes(initialTab) ? initialTab : null);
  const [photoView, setPhotoView] = useState<{ cat: string | null; key: number }>({ cat: null, key: 0 });
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [sheetOpts, setSheetOpts] = useState<{ draft?: string; photoCat?: string }>({});
  const [editCustomer, setEditCustomer] = useState(0);
  const [callPrompt, setCallPrompt] = useState(false);
  const [pendingDoc, setPendingDoc] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [dockAck, setDockAck] = useState(false);

  /* ── Loading: the whole job, then light polls ─────────────────────────────── */
  const recRef = useRef<RecordData | null>(null);
  const wantFull = useRef(true);
  const signedAt = useRef(0);
  const cursor = useRef<string | null>(null);
  useEffect(() => {
    recRef.current = rec;
    if (rec) seen.set(id, rec);
  });
  useEffect(() => mergeNotice.clear(), []);
  // Back from the chat page: where the page was.
  const restored = useRef(false);
  useEffect(() => {
    if (!rec || restored.current) return;
    restored.current = true;
    let y = 0;
    try {
      // "{scrollY}:{when}", used within half an hour.
      const [top, at] = (sessionStorage.getItem(SCROLL_KEY(id)) || '').split(':').map(Number);
      sessionStorage.removeItem(SCROLL_KEY(id));
      if (Date.now() - at < 30 * 60_000) y = top || 0;
    } catch {
      // Nothing kept.
    }
    if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
  }, [id, rec]);

  const loadFull = useCallback(async () => {
    const started = Date.now();
    const r = await fetch(`/api/crm/projects/${id}`, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok && d.error === 'merged' && d.into) setJoined(d.into);
    if (!r.ok) throw new Error(d.error === 'merged' ? 'This job was joined into another.' : d.error || 'Could not load this job');
    wantFull.current = false;
    signedAt.current = started;
    cursor.current = cursorFrom(d.timeline ?? []);
    setRec(d as RecordData);
    setError('');
  }, [id]);

  const load = useCallback(async () => {
    try {
      const cur = recRef.current;
      if (wantFull.current || !cur || Date.now() - signedAt.current > PHOTO_LINKS_MS) {
        await loadFull();
        return true;
      }
      const since = cursor.current ? `&since=${encodeURIComponent(cursor.current)}` : '';
      const r = await fetch(`/api/crm/projects/${id}?light=1${since}`, { cache: 'no-store' });
      const d = (await r.json().catch(() => ({}))) as LightData & { error?: string; into?: { id: string; ref: string | null } };
      if (!r.ok && d.error === 'merged' && d.into) setJoined(d.into);
      if (!r.ok) throw new Error(d.error || 'Could not load this job');
      // Something else changed the job, or its photos or documents: read it all again.
      if (d.project.updated_at !== cur.project.updated_at || d.counts.photos !== cur.photos.length || d.counts.documents !== cur.documents.length) {
        await loadFull();
        return true;
      }
      cursor.current = d.cursor;
      setRec((prev) =>
        prev ? { ...prev, project: d.project, customer: d.customer, tasks: d.tasks, whatsapp: d.whatsapp, timeline: mergeTimeline(prev.timeline, d.timeline) } : prev
      );
      setError('');
      return true;
    } catch (e) {
      // Offline or a blip: keep what's on screen; say so only if there's nothing to show.
      if (!recRef.current) setError(e instanceof Error ? e.message : 'Could not load this job');
      return false;
    }
  }, [id, loadFull]);
  const { reload } = useLiveRefresh(load, 30_000);
  /** After an edit: everything again (the checklist, deadlines and dates follow from it). */
  const refresh = useCallback(() => {
    wantFull.current = true;
    return reload();
  }, [reload]);

  // Unit Q's portal card changed the job (Send quote for signing moves it to Quote sent): read it again now.
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<{ id?: string }>).detail?.id === id) void refresh();
    };
    window.addEventListener('hx:project-changed', on);
    return () => window.removeEventListener('hx:project-changed', on);
  }, [id, refresh]);

  /* ── The WhatsApp dock: which job this is, and its Tasks slot ──────────────── */
  const jobJson = useMemo(() => {
    if (!rec) return '';
    const job: DockJob = {
      projectId: rec.project.id,
      enquiryId: rec.customer.id,
      enquiryIds: rec.whatsapp.enquiryIds?.length ? rec.whatsapp.enquiryIds : [rec.customer.id],
      threadId: rec.whatsapp.number ? rec.whatsapp.threadId : null,
      waId: rec.whatsapp.number,
      name: rec.customer.name,
      ref: rec.project.project_ref ?? null,
      customerRef: rec.customer.customer_ref ?? null,
      stage: rec.project.stage,
      unread: rec.whatsapp.unread,
      docs: rec.documents,
    };
    return JSON.stringify(job);
  }, [rec]);
  useEffect(() => {
    if (!jobJson) return;
    const job = JSON.parse(jobJson) as DockJob;
    // The dock answers with its state (and the Tasks slot when This job is showing).
    const ack = () => setDockAck(true);
    window.addEventListener(DOCK.state, ack, { once: true });
    sendDockJob(job);
    const onReady = () => sendDockJob(job);
    window.addEventListener(DOCK.ready, onReady);
    return () => {
      window.removeEventListener(DOCK.ready, onReady);
      window.removeEventListener(DOCK.state, ack);
    };
  }, [jobJson]);
  useEffect(() => () => sendDockJob(null), []);

  // The dock's "Add mobile": the Customer card opens for editing (in the Details tab below 1280px).
  useEffect(() => {
    const onAction = (e: Event) => {
      const d = (e as CustomEvent<{ action?: string; projectId?: string }>).detail;
      if (d?.action !== 'edit-customer' || d.projectId !== id) return;
      if (!window.matchMedia('(min-width: 1280px)').matches) setTabSel('details');
      setEditCustomer((n) => n + 1);
    };
    window.addEventListener(DOCK.action, onAction);
    return () => window.removeEventListener(DOCK.action, onAction);
  }, [id]);

  /* ── After a phone call ─────────────────────────────────────────────────────── */
  const calledAt = useRef(0);
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState !== 'visible' || !calledAt.current) return;
      if (Date.now() - calledAt.current < CALL_PROMPT_MS) setCallPrompt(true);
      calledAt.current = 0;
    };
    document.addEventListener('visibilitychange', onBack);
    return () => document.removeEventListener('visibilitychange', onBack);
  }, []);

  /* ── Tabs ────────────────────────────────────────────────────────────────────── */
  const schema = rec?.schema ?? serverSchema;
  const stage = rec?.project.stage ?? '';
  const fallbackTab = stage ? defaultTab(stage, area) : 'activity';
  // Orders (purchase-orders.sql): for jobs from Won, and any job that already has some.
  const ordersTab = !!schema.purchaseOrders && (isProjectStage(stage) || ordersCount(rec?.orders) > 0);
  // Site (site-commissioning.sql): the trades on the job, from Won.
  const siteTab = !!schema.site && isProjectStage(stage);
  // Handover (handover.sql): the customer's handover pack, from Ready.
  const handoverTab = !!schema.handover && HANDOVER_STAGES.includes(stage);
  let tab: Tab = tabSel ?? fallbackTab;
  if ((tab === 'details' && wide1280) || (tab === 'surveys' && !schema.surveys) || (tab === 'orders' && !ordersTab) || (tab === 'site' && !siteTab) || (tab === 'handover' && !handoverTab))
    tab = fallbackTab;

  const pickTab = useCallback((t: Tab) => {
    setTabSel(t);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      url.searchParams.delete('entry');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // The tab still changes; only Back won't remember it.
    }
  }, []);

  // Phones: the tabs scroll sideways, so keep the one that's open in view.
  const loaded = rec !== null;
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.crmr-tabs');
    const on = bar?.querySelector<HTMLElement>('button.on');
    if (!bar || !on || bar.scrollWidth <= bar.clientWidth) return;
    const left = on.offsetLeft - bar.offsetLeft;
    if (left < bar.scrollLeft || left + on.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollTo({ left: Math.max(0, left - 16) });
  }, [tab, loaded]);

  // "+ Add" on a document tile: open Docs, then tell its upload which kind (Unit Q's DocumentsTab listens).
  useEffect(() => {
    if (!pendingDoc || tab !== 'docs') return;
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('hx:add-document', { detail: { category: pendingDoc } }));
      setPendingDoc(null);
    }, 60);
    return () => clearTimeout(t);
  }, [pendingDoc, tab]);

  /* ── Saving ──────────────────────────────────────────────────────────────────── */
  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setError('');
      try {
        const d = await send<{ warning?: string }>(`/api/crm/projects/${id}`, 'PATCH', body);
        setNotice(d.warning || '');
        void refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Not saved');
        return false;
      }
    },
    [id, refresh]
  );

  const base = area === 'projects' ? '/admin/projects' : '/admin/crm';
  const joinedBanner = joined && (
    <p className="crm-banner">
      This job was joined into {joined.ref ?? 'another job'}.{' '}
      <a className="crm-link" href={`${base}/${joined.id}`}>
        Open it
      </a>
    </p>
  );
  if (!rec) {
    return (
      <div className="crm crmh crmr">
        {joinedBanner || <p className={error ? 'crm-banner crm-banner--err' : 'crm-muted'}>{error || 'Loading…'}</p>}
      </div>
    );
  }

  const p = rec.project;
  const c = rec.customer;
  const wa = rec.whatsapp;
  const first = firstName(c.name) || c.name;
  const jobRef = refOf(p, c);
  const site = siteOf(p, c);
  const delivery = isProjectStage(p.stage);
  const done = p.stage === 'complete' || p.stage === 'lost';
  const noSurvey = noSurveyNeeded(p);
  const primary = adjustPrimary(
    primaryActionFor(p.stage, { surveyDay: p.survey_at ? ukDayOf(p.survey_at) : null, today, keyMissing: rec.progress.keyMissing }),
    schema,
    noSurvey
  );
  // The dock's Tasks space: on This job over the chat, or on Chats under the list (so Tasks stay on the right).
  const slotEl = dock.tasksSlot && typeof document !== 'undefined' ? document.getElementById(dock.tasksSlot) : null;
  // Docked open but with no Tasks space (the dock hasn't taken this job yet): the left column keeps them meanwhile.
  const tasksInDockTab = wide1280 && dock.state === 'open' && dock.panel && !slotEl && dockAck;
  // A quote or contract to send for signing (Unit Q's signable types).
  const hasQuote = rec.documents.some((d) => d.category === 'quote' || d.category === 'contract');
  const counts = {
    photos: rec.photos.length,
    // Old versions of generated documents are kept (archived): the count is what the tab lists.
    docs: rec.documents.filter((d) => !d.archived_at).length,
    surveys: rec.surveys.length,
  };

  function openSheet(s: SheetKey, opts: { draft?: string; photoCat?: string } = {}) {
    setSheetOpts(opts);
    setSheet(s);
  }
  const closeSheet = () => setSheet(null);
  const savedAndClose = () => {
    setSheet(null);
    void reload();
  };

  /** The green button: the dock from 761px, the full-screen chat on phones, the old sheet without either. */
  function openWhatsApp(draft?: string) {
    if (!wa.number) {
      // No mobile yet: add it first.
      if (!wide1280) pickTab('details');
      setEditCustomer((n) => n + 1);
      setNotice(`Add ${first}’s mobile to message them on WhatsApp.`);
      return;
    }
    if (openDock({ tab: 'job', focus: true, ...(draft ? { draft } : {}) })) return;
    const el = document.getElementById('hx-dock');
    if (el && !el.hidden && !wide761 && wa.threadId && !draft) {
      try {
        sessionStorage.setItem('hx-chat-from', id);
        sessionStorage.setItem(SCROLL_KEY(id), `${Math.round(window.scrollY)}:${Date.now()}`);
      } catch {
        // "Back to job" then links back instead.
      }
      router.push(`/admin/crm/chats/${wa.threadId}?job=${id}&tab=${tab}`);
      return;
    }
    openSheet('whatsapp', { draft: draft ?? '' });
  }

  function focusField(fieldId: string) {
    pickTab('overview');
    setTimeout(() => {
      const el = document.getElementById(fieldId);
      el?.scrollIntoView({ block: 'center' });
      el?.focus({ preventScroll: true });
    }, 80);
  }

  async function startSurvey(type: 'solar' | 'ashp') {
    setStarting(true);
    setError('');
    try {
      const d = await send<{ id: string }>('/api/crm/surveys', 'POST', { project_id: id, type }, 'Couldn’t start the survey.');
      window.location.href = `/admin/surveys/${d.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t start the survey.');
      setStarting(false);
    }
  }

  function addDocument(category: string) {
    pickTab('docs');
    setPendingDoc(category);
  }

  /** Send quote for signing: no quote or contract yet, upload it first; else the customer portal card's picker (Details below 1280px). */
  function sendQuote() {
    if (!hasQuote) return addDocument('quote');
    if (!wide1280) pickTab('details');
    window.dispatchEvent(new CustomEvent(SEND_QUOTE, { detail: { id } }));
    setTimeout(() => document.querySelector('.crmr-slot[aria-label="Customer portal"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }

  async function runAction(a: ActionKey, to?: string, confirmText?: string) {
    switch (a) {
      case 'mark_contacted':
        await patch({ stage: 'contacted' });
        return;
      case 'booking_link':
        if (schema.booking) openSheet('link');
        else focusField('rec-survey-at');
        return;
      case 'start_survey':
        if (schema.surveys) void startSurvey('solar');
        else focusField('rec-survey-at');
        return;
      case 'find_time':
        // A home visit (no survey): its date goes in by hand.
        if (schema.booking && !noSurvey) router.push(`/admin/surveys?project=${id}`);
        else focusField('rec-survey-at');
        return;
      case 'send_quote':
        sendQuote();
        return;
      case 'chase_quote':
        openWhatsApp(`Hi ${first}, just checking you got our quote and whether you have any questions. Happy to talk it through.`);
        return;
      case 'mark_won':
        if (window.confirm(`Mark ${c.name}’s job as Won?`)) await patch({ stage: 'won' });
        return;
      case 'move_next':
        if (!to || (confirmText && !window.confirm(confirmText))) return;
        await patch({ stage: to });
        return;
      case 'install_dates':
        focusField('rec-install-at');
        return;
      case 'upload_certificate':
        addDocument('mcs');
        return;
      case 'ask_review':
        openWhatsApp(`Hi ${first}, thank you for choosing Heliaxis. If you’re happy with everything, would you leave us a quick review? It really helps us.`);
        return;
      case 'reopen':
        openSheet('stage');
        return;
    }
  }

  const overviewActions: OverviewActions = {
    patch,
    checklist: async (item, b) => {
      try {
        const d = await send<Pick<RecordData, 'checklist' | 'progress'>>(`/api/crm/projects/${id}/checklist`, 'POST', { item, ...b });
        setRec((r) => (r ? { ...r, checklist: d.checklist, progress: d.progress } : r));
        void reload();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Not saved';
      }
    },
    moveTo: async (s) => {
      await patch({ stage: s });
    },
    openTab: (t, cat) => {
      if (t === 'photos') setPhotoView((v) => ({ cat: cat ?? null, key: v.key + 1 }));
      // From 1280px the customer's details are the left column, not a tab.
      if (t === 'details' && wide1280) document.querySelector('.crmr-customer')?.scrollIntoView({ block: 'nearest' });
      else pickTab(t);
    },
    addDocument,
    addPhoto: (cat) => openSheet('photo', { photoCat: cat }),
    startSurvey: (type) => void startSurvey(type),
    bookingLink: () => openSheet('link'),
  };

  const tasksCard = (where: 'page' | 'dock' | 'dock-chats') => (
    <TasksCard
      // Under another customer's chat, say whose job these are.
      heading={where === 'dock-chats' ? `Tasks · ${first}` : undefined}
      projectId={id}
      tasks={rec.tasks}
      team={rec.team}
      me={me}
      today={today}
      defaultAssignee={p.owner_id}
      delivery={delivery}
      where={where === 'page' ? 'page' : 'dock'}
      onChanged={() => reload()}
    />
  );
  const tabLabel: Record<Exclude<Tab, 'details'>, React.ReactNode> = {
    overview: 'Overview',
    activity: (
      <>
        Activity{wa.unread > 0 && <em>{wa.unread} new</em>}
      </>
    ),
    photos: <>Photos{counts.photos > 0 && <i>{counts.photos}</i>}</>,
    docs: <>Docs{counts.docs > 0 && <i>{counts.docs}</i>}</>,
    orders: <>Orders{ordersCount(rec.orders) > 0 && <i>{ordersCount(rec.orders)}</i>}</>,
    site: 'Site',
    handover: 'Handover',
    surveys: <>Surveys{counts.surveys > 0 && <i>{counts.surveys}</i>}</>,
  };
  const shownTabs = [
    'overview',
    'activity',
    'photos',
    'docs',
    ...(ordersTab ? ['orders'] : []),
    ...(siteTab ? ['site'] : []),
    ...(handoverTab ? ['handover'] : []),
    ...(schema.surveys ? ['surveys'] : []),
  ] as Exclude<Tab, 'details'>[];

  return (
    <div className="crm crmh crmr" data-tab={tab} data-phase={phaseOf(p.stage)}>
      <RecordHeader
        project={p}
        customer={c}
        waNumber={wa.number}
        others={rec.others}
        duplicates={rec.duplicates}
        area={area}
        now={now}
        progress={delivery ? rec.progress : null}
        primary={primary}
        nextDate={nextDateWords(rec.next_date, p)}
        jobRef={jobRef}
        isAdmin={isAdmin}
        site={site}
        onStage={() => openSheet('stage')}
        onMoveTo={(s) => void patch({ stage: s })}
        onPrimary={(a, to, confirmText) => void runAction(a, to, confirmText)}
        onEmail={() => openSheet('email')}
        onCall={() => {
          calledAt.current = Date.now();
        }}
        onName={() => {
          if (!wide1280) pickTab('details');
          else document.querySelector('.crmr-customer')?.scrollIntoView({ block: 'nearest' });
        }}
        onNewProject={() => openSheet('newproject')}
        onDelete={() => openSheet('delete')}
        onMerge={(other) => setMerging({ a: c.id, b: other, name: c.name })}
        onJoinJobs={() => setMerging({ a: c.id, name: c.name, jobPair: [id, rec.others.length === 1 ? rec.others[0].id : ''], jobs: rec.others.map((o) => ({ id: o.id, ref: o.project_ref, title: o.title, stage: o.stage })) })}
        onNotSame={async (other) => {
          const ok = await send('/api/crm/merge', 'POST', { action: 'distinct', a: c.id, b: other }).then(
            () => true,
            (e: Error) => (setError(e.message), false)
          );
          if (ok) void refresh();
        }}
      />
      {joinedBanner}

      {callPrompt && (
        <CallPrompt
          name={c.name}
          onAnswered={() => {
            setCallPrompt(false);
            openSheet('call');
          }}
          onNoAnswer={async () => {
            setCallPrompt(false);
            await send(`/api/crm/projects/${id}/activities`, 'POST', { kind: 'call', body: 'Called, no answer.' }).catch(() => null);
            void reload();
          }}
          onSkip={() => setCallPrompt(false)}
        />
      )}
      {notice && (
        <p className="crm-banner crmr-notice">
          {notice}
          <button type="button" className="crm-link" onClick={() => setNotice('')}>
            OK
          </button>
        </p>
      )}
      {error && <p className="crm-banner crm-banner--err">{error}</p>}

      <div className="crmr-grid">
        <aside className="crmr-left" aria-label="Customer and job details">
          <CustomerColumn
            project={p}
            customer={c}
            wa={wa}
            others={rec.others}
            surveys={rec.surveys}
            team={rec.team}
            schema={schema}
            area={area}
            now={now}
            portal={rec.portal}
            tracker={rec.tracker}
            stripe={rec.connected.stripe}
            isAdmin={isAdmin}
            editCustomer={editCustomer}
            onSaved={() => refresh()}
            onSaveProject={patch}
            onSendWhatsApp={(text) => openWhatsApp(text)}
            onDelete={() => openSheet('delete')}
            onNewProject={() => openSheet('newproject')}
            // Docked open with no Tasks space in the dock yet: there's no right-hand column either, so the
            // card comes here meanwhile and Tasks are never missing.
            tasksElsewhere={tasksInDockTab ? tasksCard('page') : null}
          />
        </aside>

        <div className="crmr-band">
          <CompactCustomer project={p} customer={c} wa={wa} onDetails={() => pickTab('details')} />
        </div>

        {!done && (
          <div className="crmr-next">
            <NextStepBar
              project={p}
              now={now}
              onEdit={() => openSheet('next')}
              onDone={() => void patch({ complete_next_step: true })}
              onSnooze={(at) => void patch({ next_step_at: at })}
            />
          </div>
        )}

        <aside className="crmr-right" aria-label="Tasks">
          {!slotEl && !tasksInDockTab && tasksCard('page')}
          <p className="crmr-grey crmr-chathint">Chat with {first} is in the strip on the right, or press the green button.</p>
        </aside>

        <section className="crmr-main" aria-label="The job">
          <div className="crmr-tabs" role="tablist" aria-label="Job">
            {shownTabs.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pickTab(k)}>
                {tabLabel[k]}
              </button>
            ))}
            <button type="button" role="tab" aria-selected={tab === 'details'} className={`crmr-tab--details${tab === 'details' ? ' on' : ''}`} onClick={() => pickTab('details')}>
              Details
            </button>
          </div>
          <div className="crmr-pane" role="tabpanel">
            {tab === 'overview' && <ProjectOverview rec={rec} team={rec.team} today={today} actions={overviewActions} />}
            {tab === 'activity' && (
              <ActivityTab
                projectId={id}
                entries={rec.timeline}
                others={rec.others}
                customerName={c.name}
                today={today}
                entry={entry}
                base={area === 'projects' ? '/admin/projects' : '/admin/crm'}
                // Stable, and a full read: a file's "on its way" check runs once, and an older message's new status still shows.
                onChanged={refresh}
              />
            )}
            {tab === 'photos' && <PhotosTab key={photoView.key} id={id} photos={rec.photos} initialCat={photoView.cat} onChanged={refresh} />}
            {tab === 'docs' && <DocumentsTab id={id} docs={rec.documents} onChanged={refresh} siteDocs={schema.site} handover={schema.handover} />}
            {tab === 'orders' && <OrdersTab projectId={id} today={today} myName={rec.team.find((t) => t.id === me)?.name ?? null} onChanged={refresh} />}
            {tab === 'site' && <SiteTab projectId={id} now={now} onChanged={() => void refresh()} />}
            {tab === 'handover' && (
              <HandoverTab projectId={id} now={now} me={rec.team.find((t) => t.id === me)?.name ?? ''} isAdmin={isAdmin} onChanged={() => void refresh()} openTab={pickTab} />
            )}
            {tab === 'surveys' && <SurveysPanel surveys={rec.surveys} busy={starting} onStart={(type) => void startSurvey(type)} />}
          </div>
          <RecordFabs unread={wa.unread} name={c.name} onWhatsApp={() => openWhatsApp()} onAdd={() => openSheet('menu')} />
        </section>
      </div>

      {slotEl && createPortal(tasksCard(dock.tasksWhere === 'chats' ? 'dock-chats' : 'dock'), slotEl, dock.tasksWhere ?? 'dock')}

      {sheet === 'menu' && (
        <ActionMenu
          customer={c}
          tile={primary.tile}
          onPick={(s) => (s ? openSheet(s) : closeSheet())}
          onTile={() => {
            closeSheet();
            if (primary.tile) void runAction(primary.tile.action, primary.tile.action === primary.action ? primary.to : undefined);
          }}
        />
      )}
      {sheet === 'task' && <TaskEditor id={id} team={rec.team} today={today} defaultAssignee={p.owner_id} onSaved={savedAndClose} onClose={closeSheet} />}
      {sheet === 'next' && (
        <NextStepEditor
          project={p}
          now={now}
          onClose={closeSheet}
          onSave={(next_step, next_step_at) => {
            closeSheet();
            void patch({ next_step, next_step_at });
          }}
        />
      )}
      {sheet === 'whatsapp' && (
        <WhatsAppComposer projectId={id} docs={rec.documents} initialText={sheetOpts.draft ?? ''} customer={c} wa={wa} onSent={savedAndClose} onClose={closeSheet} />
      )}
      {(sheet === 'note' || sheet === 'call' || sheet === 'visit') && (
        <LogComposer id={id} kind={sheet} phone={phoneShown(c, wa.number)} onSaved={savedAndClose} onClose={closeSheet} />
      )}
      {sheet === 'email' && (
        <PlainSheet label={`Email ${c.name}`} onClose={closeSheet}>
          <EmailComposerV2
            id={id}
            customer={{ name: c.name, email: c.email || '' }}
            docs={rec.documents}
            connected={rec.connected.email}
            onSaved={async () => {
              savedAndClose();
            }}
          />
        </PlainSheet>
      )}
      {sheet === 'photo' && (
        <PhotoQuick
          id={id}
          initialCat={sheetOpts.photoCat}
          onClose={closeSheet}
          onDone={() => {
            closeSheet();
            void refresh();
          }}
        />
      )}
      {sheet === 'stage' && (
        <StageSheet
          stage={p.stage}
          primary={primary}
          onClose={closeSheet}
          onPrimary={() => {
            closeSheet();
            void runAction(primary.action, primary.to, primary.confirm);
          }}
          onPick={(s) => {
            closeSheet();
            if (s !== 'lost') return void patch({ stage: s });
            // Lost: why, if they know (it shows in Job details and the reports).
            const why = window.prompt(`Why was ${c.name}’s job lost? (optional, e.g. price, timing, went elsewhere)`, p.lost_reason || '');
            if (why === null) return;
            void patch({ stage: 'lost', ...(why.trim() ? { lost_reason: why.trim() } : {}) });
          }}
        />
      )}
      {sheet === 'link' && <LinkSheet projectId={id} onClose={closeSheet} onWhatsApp={(text) => (closeSheet(), openWhatsApp(text))} />}
      {merging && (
        <MergeSheet
          start={merging}
          isAdmin={isAdmin}
          onClose={() => setMerging(null)}
          onDone={(done, preview) => {
            setMerging(null);
            const words = mergedWords(done, preview);
            if (!done.job || done.job === id) {
              setNotice(words);
              void refresh();
              return;
            }
            mergeNotice.set(words);
            router.push(`${base}/${done.job}`);
          }}
        />
      )}
      {sheet === 'delete' && <DeleteSheet project={p} customer={c} canInbox={canInbox} area={area} onClose={closeSheet} onDone={(to) => router.push(to)} />}
      {sheet === 'newproject' && (
        <NewProjectSheet
          mode="project"
          me={me}
          team={rec.team}
          siteApp={schema.site}
          customer={{
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            postcode: c.postcode,
            customer_ref: c.customer_ref ?? null,
            projects: rec.others.length + 1,
            latest: { address: p.address, postcode: p.postcode, products: p.products },
            possible_duplicate: null,
          }}
          onClose={closeSheet}
          onCreated={(newId) => router.push(`/admin/projects/${newId}`)}
        />
      )}
    </div>
  );
}

const SURVEY_ACTIONS: ActionKey[] = ['booking_link', 'find_time', 'start_survey'];

/**
 * The stage's main button, for what's set up: before the booking diary (survey-booking.sql) a booking
 * link or "Find a time" becomes "Add survey date"; before surveys.sql there's no "Start survey". A job
 * with no solar, battery or heat pump (infrared, an EV charger or LEDs only) has no survey to book or
 * do, so it gets "Add home visit date" instead.
 */
function adjustPrimary(a: PrimaryAction, schema: SchemaReady, noSurvey: boolean): PrimaryAction {
  if (noSurvey) {
    const visit = { action: 'find_time' as const, label: 'Add home visit date' };
    const main = SURVEY_ACTIONS.includes(a.action) ? { ...a, ...visit } : a;
    return { ...main, menu: main.menu.filter((m) => !SURVEY_ACTIONS.includes(m.action)), tile: a.tile && SURVEY_ACTIONS.includes(a.tile.action) ? visit : a.tile };
  }
  const noBooking = !schema.booking && (a.action === 'booking_link' || a.action === 'find_time');
  const noSurveys = !schema.surveys && a.action === 'start_survey';
  const label = schema.booking ? 'Find a time' : a.action === 'booking_link' ? 'Add survey date' : 'Change survey date';
  const base = noBooking || noSurveys ? { ...a, action: 'find_time' as const, label, menu: a.menu.filter((m) => m.action !== 'find_time') } : a;
  const t = base.tile;
  // No booking diary yet: the tile adds the survey date by hand. No surveys yet: no Start survey tile.
  const tile = t && !schema.booking && t.action === 'booking_link' ? { action: 'find_time' as const, label: 'Add survey date' } : t && !schema.surveys && t.action === 'start_survey' ? null : t;
  return { ...base, tile };
}

function NextStepBar({
  project,
  now,
  onEdit,
  onDone,
  onSnooze,
}: {
  project: Project;
  now: number;
  onEdit: () => void;
  onDone: () => void;
  onSnooze: (at: string) => void;
}) {
  const [snoozing, setSnoozing] = useState(false);
  if (!project.next_step) {
    return (
      <button type="button" className="crmr-nextbar is-empty" onClick={onEdit}>
        + Add a next step <span className="crm-muted">so this doesn’t go quiet</span>
      </button>
    );
  }
  const at = project.next_step_at;
  const late = !!at && !!now && Date.parse(at) < now;
  const isToday = !!at && !!now && ukDayOf(at) === ukDayOf(now);
  return (
    <div className={`crmr-nextbar${late ? ' is-late' : isToday ? ' is-today' : ''}`}>
      <span className="crmr-nextbar__lab">Next step</span>
      <button type="button" className="crmr-nextbar__t" onClick={onEdit} title="Change the next step">
        {project.next_step}
      </button>
      {at && (
        <span className="crmr-nextbar__due">
          {late ? 'Overdue · ' : ''}
          {isToday ? `Today ${ukWhen(at).split(', ')[1]}` : ukWhen(at)}
        </span>
      )}
      <span className="crmr-nextbar__acts">
        <button type="button" className="crm-btn crm-btn--small" onClick={onDone}>
          ✓ Done
        </button>
        <span className="crmr-snooze">
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" aria-expanded={snoozing} onClick={() => setSnoozing((s) => !s)}>
            Snooze ▾
          </button>
          {snoozing && (
            <span className="crmr-snooze__list" role="menu">
              {nextStepTimes(now).map(([label, iso]) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSnoozing(false);
                    onSnooze(iso);
                  }}
                >
                  {label}
                </button>
              ))}
            </span>
          )}
        </span>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small crmr-nextbar__edit" onClick={onEdit}>
          Edit
        </button>
      </span>
    </div>
  );
}

