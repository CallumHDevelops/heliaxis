export type BlogPostStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export type BlogCategory = {
  id: string;
  title: string;
  slug: string;
  description?: string;
};

export type BlogBodyBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'cta'; label: string; href: string };

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: BlogBodyBlock[];
  mainImage: { src: string; alt: string };
  categories: BlogCategory[];
  author: string;
  status: BlogPostStatus;
  publishAt: string; // ISO
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  aiPrompt?: string;
  generatedAt?: string;
  readMinutes?: number;
};

export type BlogPostInput = {
  title: string;
  slug: string;
  excerpt: string;
  body: BlogBodyBlock[];
  mainImage?: { src: string; alt: string };
  categorySlugs?: string[];
  author?: string;
  status: BlogPostStatus;
  publishAt: string;
  seoTitle?: string;
  seoDescription?: string;
  aiPrompt?: string;
};
