import { BLOG_CATEGORIES, BLOG_MOCK_POSTS } from '@/data/blog-mock';
import {
  getCmsBlogArticleBySlug,
  getCmsPublicPostBySlug,
  getCmsPublicPosts,
} from '@/lib/blog/cms-public';
import type { BlogCategory, BlogPost } from './types';
import { bodyPlainLength, estimateReadMinutes, isPostPublic } from './visibility';

function withReadTime(post: BlogPost): BlogPost {
  if (post.readMinutes) return post;
  return { ...post, readMinutes: estimateReadMinutes(bodyPlainLength(post)) };
}

function sortByDateDesc(a: BlogPost, b: BlogPost) {
  return new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime();
}

function mockPublic(categorySlug?: string): BlogPost[] {
  const now = new Date();
  let posts = BLOG_MOCK_POSTS.map(withReadTime).filter((p) => isPostPublic(p, now));
  if (categorySlug) {
    posts = posts.filter((p) => p.categories.some((c) => c.slug === categorySlug));
  }
  return posts.sort(sortByDateDesc);
}

/** Published CMS blogs first; mock seed only when no live CMS posts. */
export async function getPublicPosts(categorySlug?: string): Promise<BlogPost[]> {
  const cms = (await getCmsPublicPosts()).map(withReadTime);
  const posts = cms.length > 0 ? cms : mockPublic();
  if (categorySlug) {
    return posts
      .filter((p) => p.categories.some((c) => c.slug === categorySlug))
      .sort(sortByDateDesc);
  }
  return posts.sort(sortByDateDesc);
}

export async function getPublicPostBySlug(slug: string): Promise<BlogPost | null> {
  const cms = await getCmsPublicPostBySlug(slug);
  if (cms) return withReadTime(cms);
  const cmsPosts = await getCmsPublicPosts();
  // When CMS journals exist, do not fall through to mock for missing slugs
  if (cmsPosts.length > 0) return null;

  const post = BLOG_MOCK_POSTS.find((p) => p.slug === slug);
  if (!post || !isPostPublic(post)) return null;
  return withReadTime(post);
}

/** CMS rendered article when available (preferred over mock React body). */
export async function getCmsRenderedBlogArticle(slug: string) {
  return getCmsBlogArticleBySlug(slug);
}

/** Admin live preview — drafts and archived included (mock + CMS card meta). */
export async function getAdminPostBySlug(slug: string): Promise<BlogPost | null> {
  const cms = await getCmsPublicPostBySlug(slug);
  if (cms) return withReadTime(cms);
  const post = BLOG_MOCK_POSTS.find((p) => p.slug === slug);
  return post ? withReadTime(post) : null;
}

export async function getRelatedPosts(post: BlogPost, limit = 3): Promise<BlogPost[]> {
  const catIds = new Set(post.categories.map((c) => c.id));
  const all = await getPublicPosts();
  return all
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({
      post: p,
      score: p.categories.reduce((s, c) => s + (catIds.has(c.id) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || sortByDateDesc(a.post, b.post))
    .slice(0, limit)
    .map((x) => x.post);
}

export async function getBlogCategories(): Promise<BlogCategory[]> {
  return BLOG_CATEGORIES;
}

export async function getCategoryBySlug(slug: string): Promise<BlogCategory | null> {
  const cats = await getBlogCategories();
  return cats.find((c) => c.slug === slug) ?? null;
}

/** Admin list — mock posts (CMS AI blogs use listCmsAiBlogs). */
export async function getAllPostsForAdmin(): Promise<BlogPost[]> {
  return BLOG_MOCK_POSTS.map(withReadTime).sort(sortByDateDesc);
}
