import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@/app/(site)/blog/blog.css';
import '@/app/(site)/home.css';
import '@/app/(site)/site.css';
import { getAdminPostBySlug, getRelatedPosts } from '@/lib/blog/queries';
import { isPostPublic } from '@/lib/blog/visibility';
import { BlogPreviewShell } from '../BlogPreviewShell';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getAdminPostBySlug(slug);
  return {
    title: post ? `Preview: ${post.title} — Heliaxis CMS` : 'Preview — Heliaxis CMS',
    robots: { index: false, follow: false },
  };
}

export default async function BlogSavedPreviewPage({ params }: Props) {
  const { slug } = await params;
  const post = await getAdminPostBySlug(slug);
  if (!post) notFound();

  const related = await getRelatedPosts(post, 3).catch(() => []);
  const live = isPostPublic(post);

  return (
    <BlogPreviewShell
      post={post}
      related={related}
      bannerNote={
        live
          ? `Preview · live on /blog/${post.slug}`
          : `Preview · ${post.status} · not visible on the public site yet`
      }
    />
  );
}
