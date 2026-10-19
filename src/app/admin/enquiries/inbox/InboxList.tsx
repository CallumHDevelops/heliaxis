'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PushBanner } from '@/components/admin/PushBanner';
import { refMatches, relativeTime } from '@/lib/enquiries';
import { NOTIFICATIONS_CHANGED } from '@/lib/notification-refs';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { windowOpen } from '@/lib/whatsapp/shared';
import '../whatsapp.css';

type Convo = {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  whatsapp_opt_in: boolean;
  wa_last_inbound_at: string | null;
  wa_last_message_at: string | null;
  wa_unread: number;
  created_at: string;
  /** HX-0042 (customer-refs.sql); null until it's been run. */
  customer_ref?: string | null;
  last: { direction: string; body: string | null } | null;
  queued: boolean;
  chasing: boolean;
};

type Filter = 'all' | 'reply' | 'waiting';
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['reply', 'Needs reply'],
  ['waiting', 'Waiting on them'],
];
const needsReply = (c: Convo) => c.last?.direction === 'in' && !c.queued;
const waitingOnThem = (c: Convo) => c.last?.direction === 'out' || (!c.last && c.chasing);

export function InboxList() {
  const [items, setItems] = useState<Convo[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [now, setNow] = useState(() => Date.now());
  /** The last full list's version: polls send it, and get { same: true } if nothing changed. */
  const version = useRef('');

  const load = useCallback(async (full: boolean) => {
    try {
      const r = await fetch(`/api/whatsapp/conversations${!full && version.current ? `?v=${version.current}` : ''}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load the inbox');
      if (!d.same) {
        // Something changed (a new message, or a chat read elsewhere): the bell catches up too.
        if (version.current && d.v !== version.current) window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
        setItems(d.items);
        setConfigured(d.configured);
        version.current = d.v || '';
      }
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the inbox');
      setItems((prev) => prev ?? []);
      return false;
    }
  }, []);

  // New chats, messages and unread counts show up by themselves (every 12s while it's on screen).
  const { refresh, busy } = useLiveRefresh(load, 12_000);
  // "5m ago" and the 24h window move on even when nothing new arrives.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const shown = (items ?? []).filter(
    (c) =>
      (!q || `${c.name} ${c.phone || ''}`.toLowerCase().includes(q.trim().toLowerCase()) || refMatches(c.customer_ref, q)) &&
      (filter === 'all' || (filter === 'reply' ? needsReply(c) : waitingOnThem(c)))
  );
  const count = (f: Filter) => (items ?? []).filter(f === 'reply' ? needsReply : f === 'waiting' ? waitingOnThem : () => true).length;

  return (
    <div className="wa-page">
      <div className="wa-top">
        <Link href="/admin/enquiries" className="wa-back">← Enquiries</Link>
        <span className="wa-top-actions">
          <Link href="/admin/enquiries/smart-replies" className="wa-link">Smart replies</Link>
          <button type="button" className="wa-refresh" onClick={refresh} disabled={busy}>
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </span>
      </div>
      <h1 className="wa-h1">WhatsApp</h1>
      <PushBanner />
      {!configured && (
        <p className="wa-banner">
          WhatsApp isn’t connected yet — conversations will appear here once the Meta keys are added
          (see WHATSAPP_SETUP.md).
        </p>
      )}
      {error && <p className="wa-banner wa-banner--err">{error}</p>}
      <input
        className="wa-search"
        placeholder={items?.some((c) => c.customer_ref) ? 'Search name, number or HX-0042' : 'Search name or number'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="wa-filters">
        {FILTERS.map(([f, label]) => (
          <button key={f} type="button" className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {label} <span>{count(f)}</span>
          </button>
        ))}
      </div>
      {items === null ? (
        <p className="wa-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="wa-muted">No WhatsApp conversations yet. Leads who message you, or opt in on a Meta form, show up here.</p>
      ) : (
        <ul className="wa-list">
          {shown.map((c) => {
            const open = windowOpen(c.wa_last_inbound_at, now);
            const preview = c.last
              ? `${c.last.direction === 'out' ? 'You: ' : ''}${c.last.body || ''}`
              : 'Opted in — not messaged yet';
            return (
              <li key={c.id}>
                <Link href={`/admin/enquiries/inbox/${c.id}`} className={`wa-row${c.wa_unread ? ' unread' : ''}`}>
                  <span className="wa-avatar">{(c.name || '?').slice(0, 1).toUpperCase()}</span>
                  <span className="wa-row-main">
                    <span className="wa-row-top">
                      <b>{c.name}</b>
                      {c.customer_ref && <span className="wa-ref">{c.customer_ref}</span>}
                      <span className="wa-time">{relativeTime(c.wa_last_message_at || c.created_at)}</span>
                    </span>
                    <span className="wa-row-bottom">
                      <span className="wa-preview">{preview}</span>
                      {c.queued && <span className="wa-chip">⏱ reply queued</span>}
                      {c.chasing && <span className="wa-chip wa-chip--chase">↻ chasing</span>}
                      {c.wa_unread > 0 && <span className="wa-badge">{c.wa_unread}</span>}
                    </span>
                    {!open && c.last && <span className="wa-closed">24h window closed · template only</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
