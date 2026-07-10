import type { Metadata } from 'next';
import '../cms.css';
import { CmsApp } from '../CmsApp';
import { getSessionProfile } from '@/lib/auth';

const RESERVED = new Set(['enquiries', 'approvals', 'blog']);

function titleFromSlug(slug: string) {
  return decodeURIComponent(slug)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pageSlug: string }>;
}): Promise<Metadata> {
  const { pageSlug } = await params;
  const decoded = decodeURIComponent(pageSlug);
  if (RESERVED.has(decoded)) {
    return { title: 'Heliaxis CMS', robots: { index: false, follow: false } };
  }
  return {
    title: `${titleFromSlug(pageSlug)} · Heliaxis CMS`,
    robots: { index: false, follow: false },
  };
}

export default async function AdminPageEditor({
  params,
}: {
  params: Promise<{ pageSlug: string }>;
}) {
  const { pageSlug } = await params;
  const decoded = decodeURIComponent(pageSlug);
  const { profile } = await getSessionProfile();

  if (RESERVED.has(decoded)) {
    return null;
  }

  return <CmsApp profile={profile} initialPageSlug={decoded} />;
}
