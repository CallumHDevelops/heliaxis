'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FEED_CHIPS, type FeedChip, type FeedKind } from '@/lib/projects/feed';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { Icon, JobPicker, Sheet, StageChip, WaIcon } from './CrmUi';
import { dayLabel, ukTime, type PipelineProject } from './crm-shared';
import { openDock } from './dock-link';
import { useStored } from './use-stored';

type Note = {
  id: string;
  kind: FeedKind;
  type: string;
  body: string | null;
  at: string;
  day: string;
  milestone: boolean;
  by: { id: string; name: string; initials: string } | null;
  meta: Record<string, unknown> | null;
  project: { id: string; title: string; stage: string; ref: string | null } | null;
  customer: { id: string; name: string; ref: string | null; postcode: string | null } | null;
};

const CHIP_LABEL: Record<FeedChip, string> = {
  note: 'Notes',
  call: 'Calls',
  visit: 'Site visits',
  survey: 'Surveys',
  email: 'Emails',
  doc: 'Docs & signatures',
};
const KIND_LABEL: Record<FeedKind, string> = {
  note: 'Note',
  call: 'Call',
  visit: 'Site visit',
  survey: 'Survey',
  email: 'Email',
  doc: 'Document',
  stage: '',
  update: 'Update',
};
const WHO = ['all', 'mine'] as const;
const PAGE = 30;

/**
 * Latest notes on the CRM home: notes, calls, site visits, surveys, emails and signed documents from
 * every job, newest first, in UK days (GET /api/crm/activity). Stage moves only with "Stage changes"
 * on (milestones always show). It refreshes when you come back to the tab and every minute while
 * it's on screen. Clicking a note opens the job at that entry.
 */
export function LatestNotes({
  me,
  projects,
  today,
  onChanged,
  refreshKey,
}: {
  me: string;
  projects: PipelineProject[];
  today: string;
  onChanged: () => void;
  /** A new number: a note was added from the page's + button, so load again now. */
  refreshKey: number;
}) {
  const [who, setWho] = useStored(`hx-crm-notes:${me.slice(0, 8)}`, 'all', WHO);
  const [chip, setChip] = useState<FeedChip | 'all'>('all');
  const [stages, setStages] = useState(false);
  // `extra`: more pages loaded by hand, which a refresh keeps (new notes go on top).
  const [feed, setFeed] = useState<{ key: string; items: Note[]; next: string | null; extra: boolean } | null>(null);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState(false);
  const key = `${who}|${chip}|${stages ? 1 : 0}`;

  const url = useCallback(
    (before?: string | null) => {
      const p = new URLSearchParams({ limit: String(PAGE) });
      if (chip !== 'all') p.set('kinds', chip);
      if (who === 'mine') p.set('mine', '1');
      if (stages) p.set('stages', '1');
      if (before) p.set('before', before);
      return `/api/crm/activity?${p}`;
    },
    [chip, who, stages]
  );

  // The first page, fresh.
  const load = useCallback(async () => {
    try {
      const r = await fetch(url(), { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load the notes');
      const items = (d.items ?? []) as Note[];
      setFeed((f) => {
        if (!f || f.key !== key || !f.extra) return { key, items, next: d.next ?? null, extra: false };
        const fresh = new Set(items.map((i) => i.id));
        return { key, items: [...items, ...f.items.filter((i) => !fresh.has(i.id))], next: f.next, extra: true };
      });
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the notes');
      return false;
    }
  }, [url, key]);
  const { reload } = useLiveRefresh(load, 60_000);
  // Something was added from the page's + button: show it now.
  useEffect(() => {
    if (refreshKey) void reload();
  }, [refreshKey, reload]);

  async function loadMore() {
    if (!feed?.next) return;
    setBusy(true);
    try {
      const r = await fetch(url(feed.next), { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) {
        const seen = new Set(feed.items.map((i) => i.id));
        const items = [...feed.items, ...((d.items ?? []) as Note[]).filter((i) => !seen.has(i.id))];
        setFeed({ key, items, next: d.next ?? null, extra: true });
      }
    } finally {
      setBusy(false);
    }
  }

  const items = feed?.key === key ? feed.items : null;
  // Grouped by UK day. Phones show the first 10 until "More notes" (`extra` marks the rest).
  const days: { day: string; items: { n: Note; extra: boolean }[]; extra: boolean }[] = [];
  (items ?? []).forEach((n, i) => {
    const last = days[days.length - 1];
    const extra = i >= 10;
    if (last && last.day === n.day) last.items.push({ n, extra });
    else days.push({ day: n.day, items: [{ n, extra }], extra });
  });

  return (
    <section className={`crmh-card crmh-notes${more ? ' is-more' : ''}`} aria-label="Latest notes">
      <div className="crmh-card__h crmh-notes__h">
        <h3>Latest notes</h3>
        <div className="crmh-tog" role="group" aria-label="Whose notes">
          <button type="button" className={who === 'all' ? 'on' : ''} aria-pressed={who === 'all'} onClick={() => setWho('all')}>
            Everyone
          </button>
          <button type="button" className={who === 'mine' ? 'on' : ''} aria-pressed={who === 'mine'} onClick={() => setWho('mine')}>
            Mine
          </button>
        </div>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small crmh-ml" onClick={() => setAdding(true)}>
          + Note
        </button>
      </div>
      <div className="crmh-notes__filters">
        <div className="crmh-chipsrow" role="group" aria-label="Kinds">
          <button type="button" className={`crmh-chipf${chip === 'all' ? ' on' : ''}`} aria-pressed={chip === 'all'} onClick={() => setChip('all')}>
            All
          </button>
          {FEED_CHIPS.map((c) => (
            <button key={c} type="button" className={`crmh-chipf${chip === c ? ' on' : ''}`} aria-pressed={chip === c} onClick={() => setChip(c)}>
              {CHIP_LABEL[c]}
            </button>
          ))}
        </div>
        <label className="crmh-switch">
          <input type="checkbox" checked={stages} onChange={(e) => setStages(e.target.checked)} />
          <span aria-hidden="true" />
          Stage changes
        </label>
      </div>

      {error && <p className="crm-banner crm-banner--err crmh-pad">{error}</p>}
      {!items ? (
        <p className="crm-muted crmh-pad">Loading…</p>
      ) : items.length === 0 ? (
        <p className="crm-muted crmh-pad crmh-empty">Notes, calls and site-visit notes from every job show here.</p>
      ) : (
        <div className="crmh-feed">
          {days.map((d) => (
            <div key={d.day} className={`crmh-day${d.extra ? ' is-extra' : ''}`}>
              <div className="crmh-day__h">{dayLabel(d.day, today)}</div>
              {d.items.map(({ n, extra }) => (
                <NoteRow key={n.id} n={n} extra={extra} open={open.has(n.id)} onMore={() => setOpen((o) => new Set(o).add(n.id))} />
              ))}
            </div>
          ))}
        </div>
      )}
      {items && items.length > 0 && (
        <div className="crmh-notes__foot">
          {/* Phones show 10 at first. */}
          {!more && items.length > 10 && (
            <button type="button" className="crmh-loadmore crmh-phone-only" onClick={() => setMore(true)}>
              More notes →
            </button>
          )}
          {feed?.next && (
            <button type="button" className={`crmh-loadmore${!more && items.length > 10 ? ' crmh-wide-only' : ''}`} disabled={busy} onClick={() => void loadMore()}>
              {busy ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}

      {adding && (
        <NoteSheet
          projects={projects}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void reload();
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function NoteRow({ n, extra, open, onMore }: { n: Note; extra: boolean; open: boolean; onMore: () => void }) {
  const job = n.project;
  const href = job ? `/admin/crm/${job.id}?tab=activity&entry=${n.id}` : null;
  const from = typeof n.meta?.from === 'string' ? n.meta.from : null;
  const to = typeof n.meta?.to === 'string' ? n.meta.to : null;
  const name = n.customer?.name || job?.title || 'Customer';
  const ref = job?.ref || n.customer?.ref || n.customer?.postcode || null;
  const body = (n.body ?? '').trim();
  const long = body.length > 220;
  const stageMove = n.kind === 'stage' && from && to;
  return (
    <article className={`crmh-note${n.milestone ? ' is-milestone' : ''}${extra ? ' is-extra' : ''}`}>
      <span className={`crmh-av${!n.by ? ' crmh-av--sys' : ''}${n.milestone ? ' crmh-av--ok' : ''}`} aria-hidden="true">
        {n.milestone ? <Icon k="check" size={15} /> : n.by ? n.by.initials : n.kind === 'stage' ? '→' : '•'}
      </span>
      <div className="crmh-note__b">
        <div className="crmh-note__h">
          {KIND_LABEL[n.kind] && <span className="crmh-kind">{KIND_LABEL[n.kind]}</span>}
          {href ? (
            <Link href={href} className="crmh-cust">
              {name}
            </Link>
          ) : (
            <b className="crmh-cust">{name}</b>
          )}
          {ref && <span className="crmh-ref">{ref}</span>}
          {stageMove ? (
            <>
              <StageChip stage={from} />
              <span aria-hidden="true">→</span>
              <StageChip stage={to} />
            </>
          ) : (
            job && <StageChip stage={job.stage} />
          )}
          <time dateTime={n.at}>
            {ukTime(n.at)}
            {n.by ? ` · ${n.by.name.split(/\s+/)[0]}` : ''}
          </time>
        </div>
        {!stageMove && body && (
          <p className={`crmh-note__p${open ? ' open' : ''}`}>
            {open || !long ? body : `${body.slice(0, 220).trimEnd()}…`}
            {long && !open && (
              <>
                {' '}
                <button type="button" className="crmh-more" onClick={onMore}>
                  more
                </button>
              </>
            )}
          </p>
        )}
      </div>
      {n.customer && (
        <button
          type="button"
          className="crmh-act crmh-act--wa crmh-note__wa"
          title={`WhatsApp ${name}`}
          aria-label={`WhatsApp ${name}`}
          onClick={() => {
            if (!openDock({ enquiryId: n.customer!.id, tab: 'chats' }) && href) window.location.assign(href);
          }}
        >
          <WaIcon size={15} />
        </button>
      )}
    </article>
  );
}

/** "+ Note": pick the customer's job, say what it was, write it. */
export function NoteSheet({
  projects,
  kind: startKind = 'note',
  onClose,
  onSaved,
}: {
  projects: PipelineProject[];
  kind?: 'note' | 'call' | 'visit';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [job, setJob] = useState<PipelineProject | null>(null);
  const [kind, setKind] = useState<'note' | 'call' | 'visit'>(startKind);
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!job || !body.trim()) return;
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/projects/${job.id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, body: body.trim() }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) onSaved();
    else setErr(d.error || 'Not saved. Try again.');
  }
  return (
    <Sheet title={startKind === 'call' ? 'Log a call' : 'Add a note'} onClose={onClose}>
      <label className="crm-label">Customer</label>
      <JobPicker projects={projects} value={job} onChange={setJob} autoFocus />
      <label className="crm-label">What was it?</label>
      <div className="crm-checks">
        {(
          [
            ['note', 'Note'],
            ['call', 'Phone call'],
            ['visit', 'Site visit'],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className={kind === k ? 'on' : ''}>
            <input type="radio" name="crmh-note-kind" checked={kind === k} onChange={() => setKind(k)} />
            {label}
          </label>
        ))}
      </div>
      <label className="crm-label" htmlFor="crmh-note-body">
        Note
      </label>
      <textarea id="crmh-note-body" className="crm-input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What was said or agreed" />
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !job || !body.trim()} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save note'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
