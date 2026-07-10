import { BLOG_CATEGORIES, BLOG_MOCK_POSTS } from '@/data/blog-mock';
import type { BlogCategory, BlogPost } from './types';
import { bodyPlainLength, estimateReadMinutes, isPostPublic } from './visibility';
import {
  isSanityConfigured,
  fetchSanityPosts,
  fetchSanityPostBySlug,
  fetchSanityPostBySlugAdmin,
  fetchSanityCategories,
  fetchSanityPostsForAdmin,
} from './sanity';

function withReadTime(post: BlogPost): BlogPost {
  if (post.readMinutes) return post;
  return { ...post, readMinutes: estimateReadMinutes(bodyPlainLength(post)) };
}

function sortByDateDesc(a: BlogPost, b: BlogPost) {
  return new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime();
}

async function allPublicPosts(): Promise<BlogPost[]> {
  if (isSanityConfigured()) {
    const posts = await fetchSanityPosts();
    return posts.map(withReadTime);
  }
  return BLOG_MOCK_POSTS.map(withReadTime);
}

/** Published + due scheduled posts for the public site. */
export async function getPublicPosts(categorySlug?: string): Promise<BlogPost[]> {
  const now = new Date();
  let posts = (await allPublicPosts()).filter((p) => isPostPublic(p, now));
  if (categorySlug) {
    posts = posts.filter((p) => p.categories.some((c) => c.slug === categorySlug));
  }
  return posts.sort(sortByDateDesc);
}

export async function getPublicPostBySlug(slug: string): Promise<BlogPost | null> {
  if (isSanityConfigured()) {
    const post = await fetchSanityPostBySlug(slug);
    if (!post || !isPostPublic(post)) return null;
    return withReadTime(post);
  }
  const post = BLOG_MOCK_POSTS.find((p) => p.slug === slug);
  if (!post || !isPostPublic(post)) return null;
  return withReadTime(post);
}

/** Admin live preview — drafts and archived included. */
export async function getAdminPostBySlug(slug: string): Promise<BlogPost | null> {
  if (isSanityConfigured()) {
    try {
      const post = await fetchSanityPostBySlugAdmin(slug);
      return post ? withReadTime(post) : null;
    } catch (e) {
      console.error('[blog] Admin post by slug failed', e);
      return null;
    }
  }
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
  if (isSanityConfigured()) {
    try {
      return await fetchSanityCategories();
    } catch (e) {
      console.error('[blog] Sanity categories failed', e);
      return [];
    }
  }
  return BLOG_CATEGORIES;
}

export async function getCategoryBySlug(slug: string): Promise<BlogCategory | null> {
  const cats = await getBlogCategories();
  return cats.find((c) => c.slug === slug) ?? null;
}

/** Admin list — all statuses (Sanity with token, or mock when Sanity unset). */
export async function getAllPostsForAdmin(): Promise<BlogPost[]> {
  if (isSanityConfigured()) {
    try {
      const posts = await fetchSanityPostsForAdmin();
      return posts.map(withReadTime).sort(sortByDateDesc);
    } catch (e) {
      console.error('[blog] Admin Sanity fetch failed', e);
      return [];
    }
  }
  return BLOG_MOCK_POSTS.map(withReadTime).sort(sortByDateDesc);
}
