'use client';

import { useEffect, useState } from 'react';
import { BlogPreviewShell } from './BlogPreviewShell';
import { BLOG_PREVIEW_STORAGE_KEY, type BlogPreviewPayload } from '@/lib/blog/preview';
import type { BlogPost } from '@/lib/blog/types';
import { bodyPlainLength, estimateReadMinutes } from '@/lib/blog/visibility';
import { brand } from '@/components/auth/authStyles';

function payloadToPost(p: BlogPreviewPayload): BlogPost {
  const publishAt = p.publishAt || new Date().toISOString();
  const categories = (p.categorySlugs || []).map((slug) => ({
    id: slug,
    title: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    slug,
  }));
  const post: BlogPost = {
    id: 'preview-draft',
    title: p.title || 'Untitled',
    slug: p.slug || 'preview',
    excerpt: p.excerpt || '',
    body: p.body || [],
    mainImage: p.mainImage?.src
      ? p.mainImage
      : {
          src: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1600&q=80',
          alt: p.title || 'Blog image',
        },
    categories,
    author: 'Heliaxis',
    status: p.status || 'draft',
    publishAt,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
  };
  return {
    ...post,
    readMinutes: estimateReadMinutes(bodyPlainLength(post)),
  };
}

export function BlogDraftPreviewClient() {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BLOG_PREVIEW_STORAGE_KEY);
      if (!raw) {
        setError('No draft preview found. Generate a draft on /admin/blog and click Preview.');
        return;
      }
      const data = JSON.parse(raw) as BlogPreviewPayload;
      setPost(payloadToPost(data));
    } catch {
      setError('Could not read preview data.');
    }
  }, []);

  if (error) {
    return (
      <div style={{ padding: '3rem 1.5rem', fontFamily: brand.body, color: brand.ink, maxWidth: 480 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Preview unavailable</h1>
        <p style={{ color: brand.muted }}>{error}</p>
        <a href="/admin/blog" style={{ color: brand.amber, fontWeight: 700 }}>
          ← Blog admin
        </a>
      </div>
    );
  }

  if (!post) {
    return (
      <div style={{ padding: '3rem', fontFamily: brand.body, color: brand.muted }}>
        Loading preview…
      </div>
    );
  }

  return (
    <BlogPreviewShell
      post={post}
      bannerNote={`Live preview · unsaved draft · ${post.slug} · not visible to the public`}
    />
  );
}
