import type { Metadata } from 'next';
import './blog.css';
import '../home.css';
import { BlogIndexView } from '@/components/blog/BlogIndexView';
import { getBlogCategories, getPublicPosts } from '@/lib/blog/queries';
import { SiteFooter } from '@/components/home/SiteFooter';

export const metadata: Metadata = {
  title: 'Blog — Heliaxis',
  description:
    'Guides and updates on solar, battery storage, and energy funding for South Wales homes and businesses.',
};

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
