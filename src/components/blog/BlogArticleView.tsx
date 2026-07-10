import Image from 'next/image';
import Link from 'next/link';
import type { BlogBodyBlock, BlogPost } from '@/lib/blog/types';
import { formatPostDate } from '@/lib/blog/visibility';

function BodyBlocks({ blocks }: { blocks: BlogBodyBlock[] }) {
  return (
    <div className="blog-prose">
      {blocks.map((b, i) => {
        const key = `${b.type}-${i}`;
        if (b.type === 'h2') return <h2 key={key}>{b.text}</h2>;
        if (b.type === 'h3') return <h3 key={key}>{b.text}</h3>;
        if (b.type === 'quote') return <blockquote key={key}>{b.text}</blockquote>;
        if (b.type === 'ul') {
          return (
            <ul key={key}>
              {b.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }
        if (b.type === 'cta') {
          return (
            <p key={key}>
              <Link className="blog-inline-cta" href={b.href}>
                {b.label}
              </Link>
            </p>
          );
        }
        return <p key={key}>{b.text}</p>;
      })}
    </div>
  );
}

export function BlogArticleView({
  post,
  related,
}: {
  post: BlogPost;
  related: BlogPost[];
}) {
  const unoptimized =
    post.mainImage.src.startsWith('blob:') ||
    post.mainImage.src.startsWith('data:') ||
    post.mainImage.src.startsWith('/');

  return (
    <article className="blog blog-article">
      <header className="blog-article-head">
        {post.categories.length > 0 && (
          <div className="blog-tags blog-tags-top">
            {post.categories.map((c) => (
              <Link key={c.slug} href={`/blog/category/${c.slug}`}>
                {c.title}
              </Link>
            ))}
          </div>
        )}
        <div className="blog-meta">
          <span>{formatPostDate(post.publishAt)}</span>
          {post.readMinutes ? <span>{post.readMinutes} min read</span> : null}
        </div>
        <h1>{post.title}</h1>
        <p className="blog-standfirst">{post.excerpt}</p>
      </header>

      <div className="blog-article-hero">
        <Image
          src={post.mainImage.src}
          alt={post.mainImage.alt}
          fill
          sizes="100vw"
          priority
          unoptimized={unoptimized}
          className="blog-article-hero-img"
        />
      </div>

      <BodyBlocks blocks={post.body} />

      {related.length > 0 && (
        <section className="blog-related">
          <h2>Related posts</h2>
          <div className="blog-related-grid">
            {related.map((r) => (
              <Link key={r.id} href={`/blog/${r.slug}`}>
                <div className="blog-meta">
                  {r.categories[0] && <span className="blog-chip">{r.categories[0].title}</span>}
                  <span>{formatPostDate(r.publishAt)}</span>
                </div>
                <h3>{r.title}</h3>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="blog-band">
        <div className="blog-wrap">
          <div>
            <h2>Ready to cut your energy bills?</h2>
            <p>Free survey across South Wales — MCS-certified, no obligation.</p>
          </div>
          <Link href="/#quote">Get a free quote</Link>
        </div>
      </div>
    </article>
  );
}
