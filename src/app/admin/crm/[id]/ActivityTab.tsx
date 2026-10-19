'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MediaBubble } from '@/components/admin/whatsapp/MediaBubble';
import { ACTIVITY_LABEL } from '@/lib/crm/stages';
import { classifyActivity } from '@/lib/projects/feed';
import { captionOf, type MediaFields } from '@/lib/whatsapp/media-shared';
import { WaIcon } from '../CrmUi';
import { dayLabel, firstName, initials, ukDayOf, ukTime } from '../crm-shared';
import { openDock } from '../dock-link';
import { send, type Entry, type OtherJob } from './record-shared';

type Chip = 'all' | 'notes' | 'wa' | 'email' | 'stages' | 'docs';
const CHIPS: [Chip, string][] = [
  ['all', 'All'],
  ['notes', 'Notes & calls'],
  ['wa', 'WhatsApp'],
  ['email', 'Email'],
  ['stages', 'Stages & checklist'],
  ['docs', 'Docs & payments'],
];
const PAGE = 50;
/** How a message that isn't text reads in a folded row. */
const MEDIA: Record<string, string> = { image: 'Photo', video: 'Video', audio: 'Voice note', document: 'File', sticker: 'Sticker', location: 'Location' };
const MONEY = /\b(deposit|paid|payment|invoice|refund)\b/i;

/** Which chip an entry is under. */
function chipOf(e: Entry): Chip {
  switch (e.kind) {
    case 'note':
    case 'call':
    case 'visit':
      return 'notes';
    case 'whatsapp':
      return 'wa';
    case 'email':
      return 'email';
  }
  const c = classifyActivity({ kind: e.kind, body: e.body, meta: e.meta });
  return c.kind === 'doc' || MONEY.test(e.body ?? '') ? 'docs' : 'stages';
}

type Item = { type: 'entry'; e: Entry } | { type: 'wa'; run: Entry[] };

/**
 * Activity: a composer (Note, Log a call, Site visit), filter chips, then everything newest first in
 * UK days, 50 at a time. From 1280px, with the WhatsApp panel on the page, a run of WhatsApp messages
 * folds into one row that opens the chat in the panel at that message, so the thread isn't shown
 * twice; below that (and without the panel) the bubbles show (CSS decides). The page never scrolls by
 * itself, apart from once to the entry a link pointed at.
 */
export function ActivityTab({
  projectId,
  entries,
  others,
  customerName,
  today,
  entry,
  base,
  onChanged,
}: {
  projectId: string;
  entries: Entry[];
  others: OtherJob[];
  customerName: string;
  today: string;
  /** Opened at this entry (?entry= from Latest notes). */
  entry: string | null;
  base: string;
  onChanged: () => void;
}) {
  const [chip, setChip] = useState<Chip>('all');
  const [shownMax, setShownMax] = useState(PAGE);
  const shown = useMemo(() => (chip === 'all' ? entries : entries.filter((e) => chipOf(e) === chip)), [entries, chip]);
  // Make sure the entry a link pointed at is in the first page shown.
  const entryAt = entry ? shown.findIndex((e) => e.id === entry) : -1;
  const limit = Math.max(shownMax, entryAt + 1);
  const page = useMemo(() => shown.slice(0, limit), [shown, limit]);

  // Group by UK day, folding runs of WhatsApp messages.
  const days = useMemo(() => {
    const out: { day: string; items: Item[] }[] = [];
    for (const e of page) {
      const day = ukDayOf(e.at);
      let g = out[out.length - 1];
      if (!g || g.day !== day) out.push((g = { day, items: [] }));
      const last = g.items[g.items.length - 1];
      if (e.kind === 'whatsapp') {
        if (last?.type === 'wa') last.run.push(e);
        else g.items.push({ type: 'wa', run: [e] });
      } else g.items.push({ type: 'entry', e });
    }
    return out;
  }, [page]);

  const titleOf = (id: string) => others.find((o) => o.id === id)?.title ?? 'another job';

  const scrolled = useRef(false);
  useEffect(() => {
    if (!entry || scrolled.current) return;
    const el = document.getElementById(`entry-${entry}`);
    if (!el) return;
    scrolled.current = true;
    el.scrollIntoView({ block: 'center' });
  }, [entry, days]);

  return (
    <div className="crmr-activity">
      <Composer projectId={projectId} name={customerName} onSaved={onChanged} />
      <div className="crmh-chipsrow crmr-chips" role="group" aria-label="Show">
        {CHIPS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`crmh-chipf${chip === k ? ' on' : ''}`}
            aria-pressed={chip === k}
            onClick={() => {
              setChip(k);
              setShownMax(PAGE);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {page.length === 0 ? (
        <p className="crm-muted crm-empty">
          {chip === 'all' ? `Nothing yet with ${customerName}. Add a note, log a call or message them.` : 'Nothing of this kind yet.'}
        </p>
      ) : (
        days.map((g) => (
          <div key={g.day} className="crmr-day">
            <div className="crmr-day__h">{today ? dayLabel(g.day, today) : g.day}</div>
            {g.items.map((it) =>
              it.type === 'wa' ? (
                <WaRun key={it.run[0].id} run={it.run} highlight={entry} projectId={projectId} onChanged={onChanged} />
              ) : (
                <Act key={it.e.id} e={it.e} highlight={entry === it.e.id} other={it.e.other_project ? { id: it.e.other_project, title: titleOf(it.e.other_project), base } : null} />
              )
            )}
          </div>
        ))
      )}
      {shown.length > limit && (
        <button type="button" className="crmh-fold crmr-older" onClick={() => setShownMax(limit + PAGE)}>
          Load older ({shown.length - limit} more)
        </button>
      )}
    </div>
  );
}

function Act({ e, highlight, other }: { e: Entry; highlight: boolean; other: { id: string; title: string; base: string } | null }) {
  const system = e.kind === 'system' || e.kind === 'stage' || e.kind === 'photo';
  const label =
    e.kind === 'email' && e.meta?.direction === 'in' ? 'Email received' : e.kind === 'email' && e.meta?.synced ? 'Email sent' : ACTIVITY_LABEL[e.kind] || 'Update';
  return (
    <div id={`entry-${e.id}`} className={`crmr-act k-${e.kind}${system ? ' is-sys' : ''}${highlight ? ' is-hl' : ''}`}>
      <span className="crmr-act__ic" aria-hidden="true">
        {system ? '•' : e.kind === 'email' ? '✉' : initials(e.by)}
      </span>
      <div className="crmr-act__b">
        <div className="crmr-act__h">
          <b>{system ? e.body : label}</b>
          {e.by && !system && <span className="crm-muted crm-small">{e.by}</span>}
          <time>{ukTime(e.at)}</time>
        </div>
        {!system && e.body && <p>{e.body}</p>}
        {other && (
          <Link href={`${other.base}/${other.id}`} className="crmr-act__other">
            Other project: {other.title}
          </Link>
        )}
      </div>
    </div>
  );
}

/** A message's photo, video, voice note or file (whatsapp-media.sql), kept in the entry's meta by the job's GET. */
const mediaOf = (e: Entry): MediaFields | null => (e.meta?.media_status ? (e.meta as MediaFields) : null);

/**
 * A run of WhatsApp messages: one row from 1280px (with the panel), the bubbles below that. Photos,
 * videos, voice notes and files show as they do in the chat (MediaBubble), and a photo they sent can
 * be saved to this job's photos.
 */
function WaRun({ run, highlight, projectId, onChanged }: { run: Entry[]; highlight: string | null; projectId: string; onChanged: () => void }) {
  const newest = run[0];
  const kindOf = (e: Entry) => String(e.meta?.kind || 'text');
  const templates = run.every((e) => kindOf(e) === 'template');
  const quote = (e: Entry) => {
    const who = e.meta?.direction === 'in' ? firstName(e.by) || 'They' : 'You';
    const text = (MEDIA[kindOf(e)] ? captionOf(kindOf(e), e.body, (mediaOf(e)?.media_name as string | null | undefined) ?? null) : e.body || '').replace(/\s+/g, ' ').trim();
    const short = text.length > 70 ? `${text.slice(0, 68)}…` : text;
    const media = MEDIA[kindOf(e)];
    return media ? `${who}: ${media}${short ? ` “${short}”` : ''}` : `${who}: “${short}”`;
  };
  return (
    <>
      <div className="crmr-act k-whatsapp crmr-warun">
        <span className="crmr-act__ic" aria-hidden="true">
          <WaIcon size={15} />
        </span>
        <button type="button" className="crmr-act__b" onClick={() => openDock({ tab: 'job', messageId: newest.id.replace(/^wa-/, '') })}>
          <span className="crmr-act__h">
            <b>
              {templates
                ? `WhatsApp template sent${run.length > 1 ? ` × ${run.length}` : ''}`
                : `WhatsApp · ${run.length} message${run.length === 1 ? '' : 's'}`}
            </b>
            {templates && newest.by && <span className="crm-muted crm-small">{newest.by}</span>}
            <span className="crmh-link crm-small">Show in chat →</span>
            <time>{ukTime(newest.at)}</time>
          </span>
          <span className="crmr-act__p">
            {run
              .slice(0, 2)
              .reverse()
              .map(quote)
              .join(' · ')}
          </span>
        </button>
      </div>
      <div className="crmr-wabubbles">
        {[...run].reverse().map((e) => {
          const inbound = e.meta?.direction === 'in';
          const status = String(e.meta?.status || '');
          const media = mediaOf(e);
          return (
            <div key={e.id} id={`entry-${e.id}`} className={`crm-bubble ${inbound ? 'in' : 'out'}${media ? ' has-media' : ''}${highlight === e.id ? ' is-hl' : ''}`}>
              {!inbound && e.by && <span className="crm-bubble-by">{e.by}</span>}
              {media ? (
                <MediaBubble
                  m={{ ...media, id: e.id.replace(/^wa-/, ''), kind: kindOf(e), body: e.body, created_at: e.at, direction: inbound ? 'in' : 'out' }}
                  jobId={projectId}
                  onChange={onChanged}
                />
              ) : (
                <span className="crm-bubble-text">{e.body || (e.meta?.kind ? `(${String(e.meta.kind)})` : '')}</span>
              )}
              <span className="crm-bubble-meta">
                {ukTime(e.at)}
                {!inbound && e.meta?.via !== 'import' && (
                  <span className={`crm-wa-tick ${status}`}>{status === 'read' || status === 'delivered' ? ' ✓✓' : status === 'failed' ? ' !' : ' ✓'}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Note | Log a call | Site visit: one line that grows as you type. */
function Composer({ projectId, name, onSaved }: { projectId: string; name: string; onSaved: () => void }) {
  const [kind, setKind] = useState<'note' | 'call' | 'visit'>('note');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const placeholder = { note: `Add a note for ${firstName(name) || 'this job'}…`, call: 'What was said on the call?', visit: 'How did the visit go?' }[kind];
  async function save() {
    if (!body.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await send(`/api/crm/projects/${projectId}/activities`, 'POST', { kind, body: body.trim() });
      setBody('');
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={`crmr-compose${body ? ' is-open' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="crmh-tog" role="group" aria-label="What to add">
        {(['note', 'call', 'visit'] as const).map((k) => (
          <button key={k} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === 'note' ? 'Note' : k === 'call' ? 'Log a call' : 'Site visit'}
          </button>
        ))}
      </div>
      <textarea
        className="crm-input crmr-compose__box"
        rows={body ? 3 : 1}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {body.trim() && (
        <button type="submit" className="crm-btn crm-btn--solar crm-btn--small" disabled={busy} title="Ctrl/⌘ + Enter">
          {busy ? 'Saving…' : 'Save'}
        </button>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
    </form>
  );
}
