import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { isAiConfigured } from '@/lib/blog/ai';
import { listCmsAiBlogs } from '@/lib/blog/cms-ai-blogs';
import { BlogAdminCreate } from './BlogAdminCreate';
import { BlogAdminList } from './BlogAdminList';
import './blog-admin.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI Blog — Heliaxis CMS',
  robots: { index: false, follow: false },
};

export default async function AdminBlogPage() {
  const { profile } = await getSessionProfile();
  const aiReady = isAiConfigured();
  const posts = await listCmsAiBlogs();

  const draft = posts.filter((p) => p.status === 'draft' && !p.live).length;
  const scheduled = posts.filter((p) => p.status === 'scheduled').length;
  const live = posts.filter((p) => p.status === 'published' || p.live).length;

  return (
    <AdminShell active="blog" isAdmin={profile?.role === 'admin'}>
      <div className="blog-admin">
        <header className="blog-admin__header">
          <div>
            <h1 className="blog-admin__title">AI Blog</h1>
            <p className="blog-admin__lede">
              Manage AI articles separately from website pages in the{' '}
              <Link href="/admin" style={{ color: '#211F18', fontWeight: 600 }}>
                CMS
              </Link>
              . Publish now, or schedule to go live automatically.
            </p>
          </div>
          <div className="blog-admin__stats" aria-label="Article counts">
            <span className="blog-admin__stat">
              Drafts <strong>{draft}</strong>
            </span>
            <span className="blog-admin__stat">
              Scheduled <strong>{scheduled}</strong>
            </span>
            <span className="blog-admin__stat">
              Live <strong>{live}</strong>
            </span>
          </div>
        </header>

        {profile?.role === 'admin' ? (
          <BlogAdminCreate aiReady={aiReady} />
        ) : (
          <p style={{ color: '#6E6A5E', margin: 0 }}>Only admins can create posts.</p>
        )}

        <BlogAdminList posts={posts} />
      </div>
    </AdminShell>
  );
}
