'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandIcon, Sheet } from '../crm/CrmUi';
import { WritingSpark } from '../sales/quotes/[id]/WritingSpark';
import type { MailCounts, ThreadRow } from '@/lib/mail/server';
import '../crm/crm.css';
import '../sales/quotes/quotes.css';
import './mail.css';

type Tab = 'reply' | 'waiting' | 'people' | 'fyi' | 'marketing' | 'folders' | 'settings';
const LIST_TABS: Tab[] = ['reply', 'waiting', 'people', 'fyi', 'marketing'];

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
  const [startTab] = useState<Tab>(() => ((['reply', 'waiting', 'people', 'fyi', 'marketing', 'folders', 'settings'] as Tab[]).includes(p.startTab as Tab) ? (p.startTab as Tab) : 'reply'));
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
        />
      )}
    </div>
  );
}

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
              ? `${counts.reply} to reply${counts.urgent ? `, ${counts.urgent} of them urgent or important` : ''}${counts.drafts ? `. ${counts.drafts} draft${counts.drafts === 1 ? '' : 's'} ready to check.` : '.'}`
              : 'Nothing waiting on a reply from you.'
            : 'Your own mailbox, sorted: what needs a reply, drafts ready to check, and everything filed.'}
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
        <p>The app reads your inbox every two minutes and:</p>
        <ul>
          <li>shows the emails that need a reply from you, the most important first, each with a draft reply to check and send;</li>
          <li>spots people asking about solar, batteries or heat pumps who aren’t in the CRM yet, so you can add them in one tap;</li>
          <li>works out a folder for every company and customer (GoodWe, National Grid, Customers/Jane Smith);</li>
          <li>once you turn filing on, moves each email into its folder after you’ve replied, and marketing into a Marketing folder.</li>
        </ul>
        <p className="crm-muted">
          Nothing is moved until you’ve checked the folders and turned filing on, and nothing is ever deleted. Only you see your email here.
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
  reply: 'Nothing needs a reply from you. New emails are checked every two minutes.',
  waiting: 'Nobody you’ve emailed in the last six weeks has gone quiet for three days or more.',
  people: 'No one new. When someone not in the CRM asks about a job, they appear here.',
  fyi: 'Nothing in the last two weeks.',
  marketing: 'No marketing emails found.',
};

const HINT: Record<string, string> = {
  waiting: 'You sent the last email, three or more days ago, and they haven’t replied. Worth a nudge?',
  people: 'They’ve emailed about a job but aren’t in the CRM. Add them so nothing is missed.',
  fyi: 'The last two weeks’ emails that need nothing from you. If one does, open it and say so.',
  marketing: 'Newsletters and offers. They go to the Marketing folder once that’s on in Settings. If one isn’t marketing, open it and say so.',
};

function ThreadList({ tab, rows, loading, now, onOpen }: { tab: Tab; rows: ThreadRow[]; loading: boolean; now: number; onOpen: (r: ThreadRow) => void }) {
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
              <li key={r.id}>
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
                    {r.summary && <span className="mx-row__p">{r.summary}</span>}
                    <span className="mx-chips">
                      {tab === 'reply' && PRIORITY[r.priority ?? ''] && <span className={`mx-chip is-${r.priority}`}>{PRIORITY[r.priority!]}</span>}
                      {r.due && <span className="mx-chip is-due">{r.due}</span>}
                      {r.prospect && !r.enquiry_id && <span className="mx-chip is-new">New customer?</span>}
                      {r.enquiry_id && <span className="mx-chip">In the CRM</span>}
                      {tab === 'reply' && draftReady && <span className="mx-chip is-draft">Draft ready</span>}
                      {r.kind && KIND[r.kind] && r.kind !== 'prospect' && r.kind !== 'customer' && <span className="mx-chip is-quiet">{KIND[r.kind]}</span>}
                    </span>
                  </span>
                </button>
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

function ThreadSheet({ row, tab, canCrm, now, onClose, onChanged }: { row: ThreadRow; tab: Tab; canCrm: boolean; now: number; onClose: () => void; onChanged: () => void }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [latest, setLatest] = useState<{ text: string; webLink: string | null } | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [text, setText] = useState(row.draft ?? '');
  const [steer, setSteer] = useState('');
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<'' | 'send' | 'outlook' | 'redraft' | 'done' | 'undone' | 'crm' | 'notMarketing'>('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [gaps, setGaps] = useState(false);
  const [crm, setCrm] = useState({ name: row.prospect?.name || row.who_name || '', phone: row.prospect?.phone || '', postcode: row.prospect?.postcode || '' });
  const isReply = row.state === 'reply' || row.state === 'new';

  useEffect(() => {
    let live = true;
    void call(`/api/mail/threads/${row.id}`).then((r) => {
      if (!live || !r.ok) return;
      setMsgs((r.data.messages as Msg[]) ?? []);
      setLatest((r.data.latest as typeof latest) ?? null);
      setSignature((r.data.signature as string | null) ?? null);
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
              · folder {row.rule.folder}
              {row.rule.status !== 'on' ? ' (not approved yet)' : ''}
            </span>
          )}
        </p>
        {(row.summary || row.why) && (
          <div className={`mx-why is-${row.priority ?? 'normal'}`}>
            {row.summary && <b>{row.summary}</b>}
            {row.why && <span>{row.why}</span>}
            {row.due && <span>Deadline: {row.due}</span>}
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
            <p className="crm-muted">They look like a new customer. Add them so their emails go on their record and into their own folder.</p>
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

        {tab === 'marketing' ? (
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
              {busy === 'redraft' && <WritingSpark label="Writing your reply" steps={['Reading the conversation', 'Checking the CRM', 'Writing it your way', 'Reading it back']} />}
            </div>
            {signature && <p className="crm-muted crm-small">Your signature goes underneath when it’s sent.</p>}
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
                  const d = await act('send', { text, all, force: gaps });
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
                  const d = await act('outlook', { text, all });
                  if (d) {
                    setNote('It’s in your Outlook Drafts.');
                    if (d.link) window.open(String(d.link), '_blank', 'noopener');
                  }
                }}
              >
                {busy === 'outlook' ? 'Saving…' : 'Put in Outlook drafts'}
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
                  if (await act('done')) onChanged();
                }}
              >
                {busy === 'done' ? 'Saving…' : 'No reply needed'}
              </button>
            </div>
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
        Every company is matched by its email domain (everyone at goodwe.com goes to GoodWe), and customers by their own address. Customers, contacts and organisations already in the CRM are on straight away; the rest are suggestions to check. Use a / for a folder inside a folder: “Suppliers/GoodWe”. Nothing moves until filing is on in Settings.
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
  box: { address: string; filing: boolean; marketing: boolean; drafts: boolean; signature: string | null; scan_before: string | null; sent_before: string | null; scan_done_at: string | null; last_run_at: string | null; last_error: string | null };
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

  const toggles: { k: 'drafts' | 'filing' | 'marketing'; title: string; body: string }[] = [
    { k: 'drafts', title: 'Draft replies', body: 'Writes a reply for each email that needs one, for you to check, change and send. Nothing is ever sent without you pressing Send.' },
    {
      k: 'filing',
      title: 'File emails into folders',
      body: `Once you’ve replied (or there’s nothing to reply to), the email moves from your inbox to its folder. Emails still waiting on you stay in the inbox. Only approved folders are used${info.suggested ? `: ${info.suggested} still to check in Folders` : ''}.`,
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
      <section className="mx-card">
        <h3>Signature</h3>
        <p className="crm-muted">Added under replies you send from here (Outlook doesn’t add its own to these).</p>
        <textarea className="crm-input" rows={4} value={sig} onChange={(e) => setSig(e.target.value)} placeholder={'Your name\nHeliaxis\nYour mobile'} />
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => set({ signature: sig }, 'sig')}>
          {busy === 'sig' ? 'Saving…' : 'Save signature'}
        </button>
      </section>
      {msg && <p className="mx-ok">{msg}</p>}
      <section className="mx-card">
        <h3>Disconnect</h3>
        <p className="crm-muted">The app stops reading your mailbox and forgets what it saved. Your Outlook, and every folder made, stays as it is.</p>
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
