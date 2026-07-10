import Image from 'next/image';
import Link from 'next/link';
import type { BlogCategory, BlogPost } from '@/lib/blog/types';
import { formatPostDate } from '@/lib/blog/visibility';

function isLocalOrBlob(src: string) {
  return src.startsWith('blob:') || src.startsWith('data:') || src.startsWith('/');
}

function PostCard({
  post,
  priority = false,
  delay = 0,
}: {
  post: BlogPost;
  priority?: boolean;
  delay?: number;
}) {
  const author = post.author || 'Heliaxis';
  const initial = author.trim().charAt(0).toUpperCase() || 'H';

  return (
    <li className="blog-card-item" style={{ animationDelay: `${delay}ms` }}>
      <Link href={`/blog/${post.slug}`} className="blog-card">
        <div className="blog-card-media">
          <Image
            src={post.mainImage.src}
            alt={post.mainImage.alt}
            fill
            sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
            priority={priority}
            unoptimized={isLocalOrBlob(post.mainImage.src)}
            className="blog-card-img"
          />
        </div>
        <div className="blog-card-body">
          <h2 className="blog-card-title">{post.title}</h2>
          <p className="blog-card-excerpt">{post.excerpt}</p>
          <div className="blog-card-foot">
            <span className="blog-card-avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="blog-card-author">{author}</span>
            <span className="blog-card-sep" aria-hidden="true" />
            <time dateTime={post.publishAt}>{formatPostDate(post.publishAt)}</time>
          </div>
        </div>
      </Link>
    </li>
  );
}

export function BlogIndexView({
  posts,
  categories,
  activeCategory,
  heading = 'Practical energy guides',
  lead = 'Practical guides on solar, battery, and funding for South Wales homes and businesses.',
}: {
  posts: BlogPost[];
  categories: BlogCategory[];
  activeCategory?: string;
  heading?: string;
  lead?: string;
}) {
  const featured = posts[0];

  return (
    <div className="blog">
      <header className="blog-hero">
        <div className="blog-hero-glow" aria-hidden="true" />
        <div className="blog-wrap blog-hero-grid">
          <div className="blog-hero-inner">
            <p className="blog-eyebrow blog-eyebrow-on-dark">Journal</p>
            <p className="blog-hero-brand">Heliaxis</p>
            <h1>{heading}</h1>
            <p className="blog-hero-lead">{lead}</p>
            <div className="blog-hero-actions">
              <Link className="blog-hero-cta" href="/#quote">
                Free quote →
              </Link>
              <a className="blog-hero-cta-ghost" href="#blog-posts">
                Browse articles
              </a>
            </div>
          </div>

          {featured && (
            <Link
              href={`/blog/${featured.slug}`}
              className="blog-hero-visual"
              aria-label={`Featured: ${featured.title}`}
            >
              <div className="blog-hero-visual-media">
                <Image
                  src={featured.mainImage.src}
                  alt={featured.mainImage.alt}
                  fill
                  sizes="(max-width: 900px) 0px, 520px"
                  priority
                  unoptimized={isLocalOrBlob(featured.mainImage.src)}
                  className="blog-hero-visual-img"
                />
              </div>
              <div className="blog-hero-visual-body">
                <span className="blog-hero-visual-label">Latest</span>
                <p className="blog-hero-visual-title">{featured.title}</p>
                <p className="blog-hero-visual-meta">
                  {formatPostDate(featured.publishAt)}
                  {featured.readMinutes ? ` · ${featured.readMinutes} min read` : ''}
                </p>
              </div>
            </Link>
          )}
        </div>
      </header>

      <div className="blog-wrap blog-index-body" id="blog-posts">
        <nav className="blog-filters" aria-label="Categories">
          <Link href="/blog" className={!activeCategory ? 'on' : undefined}>
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/blog/category/${c.slug}`}
              className={activeCategory === c.slug ? 'on' : undefined}
            >
              {c.title}
            </Link>
          ))}
        </nav>

        {!posts.length ? (
          <div className="blog-empty">
            <p>No posts yet. Check back soon.</p>
            <Link href="/#quote">Get a free quote →</Link>
          </div>
        ) : (
          <ul className="blog-card-grid">
            {posts.map((post, i) => (
              <PostCard
                key={post.id}
                post={post}
                priority={i === 0}
                delay={Math.min(i, 8) * 45}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
