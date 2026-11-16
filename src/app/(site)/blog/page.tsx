import type { Metadata } from 'next';
import { withSeoOverride } from '@/lib/seo/overrides';
import './blog.css';
import '../home.css';
import { BlogIndexView } from '@/components/blog/BlogIndexView';
import { getBlogCategories, getPublicPosts } from '@/lib/blog/queries';
import { SiteFooter } from '@/components/home/SiteFooter';

const META: Metadata = {
  title: 'Blog: practical energy guides',
  description:
    'Guides and updates on solar, battery storage, and energy funding for South Wales homes and businesses.',
};

/** The page's title and description, with any change approved in the SEO report on top. */
export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride('/blog', META);
}

export const revalidate = 60;

export default async function BlogPage() {
  const [posts, categories] = await Promise.all([getPublicPosts(), getBlogCategories()]);

  return (
    <>
      <BlogIndexView posts={posts} categories={categories} />
      <SiteFooter />
    </>
  );
}
