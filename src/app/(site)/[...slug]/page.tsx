import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type CmsPage = {
  slug: string;
  name: string;
  theme?: string;
  seo?: { title?: string; desc?: string; noindex?: boolean };
  html: string;
};
type Rendered = { css: string; pages: CmsPage[] };

// Read the published CMS output (service-role; only exposes the published snapshot).
async function getRendered(): Promise<Rendered | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('cms_kv')
      .select('value')
      .eq('key', 'heliaxis-cms-rendered')
      .maybeSingle();
    if (!data?.value) return null;
    return JSON.parse(data.value) as Rendered;
  } catch {
    return null;
  }
}

function pathFromSlug(slug?: string[]) {
  return '/' + (slug?.join('/') || '');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const rendered = await getRendered();
  const page = rendered?.pages.find((p) => p.slug === pathFromSlug(slug));
  if (!page) return {};
  return {
    title: page.seo?.title || `${page.name} — Heliaxis`,
    description: page.seo?.desc,
    robots: page.seo?.noindex ? { index: false, follow: false } : undefined,
  };
}

export default async function CmsCatchAllPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const rendered = await getRendered();
  const page = rendered?.pages.find((p) => p.slug === pathFromSlug(slug));
  if (!rendered || !page) notFound();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: rendered.css }} />
      <div
        className={page.theme === 'dark' ? 'dk' : ''}
        dangerouslySetInnerHTML={{ __html: page.html }}
      />
    </>
  );
}
