'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandIcon, FileButton, Sheet } from '../crm/CrmUi';
import { createClient } from '@/lib/supabase/client';
import { WritingSpark } from '../sales/quotes/[id]/WritingSpark';
import type { MailCounts, ThreadRow } from '@/lib/mail/server';
import { clearAwayTo, prettyFolder } from '@/lib/mail/shared';

type Cleared = { filed: number; deleted: number; folder: string | null };
type Doc = { id: string; name: string; size: number | null; job?: string | null };
const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
import '../crm/crm.css';
import '../sales/quotes/quotes.css';
import './mail.css';

type Tab = 'reply' | 'waiting' | 'opps' | 'people' | 'fyi' | 'marketing' | 'folders' | 'settings';
const LIST_TABS: Tab[] = ['reply', 'waiting', 'opps', 'people', 'fyi', 'marketing'];

/** How they come across (Hestia's read of their latest email): the ones worth knowing before you reply. */
const TONE: Record<string, { label: string; cls: string }> = {
  angry: { label: 'Angry', cls: 'is-urgent' },
  frustrated: { label: 'Frustrated', cls: 'is-hot' },
  anxious: { label: 'Worried', cls: 'is-due' },
  confused: { label: 'Confused', cls: 'is-due' },
  happy: { label: 'Happy', cls: 'is-draft' },
};

const PRIORITY: Record<string, string> = { urgent: 'Urgent', high: 'High', normal: '', low: 'Low' };
const KIND: Record<string, string> = { customer: 'Customer', prospect: 'New customer?', supplier: 'Supplier', grid: 'Grid / DNO', partner: 'Partner', finance: 'Finance', team: 'Team', personal: 'Personal', other: '' };

export function ago(iso: string | null, now: number) {
  if (!iso || !now) return '';
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d < 14 ? `${d}d` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const initials = (s: string) =>
  s
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } }).catch(() => null);
  const d = await r?.json().catch(() => ({}));
  return { ok: !!r?.ok, data: (d ?? {}) as Record<string, unknown> };
}

export function MailView(p: {
  missing: boolean;
  connected: boolean;
  email: string;
  hasBox: boolean;
  counts: MailCounts | null;
  initialRows: ThreadRow[];
  openId: string | null;
  startTab: string | null;
  canCrm: boolean;
}) {
  const router = useRouter();
  const [startTab] = useState<Tab>(() => ((['reply', 'waiting', 'opps', 'people', 'fyi', 'marketing', 'folders', 'settings'] as Tab[]).includes(p.startTab as Tab) ? (p.startTab as Tab) : 'reply'));
  // Opened on another list (?tab=waiting from the dashboard): it starts empty and loads.
  const otherList = startTab !== 'reply' && LIST_TABS.includes(startTab);
  const [tab, setTab] = useState<Tab>(startTab);
  const [rows, setRows] = useState<ThreadRow[]>(otherList ? [] : p.initialRows);
  const [counts, setCounts] = useState<MailCounts | null>(p.counts);
  const [loading, setLoading] = useState(otherList);
  const [open, setOpen] = useState<ThreadRow | null>(() => p.initialRows.find((r) => r.id === p.openId) ?? null);
  const [now] = useState(() => Date.now());

  /** Fetches one list and the counts; the state is set when they arrive. */
  const fetchList = useCallback(
    (t: Tab) =>
      Promise.all([call(`/api/mail/threads?view=${t}`), call('/api/mail/box')]).then(([list, box]) => {
        if (list.ok) setRows((list.data.rows as ThreadRow[]) ?? []);
        if (box.ok && box.data.counts) setCounts(box.data.counts as MailCounts);
        setLoading(false);
      }),
    []
  );
  const load = useCallback(
    (t: Tab) => {
      if (!LIST_TABS.includes(t)) return;
      setLoading(true);
      void fetchList(t);
    },
    [fetchList]
  );

  // "No reply needed" from the list or a conversation: where it went, with Undo for a few seconds.
  const [toast, setToast] = useState<{ id: string; text: string; busy: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cleared(row: ThreadRow, d: Cleared) {
    const text = d.folder ? `Moved to ${pretty(d.folder)}` : d.deleted ? 'Moved to Deleted Items' : 'Marked no reply needed';
    setToast({ id: row.id, text: `${row.who_name || row.who_address || 'Email'}: ${text}`, busy: false });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }
  async function quickDone(row: ThreadRow, how: 'done' | 'delete' = 'done') {
    // Off the list at once; back if it didn't work.
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    const r = await call(`/api/mail/threads/${row.id}`, { method: 'POST', body: JSON.stringify({ action: how }) });
    if (!r.ok) {
      setRows((rs) => [row, ...rs]);
      setToast({ id: row.id, text: String(r.data.error || 'That didn’t work. Try again.'), busy: false });
      return;
    }
    cleared(row, r.data as unknown as Cleared);
    setCounts((c) => (c ? { ...c, reply: Math.max(0, c.reply - 1), urgent: row.priority === 'urgent' || row.priority === 'high' ? Math.max(0, c.urgent - 1) : c.urgent } : c));
  }
  async function undo(id: string) {
    setToast((t) => (t ? { ...t, busy: true } : t));
    await call(`/api/mail/threads/${id}`, { method: 'POST', body: JSON.stringify({ action: 'restore' }) });
    setToast(null);
    load(tab);
  }

  function pick(t: Tab) {
    setTab(t);
    if (LIST_TABS.includes(t)) {
      setRows([]);
      load(t);
    }
  }

  useEffect(() => {
    if (startTab !== 'reply' && LIST_TABS.includes(startTab)) void fetchList(startTab);
  }, [startTab, fetchList]);

  // Fresh every two minutes while the page is open (the job runs every two minutes).
  useEffect(() => {
    if (!p.hasBox) return;
    const i = setInterval(() => {
      if (!open && document.visibilityState === 'visible') load(tab);
    }, 120_000);
    return () => clearInterval(i);
  }, [p.hasBox, tab, open, load]);

  if (p.missing)
    return (
      <div className="crm mx">
        <Head />
        <p className="crm-emptystate">
          <b>Not set up yet.</b> Run <code>supabase/mail-sort.sql</code> in Supabase, then come back.
        </p>
      </div>
    );
  if (!p.hasBox) return <Connect email={p.email} connected={p.connected} onDone={() => router.refresh()} />;

  const tabs: { k: Tab; label: string; n?: number; hot?: boolean }[] = [
    { k: 'reply', label: 'To reply', n: counts?.reply, hot: !!counts?.urgent },
    { k: 'waiting', label: 'Waiting on them', n: counts?.waiting },
    { k: 'opps', label: 'Opportunities', n: counts?.opps },
    { k: 'people', label: 'New people', n: counts?.people },
    { k: 'fyi', label: 'No reply needed' },
    { k: 'marketing', label: 'Marketing' },
    { k: 'folders', label: 'Folders' },
    { k: 'settings', label: 'Settings' },
  ];

  return (
    <div className="crm mx">
      <Head counts={counts} />
      <div className="mx-tabs" role="tablist" aria-label="Email">
        {tabs.map((t) => (
          <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => pick(t.k)}>
            {t.label}
            {!!t.n && <em className={t.hot ? 'hot' : ''}>{t.n}</em>}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {LIST_TABS.includes(tab) && (
          <ThreadList
            tab={tab}
            rows={rows}
            loading={loading}
            now={now}
            onOpen={setOpen}
            onDone={quickDone}
          />
        )}
        {tab === 'folders' && <Folders />}
        {tab === 'settings' && <Settings onDisconnect={() => router.refresh()} />}
      </div>
      {open && (
        <ThreadSheet
          row={open}
          tab={tab}
          canCrm={p.canCrm}
          now={now}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null);
            load(tab);
          }}
          onCleared={(d) => {
            setOpen(null);
            cleared(open, d);
            load(tab);
          }}
        />
      )}
      {toast && (
        <div className="mx-toast" role="status">
          <span>{toast.text}</span>
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={toast.busy} onClick={() => undo(toast.id)}>
            {toast.busy ? 'Putting it back…' : 'Undo'}
          </button>
        </div>
      )}
    </div>
  );
}

/** "Inbox/Customers/Sarah Davies (HX-0069)" → "Customers › Sarah Davies (HX-0069)". */
const pretty = prettyFolder;

function Head({ counts }: { counts?: MailCounts | null }) {
  return (
    <header className="mx-head">
      <div>
        <h1>
          <BrandIcon k="mail" size={24} /> My email
        </h1>
        <p className="crm-muted">
          {counts
            ? counts.reply
              ? `Hestia has ${counts.reply} that need you${counts.urgent ? `, ${counts.urgent} urgent or important` : ''}${counts.drafts ? `. ${counts.drafts} draft${counts.drafts === 1 ? '' : 's'} ready to check, also in your Outlook Drafts.` : '.'}`
              : 'Hestia has nothing waiting on you.'
            : 'Hestia, your assistant, keeps your inbox sorted: what needs you, urgent first, with replies drafted in your style.'}
        </p>
      </div>
    </header>
  );
}

/* ── Connect ─────────────────────────────────────────────────────────────── */

function Connect({ email, connected, onDone }: { email: string; connected: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setBusy(true);
    setErr('');
    const r = await call('/api/mail/box', { method: 'POST' });
    setBusy(false);
    if (!r.ok) return setErr(String(r.data.error || 'Couldn’t connect it.'));
    onDone();
  }
  return (
    <div className="crm mx">
      <Head />
      <section className="mx-card mx-connect">
        <h2>Connect {email}</h2>
        <p>Hestia, your assistant, goes through your whole inbox first, then every new email within two minutes. She:</p>
        <ul>
          <li>works out which emails need you, urgent first, reading each person’s tone, and flags them in Outlook (“Urgent”, “Needs reply” or “Action needed”), so they stand out on your phone too; anything urgent also comes to your phone straight away;</li>
          <li>spots every opportunity: new leads, referrals, add-ons, happy customers who’d leave a review;</li>
          <li>learns how you write from your sent emails, and drafts each reply in your style, waiting in Outlook’s Drafts and here, for you to check and send;</li>
          <li>works out a folder for every company and customer (GoodWe, National Grid, Customers/Jane Smith);</li>
          <li>moves marketing into a Marketing folder from the start, and once you turn filing on, moves each email into its folder after you’ve replied, so your inbox only holds what still needs you;</li>
          <li>notes emails from CRM customers on their record;</li>
          <li>spots people asking about a job who aren’t in the CRM yet, so you can add them in one tap.</li>
        </ul>
        <p className="crm-muted">
          You carry on in Outlook as usual: the flags, drafts and folders are all there. Nothing but marketing is moved until you’ve checked the folders and turned filing on, and none of your emails are ever deleted (only Hestia’s own drafts, once you’ve replied). Only you see your email here.
        </p>
        {!connected && <p className="mx-err">Microsoft 365 isn’t connected to the app yet: see Setup › Connect Microsoft 365 email first.</p>}
        {err && <p className="mx-err">{err}</p>}
        <button type="button" className="crm-btn crm-btn--solar" onClick={go} disabled={busy || !connected}>
          {busy ? 'Connecting…' : `Connect ${email}`}
        </button>
      </section>
    </div>
  );
}

/* ── The lists ───────────────────────────────────────────────────────────── */

const EMPTY: Record<string, string> = {
  reply: 'Nothing needs you. New emails are checked every two minutes.',
  opps: 'No opportunities spotted in the last two months.',
  waiting: 'Nobody you’ve emailed in the last six weeks has gone quiet for three days or more.',
  people: 'No one new. When someone not in the CRM asks about a job, they appear here.',
  fyi: 'Nothing in the last two weeks.',
  marketing: 'No marketing emails found.',
};

const HINT: Record<string, string> = {
  waiting: 'You sent the last email, three or more days ago, and they haven’t replied. Worth a nudge?',
  opps: 'Chances Hestia spotted in the last two months: new leads, referrals, add-ons, reviews. Open one to follow it up.',
  people: 'They’ve emailed about a job but aren’t in the CRM. Add them so nothing is missed.',
  fyi: 'The last two weeks’ emails that need nothing from you. If one does, open it and say so.',
  marketing: 'Newsletters and offers, moved to your Marketing folder. If one isn’t marketing, open it and say so: it comes back to your inbox.',
};

function ThreadList({ tab, rows, loading, now, onOpen, onDone }: { tab: Tab; rows: ThreadRow[]; loading: boolean; now: number; onOpen: (r: ThreadRow) => void; onDone: (r: ThreadRow, how: 'done' | 'delete') => void }) {
  if (loading && !rows.length) return <p className="crm-muted mx-pad">Loading…</p>;
  return (
    <>
      {HINT[tab] && <p className="crm-muted mx-hint">{HINT[tab]}</p>}
      {rows.length === 0 ? (
        <p className="crm-emptystate">{EMPTY[tab]}</p>
      ) : (
        <ul className="mx-list">
          {rows.map((r) => {
            const who = r.who_name || r.rule?.label || r.who_address || 'Unknown';
            const draftReady = !!r.draft && !!r.draft_for && r.draft_for >= String(r.last_in_at ?? '');
            return (
              <li key={r.id} className="mx-li">
                <button type="button" className={`mx-row is-${r.priority ?? 'normal'}`} onClick={() => onOpen(r)}>
                  <span className="mx-av" aria-hidden="true">
                    {initials(who)}
                  </span>
                  <span className="mx-row__b">
                    <span className="mx-row__h">
                      <b>{who}</b>
                      {r.rule?.label && r.rule.label !== who && <span className="crm-muted">{r.rule.label}</span>}
                      <time>{ago(tab === 'waiting' ? r.last_out_at : r.last_in_at, now)}</time>
                    </span>
                    <span className="mx-row__s">{r.subject || '(no subject)'}</span>
                    {tab === 'opps' && r.opportunity ? <span className="mx-row__p">{r.opportunity}</span> : r.summary && <span className="mx-row__p">{r.summary}</span>}
                    <span className="mx-chips">
                      {tab === 'reply' && PRIORITY[r.priority ?? ''] && <span className={`mx-chip is-${r.priority}`}>{PRIORITY[r.priority!]}</span>}
                      {r.action_only && r.state === 'reply' && <span className="mx-chip is-due">Action needed</span>}
                      {r.tone && TONE[r.tone] && <span className={`mx-chip ${TONE[r.tone].cls}`}>{TONE[r.tone].label}</span>}
                      {r.due && <span className="mx-chip is-due">{r.due}</span>}
                      {r.opportunity && <span className="mx-chip is-opp">Opportunity</span>}
                      {r.prospect && !r.enquiry_id && <span className="mx-chip is-new">New customer?</span>}
                      {r.enquiry_id && <span className="mx-chip">In the CRM</span>}
                      {tab === 'reply' && draftReady && <span className="mx-chip is-draft">Draft ready</span>}
                      {r.kind && KIND[r.kind] && r.kind !== 'prospect' && r.kind !== 'customer' && <span className="mx-chip is-quiet">{KIND[r.kind]}</span>}
                    </span>
                  </span>
                </button>
                {tab === 'reply' && (
                  <span className="mx-quick">
                    <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => onDone(r, 'done')} title={`Stores it in ${pretty(clearAwayTo(r.rule))}`}>
                      No reply needed
                    </button>
                    <button type="button" className="crm-btn crm-btn--ghost crm-btn--small mx-del" onClick={() => onDone(r, 'delete')} title="Moves it to Deleted Items">
                      Delete
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ── One conversation ────────────────────────────────────────────────────── */

type Msg = { id: string; direction: 'in' | 'out'; from_name: string | null; from_address: string | null; subject: string | null; preview: string | null; at: string; place: string };

function ThreadSheet({
  row,
  tab,
  canCrm,
  now,
  onClose,
  onChanged,
  onCleared,
}: {
  row: ThreadRow;
  tab: Tab;
  canCrm: boolean;
  now: number;
  onClose: () => void;
  onChanged: () => void;
  onCleared: (d: Cleared) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [latest, setLatest] = useState<{ text: string; webLink: string | null } | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [received, setReceived] = useState<Record<string, { id: string; name: string; size: number }[]>>({});
  // Attachments: files from your device (uploaded as you add them), and one-tap picks from their documents and the library.
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [library, setLibrary] = useState<Doc[]>([]);
  const [uploads, setUploads] = useState<{ path: string; name: string; type: string; size: number }[]>([]);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [libIds, setLibIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const attachBody = () => ({ uploads: uploads.map(({ path, name, type }) => ({ path, name, type })), documentIds: docIds, libraryIds: libIds });
  const attachedSize = uploads.reduce((n, u) => n + u.size, 0) + [...documents.filter((d) => docIds.includes(d.id)), ...library.filter((d) => libIds.includes(d.id))].reduce((n, d) => n + (d.size ?? 0), 0);

  async function addFiles(files: File[]) {
    setUploading(true);
    setErr('');
    for (const f of files) {
      if (attachedSize + f.size > 25 * 1024 * 1024) {
        setErr(`${f.name} would take the attachments over 25 MB, Outlook’s limit.`);
        break;
      }
      const p = await call(`/api/mail/threads/${row.id}`, { method: 'POST', body: JSON.stringify({ action: 'attach', name: f.name, size: f.size }) });
      if (!p.ok) {
        setErr(String(p.data.error || `Couldn’t add ${f.name}.`));
        break;
      }
      const up = await createClient().storage.from(String(p.data.bucket)).uploadToSignedUrl(String(p.data.path), String(p.data.token), f, { contentType: f.type || 'application/octet-stream' });
      if (up.error) {
        setErr(`Couldn’t upload ${f.name}. Try again.`);
        break;
      }
      setUploads((u) => [...u, { path: String(p.data.path), name: f.name, type: f.type || 'application/octet-stream', size: f.size }]);
    }
    setUploading(false);
  }
  const [text, setText] = useState(row.draft ?? '');
  const [steer, setSteer] = useState('');
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<'' | 'send' | 'outlook' | 'redraft' | 'done' | 'delete' | 'undone' | 'crm' | 'notMarketing'>('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [gaps, setGaps] = useState(false);
  const [crm, setCrm] = useState({ name: row.prospect?.name || row.who_name || '', phone: row.prospect?.phone || '', postcode: row.prospect?.postcode || '' });
  const isReply = (row.state === 'reply' || row.state === 'new') && !row.action_only;
  const isAction = row.state === 'reply' && row.action_only;

  useEffect(() => {
    let live = true;
    void call(`/api/mail/threads/${row.id}`).then((r) => {
      if (!live || !r.ok) return;
      setMsgs((r.data.messages as Msg[]) ?? []);
      setLatest((r.data.latest as typeof latest) ?? null);
      setSignature((r.data.signature as string | null) ?? null);
      setReceived((r.data.received as typeof received) ?? {});
      setDocuments((r.data.documents as Doc[]) ?? []);
      setLibrary((r.data.library as Doc[]) ?? []);
    });
    return () => {
      live = false;
    };
  }, [row.id]);

  async function act(action: typeof busy, body: Record<string, unknown> = {}) {
    setBusy(action);
    setErr('');
    setNote('');
    const r = await call(`/api/mail/threads/${row.id}`, { method: 'POST', body: JSON.stringify({ action, ...body }) });
    setBusy('');
    if (!r.ok) {
      if (r.data.gaps) setGaps(true);
      setErr(String(r.data.error || 'That didn’t work. Try again.'));
      return null;
    }
    return r.data;
  }

  const who = row.who_name || row.rule?.label || row.who_address || 'Unknown';
  const lastIn = msgs?.filter((m) => m.direction === 'in').at(-1);

  return (
    <Sheet title={who} onClose={onClose} wide>
      <div className="mx-sheet">
        <p className="mx-sheet__subject">
          <b>{row.subject || '(no subject)'}</b>
          {row.who_address && <span className="crm-muted"> · {row.who_address}</span>}
          {row.rule && (
            <span className="crm-muted">
              {' '}
              · folder {row.rule.folder.replace(/\//g, ' › ')}
              {row.rule.status !== 'on' ? ' (not approved yet)' : ''}
            </span>
          )}
          {row.enquiry_id && (
            <>
              {' '}
              ·{' '}
              <a className="crm-link" href={`/admin/crm?enquiry=${row.enquiry_id}`}>
                Open their record
              </a>
            </>
          )}
        </p>
        {(row.summary || row.why || row.opportunity) && (
          <div className={`mx-why is-${row.priority ?? 'normal'}`}>
            {row.summary && <b>{row.summary}</b>}
            {row.why && <span>{row.why}</span>}
            {row.due && <span>Deadline: {row.due}</span>}
            {row.tone && TONE[row.tone] && <span>Tone: {TONE[row.tone].label.toLowerCase()}</span>}
            {row.opportunity && (
              <span className="mx-why__opp">
                <b>Opportunity:</b> {row.opportunity}
              </span>
            )}
          </div>
        )}

        <div className="mx-convo" aria-label="The conversation">
          {!msgs && <p className="crm-muted">Loading the conversation…</p>}
          {msgs?.map((m) => {
            const full = m.id === lastIn?.id && latest?.text;
            return (
              <article key={m.id} className={`mx-msg is-${m.direction}`}>
                <header>
                  <b>{m.direction === 'out' ? 'You' : m.from_name || m.from_address}</b>
                  <time>{ago(m.at, now)}</time>
                </header>
                <p>{full ? latest!.text : m.preview}</p>
                {received[m.id]?.length ? (
                  <ul className="mx-files" aria-label="Attachments">
                    {received[m.id].map((f) => (
                      <li key={f.id}>
                        <BrandIcon k="document" size={16} />{' '}
                        <a className="crm-link" href={`/api/mail/threads/${row.id}/attachment?m=${m.id}&a=${encodeURIComponent(f.id)}`} target="_blank" rel="noopener noreferrer">
                          {f.name}
                        </a>{' '}
                        <span className="crm-muted crm-small">{size(f.size)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
        {latest?.webLink && (
          <p>
            <a className="crm-link" href={latest.webLink} target="_blank" rel="noopener noreferrer">
              Open in Outlook ↗
            </a>
          </p>
        )}

        {row.prospect && !row.enquiry_id && canCrm && (
          <section className="mx-card mx-crm">
            <h3>Not in the CRM yet</h3>
            <p className="crm-muted">They look like a new customer. Add them so they’re followed up in the CRM, and their emails get their own folder.</p>
            <div className="mx-grid3">
              <label>
                Name
                <input className="crm-input" value={crm.name} onChange={(e) => setCrm({ ...crm, name: e.target.value })} />
              </label>
              <label>
                Mobile
                <input className="crm-input" value={crm.phone} onChange={(e) => setCrm({ ...crm, phone: e.target.value })} inputMode="tel" />
              </label>
              <label>
                Postcode
                <input className="crm-input" value={crm.postcode} onChange={(e) => setCrm({ ...crm, postcode: e.target.value })} />
              </label>
            </div>
            <button
              type="button"
              className="crm-btn crm-btn--solar crm-btn--small"
              disabled={!!busy || !crm.name.trim()}
              onClick={async () => {
                const d = await act('crm', crm);
                if (d) onChanged();
              }}
            >
              {busy === 'crm' ? 'Adding…' : 'Add to the CRM'}
            </button>
          </section>
        )}

        {isAction ? (
          <section className="mx-reply" aria-label="Something to do">
            <h3>Something to do</h3>
            <p className="crm-muted">This needs you to do something rather than reply. Once it’s done, tick it off and the flag comes off in Outlook.</p>
            <div className="mx-actions">
              <button
                type="button"
                className="crm-btn crm-btn--solar"
                disabled={!!busy}
                onClick={async () => {
                  const d = await act('done');
                  if (d) onCleared(d as Cleared);
                }}
              >
                {busy === 'done' ? 'Moving…' : 'Done'}
              </button>
            </div>
          </section>
        ) : tab === 'marketing' ? (
          <div className="mx-actions">
            <button
              type="button"
              className="crm-btn crm-btn--ghost"
              disabled={!!busy}
              onClick={async () => {
                if (await act('notMarketing')) onChanged();
              }}
            >
              {busy === 'notMarketing' ? 'Moving it back…' : 'Not marketing'}
            </button>
          </div>
        ) : isReply ? (
          <section className="mx-reply" aria-label="Your reply">
            <h3>Your reply</h3>
            <div className="mx-draftbox">
              <textarea className="crm-input" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={row.draft_error || 'No draft yet: write your reply, or ask for one below.'} disabled={busy === 'redraft'} />
              {busy === 'redraft' && <WritingSpark label="Hestia is writing your reply" steps={['Reading the conversation', 'Checking the CRM', 'Writing it your way', 'Reading it back']} />}
            </div>
            {signature && <p className="crm-muted crm-small">Your signature goes underneath when it’s sent.</p>}
            <div className="mx-attach" aria-label="Attachments">
              <div className="mx-attach__row">
                <FileButton label={uploading ? 'Uploading…' : 'Attach a file'} multiple busy={uploading} disabled={!!busy} onFiles={addFiles} />
                {library.length > 0 && (
                  <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" aria-expanded={showLibrary} onClick={() => setShowLibrary(!showLibrary)}>
                    {showLibrary ? 'Hide the library' : 'From the library'}
                  </button>
                )}
                {attachedSize > 0 && <span className="crm-muted crm-small">{size(attachedSize)} of 25 MB</span>}
              </div>
              {documents.length > 0 && (
                <div className="mx-attach__pick">
                  <span className="crm-muted crm-small">Their documents:</span>
                  {documents.map((d) => (
                    <button key={d.id} type="button" className={`crm-btn crm-btn--ghost crm-btn--small${docIds.includes(d.id) ? ' is-on' : ''}`} aria-pressed={docIds.includes(d.id)} onClick={() => setDocIds((x) => (x.includes(d.id) ? x.filter((y) => y !== d.id) : [...x, d.id]))} title={d.job ?? undefined}>
                      {d.name}
                    </button>
                  ))}
                </div>
              )}
              {showLibrary && (
                <div className="mx-attach__pick">
                  <span className="crm-muted crm-small">Library:</span>
                  {library.map((d) => (
                    <button key={d.id} type="button" className={`crm-btn crm-btn--ghost crm-btn--small${libIds.includes(d.id) ? ' is-on' : ''}`} aria-pressed={libIds.includes(d.id)} onClick={() => setLibIds((x) => (x.includes(d.id) ? x.filter((y) => y !== d.id) : [...x, d.id]))}>
                      {d.name}
                    </button>
                  ))}
                </div>
              )}
              {uploads.length > 0 && (
                <ul className="mx-attach__list">
                  {uploads.map((u) => (
                    <li key={u.path}>
                      <BrandIcon k="document" size={16} /> {u.name} <span className="crm-muted crm-small">{size(u.size)}</span>
                      <button type="button" className="crm-link" onClick={() => setUploads((x) => x.filter((y) => y.path !== u.path))}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/\[[^\]\n]{1,40}\]/.test(text) && <p className="mx-warn">Fill in the parts in [square brackets] before sending.</p>}
            <div className="mx-steer">
              <input className="crm-input" value={steer} onChange={(e) => setSteer(e.target.value)} placeholder="Tell the assistant what to say, e.g. “say yes to Thursday at 10, and the battery is in stock”" />
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={async () => {
                const d = await act('redraft', { steer });
                if (d?.draft) {
                  setText(String(d.draft));
                  setSteer('');
                }
              }}>
                {busy === 'redraft' ? 'Writing…' : text ? 'Rewrite' : 'Write a draft'}
              </button>
            </div>
            <div className="mx-actions">
              <button
                type="button"
                className="crm-btn crm-btn--solar"
                disabled={!!busy || !text.trim()}
                onClick={async () => {
                  const d = await act('send', { text, all, force: gaps, ...attachBody() });
                  if (d) onChanged();
                }}
              >
                {busy === 'send' ? 'Sending…' : gaps ? 'Send anyway' : 'Send'}
              </button>
              <button
                type="button"
                className="crm-btn crm-btn--ghost"
                disabled={!!busy || !text.trim()}
                onClick={async () => {
                  const d = await act('outlook', { text, all, ...attachBody() });
                  if (d) {
                    setNote('Your Outlook draft now says this.');
                    if (d.link) window.open(String(d.link), '_blank', 'noopener');
                  }
                }}
              >
                {busy === 'outlook' ? 'Saving…' : 'Update the Outlook draft'}
              </button>
              <button
                type="button"
                className={`crm-btn crm-btn--ghost crm-btn--small${all ? ' is-on' : ''}`}
                aria-pressed={all}
                onClick={() => setAll(!all)}
                title="Reply to everyone on the email"
              >
                {all ? 'Reply all: on' : 'Reply all: off'}
              </button>
              <button
                type="button"
                className="crm-btn crm-btn--ghost crm-btn--small mx-actions__end"
                disabled={!!busy}
                onClick={async () => {
                  const d = await act('done');
                  if (d) onCleared(d as Cleared);
                }}
                title={`Stores it in ${pretty(clearAwayTo(row.rule))}`}
              >
                {busy === 'done' ? 'Storing…' : 'No reply needed'}
              </button>
              <button
                type="button"
                className="crm-btn crm-btn--ghost crm-btn--small mx-del"
                disabled={!!busy}
                onClick={async () => {
                  const d = await act('delete');
                  if (d) onCleared(d as Cleared);
                }}
                title="Moves it to Deleted Items"
              >
                {busy === 'delete' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
            <p className="crm-muted crm-small mx-dest">No reply needed stores it in {pretty(clearAwayTo(row.rule))}. Delete moves it to Deleted Items.</p>
          </section>
        ) : (
          <div className="mx-actions">
            {tab === 'fyi' && (
              <button
                type="button"
                className="crm-btn crm-btn--ghost"
                disabled={!!busy}
                onClick={async () => {
                  if (await act('undone')) onChanged();
                }}
              >
                {busy === 'undone' ? 'Saving…' : 'Needs a reply after all'}
              </button>
            )}
          </div>
        )}
        {note && <p className="mx-ok">{note}</p>}
        {err && <p className="mx-err">{err}</p>}
      </div>
    </Sheet>
  );
}

/* ── Folders ─────────────────────────────────────────────────────────────── */

type RuleRow = { id: string; kind: 'domain' | 'address'; match: string; label: string; folder: string; action: string; status: string; source: string; named: boolean; messages: number; last_at: string | null; enquiry_id: string | null; organisation_id: string | null };

function Folders() {
  const [rows, setRows] = useState<RuleRow[] | null>(null);
  const [show, setShow] = useState<'suggested' | 'on' | 'all'>('suggested');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(
    () =>
      call('/api/mail/rules').then((r) => {
        if (r.ok) setRows((r.data.rows as RuleRow[]) ?? []);
      }),
    []
  );
  useEffect(() => {
    void call('/api/mail/rules').then((r) => {
      if (r.ok) setRows((r.data.rows as RuleRow[]) ?? []);
    });
  }, []);

  async function save(id: string, patch: Partial<RuleRow>) {
    setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? null);
    const r = await call('/api/mail/rules', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) });
    if (!r.ok) {
      setMsg(String(r.data.error || 'Couldn’t save that.'));
      void load();
    }
  }

  const suggested = rows?.filter((r) => r.status === 'suggested') ?? [];
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (rows ?? []).filter((r) => (show === 'all' || r.status === show) && words.every((w) => `${r.match} ${r.label} ${r.folder}`.toLowerCase().includes(w)));
  }, [rows, show, q]);

  if (!rows) return <p className="crm-muted mx-pad">Loading…</p>;
  return (
    <div className="mx-folders">
      <p className="crm-muted mx-hint">
        Every company is matched by its email domain (everyone at goodwe.com goes to GoodWe), and customers by their own address, into Inbox › Customers › “Name (HX-number)”. Companies go inside your Inbox under their group: Inbox › Suppliers › GoodWe, Inbox › Grid and DNO › National Grid. Anything with no folder is stored in Inbox › Filed. Use a / for a folder inside a folder.
      </p>
      {suggested.length > 0 && (
        <div className="mx-banner">
          <span>
            <b>{suggested.length}</b> suggested folder{suggested.length === 1 ? '' : 's'} to check. Change any names below, then approve.
          </span>
          <button
            type="button"
            className="crm-btn crm-btn--solar crm-btn--small"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await call('/api/mail/rules', { method: 'PATCH', body: JSON.stringify({ approveAll: true }) });
              setBusy(false);
              setMsg(r.ok ? `${r.data.count} approved.` : String(r.data.error || 'Couldn’t approve them.'));
              void load();
            }}
          >
            {busy ? 'Approving…' : 'Approve all'}
          </button>
        </div>
      )}
      <div className="mx-filter">
        {(['suggested', 'on', 'all'] as const).map((k) => (
          <button key={k} type="button" className={`crm-btn crm-btn--ghost crm-btn--small${show === k ? ' is-on' : ''}`} aria-pressed={show === k} onClick={() => setShow(k)}>
            {k === 'suggested' ? `Suggested (${suggested.length})` : k === 'on' ? 'Approved' : 'All'}
          </button>
        ))}
        <input className="crm-input mx-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a company or person" aria-label="Find" />
      </div>
      {msg && <p className="mx-ok">{msg}</p>}
      {list.length === 0 ? (
        <p className="crm-emptystate">{show === 'suggested' ? 'Nothing to check. New companies appear here as they email you.' : 'None.'}</p>
      ) : (
        <div className="crm-tablebox">
          <table className="crm-table mx-rules">
            <thead>
              <tr>
                <th>Who</th>
                <th>Emails</th>
                <th>Folder</th>
                <th>What happens</th>
                <th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 300).map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.label}</b>
                    <small className="crm-muted">
                      {r.kind === 'domain' ? `everyone @${r.match}` : r.match}
                      {r.enquiry_id ? ' · customer' : r.organisation_id ? ' · in the CRM' : ''}
                      {!r.named ? ' · naming…' : ''}
                    </small>
                  </td>
                  <td>{r.messages}</td>
                  <td>
                    <input className="crm-input" defaultValue={r.folder} aria-label={`Folder for ${r.label}`} onBlur={(e) => e.target.value.trim() !== r.folder && save(r.id, { folder: e.target.value })} />
                  </td>
                  <td>
                    <select className="crm-input" value={r.action} onChange={(e) => save(r.id, { action: e.target.value })} aria-label={`What happens to ${r.label}’s emails`}>
                      <option value="file">File in the folder</option>
                      <option value="marketing">Marketing folder</option>
                      <option value="leave">Leave in the inbox</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`crm-btn crm-btn--small ${r.status === 'on' ? 'crm-btn--solar' : 'crm-btn--ghost'}`}
                      aria-pressed={r.status === 'on'}
                      onClick={() => save(r.id, { status: r.status === 'on' ? 'off' : 'on' })}
                    >
                      {r.status === 'on' ? 'Yes' : r.status === 'off' ? 'Off' : 'Approve'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Settings ────────────────────────────────────────────────────────────── */

type BoxInfo = {
  box: {
    address: string;
    filing: boolean;
    file_customers: boolean;
    marketing: boolean;
    drafts: boolean;
    outlook_drafts: boolean;
    highlight: boolean;
    categories_ready: boolean;
    sign_off: string;
    signature: string | null;
    signature_html: string | null;
    signature_images: { contentId: string; contentType: string; contentBytes: string }[] | null;
    signature_at: string | null;
    style: string | null;
    style_examples: { to: string; text: string }[] | null;
    style_from: number | null;
    style_at: string | null;
    style_edited: boolean;
    scan_before: string | null;
    sent_before: string | null;
    scan_done_at: string | null;
    last_run_at: string | null;
    last_error: string | null;
  };
  read: number;
  suggested: number;
};

function Settings({ onDisconnect }: { onDisconnect: () => void }) {
  const [info, setInfo] = useState<BoxInfo | null>(null);
  const [sig, setSig] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const apply = useCallback((r: Awaited<ReturnType<typeof call>>) => {
    if (r.ok && r.data.box) {
      setInfo(r.data as unknown as BoxInfo);
      setSig(String((r.data.box as BoxInfo['box']).signature ?? ''));
    }
  }, []);
  const load = useCallback(() => call('/api/mail/box').then(apply), [apply]);
  useEffect(() => {
    void call('/api/mail/box').then(apply);
  }, [apply]);
  if (!info) return <p className="crm-muted mx-pad">Loading…</p>;
  const b = info.box;

  async function set(patch: Record<string, unknown>, label: string) {
    setBusy(label);
    setMsg('');
    const r = await call('/api/mail/box', { method: 'PATCH', body: JSON.stringify(patch) });
    setBusy('');
    setMsg(r.ok ? 'Saved.' : String(r.data.error || 'Couldn’t save that.'));
    void load();
  }

  const toggles: { k: 'highlight' | 'drafts' | 'outlook_drafts' | 'file_customers' | 'filing' | 'marketing'; title: string; body: string }[] = [
    {
      k: 'highlight',
      title: 'Highlight in Outlook',
      body: `Every email that needs a reply is flagged in Outlook, with the category “Urgent” or “Needs reply”, so it stands out in your inbox and on your phone. The flag and category come off once you’ve replied or said no reply needed. Your own categories and flags are left alone.${b.highlight && !b.categories_ready ? ' (The categories show grey until the app is allowed to colour them: see the CRM guide, My email.)' : ''}`,
    },
    { k: 'drafts', title: 'Draft replies', body: 'Hestia writes a reply, in your style and right for their tone, for each email that needs one, for you to check, change and send. Nothing is ever sent without you pressing Send.' },
    {
      k: 'outlook_drafts',
      title: 'Put the drafts in Outlook too',
      body: 'Each draft also waits in Outlook’s Drafts, as a reply under their email, so you can check and send it from Outlook on your phone or computer. Once you’ve replied (from Outlook or here) or said no reply needed, the app takes its draft away again; one you’ve changed in Outlook is always left alone.',
    },
    {
      k: 'file_customers',
      title: 'File customers’ emails into their own folders',
      body: 'Each CRM customer has a folder inside your Inbox: Customers › “Sarah Davies (HX-0069)”, with their customer number. Once you’ve replied, or said no reply needed, their emails move into it straight away. Emails still waiting on you stay in the Inbox. Their emails are noted on their customer record too.',
    },
    {
      k: 'filing',
      title: 'File everyone else’s emails into folders',
      body: `Companies and other contacts: once you’ve replied (or there’s nothing to reply to), the email moves from your inbox to its folder (Suppliers › GoodWe, say). Emails still waiting on you stay in the inbox. Only approved folders are used${info.suggested ? `: ${info.suggested} still to check in Folders` : ''}.`,
    },
    { k: 'marketing', title: 'Move marketing to a Marketing folder', body: 'Newsletters and offers (anything with an unsubscribe link) go to a Marketing folder. Never from customers, or anyone you’ve replied to. Nothing is deleted.' },
  ];

  return (
    <div className="mx-settings">
      <section className="mx-card">
        <h3>{b.address}</h3>
        <p className="crm-muted">
          {b.scan_done_at ? 'First read finished. ' : `Reading your mailbox for the first time${b.scan_before ? ` (now at ${new Date(b.scan_before).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''}. `}
          {info.read.toLocaleString('en-GB')} emails read.
          {b.last_run_at ? ` Last checked ${new Date(b.last_run_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` : ' Not checked yet: it runs every two minutes.'}
        </p>
        {b.last_error && <p className="mx-err">Last run: {b.last_error}</p>}
      </section>
      {toggles.map((t) => (
        <section key={t.k} className="mx-card mx-toggle">
          <div>
            <h3>{t.title}</h3>
            <p className="crm-muted">{t.body}</p>
          </div>
          <button
            type="button"
            className={`crm-btn crm-btn--small ${b[t.k] ? 'crm-btn--solar' : 'crm-btn--ghost'}`}
            aria-pressed={b[t.k]}
            disabled={!!busy}
            onClick={() => set({ [t.k]: !b[t.k] }, t.k)}
          >
            {busy === t.k ? 'Saving…' : b[t.k] ? 'On' : 'Off'}
          </button>
        </section>
      ))}
      <SignOffCard value={b.sign_off} busy={busy} onSave={(v) => set({ sign_off: v }, 'signoff')} />
      <StyleCard key={b.style_at ?? 'none'} box={b} busy={busy} onSave={(style) => set({ style }, 'style')} onLearnt={load} />
      <SignatureCard box={b} sig={sig} setSig={setSig} busy={busy} onSave={() => set({ signature: sig }, 'sig')} onCopied={load} />
      {msg && <p className="mx-ok">{msg}</p>}
      <section className="mx-card">
        <h3>Disconnect</h3>
        <p className="crm-muted">The app stops reading your mailbox and forgets what it saved. Your Outlook, and every folder made, stays as it is: turn Highlight in Outlook off first (and wait a few minutes) if you want its categories taken off.</p>
        <button
          type="button"
          className="crm-btn crm-btn--ghost crm-btn--small"
          disabled={!!busy}
          onClick={async () => {
            if (!window.confirm('Disconnect your mailbox? Folders and drafts saved here will be forgotten. Your Outlook stays as it is.')) return;
            setBusy('off');
            const r = await call('/api/mail/box', { method: 'DELETE' });
            setBusy('');
            if (r.ok) onDisconnect();
            else setMsg(String(r.data.error || 'Couldn’t disconnect.'));
          }}
        >
          {busy === 'off' ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </section>
    </div>
  );
}

/** Your writing style: what the app learnt from your sent emails, which every draft follows. Yours to edit. */
function StyleCard({ box, busy, onSave, onLearnt }: { box: BoxInfo['box']; busy: string; onSave: (style: string) => void; onLearnt: () => void }) {
  const [text, setText] = useState(box.style ?? '');
  const [learning, setLearning] = useState(false);
  const [err, setErr] = useState('');
  const [showEx, setShowEx] = useState(false);
  const learnt = box.style_at && box.style
    ? `Learnt from ${box.style_from ?? 'your'} sent emails on ${new Date(box.style_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${box.style_edited ? ', then edited by you (it won’t be re-learnt over your edits)' : ', and learnt again every 30 days'}.`
    : box.sent_before
      ? 'It’s learnt once your sent emails from the last six months have been read (part of the first read).'
      : 'Not learnt yet: it happens on the next run, or tap Learn it now.';
  return (
    <section className="mx-card mx-style">
      <h3>Your writing style</h3>
      <p className="crm-muted">
        Every draft is written the way you write: your greetings, sign-offs, length, tone and phrases, matched most closely to emails you’ve sent the same person before. {learnt}
      </p>
      <div className="mx-draftbox">
        <textarea className="crm-input" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="How you write appears here once it’s been learnt." disabled={learning} />
        {learning && <WritingSpark label="Learning your style" steps={['Reading your sent emails', 'Picking out your habits', 'Writing the guide', 'Choosing examples']} />}
      </div>
      {!!box.style_examples?.length && (
        <>
          <button type="button" className="crm-link" onClick={() => setShowEx(!showEx)} aria-expanded={showEx}>
            {showEx ? 'Hide' : 'Show'} the {box.style_examples.length} example emails it copies
          </button>
          {showEx && (
            <div className="mx-convo mx-examples">
              {box.style_examples.map((e, i) => (
                <article key={i} className="mx-msg is-out">
                  <header>
                    <b>To {e.to}</b>
                  </header>
                  <p>{e.text}</p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {err && <p className="mx-err">{err}</p>}
      <div className="mx-actions">
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy || learning || text.trim() === (box.style ?? '').trim()} onClick={() => onSave(text)}>
          {busy === 'style' ? 'Saving…' : 'Save my changes'}
        </button>
        <button
          type="button"
          className="crm-btn crm-btn--ghost crm-btn--small"
          disabled={!!busy || learning || !!box.sent_before}
          onClick={async () => {
            if (box.style_edited && !window.confirm('Learn it again from your sent emails? This replaces your edits.')) return;
            setLearning(true);
            setErr('');
            const r = await call('/api/mail/box/style', { method: 'POST' });
            setLearning(false);
            if (!r.ok) return setErr(String(r.data.error || 'Couldn’t learn it.'));
            onLearnt();
          }}
        >
          {learning ? 'Learning…' : box.style ? 'Learn it again' : 'Learn it now'}
        </button>
      </div>
    </section>
  );
}

/** Your signature: the one on your emails now, copied from your sent emails, shown as it will look. */
function SignatureCard({ box, sig, setSig, busy, onSave, onCopied }: { box: BoxInfo['box']; sig: string; setSig: (s: string) => void; busy: string; onSave: () => void; onCopied: () => void }) {
  const [copying, setCopying] = useState(false);
  const [note, setNote] = useState('');
  // Its pictures (your logo) are inside the emails: shown here from the copies kept with it. No <style> blocks on this page.
  const preview = useMemo(() => {
    if (!box.signature_html) return '';
    let html = box.signature_html.replace(/<style[\s\S]*?<\/style>/gi, '');
    for (const img of box.signature_images ?? []) html = html.split(`cid:${img.contentId}`).join(`data:${img.contentType};base64,${img.contentBytes}`);
    return html;
  }, [box.signature_html, box.signature_images]);
  const when = box.signature_at ? new Date(box.signature_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  return (
    <section className="mx-card">
      <h3>Your signature</h3>
      {box.signature_html ? (
        <>
          <p className="crm-muted">
            The signature on your emails now, copied from your sent emails{when ? ` (checked ${when}, and again every week, so a change you make in Outlook comes through)` : ''}. Every reply ends with it, in Outlook’s Drafts and when you send from here.
          </p>
          <div className="mx-sigpreview" dangerouslySetInnerHTML={{ __html: preview }} />
        </>
      ) : (
        <>
          <p className="crm-muted">
            {box.signature_at
              ? 'Your signature couldn’t be found in your latest sent emails. It’s copied from emails sent from Outlook on your computer or the web (not your phone), so send a couple from there, then tap Copy it again. Until then, replies end with this:'
              : 'Your signature is copied from your latest sent emails on the next run. Until then, replies end with this:'}
          </p>
          <textarea className="crm-input" rows={4} value={sig} onChange={(e) => setSig(e.target.value)} placeholder={'Your name\nHeliaxis\nYour mobile'} />
        </>
      )}
      {note && <p className="mx-warn">{note}</p>}
      <div className="mx-actions">
        {!box.signature_html && (
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy || copying} onClick={onSave}>
            {busy === 'sig' ? 'Saving…' : 'Save'}
          </button>
        )}
        <button
          type="button"
          className="crm-btn crm-btn--ghost crm-btn--small"
          disabled={!!busy || copying}
          onClick={async () => {
            setCopying(true);
            setNote('');
            const r = await call('/api/mail/box/signature', { method: 'POST' });
            setCopying(false);
            if (!r.ok) return setNote(String(r.data.error || 'Couldn’t copy it.'));
            if (!r.data.found) setNote('No signature found in your latest sent emails.');
            onCopied();
          }}
        >
          {copying ? 'Copying…' : 'Copy it again from my sent emails'}
        </button>
      </div>
    </section>
  );
}

/** What every reply ends with, just above your signature. */
function SignOffCard({ value, busy, onSave }: { value: string; busy: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value || 'Kind regards,');
  return (
    <section className="mx-card">
      <h3>Sign-off</h3>
      <p className="crm-muted">Every reply Hestia writes ends with this, just above your signature.</p>
      <div className="mx-steer">
        <input className="crm-input" value={v} onChange={(e) => setV(e.target.value)} maxLength={60} aria-label="Sign-off" />
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy || !v.trim() || v.trim() === (value || '').trim()} onClick={() => onSave(v.trim())}>
          {busy === 'signoff' ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  );
}
