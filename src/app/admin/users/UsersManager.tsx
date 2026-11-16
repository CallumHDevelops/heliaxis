'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PORTALS } from '@/lib/portals';
import { Sheet } from '../crm/CrmUi';
import '../crm/crm.css';
import { sendPasswordReset, updateUser } from './actions';
import './users.css';

export type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: 'member' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
  portals: string[];
  /** Gets the proposal pack tasks and alerts. Absent until supabase/proposal-pack.sql has been run. */
  project_admin?: boolean | null;
  created_at: string;
};

const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const initials = (u: Pick<UserRow, 'full_name' | 'email'>) =>
  ((u.full_name || u.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();

/** The portals, grouped by what they are for, so a long list reads as a few short ones. */
const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Customers and sales', keys: ['crm', 'enquiries', 'tasks'] },
  { title: 'Website and brand', keys: ['cms', 'branding', 'design', 'analytics'] },
  { title: 'Social', keys: ['social', 'social_monitoring'] },
  { title: 'People and sites', keys: ['subcontractors', 'team', 'rams'] },
];
const groupsFor = () => {
  const placed = new Set(GROUPS.flatMap((g) => g.keys));
  const rest = PORTALS.filter((p) => !placed.has(p.key)).map((p) => p.key);
  return rest.length ? [...GROUPS, { title: 'Other', keys: rest }] : GROUPS;
};

type Filter = 'all' | 'pending' | 'active' | 'rejected';
const STATUS_LABEL = { pending: 'Awaiting approval', approved: 'Active', rejected: 'Rejected' } as const;

export function UsersManager({ rows, selfId, hasPortals, hasProjectAdmin, loadError }: { rows: UserRow[]; selfId: string; hasPortals: boolean; hasProjectAdmin: boolean; loadError: string | null }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<{ id: string; approve: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const router = useRouter();

  const counts = useMemo(() => ({ all: rows.length, pending: rows.filter((r) => r.status === 'pending').length, active: rows.filter((r) => r.status === 'approved').length, rejected: rows.filter((r) => r.status === 'rejected').length }), [rows]);
  const shown = useMemo(() => {
    const order = { pending: 0, approved: 1, rejected: 2 };
    const want = (r: UserRow) => filter === 'all' || (filter === 'active' ? r.status === 'approved' : r.status === filter);
    return rows
      .filter((r) => want(r) && (!q || `${r.full_name ?? ''} ${r.email ?? ''}`.toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => order[a.status] - order[b.status] || (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1) || (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));
  }, [rows, q, filter]);
  const editing = open ? rows.find((r) => r.id === open.id) ?? null : null;

  async function reject(u: UserRow) {
    if (!window.confirm(`Reject ${u.full_name || u.email}? They won't be able to sign in.`)) return;
    const r = await updateUser(u.id, { status: 'rejected', role: u.role, portals: u.portals });
    setNotice(r.ok ? `${u.full_name || u.email} was rejected.` : r.error);
    if (r.ok) router.refresh();
  }

  const tabs: [Filter, string][] = [
    ['all', 'Everyone'],
    ['pending', 'Awaiting approval'],
    ['active', 'Active'],
    ['rejected', 'Rejected'],
  ];

  return (
    <div className="us-page">
      <header className="us-head">
        <div>
          <h1>Users</h1>
          <p>
            {counts.active} active{counts.pending > 0 && <> · <strong>{counts.pending} awaiting approval</strong></>}. Approve sign-ups, choose what each person can open, and set their role.
          </p>
        </div>
        <input className="us-search" type="search" placeholder="Search name or email…" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
      </header>

      {loadError && <p className="crm-banner crm-banner--err">Couldn’t load users: {loadError}</p>}
      {!hasPortals && (
        <p className="crm-banner">
          Portal access isn’t set up in the database yet. Run <code>supabase/user-portals.sql</code> in the Supabase SQL editor. Until then members keep their old access (CMS and Enquiries).
        </p>
      )}
      {notice && (
        <p className="crm-banner" role="status">
          {notice}{' '}
          <button type="button" className="crm-link" onClick={() => setNotice('')}>
            OK
          </button>
        </p>
      )}

      <div className="us-tabs" role="tablist" aria-label="Show">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} className={`us-tab${filter === k ? ' on' : ''}${k === 'pending' && counts.pending ? ' is-attn' : ''}`} onClick={() => setFilter(k)}>
            {label} <span>{counts[k]}</span>
          </button>
        ))}
      </div>

      <ul className="us-list">
        {shown.map((u) => {
          const self = u.id === selfId;
          const names = u.role === 'admin' ? 'Everything' : u.portals.map((k) => PORTALS.find((p) => p.key === k)?.label ?? k).join(', ');
          return (
            <li key={u.id} className={`us-row s-${u.status}`}>
              <span className="us-avatar" aria-hidden="true">
                {initials(u)}
              </span>
              <div className="us-who">
                <strong>
                  {u.full_name || u.email || 'No name'}
                  {self && <span className="us-you">you</span>}
                </strong>
                <span>{u.full_name ? u.email : ''}</span>
              </div>
              <div className="us-tags">
                <span className={`us-pill is-${u.status}`}>{STATUS_LABEL[u.status]}</span>
                {u.role === 'admin' && <span className="us-pill is-admin">Admin</span>}
                {u.project_admin && <span className="us-pill">Project admin</span>}
              </div>
              <div className="us-access" title={names}>
                {u.role === 'admin' ? 'All portals' : u.portals.length ? `${u.portals.length} portal${u.portals.length > 1 ? 's' : ''}` : 'No portals yet'}
                <small>{u.role === 'admin' ? 'Admins open everything' : names || (u.status === 'pending' ? 'Choose when you approve' : '')}</small>
              </div>
              <span className="us-date">Joined {fmt(u.created_at)}</span>
              <div className="us-go">
                {u.status === 'pending' ? (
                  <>
                    <button type="button" className="crm-btn crm-btn--solar crm-btn--small" onClick={() => setOpen({ id: u.id, approve: true })}>
                      Review
                    </button>
                    <button type="button" className="crm-btn crm-btn--ghost crm-btn--small us-danger" onClick={() => void reject(u)}>
                      Reject
                    </button>
                  </>
                ) : (
                  <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setOpen({ id: u.id, approve: false })}>
                    Edit
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {shown.length === 0 && <li className="us-empty">{rows.length ? 'Nobody matches.' : 'No users yet.'}</li>}
      </ul>

      <p className="us-note">
        New people register at <code>/register</code> and appear here awaiting approval. Admins can open every portal and manage users. RAMS is a separate app: ticking it shows its link on that person’s dashboard.
      </p>

      {editing && (
        <UserSheet
          key={editing.id}
          u={editing}
          self={editing.id === selfId}
          approve={!!open?.approve}
          hasPortals={hasPortals}
          hasProjectAdmin={hasProjectAdmin}
          onClose={() => setOpen(null)}
          onSaved={(text) => {
            setOpen(null);
            setNotice(text);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function UserSheet({ u, self, approve, hasPortals, hasProjectAdmin, onClose, onSaved }: { u: UserRow; self: boolean; approve: boolean; hasPortals: boolean; hasProjectAdmin: boolean; onClose: () => void; onSaved: (text: string) => void }) {
  const [status, setStatus] = useState<UserRow['status']>(approve ? 'approved' : u.status);
  const [role, setRole] = useState(u.role);
  const [portals, setPortals] = useState<string[]>(u.portals);
  const [projectAdmin, setProjectAdmin] = useState(!!u.project_admin);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const admin = role === 'admin';
  const dirty = status !== u.status || role !== u.role || [...portals].sort().join() !== [...u.portals].sort().join() || (hasProjectAdmin && projectAdmin !== !!u.project_admin);
  const toggle = (k: string) => setPortals((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const name = u.full_name || u.email || 'this person';

  async function save() {
    setBusy(true);
    setErr('');
    const r = await updateUser(u.id, { status, role, portals, ...(hasProjectAdmin ? { projectAdmin } : {}) });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onSaved(status === 'approved' && u.status !== 'approved' ? `${name} is approved.` : `Saved ${name}.`);
  }

  return (
    <Sheet title={u.status === 'pending' ? `Review ${name}` : name} onClose={onClose} wide>
      <div className="us-sheet">
        <div className="us-sheet__who">
          <span className="us-avatar us-avatar--big" aria-hidden="true">
            {initials(u)}
          </span>
          <div>
            <strong>{name}</strong>
            <span>{u.email}</span>
            <small>Joined {fmt(u.created_at)}</small>
          </div>
        </div>

        <div className="us-sec">
          <h3>Account</h3>
          <div className="us-two">
            <div>
              <label className="crm-label" htmlFor="us-status">
                Status
              </label>
              <select id="us-status" className="crm-input" value={status} onChange={(e) => setStatus(e.target.value as UserRow['status'])} disabled={self}>
                <option value="pending">Awaiting approval</option>
                <option value="approved">Active</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <span className="crm-label">Role</span>
              <div className="us-seg" role="group" aria-label="Role">
                {(['member', 'admin'] as const).map((r) => (
                  <button key={r} type="button" className={role === r ? 'on' : ''} aria-pressed={role === r} disabled={self} onClick={() => setRole(r)}>
                    {r === 'admin' ? 'Admin' : 'Member'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="us-switch" title={hasProjectAdmin ? '' : 'Run supabase/proposal-pack.sql in the Supabase SQL editor first'}>
            <input type="checkbox" checked={projectAdmin} onChange={(e) => setProjectAdmin(e.target.checked)} disabled={!hasProjectAdmin} />
            <span>
              Project admin
              <small>Gets the task and alert when a customer accepts before their proposal pack is finished.</small>
            </span>
          </label>
        </div>

        <div className="us-sec">
          <div className="us-sec__h">
            <h3>What they can open</h3>
            {!admin && hasPortals && (
              <span className="us-bulk">
                <button type="button" className="crm-link" onClick={() => setPortals(PORTALS.map((p) => p.key))}>
                  All
                </button>
                <button type="button" className="crm-link" onClick={() => setPortals([])}>
                  None
                </button>
              </span>
            )}
          </div>
          {admin ? (
            <p className="crm-muted">Admins can open every portal and manage users.</p>
          ) : (
            groupsFor().map((g) => (
              <fieldset key={g.title} className="us-group" disabled={!hasPortals}>
                <legend>{g.title}</legend>
                {g.keys.map((k) => {
                  const p = PORTALS.find((x) => x.key === k);
                  if (!p) return null;
                  const on = portals.includes(k);
                  return (
                    <label key={k} className={`us-portal${on ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(k)} />
                      <span>
                        {p.label}
                        <small>{p.description}</small>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ))
          )}
        </div>

        {u.email && <PasswordReset id={u.id} email={u.email} />}

        {err && <p className="crm-banner crm-banner--err">{err}</p>}
        <div className="crm-actions us-sheet__foot">
          <button type="button" className="crm-btn crm-btn--solar" disabled={busy || (!dirty && u.status !== 'pending')} onClick={() => void save()}>
            {busy ? 'Saving…' : u.status === 'pending' && status === 'approved' ? `Approve${!admin && portals.length ? ` with ${portals.length} portal${portals.length > 1 ? 's' : ''}` : ''}` : 'Save'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** Email someone a password reset link, or copy one to send another way (e.g. WhatsApp). */
function PasswordReset({ id, email }: { id: string; email: string }) {
  const [busy, setBusy] = useState<'email' | 'link' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function run(mode: 'email' | 'link') {
    if (mode === 'email' && !confirm(`Email a password reset link to ${email}?`)) return;
    setBusy(mode);
    setMsg(null);
    setLink(null);
    const r = await sendPasswordReset(id, mode);
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    if (r.link) {
      setLink(r.link);
      const copied = await navigator.clipboard?.writeText(r.link).then(
        () => true,
        () => false
      );
      setMsg({ ok: true, text: copied ? 'Link copied. Send it to them; it works once, for an hour.' : 'Copy the link below and send it to them.' });
    } else {
      setMsg({ ok: true, text: `Reset link emailed to ${r.email}` });
    }
  }

  return (
    <div className="us-sec">
      <h3>Password</h3>
      <div className="crm-actions" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => void run('email')}>
          {busy === 'email' ? 'Sending…' : 'Email a reset link'}
        </button>
        <button
          type="button"
          className="crm-btn crm-btn--ghost crm-btn--small"
          disabled={!!busy}
          onClick={() => void run('link')}
          title="Makes a new link (cancelling any earlier one) for you to send by WhatsApp or text. Don't open it yourself: it signs in as them."
        >
          {busy === 'link' ? 'Making…' : 'Copy a link to send'}
        </button>
      </div>
      {msg && <p className={msg.ok ? 'us-ok' : 'us-err'}>{msg.text}</p>}
      {link && <input className="crm-input us-reset-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Reset link" />}
    </div>
  );
}
