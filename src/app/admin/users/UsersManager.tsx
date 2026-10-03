'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PORTALS } from '@/lib/portals';
import { updateUser } from './actions';
import './users.css';

export type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: 'member' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
  portals: string[];
  created_at: string;
};

const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function UsersManager({
  rows,
  selfId,
  hasPortals,
  loadError,
}: {
  rows: UserRow[];
  selfId: string;
  hasPortals: boolean;
  loadError: string | null;
}) {
  const [q, setQ] = useState('');
  const sorted = useMemo(() => {
    const order = { pending: 0, approved: 1, rejected: 2 };
    return [...rows]
      .filter((r) => !q || `${r.full_name} ${r.email}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => order[a.status] - order[b.status]);
  }, [rows, q]);
  const pending = rows.filter((r) => r.status === 'pending').length;

  return (
    <div className="us-page">
      <div className="us-head">
        <div>
          <h1>Users</h1>
          <p>
            One account per person. Approve sign-ups, make someone an admin, and choose which portals each member can open.
            {pending > 0 && <strong> {pending} awaiting approval.</strong>}
          </p>
        </div>
        <input className="us-search" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loadError && <p className="us-banner is-err">Couldn&apos;t load users: {loadError}</p>}
      {!hasPortals && (
        <p className="us-banner is-warn">
          Portal access isn&apos;t set up in the database yet — run <code>supabase/user-portals.sql</code> in the Supabase SQL
          editor. Until then members keep their old access (CMS + Enquiries).
        </p>
      )}
      <p className="us-note">
        New people register at <code>/register</code>, then appear here as pending. Admins can open every portal and manage
        users. Social and RAMS are separate apps — ticking them shows the link on the member&apos;s dashboard.
      </p>

      <div className="us-list">
        {sorted.map((u) => (
          <UserCard key={u.id} u={u} self={u.id === selfId} hasPortals={hasPortals} />
        ))}
        {sorted.length === 0 && <p className="us-empty">No users found.</p>}
      </div>
    </div>
  );
}

function UserCard({ u, self, hasPortals }: { u: UserRow; self: boolean; hasPortals: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(u.status);
  const [role, setRole] = useState(u.role);
  const [portals, setPortals] = useState<string[]>(u.portals);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty =
    status !== u.status || role !== u.role || [...portals].sort().join() !== [...u.portals].sort().join();

  async function save(next?: { status?: UserRow['status'] }) {
    setBusy(true);
    setMsg(null);
    const s = next?.status ?? status;
    if (next?.status) setStatus(next.status);
    const r = await updateUser(u.id, { status: s, role, portals });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: 'Saved' } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  }

  const toggle = (k: string) => setPortals((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  return (
    <div className={`us-card s-${u.status}`}>
      <div className="us-who">
        <strong>{u.full_name || '—'}{self && <span className="us-you">you</span>}</strong>
        <span>{u.email}</span>
        <span className="us-date">Joined {fmt(u.created_at)}</span>
      </div>

      <div className="us-controls">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as UserRow['status'])} disabled={self}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as UserRow['role'])} disabled={self}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>

      <fieldset className="us-portals" disabled={role === 'admin' || !hasPortals}>
        <legend>Portal access {role === 'admin' && <em>— admins can open everything</em>}</legend>
        {PORTALS.map((p) => (
          <label key={p.key} className={role === 'admin' || portals.includes(p.key) ? 'is-on' : ''}>
            <input
              type="checkbox"
              checked={role === 'admin' || portals.includes(p.key)}
              onChange={() => toggle(p.key)}
            />
            {p.label}
          </label>
        ))}
      </fieldset>

      <div className="us-actions">
        {u.status === 'pending' && status === 'pending' ? (
          <>
            <button className="us-btn" disabled={busy} onClick={() => save({ status: 'approved' })}>
              Approve{portals.length ? ` with ${portals.length} portal${portals.length > 1 ? 's' : ''}` : ''}
            </button>
            <button className="us-btn-ghost is-danger" disabled={busy} onClick={() => save({ status: 'rejected' })}>
              Reject
            </button>
          </>
        ) : (
          <button className="us-btn" disabled={busy || !dirty} onClick={() => save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        )}
        {msg && <span className={msg.ok ? 'us-ok' : 'us-err'}>{msg.text}</span>}
      </div>
    </div>
  );
}
