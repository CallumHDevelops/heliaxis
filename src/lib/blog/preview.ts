export const BLOG_PREVIEW_STORAGE_KEY = 'heliaxis-blog-preview-v1';

export type BlogPreviewPayload = {
  title: string;
  slug: string;
  excerpt: string;
  body: import('./types').BlogBodyBlock[];
  seoTitle?: string;
  seoDescription?: string;
  mainImage: { src: string; alt: string };
  categorySlugs?: string[];
  status?: import('./types').BlogPostStatus;
  publishAt?: string;
};

export function openBlogDraftPreview(payload: BlogPreviewPayload) {
  try {
    sessionStorage.setItem(BLOG_PREVIEW_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    alert('Could not open preview (storage blocked). Try another browser or allow site data.');
    return;
  }
  window.open('/admin/blog/preview', '_blank', 'noopener,noreferrer');
}
