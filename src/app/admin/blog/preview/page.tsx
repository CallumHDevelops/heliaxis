import type { Metadata } from 'next';
import '@/app/(site)/blog/blog.css';
import '@/app/(site)/home.css';
import '@/app/(site)/site.css';
import { BlogDraftPreviewClient } from './BlogDraftPreviewClient';

export const metadata: Metadata = {
  title: 'Blog draft preview — Heliaxis CMS',
  robots: { index: false, follow: false },
};

export default function BlogDraftPreviewPage() {
  return <BlogDraftPreviewClient />;
}
