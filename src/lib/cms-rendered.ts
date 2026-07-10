import { createAdminClient } from '@/lib/supabase/admin';

export type CmsRenderedPage = {
  slug: string;
  name: string;
  theme?: string;
  seo?: { title?: string; desc?: string; noindex?: boolean };
  html: string;
};

export type CmsRendered = { css: string; pages: CmsRenderedPage[] };

/** Read the published CMS snapshot (service-role; live site only). */
export async function getCmsRendered(): Promise<CmsRendered | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('cms_kv')
      .select('value')
      .eq('key', 'heliaxis-cms-rendered')
      .maybeSingle();
    if (!data?.value) return null;
    return JSON.parse(data.value) as CmsRendered;
  } catch {
    return null;
  }
}

export function findCmsPage(
  rendered: CmsRendered | null | undefined,
  slug: string
): CmsRenderedPage | undefined {
  if (!rendered?.pages?.length) return undefined;
  const want = slug === '' || slug === '/' ? '/' : slug.startsWith('/') ? slug : `/${slug}`;
  return rendered.pages.find((p) => {
    const s = (p.slug || '/').replace(/\/$/, '') || '/';
    const normalized = s === '' ? '/' : s.startsWith('/') ? s : `/${s}`;
    return normalized === want || (want === '/' && (p.slug === '/' || p.slug === ''));
  });
}

export function hasCmsHomeContent(page: CmsRenderedPage | undefined): boolean {
  return Boolean(page && (page.html || '').trim());
}
