import type { CSSProperties } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { signOut } from '@/lib/auth-actions';
import { setUserStatus } from './actions';
import { brand } from '@/components/auth/authStyles';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function ApprovalsPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from('profiles')
    .select('id, email, full_name, role, status, created_at')
    .order('created_at', { ascending: true });

  const rows: Row[] = data ?? [];
  const pending = rows.filter((r) => r.status === 'pending');
  const others = rows.filter((r) => r.status !== 'pending');

  const cell: CSSProperties = {
    padding: '.7rem .8rem',
    borderBottom: `1px solid ${brand.line}`,
    fontSize: '.9rem',
    textAlign: 'left',
  };
  const th: CSSProperties = {
    ...cell,
    fontSize: '.72rem',
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    color: brand.muted,
    fontWeight: 600,
  };
  const btn = (bg: string, color: string): CSSProperties => ({
    padding: '.4rem .8rem',
    fontSize: '.8rem',
    fontWeight: 700,
    color,
    background: bg,
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        background: brand.paper,
        fontFamily: brand.body,
        color: brand.ink,
        padding: '2rem 1rem',
      }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>User approvals</h1>
            <p style={{ color: brand.muted, fontSize: '.9rem', margin: '.25rem 0 0' }}>
              {pending.length} awaiting approval
            </p>
          </div>
          <div style={{ display: 'flex', gap: '.6rem' }}>
            <a
              href="/admin"
              style={{
                ...btn(brand.ink, brand.paper),
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Back to CMS
            </a>
            <form action={signOut}>
              <button style={btn('transparent', brand.ink)} type="submit">
                Sign out
              </button>
            </form>
          </div>
        </header>

        {/* Pending */}
        <section
          style={{
            background: brand.card,
            border: `1px solid ${brand.line}`,
            borderRadius: '4px',
            overflow: 'hidden',
            marginBottom: '2rem',
          }}
        >
          <div style={{ padding: '.8rem .8rem', borderBottom: `1px solid ${brand.line}`, fontWeight: 700 }}>
            Pending requests
          </div>
          {pending.length === 0 ? (
            <p style={{ padding: '1.25rem .8rem', color: brand.muted, margin: 0, fontSize: '.9rem' }}>
              No pending requests. 🎉
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Email</th>
                  <th style={th}>Requested</th>
                  <th style={{ ...th, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((u) => (
                  <tr key={u.id}>
                    <td style={cell}>{u.full_name || '—'}</td>
                    <td style={cell}>{u.email}</td>
                    <td style={cell}>{fmt(u.created_at)}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      <form action={setUserStatus} style={{ display: 'inline-flex', gap: '.4rem' }}>
                        <input type="hidden" name="id" value={u.id} />
                        <button style={btn(brand.solar, brand.ink)} name="status" value="approved">
                          Approve
                        </button>
                        <button
                          style={btn('transparent', '#8a2020')}
                          name="status"
                          value="rejected"
                        >
                          Reject
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Existing members */}
        <section
          style={{
            background: brand.card,
            border: `1px solid ${brand.line}`,
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '.8rem .8rem', borderBottom: `1px solid ${brand.line}`, fontWeight: 700 }}>
            Team members
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {others.map((u) => (
                <tr key={u.id}>
                  <td style={cell}>{u.full_name || '—'}</td>
                  <td style={cell}>{u.email}</td>
                  <td style={cell}>{u.role}</td>
                  <td style={cell}>
                    <span
                      style={{
                        color: u.status === 'approved' ? brand.ok : '#8a2020',
                        fontWeight: 600,
                      }}
                    >
                      {u.status}
                    </span>
                  </td>
                </tr>
              ))}
              {others.length === 0 && (
                <tr>
                  <td style={{ ...cell, color: brand.muted }} colSpan={4}>
                    No members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
