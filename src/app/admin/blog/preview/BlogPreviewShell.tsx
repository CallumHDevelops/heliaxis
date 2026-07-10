import Header from '@/components/site/Header';
import { SiteFooter } from '@/components/home/SiteFooter';
import { BlogArticleView } from '@/components/blog/BlogArticleView';
import type { BlogPost } from '@/lib/blog/types';
import { statusLabel } from '@/lib/blog/visibility';
import { brand } from '@/components/auth/authStyles';

export function BlogPreviewShell({
  post,
  related = [],
  bannerNote,
}: {
  post: BlogPost;
  related?: BlogPost[];
  bannerNote?: string;
}) {
  const note =
    bannerNote ||
    `Preview only · ${statusLabel(post.status)} · not indexed · visitors only see published / due scheduled posts`;

  return (
    <div className="site">
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: brand.ink,
          color: brand.paper,
          padding: '8px 16px',
          fontSize: '0.78rem',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.04em',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <span>{note}</span>
        <a href="/admin/blog" style={{ color: brand.solar, fontWeight: 700, textDecoration: 'none' }}>
          ← Back to Blog admin
        </a>
      </div>
      <Header />
      <BlogArticleView post={post} related={related} />
      <SiteFooter />
    </div>
  );
}
