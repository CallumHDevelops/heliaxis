import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../../blog.css';
import '../../../home.css';
import { BlogIndexView } from '@/components/blog/BlogIndexView';
import { getBlogCategories, getCategoryBySlug, getPublicPosts } from '@/lib/blog/queries';
import { SiteFooter } from '@/components/home/SiteFooter';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) return { title: 'Category — Heliaxis Blog' };
  return {
    title: `${cat.title} — Heliaxis Blog`,
    description: cat.description || `Articles about ${cat.title.toLowerCase()} from Heliaxis.`,
  };
}

export default async function BlogCategoryPage({ params }: Props) {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) notFound();

  const [posts, categories] = await Promise.all([
    getPublicPosts(slug),
    getBlogCategories(),
  ]);

  return (
    <>
      <BlogIndexView
        posts={posts}
        categories={categories}
        activeCategory={slug}
        heading={cat.title}
        lead={cat.description || `Guides on ${cat.title.toLowerCase()} from Heliaxis.`}
      />
      <SiteFooter />
    </>
  );
}
