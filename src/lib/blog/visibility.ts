import type { BlogPost, BlogPostStatus } from './types';

/** Public visibility — DIY schedule on Sanity Free (no native scheduler). */
export function isPostPublic(post: Pick<BlogPost, 'status' | 'publishAt'>, now = new Date()): boolean {
  if (post.status === 'archived' || post.status === 'draft') return false;
  if (post.status === 'published') return true;
  if (post.status === 'scheduled') {
    const at = new Date(post.publishAt);
    if (Number.isNaN(at.getTime())) return false;
    return at.getTime() <= now.getTime();
  }
  return false;
}

export function estimateReadMinutes(bodyTextLength: number): number {
  const words = Math.max(1, Math.round(bodyTextLength / 5));
  return Math.max(1, Math.round(words / 200));
}

export function bodyPlainLength(post: BlogPost): number {
  return post.body.reduce((n, b) => {
    if (b.type === 'p' || b.type === 'h2' || b.type === 'h3' || b.type === 'quote') return n + b.text.length;
    if (b.type === 'ul') return n + b.items.join(' ').length;
    if (b.type === 'cta') return n + b.label.length;
    return n;
  }, 0);
}

export function formatPostDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function statusLabel(status: BlogPostStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'scheduled':
      return 'Scheduled';
    case 'published':
      return 'Published';
    case 'archived':
      return 'Archived';
    default:
      return status;
  }
}
