'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { useNow } from '@/lib/use-now';
import { appendDraft, ChatPane } from './ChatPane';
import {
  DOCK_EVENTS,
  initialsOf,
  jobIdFromPath,
  type ActiveChat,
  type ChatFilter,
  type DockAccess,
  type DockActionDetail,
  type DockJob,
  type DockOpenDetail,
  type DockState,
  type DockStateDetail,
} from './dock-shared';
import { useActiveChats } from './use-active-chats';
import { ChatList, ThreadBar } from './WhatsAppPanel';
import './dock.css';

/**
 * The WhatsApp dock (mounted once by DockFrame, so it and its open chat survive moving between pages):
 * - a 56px strip of chat heads from 1024px wide (the people waiting, with counts);
 * - the panel, docked open from 1280px or over the page below that: Chats (the list, or one chat) and,
 *   on a job page, This job (the record page's Tasks card, put here by the page, and the customer's chat).
 *   Docked on a job page, Chats keeps the job's Tasks card under the list, so Tasks stay on the right.
 * Phones have no dock and make no requests.
 */

type Tab = 'job' | 'chats';
type Kept = { thread: ActiveChat | null; tab: Tab; path: string };
const KEEP = 'hx-dock-open';
/** Set once a record page in this tab has said which job it is (sessionStorage). */
const SPOKE = 'hx-dock-spoke';
const SLOT = 'hx-dock-tasks';
/** How long a job page has to say which job it is before This job gives up (once one has ever said, see SPOKE). */
const JOB_WAIT_MS = 5_000;

const WA_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.2a9.7 9.7 0 0 0-8.3 14.8L2.3 21.8l4.9-1.3A9.7 9.7 0 1 0 12 2.2zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 19.9zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3z" />
  </svg>
);

function readKept(): Kept | null {
  try {
    if (typeof window === 'undefined') return null;
    const k = JSON.parse(sessionStorage.getItem(KEEP) || 'null') as Kept | null;
    return k && (k.tab === 'job' || k.tab === 'chats') ? k : null;
  } catch {
    return null;
  }
}

const noSubscribe = () => () => {};
/** False on the server and while hydrating, true after: things kept in this tab show only once it's safe. */
const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

/** A row for the job's chat when it isn't in the active list (nothing said for 14 days). */
function rowFromJob(job: DockJob, canInbox: boolean): ActiveChat {
  const threadId = job.threadId ?? job.enquiryId;
  return {
    threadId,
    enquiryIds: job.enquiryIds.length ? job.enquiryIds : [job.enquiryId],
    unreadIds: [],
    waId: job.waId,
    name: job.name,
    phone: null,
    customerRef: job.customerRef,
    postcode: null,
    last: null,
    unread: job.unread,
    needsReply: false,
    windowClosesAt: null,
    queued: false,
    chasing: false,
    project: { id: job.projectId, ref: job.ref, stage: job.stage, title: job.name },
    hasProject: true,
    chatHref: canInbox ? `/admin/enquiries/inbox/${threadId}` : `/admin/crm/chats/${threadId}`,
  };
}

/** Is this chat the job's customer (one of their enquiries, or the same WhatsApp number)? */
const isJobsChat = (job: DockJob, row: Pick<ActiveChat, 'threadId' | 'enquiryIds' | 'waId'>) =>
  job.enquiryIds.includes(row.threadId) || row.enquiryIds.some((e) => job.enquiryIds.includes(e)) || (!!job.waId && row.waId === job.waId);

export function WhatsAppDock({
  me,
  access,
  pathname,
  state,
  overlay,
  wide1280,
  wide760,
  onOpen,
  onFold,
  onCloseOverlay,
}: {
  me: string;
  access: DockAccess;
  pathname: string;
  state: DockState;
  overlay: boolean;
  wide1280: boolean;
  wide760: boolean;
  /** Docked from 1280px (and remembered), over the page below that. */
  onOpen: () => void;
  /** Fold the docked panel to the strip (remembered). */
  onFold: () => void;
  onCloseOverlay: () => void;
}) {
  const hydrated = useHydrated();
  const now = useNow(30_000);
  const shows = state === 'open' || state === 'collapsed';
  const docked = state === 'open' && wide1280 && !overlay;
  const panel = docked || (overlay && shows);
  const { data, error } = useActiveChats(shows && wide760 && (access.inbox || access.crm));
  const rows = data?.rows ?? null;
  const canInbox = data?.canInbox ?? access.inbox;

  // What's open, kept for this browser tab so it comes back after a full page load (the CMS).
  const [kept] = useState(readKept);
  const [threadState, setThread] = useState<ActiveChat | null>(kept?.thread ?? null);
  const [tabSel, setTabSel] = useState<{ tab: Tab; path: string } | null>(kept ? { tab: kept.tab, path: kept.path } : null);
  const thread = hydrated ? threadState : null;
  const picked = hydrated ? tabSel : null;
  const [filter, setFilter] = useState<ChatFilter | null>(null);
  const [query, setQuery] = useState('');
  const [job, setJob] = useState<DockJob | null>(null);
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  const [spokeState, setSpoke] = useState(() => {
    try {
      return typeof window !== 'undefined' && sessionStorage.getItem(SPOKE) === '1';
    } catch {
      return false;
    }
  });
  /** A record page in this tab has said which job it is, so it's worth waiting for one (today's record page never does). */
  const spoke = hydrated && spokeState;
  const [focus, setFocus] = useState<{ key: number; thread: string } | null>(null);
  const [scrollTo, setScrollTo] = useState<{ thread: string; message: string } | null>(null);
  /** Just replied in this chat: "Sent ✓ · Next needing reply: …". */
  const [sent, setSent] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const opener = useRef<Element | null>(null);

  const pageJob = jobIdFromPath(pathname);
  const jobHere = job && pageJob === job.projectId ? job : null;
  const waitingForJob = spoke && !!pageJob && !jobHere && gaveUp !== pathname;
  const showJobTab = !!jobHere || waitingForJob;
  const tab: Tab = showJobTab && (picked?.path !== pathname || picked.tab === 'job') ? 'job' : 'chats';
  // The live row for the open chat (fresh counts and window), or what was kept.
  const openRow = thread ? (rows?.find((r) => r.threadId === thread.threadId) ?? thread) : null;
  const jobRow = jobHere?.threadId ? (rows?.find((r) => isJobsChat(jobHere, r)) ?? rowFromJob(jobHere, canInbox)) : null;
  // The job's Tasks stay on the right whichever tab is showing: over its chat on This job, under the
  // list or the other chat on Chats (the owner's "tasks on the right"). Where it is, for the page.
  const tasksSlot: Tab | null = docked && jobHere ? tab : null;

  // A record page that never says which job it is: stop waiting.
  useEffect(() => {
    if (!spoke || !pageJob || jobHere) return;
    const t = setTimeout(() => setGaveUp(pathname), JOB_WAIT_MS);
    return () => clearTimeout(t);
  }, [spoke, pageJob, jobHere, pathname]);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEEP, JSON.stringify({ thread: threadState, tab: tabSel?.tab ?? 'chats', path: tabSel?.path ?? '' } satisfies Kept));
    } catch {
      // Not kept: it opens on the list next time.
    }
  }, [threadState, tabSel]);

  // Tell the page (the record page's Tasks card, the CRM home) whenever anything here changes, including
  // the Tasks space moving between the tabs (the page puts its card in the new one).
  useEffect(() => {
    const detail: DockStateDetail = { state, panel, overlay, tasksSlot: tasksSlot ? SLOT : null };
    window.dispatchEvent(new CustomEvent(DOCK_EVENTS.state, { detail }));
  }, [state, panel, overlay, tasksSlot, job]);

  // The overlay takes focus when it opens and gives it back to whatever opened it when it closes.
  const wasOverlay = useRef(false);
  useEffect(() => {
    if (overlay && !wasOverlay.current) panelRef.current?.focus({ preventScroll: true });
    if (!overlay && wasOverlay.current && opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus({ preventScroll: true });
    wasOverlay.current = overlay;
  }, [overlay]);
  // Escape from anywhere closes the overlay (inside the panel it first goes back to the list).
  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      // (Not one the panel has dealt with: going back to the list takes the chat, and its reply box, away.)
      if (e.key === 'Escape' && !e.defaultPrevented && !panelRef.current?.contains(e.target as Node)) onCloseOverlay();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlay, onCloseOverlay]);

  // Where the cursor goes once a change here is on screen: the control just pressed has often gone (the
  // strip hides when the panel docks, a row gives way to its chat, the chat to the list). The first of these
  // that's there, else the panel.
  const pendingFocus = useRef<string[] | null>(null);
  useEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    pendingFocus.current = null;
    const root = panelRef.current?.parentElement;
    const el = want.map((s) => root?.querySelector<HTMLElement>(s)).find(Boolean) ?? panelRef.current;
    el?.focus({ preventScroll: true });
  });

  const show = useCallback(
    (from?: Element | null) => {
      if (!panel) {
        opener.current = from ?? document.activeElement;
        pendingFocus.current = ['.hxd__panel'];
        onOpen();
      }
    },
    [panel, onOpen]
  );

  function setTab(t: Tab) {
    setTabSel({ tab: t, path: pathname });
  }

  /** Show a chat (the caller opens the panel): the job's own customer goes to This job, anyone else to Chats. */
  function openChat(row: ActiveChat) {
    setSent(null);
    if (jobHere && isJobsChat(jobHere, row)) {
      setTab('job');
    } else {
      setThread(row);
      setTab('chats');
    }
  }

  /** From a chat back to the list, with the cursor on that chat's row (or the search box). */
  function backToList() {
    pendingFocus.current = [`.hxd-row__link[href="${openRow?.chatHref}"]`, '.hxd-search'];
    setThread(null);
    setSent(null);
  }

  // What the page asks for (window events), with today's state rather than the first render's.
  const handlers = useRef({
    open: (d: DockOpenDetail) => void d,
    job: (j: DockJob | null) => void j,
  });
  useEffect(() => {
    handlers.current = {
      open: (d) => {
        if (!shows || !wide760) return;
        const from = document.activeElement;
        let target: string | null = null;
        if (d.filter) {
          setFilter(d.filter);
          setQuery('');
          setThread(null);
          setTab('chats');
        }
        const id = d.threadId || d.enquiryId;
        if (id) {
          const row = rows?.find((r) => r.threadId === id || r.enquiryIds.includes(id));
          if (row) {
            openChat(row);
            target = jobHere && isJobsChat(jobHere, row) ? jobHere.threadId : row.threadId;
          } else if (jobHere && (jobHere.enquiryIds.includes(id) || jobHere.threadId === id)) {
            setTab('job');
            target = jobHere.threadId;
          } else {
            // Not active lately: look the customer up, then open them.
            target = d.threadId ?? null;
            void fetch(`/api/whatsapp/active?enquiry=${encodeURIComponent(id)}`, { cache: 'no-store' })
              .then((r) => (r.ok ? r.json() : null))
              .then((x: { row: ActiveChat | null } | null) => {
                if (!x?.row) return;
                if (d.draft) appendDraft(me, x.row.threadId, d.draft);
                if (d.focus) setFocus({ key: Date.now(), thread: x.row.threadId });
                if (d.messageId) setScrollTo({ thread: x.row.threadId, message: d.messageId });
                openChat(x.row);
                show(from);
              })
              .catch(() => {});
          }
        } else if (d.tab === 'job' && jobHere) {
          setTab('job');
          target = jobHere.threadId;
        } else if (d.tab === 'chats') {
          setTab('chats');
          target = thread?.threadId ?? null;
        } else {
          target = tab === 'job' ? (jobHere?.threadId ?? null) : (thread?.threadId ?? null);
        }
        if (target) {
          if (d.draft) appendDraft(me, target, d.draft);
          if (d.focus) setFocus({ key: Date.now(), thread: target });
          if (d.messageId) setScrollTo({ thread: target, message: d.messageId });
        }
        show(from);
      },
      job: (j) => {
        // Leaving the job page with its chat open: the same chat stays on screen, under Chats.
        if (!j && job && tab === 'job' && job.threadId) {
          setThread(rows?.find((r) => isJobsChat(job, r)) ?? rowFromJob(job, canInbox));
        }
        if (j && !spokeState) {
          setSpoke(true);
          try {
            sessionStorage.setItem(SPOKE, '1');
          } catch {
            // Only kept in memory.
          }
        }
        setJob(j);
      },
    };
  });

  useEffect(() => {
    const onOpenEvent = (e: Event) => handlers.current.open(((e as CustomEvent<DockOpenDetail | null>).detail ?? {}) as DockOpenDetail);
    const onJobEvent = (e: Event) => {
      const j = (e as CustomEvent<DockJob | null>).detail;
      handlers.current.job(j && typeof j.projectId === 'string' ? { ...j, enquiryIds: Array.isArray(j.enquiryIds) ? j.enquiryIds : [j.enquiryId], docs: j.docs ?? [] } : null);
    };
    window.addEventListener(DOCK_EVENTS.open, onOpenEvent);
    window.addEventListener(DOCK_EVENTS.job, onJobEvent);
    // A record page that has already loaded answers with its job.
    window.dispatchEvent(new CustomEvent(DOCK_EVENTS.ready));
    return () => {
      window.removeEventListener(DOCK_EVENTS.open, onOpenEvent);
      window.removeEventListener(DOCK_EVENTS.job, onJobEvent);
    };
  }, []);

  /** Escape: from a chat back to the list, or (with the list showing) close the overlay. Never folds the docked panel. */
  function onPanelKey(e: KeyboardEvent<HTMLElement>) {
    const el = e.target as Element;
    if (e.key !== 'Escape' || el.closest?.(`#${SLOT}`)) return;
    // An open Saved replies / Send a document list closes first (closed, each is just its toggle button).
    const picker = el.closest?.('.wa-pane__chips .crm-snippets');
    if (picker && picker.childElementCount > 1) {
      const toggle = picker.firstElementChild as HTMLElement | null;
      e.preventDefault();
      toggle?.click();
      toggle?.focus();
      return;
    }
    // Esc on the Chase select belongs to the select (some browsers pass it on from the open list).
    if (el.tagName === 'SELECT') return;
    if (tab === 'chats' && thread) {
      e.preventDefault();
      backToList();
    } else if (overlay) {
      e.preventDefault();
      onCloseOverlay();
    }
  }

  // Chat heads: this job's customer, the chat open in the panel, then unread (newest first), then waiting for a reply.
  type Head = { key: string; name: string; unread: number; needsReply: boolean; row: ActiveChat; job?: boolean };
  const heads: Head[] = [];
  const addHead = (h: Head) => {
    if (heads.length < 6 && !heads.some((x) => x.row.threadId === h.row.threadId || (x.job && jobHere && isJobsChat(jobHere, h.row)))) heads.push(h);
  };
  if (jobHere && jobRow) addHead({ key: 'job', name: jobHere.name, unread: jobRow.unread, needsReply: jobRow.needsReply, row: jobRow, job: true });
  if (openRow) addHead({ key: openRow.threadId, name: openRow.name, unread: openRow.unread, needsReply: openRow.needsReply, row: openRow });
  for (const r of rows ?? []) if (r.unread > 0) addHead({ key: r.threadId, name: r.name, unread: r.unread, needsReply: r.needsReply, row: r });
  for (const r of rows ?? []) if (r.needsReply) addHead({ key: r.threadId, name: r.name, unread: r.unread, needsReply: true, row: r });
  const unreadPeople = data?.counts.unread ?? 0;

  const wrongCustomer = jobHere && openRow && tab === 'chats' && !isJobsChat(jobHere, openRow);
  const nextUp = sent ? (rows ?? []).find((r) => r.needsReply && r.threadId !== sent) : undefined;
  const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;
  const paneFocus = (t: string | null | undefined) => (focus && t && focus.thread === t ? focus.key : undefined);
  const paneScroll = (t: string | null | undefined) => (scrollTo && t && scrollTo.thread === t ? scrollTo.message : null);
  const allChats = canInbox ? { href: '/admin/enquiries/inbox', label: 'Inbox ↗' } : { href: '/admin/crm/chats', label: 'All chats ↗' };

  return (
    <aside
      id="hx-dock"
      className="hxd"
      data-state={state}
      data-panel={panel ? '1' : undefined}
      hidden={!shows}
      aria-label="WhatsApp"
    >
      <nav className="hxd__strip" aria-label="WhatsApp chats">
        <button type="button" className="hxd__logo" aria-label="Open WhatsApp" title="Open WhatsApp" onClick={(e) => show(e.currentTarget)}>
          {WA_ICON}
        </button>
        <ul className="hxd__heads">
          {heads.map((h) => {
            const label = `${h.name}${h.unread ? `, ${h.unread} unread` : h.needsReply ? ', waiting for a reply' : ''}${h.job ? ' (this job)' : ''}`;
            return (
              <li key={h.key}>
                <button
                  type="button"
                  className={h.unread ? 'hxd-head ring' : h.job ? 'hxd-head is-job' : 'hxd-head'}
                  aria-label={label}
                  title={label}
                  onClick={(e) => {
                    openChat(h.row);
                    show(e.currentTarget);
                  }}
                >
                  {initialsOf(h.name)}
                  {h.unread > 0 && <b>{h.unread > 9 ? '9+' : h.unread}</b>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="hxd__foot">
          {unreadPeople > 0 && (
            <span className="hxd__total">
              {unreadPeople}
              <br />
              unread
            </span>
          )}
          <button type="button" className="hxd__toggle" aria-label="Open WhatsApp" title="Open WhatsApp" onClick={(e) => show(e.currentTarget)}>
            «
          </button>
        </div>
      </nav>

      {overlay && shows && <div className="hxd__scrim" onClick={onCloseOverlay} aria-hidden="true" />}

      <section
        ref={panelRef}
        className="hxd__panel"
        role={overlay ? 'dialog' : undefined}
        aria-label="WhatsApp"
        tabIndex={-1}
        onKeyDown={onPanelKey}
      >
        <header className="hxd__head">
          <span className="hxd__waic" aria-hidden="true">
            {WA_ICON}
          </span>
          <div className="hxd__tabs" role="tablist" aria-label="WhatsApp">
            {showJobTab && (
              <button type="button" role="tab" aria-selected={tab === 'job'} className={tab === 'job' ? 'on' : ''} onClick={() => setTab('job')}>
                This job{jobHere ? ` · ${firstName(jobHere.name)}` : ''}
                {jobRow && jobRow.unread > 0 && <em>{jobRow.unread}</em>}
              </button>
            )}
            <button type="button" role="tab" aria-selected={tab === 'chats'} className={tab === 'chats' ? 'on' : ''} onClick={() => setTab('chats')}>
              Chats{unreadPeople > 0 && <em>{unreadPeople}</em>}
            </button>
          </div>
          <Link href={allChats.href} className="hxd__all">
            {allChats.label}
          </Link>
          {overlay ? (
            <button type="button" className="hxd__fold" aria-label="Close WhatsApp" title="Close" onClick={onCloseOverlay}>
              ✕
            </button>
          ) : (
            <button
              type="button"
              className="hxd__fold"
              aria-label="Fold away"
              title="Fold away"
              onClick={() => {
                pendingFocus.current = ['.hxd__toggle'];
                onFold();
              }}
            >
              »
            </button>
          )}
        </header>

        {data && !data.configured && (
          <p className="hxd-banner">WhatsApp isn’t connected yet, so sending is off until the Meta keys are added. The chat history still shows.</p>
        )}

        {tab === 'job' ? (
          <div className="hxd__body hxd__body--job" role="tabpanel">
            {tasksSlot === 'job' && <div id={SLOT} data-where="job" className="hxd__tasks" />}
            {!jobHere ? (
              <p className="hxd-empty">Loading this job…</p>
            ) : jobHere.threadId ? (
              <div className="hxd__chat">
                <ThreadBar row={jobRow} name={jobHere.name} canCrm={access.crm} onJobPage />
                {panel && (
                  <ChatPane
                    key={jobHere.threadId}
                    threadId={jobHere.threadId}
                    me={me}
                    variant="dock"
                    active={panel && tab === 'job'}
                    projectId={access.crm ? jobHere.projectId : null}
                    docs={access.crm ? jobHere.docs : undefined}
                    canInbox={canInbox}
                    canCrm={access.crm}
                    focusKey={paneFocus(jobHere.threadId)}
                    scrollToMessage={paneScroll(jobHere.threadId)}
                    alsoRead={jobRow?.unreadIds}
                  />
                )}
              </div>
            ) : (
              <div className="hxd-nomobile">
                <p>Add their mobile to message them on WhatsApp.</p>
                <button
                  type="button"
                  className="hxd-btn"
                  onClick={() => {
                    const detail: DockActionDetail = { action: 'edit-customer', projectId: jobHere.projectId };
                    window.dispatchEvent(new CustomEvent(DOCK_EVENTS.action, { detail }));
                    if (overlay) onCloseOverlay();
                  }}
                >
                  Add mobile
                </button>
              </div>
            )}
          </div>
        ) : openRow ? (
          <div className="hxd__body hxd__chat" role="tabpanel">
            <ThreadBar
              row={openRow}
              name={openRow.name}
              canCrm={access.crm}
              onBack={backToList}
            />
            {sent === openRow.threadId && (
              <p className="hxd-sent" role="status">
                Sent ✓
                {nextUp && (
                  <>
                    {' · Next needing reply: '}
                    <button
                      type="button"
                      onClick={() => {
                        pendingFocus.current = ['.hxd-back'];
                        openChat(nextUp);
                      }}
                    >
                      {nextUp.name}
                      {nextUp.last ? ` (${shortWait(nextUp.last.at, now)})` : ''} →
                    </button>
                  </>
                )}
              </p>
            )}
            {panel && (
              <ChatPane
                key={openRow.threadId}
                threadId={openRow.threadId}
                me={me}
                variant="dock"
                active={panel && tab === 'chats'}
                projectId={access.crm ? (openRow.project?.id ?? null) : null}
                canInbox={canInbox}
                canCrm={access.crm}
                focusKey={paneFocus(openRow.threadId)}
                scrollToMessage={paneScroll(openRow.threadId)}
                alsoRead={openRow.unreadIds}
                onSent={() => setSent(openRow.threadId)}
                notice={
                  wrongCustomer && jobHere ? (
                    <div className="hxd-wrong" role="note">
                      <span>
                        You’re on {jobHere.name}’s job. This chat is with {openRow.name}.
                      </span>
                      <button type="button" onClick={() => setTab('job')}>
                        Back to {firstName(jobHere.name)}’s chat
                      </button>
                    </div>
                  ) : null
                }
              />
            )}
          </div>
        ) : (
          <div className="hxd__body" role="tabpanel">
            <ChatList
              mode="dock"
              rows={rows}
              counts={data?.counts}
              error={error}
              canCrm={access.crm}
              filter={filter}
              onFilter={setFilter}
              query={query}
              onQuery={setQuery}
              onOpen={(row, from) => {
                pendingFocus.current = ['.hxd-back'];
                openChat(row);
                show(from);
              }}
            />
          </div>
        )}
        {tasksSlot === 'chats' && <div id={SLOT} data-where="chats" className="hxd__tasks hxd__tasks--chats" />}
      </section>
    </aside>
  );
}

/** "1h", "20m": how long they've been waiting. */
function shortWait(iso: string, now: number) {
  const mins = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60_000));
  return mins < 60 ? `${mins}m` : mins < 48 * 60 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
}

