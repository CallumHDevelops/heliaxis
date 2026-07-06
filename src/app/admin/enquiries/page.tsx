import type { CSSProperties } from 'react';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { updateEnquiryStatus } from './actions';
import { brand } from '@/components/auth/authStyles';

export const dynamic = 'force-dynamic';

type Enquiry = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  postcode: string | null;
  interest: string | null;
  property_type: string | null;
  source: string;
  status: string;
  created_at: string;
};

const STATUS_OPTS = ['new', 'contacted', 'qualified', 'won', 'lost'];
const STATUS_COLOR: Record<string, string> = {
  new: '#C77F04',
  contacted: '#2563eb',
  qualified: '#7c3aed',
  won: '#3F7D4E',
  lost: '#8a2020',
};

function fmt(d: string) {
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default async function EnquiriesPage() {
  const { profile } = await getSessionProfile();
  const admin = createAdminClient();
  const { data } = await admin
    .from('enquiries')
    .select('id, name, email, phone, postcode, interest, property_type, source, status, created_at')
    .order('created_at', { ascending: false });

  const rows: Enquiry[] = data ?? [];
  const newCount = rows.filter((r) => r.status === 'new').length;

  const cell: CSSProperties = {
    padding: '.7rem .8rem',
    borderBottom: `1px solid ${brand.line}`,
    fontSize: '.88rem',
    textAlign: 'left',
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
  };
  const th: CSSProperties = {
    ...cell,
    fontSize: '.7rem',
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    color: brand.muted,
    fontWeight: 600,
  };

  return (
    <AdminShell active="enquiries" isAdmin={profile?.role === 'admin'}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Enquiries</h1>
        <p style={{ color: brand.muted, fontSize: '.9rem', margin: '.25rem 0 0' }}>
          {rows.length} total · {newCount} new
        </p>
      </div>

      <div
        style={{
          background: brand.card,
          border: `1px solid ${brand.line}`,
          borderRadius: '4px',
          overflowX: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr>
              <th style={th}>Received</th>
              <th style={th}>Name</th>
              <th style={th}>Contact</th>
              <th style={th}>Postcode</th>
              <th style={th}>Interest</th>
              <th style={th}>Type</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td style={{ ...cell, color: brand.muted }}>{fmt(e.created_at)}</td>
                <td style={cell}>{e.name}</td>
                <td style={cell}>
                  <a href={`mailto:${e.email}`} style={{ color: brand.ink }}>
                    {e.email}
                  </a>
                  {e.phone && (
                    <>
                      <br />
                      <a href={`tel:${e.phone}`} style={{ color: brand.muted, fontSize: '.82rem' }}>
                        {e.phone}
                      </a>
                    </>
                  )}
                </td>
                <td style={cell}>{e.postcode || '—'}</td>
                <td style={{ ...cell, whiteSpace: 'normal', maxWidth: 200 }}>{e.interest || '—'}</td>
                <td style={{ ...cell, textTransform: 'capitalize' }}>{e.property_type || '—'}</td>
                <td style={cell}>
                  <form
                    action={updateEnquiryStatus}
                    style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}
                  >
                    <input type="hidden" name="id" value={e.id} />
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: STATUS_COLOR[e.status] || brand.muted,
                        display: 'inline-block',
                      }}
                    />
                    <select
                      name="status"
                      defaultValue={e.status}
                      style={{
                        padding: '.3rem .4rem',
                        fontSize: '.82rem',
                        border: `1px solid ${brand.line}`,
                        borderRadius: '2px',
                        background: '#fff',
                        color: brand.ink,
                        textTransform: 'capitalize',
                      }}
                    >
                      {STATUS_OPTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      style={{
                        padding: '.3rem .6rem',
                        fontSize: '.78rem',
                        fontWeight: 700,
                        color: brand.ink,
                        background: brand.solar,
                        border: 'none',
                        borderRadius: '2px',
                        cursor: 'pointer',
                      }}
                    >
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td style={{ ...cell, color: brand.muted }} colSpan={7}>
                  No enquiries yet. Submissions from the website quote form will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
