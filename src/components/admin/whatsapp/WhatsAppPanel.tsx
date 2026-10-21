'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { stageLabel } from '@/lib/crm/stages';
import { nameRank } from '@/lib/search-words';
import { useNow } from '@/lib/use-now';
import { shownBody } from '@/lib/whatsapp/describe';
import { chatMatches, initialsOf, mergeChats, shortAgo, windowPill, type ActiveChat, type ActiveCounts, type ChatFilter } from './dock-shared';
import { useActiveChats } from './use-active-chats';
import { useAllChats, useChatSearch } from './use-all-chats';
import './dock.css';

/**
 * The WhatsApp chat list and the bar above an open chat, shared by the dock's Chats tab and the CRM's
 * own chats page (/admin/crm/chats, for CRM staff without the Enquiries inbox). The chips work on the
 * live list (the last 14 days), except All chats: everyone with WhatsApp history, imported chats too.
 * The search box looks through all of them.
 */

const FILTERS: [ChatFilter, string, keyof ActiveCounts | null][] = [
  ['needs_reply', 'Needs reply', 'needsReply'],
  ['unread', 'Unread', 'unread'],
  ['all', 'All active', 'active'],
  ['waiting', 'Waiting on them', 'waiting'],
  ['everyone', 'All chats', null],
];
const PAGE = 15;

const keep: Record<ChatFilter, (r: ActiveChat) => boolean> = {
  needs_reply: (r) => r.needsReply,
  unread: (r) => r.unread > 0,
  all: () => true,
  waiting: (r) => r.last?.direction === 'out',
  everyone: () => true,
};

/** Needs reply while anyone does, otherwise everyone. */
export const defaultFilter = (counts: ActiveCounts | undefined): ChatFilter => (counts && counts.needsReply > 0 ? 'needs_reply' : 'all');

/** A plain click (not Ctrl, ⌘, Shift or the middle button), which the dock keeps for itself. */
export const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** The ref shown beside a name: the job's, else the customer's, else the postcode. */
export const refOf = (r: Pick<ActiveChat, 'project' | 'customerRef' | 'postcode'>) => r.project?.ref || r.customerRef || r.postcode || '';

function preview(r: ActiveChat) {
  const l = r.last;
  if (!l) return 'No messages yet';
  const what =
    shownBody(l.body)?.trim() ||
    (l.kind === 'image' ? 'Photo' : l.kind === 'document' ? 'Document' : l.kind === 'audio' ? 'Voice note' : l.kind === 'video' ? 'Video' : l.kind === 'template' ? 'Template' : 'Message');
  return `${l.direction === 'out' ? 'You: ' : ''}${what}`;
}

export function StageChip({ stage }: { stage: string | null | undefined }) {
  if (!stage) return null;
  // The title shows the whole stage when the chip is cut short.
  return (
    <span className={`hxd-stage hxd-st-${stage}`} title={stageLabel(stage)}>
      {stageLabel(stage)}
    </span>
  );
}

export function WindowPill({ closesAt, now }: { closesAt: string | null; now: number }) {
  const w = windowPill(closesAt, now);
  return <span className={w.open ? 'hxd-win hxd-win--ok' : 'hxd-win'}>{w.label}</span>;
}

type ListProps = {
  mode: 'dock' | 'page';
  rows: ActiveChat[] | null;
  counts?: ActiveCounts;
  error?: string;
  canCrm: boolean;
  filter: ChatFilter | null;
  onFilter: (f: ChatFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  /** Dock: open the chat in the panel (a plain click; Ctrl-click still opens a new tab). */
  onOpen?: (row: ActiveChat, from: HTMLElement) => void;
};

/** Filter chips, the search box and the rows, 15 at a time. */
export function ChatList({ mode, rows, counts, error, canCrm, filter, onFilter, query, onQuery, onOpen }: ListProps) {
  const now = useNow(30_000);
  const router = useRouter();
  const [shown, setShown] = useState(PAGE);
  const [making, setMaking] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const f = filter ?? defaultFilter(counts);
  const all = rows ?? [];
  const searching = query.trim().length > 0;
  const everyone = useAllChats(f === 'everyone' && !searching);
  const found = useChatSearch(query);
  // A search looks through every chat (what's loaded now, then the server's answer), names the words
  // start first; the chips narrow the live list, and All chats lays it over everyone else.
  const list = searching
    ? mergeChats(mergeChats(all, everyone.rows ?? []).filter((r) => chatMatches(query, r)), found.rows).sort((a, b) => nameRank(query, a.name) - nameRank(query, b.name))
    : f === 'everyone'
      ? mergeChats(all, everyone.rows ?? [])
      : all.filter(keep[f]);
  const pick = (key: ChatFilter) => {
    onQuery('');
    onFilter(key);
    setShown(PAGE);
    // All chats again: fresh from the server.
    if (key === 'everyone') everyone.reload();
  };

  /** "Not in the CRM": makes an opportunity for them (or opens the one they have) and goes there. */
  async function createOpportunity(r: ActiveChat) {
    setMaking(r.threadId);
    setProblem('');
    try {
      const res = await fetch('/api/crm/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enquiry_id: r.threadId, open_existing: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.id) throw new Error(d.error || 'Could not create the opportunity');
      router.push(`/admin/crm/${d.id}`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not create the opportunity');
    } finally {
      setMaking(null);
    }
  }

  const olderChats = (text: string) => (
    <button type="button" className="hxd-more" onClick={() => pick('everyone')}>
      {text}
    </button>
  );

  let body: ReactNode;
  if (rows === null) body = <p className="hxd-empty">{error || 'Loading chats…'}</p>;
  else if (!list.length && searching)
    body = <p className="hxd-empty">{found.pending ? 'Searching every chat…' : `No chats match “${query.trim()}”.`}</p>;
  else if (!list.length && f === 'everyone')
    // A page can come back with nobody this person may see (CRM staff only see customers with a job),
    // so older chats are still offered.
    body = (
      <>
        <p className="hxd-empty">
          {everyone.error || (everyone.rows === null ? 'Loading every chat…' : everyone.hasMore ? 'Nobody to show in the newest chats.' : 'No WhatsApp chats yet.')}
        </p>
        {everyone.hasMore && (
          <button type="button" className="hxd-more" disabled={everyone.busy} onClick={() => void everyone.more()}>
            {everyone.busy ? 'Loading…' : 'Show older chats'}
          </button>
        )}
      </>
    );
  // Only while the live list is what's showing: All chats and a search draw their own rows below.
  else if (!all.length && !searching && f !== 'everyone')
    body = (
      <>
        <p className="hxd-empty">No WhatsApp chats in the last 14 days.</p>
        {olderChats('See all chats, imported ones too →')}
      </>
    );
  else if (!list.length)
    body = <p className="hxd-empty">{f === 'needs_reply' ? 'All replied ✓' : f === 'unread' ? 'Nothing unread.' : 'Nobody here right now.'}</p>;
  else
    body = (
      <>
        <ul className={mode === 'page' ? 'hxd-rows hxd-rows--page' : 'hxd-rows'}>
          {list.slice(0, shown).map((r) => {
            const href = mode === 'page' ? `/admin/crm/chats/${r.threadId}` : r.chatHref;
            const ref = refOf(r);
            return (
              <li key={r.threadId} className={r.unread ? 'hxd-row is-unread' : 'hxd-row'}>
                <Link
                  href={href}
                  className="hxd-row__link"
                  onClick={(e) => {
                    if (!onOpen || !plainClick(e)) return;
                    e.preventDefault();
                    onOpen(r, e.currentTarget);
                  }}
                >
                  <span className={r.unread ? 'hxd-av ring' : 'hxd-av'} aria-hidden="true">
                    {initialsOf(r.name)}
                  </span>
                  <span className="hxd-row__b">
                    <span className="hxd-row__h">
                      <b>{r.name}</b>
                      <StageChip stage={r.project?.stage} />
                      {ref && <span className="hxd-ref">{ref}</span>}
                      <time dateTime={r.last?.at}>{shortAgo(r.last?.at, now)}</time>
                    </span>
                    <span className="hxd-row__p">
                      <span>{preview(r)}</span>
                      {r.unread > 0 && <span className="hxd-count" aria-label={`${r.unread} unread`}>{r.unread}</span>}
                    </span>
                    <span className="hxd-row__f">
                      <WindowPill closesAt={r.windowClosesAt} now={now} />
                      {r.queued && <span className="hxd-chip">Reply queued</span>}
                      {r.chasing && <span className="hxd-chip hxd-chip--chase">Chasing</span>}
                      {canCrm && !r.hasProject && <span className="hxd-nocrm">Not in the CRM</span>}
                    </span>
                  </span>
                </Link>
                {canCrm && r.project && (
                  <Link href={`/admin/crm/${r.project.id}`} className="hxd-row__act hxd-row__job">
                    Open job ↗
                  </Link>
                )}
                {canCrm && !r.hasProject && (
                  <button type="button" className="hxd-row__act hxd-row__make" disabled={making === r.threadId} onClick={() => createOpportunity(r)}>
                    {making === r.threadId ? 'Creating…' : 'Create opportunity'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {list.length > shown ? (
          <button type="button" className="hxd-more" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({list.length - shown})
          </button>
        ) : searching ? (
          found.pending && <p className="hxd-empty hxd-empty--more">Searching every chat…</p>
        ) : f === 'everyone' ? (
          everyone.hasMore && (
            <button type="button" className="hxd-more" disabled={everyone.busy} onClick={() => void everyone.more().then(() => setShown((n) => n + PAGE))}>
              {everyone.busy ? 'Loading…' : 'Show older chats'}
            </button>
          )
        ) : (
          f === 'all' && olderChats('Older chats, imported ones too: All chats →')
        )}
      </>
    );

  return (
    <div className={mode === 'page' ? 'hxd-list hxd-list--page' : 'hxd-list'}>
      <div className="hxd-list__tools">
        <div className="hxd-filters" role="group" aria-label="Show">
          {FILTERS.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              className={!searching && f === key ? 'on' : ''}
              aria-pressed={!searching && f === key}
              onClick={() => pick(key)}
            >
              {label}
              {counts && count && <span>{counts[count]}</span>}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="hxd-search"
          placeholder="Search every chat: name, number or HX-ref"
          aria-label="Search every chat by name, number or HX-ref"
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
            setShown(PAGE);
          }}
        />
      </div>
      {problem && <p className="hxd-problem">{problem}</p>}
      {error && rows !== null && <p className="hxd-problem">{error}</p>}
      <div className="hxd-list__body">{body}</div>
    </div>
  );
}

/** The bar above an open chat: back to the list, who it is, their job, and the full chat. */
export function ThreadBar({
  row,
  name,
  canCrm,
  onBack,
  onJobPage,
}: {
  row: ActiveChat | null;
  /** While the row hasn't loaded (a chat opened from elsewhere). */
  name: string;
  canCrm: boolean;
  /** "← All chats"; left out on This job. */
  onBack?: () => void;
  /** On the job's own page, so no "Open job". */
  onJobPage?: boolean;
}) {
  const now = useNow(30_000);
  const ref = row ? refOf(row) : '';
  return (
    <div className="hxd-tbar">
      <div className="hxd-tbar__a">
        {onBack && (
          <button type="button" className="hxd-back" onClick={onBack}>
            ← All chats
          </button>
        )}
        <b title={row?.name ?? name}>{row?.name ?? name}</b>
        <StageChip stage={row?.project?.stage} />
        {canCrm && row?.project && !onJobPage && (
          <Link href={`/admin/crm/${row.project.id}`} className="hxd-tbar__job">
            Open job
          </Link>
        )}
      </div>
      {row && (
        <div className="hxd-tbar__b">
          <WindowPill closesAt={row.windowClosesAt} now={now} />
          {ref && <span className="hxd-ref">{ref}</span>}
          <Link href={row.chatHref} className="hxd-tbar__full">
            Full chat ↗
          </Link>
        </div>
      )}
    </div>
  );
}

/** /admin/crm/chats: the list as a page (the dock is hidden there), each row opening the chat page. */
export function WhatsAppChats({ canCrm }: { canCrm: boolean }) {
  const { data, error } = useActiveChats(true, 100);
  const [filter, setFilter] = useState<ChatFilter | null>(null);
  const [query, setQuery] = useState('');
  return (
    <>
      {data && !data.configured && (
        <p className="hxd-banner">WhatsApp isn’t connected yet, so sending is off until the Meta keys are added. The chat history still shows.</p>
      )}
      <ChatList
        mode="page"
        rows={data?.rows ?? (error ? [] : null)}
        counts={data?.counts}
        error={error}
        canCrm={canCrm}
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
      />
    </>
  );
}
