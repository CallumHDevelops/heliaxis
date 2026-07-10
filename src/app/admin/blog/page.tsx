import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { brand } from '@/components/auth/authStyles';
import { getAllPostsForAdmin } from '@/lib/blog/queries';
import { isSanityConfigured, isSanityWriteConfigured } from '@/lib/blog/sanity';
import { isAiConfigured } from '@/lib/blog/ai';
import { formatPostDate, isPostPublic, statusLabel } from '@/lib/blog/visibility';
import { BlogAdminCreate } from './BlogAdminCreate';
import { BlogAdminPostActions } from './BlogAdminPostActions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Blog — Heliaxis CMS',
  robots: { index: false, follow: false },
};

export default async function AdminBlogPage() {
  const { profile } = await getSessionProfile();
  const posts = await getAllPostsForAdmin();
  const sanityReady = isSanityWriteConfigured();
  const sanityRead = isSanityConfigured();
  const aiReady = isAiConfigured();
  const now = new Date();

  return (
    <AdminShell active="blog" isAdmin={profile?.role === 'admin'}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Blog</h1>
        <p style={{ color: brand.muted, fontSize: '0.9rem', margin: '0.25rem 0 0' }}>
          AI-assisted posts · Sanity Free · DIY schedule via publishAt
        </p>
      </div>

      {profile?.role === 'admin' ? (
        <BlogAdminCreate sanityReady={sanityReady} aiReady={aiReady} />
      ) : (
        <p style={{ color: brand.muted, marginBottom: '1.5rem' }}>Only admins can create posts.</p>
      )}

      <div
        style={{
          background: brand.card,
          border: `1px solid ${brand.line}`,
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${brand.line}`,
            fontWeight: 700,
            fontSize: '0.95rem',
          }}
        >
          All posts ({posts.length})
          {!sanityRead && (
            <span style={{ fontWeight: 500, color: brand.muted, marginLeft: 8, fontSize: '0.82rem' }}>
              · showing mock data until Sanity is connected
            </span>
          )}
          {sanityRead && !sanityReady && (
            <span style={{ fontWeight: 500, color: '#b33', marginLeft: 8, fontSize: '0.82rem' }}>
              · read-only — set SANITY_API_TOKEN to save
            </span>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Title', 'Status', 'Live?', 'Publish at', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '0.7rem 0.8rem',
                      borderBottom: `1px solid ${brand.line}`,
                      fontSize: '0.7rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: brand.muted,
                      textAlign: 'left',
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => {
                const live = isPostPublic(p, now);
                return (
                  <tr key={p.id}>
                    <td style={{ padding: '0.75rem 0.8rem', borderBottom: `1px solid ${brand.line}`, fontSize: '0.88rem' }}>
                      <div style={{ fontWeight: 700 }}>{p.title}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: brand.muted }}>
                        /blog/{p.slug}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 0.8rem', borderBottom: `1px solid ${brand.line}`, fontSize: '0.82rem' }}>
                      {statusLabel(p.status)}
                    </td>
                    <td style={{ padding: '0.75rem 0.8rem', borderBottom: `1px solid ${brand.line}`, fontSize: '0.82rem', color: live ? brand.ok : brand.muted }}>
                      {live ? 'Yes' : 'No'}
                    </td>
                    <td style={{ padding: '0.75rem 0.8rem', borderBottom: `1px solid ${brand.line}`, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {formatPostDate(p.publishAt)}
                    </td>
                    <td style={{ padding: '0.75rem 0.8rem', borderBottom: `1px solid ${brand.line}` }}>
                      <BlogAdminPostActions
                        id={p.id}
                        slug={p.slug}
                        status={p.status}
                        canWrite={sanityReady && profile?.role === 'admin'}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
