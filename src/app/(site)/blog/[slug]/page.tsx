import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../blog.css';
import '../../home.css';
import { BlogArticleView } from '@/components/blog/BlogArticleView';
import { getPublicPostBySlug, getPublicPosts, getRelatedPosts } from '@/lib/blog/queries';
import { SiteFooter } from '@/components/home/SiteFooter';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const posts = await getPublicPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublicPostBySlug(slug);
  if (!post) return { title: 'Post not found — Heliaxis' };
  const title = post.seoTitle || `${post.title} — Heliaxis`;
  const description = post.seoDescription || post.excerpt;
  const image = post.ogImage || post.mainImage.src;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: post.publishAt,
      images: [{ url: image, alt: post.mainImage.alt }],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublicPostBySlug(slug);
  if (!post) notFound();

  const related = await getRelatedPosts(post, 3);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishAt,
    author: { '@type': 'Organization', name: post.author },
    image: post.mainImage.src,
    publisher: { '@type': 'Organization', name: 'Heliaxis' },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlogArticleView post={post} related={related} />
      <SiteFooter />
    </>
  );
}
