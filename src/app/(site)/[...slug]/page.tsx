import type { Metadata } from 'next';
import { LIVE_FIXES_CSS } from '@/lib/cms-ctas';
import { CmsBody } from '@/components/cms/CmsBody';
import { notFound } from 'next/navigation';
import { findCmsPage, getCmsRendered } from '@/lib/cms-rendered';
import { CmsFormRuntime } from '@/components/cms/CmsFormRuntime';
import { withoutBrand } from '@/lib/seo/title';
import { jsonLdScript } from '@/lib/seo/json-ld';

export const dynamic = 'force-dynamic';

function pathFromSlug(slug?: string[]) {
  return '/' + (slug?.join('/') || '');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const rendered = await getCmsRendered();
  const page = findCmsPage(rendered, pathFromSlug(slug));
  if (!page) return {};
  return {
    title: withoutBrand(page.seo?.title || page.name),
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
  const rendered = await getCmsRendered();
  const page = findCmsPage(rendered, pathFromSlug(slug));
  if (!rendered || !page) notFound();
  // Structured data a Search content-studio page was published with (validated before publishing): stored as JSON text,
  // or an object on older pages. "<" is escaped inside jsonLdScript.
  const ldJson = jsonLdScript((page.seo as { jsonLd?: unknown } | undefined)?.jsonLd);

  return (
    <>
      {ldJson && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson }} />}
      <style dangerouslySetInnerHTML={{ __html: rendered.css + LIVE_FIXES_CSS }} />
      <CmsBody html={page.html} className={'pv-live' + (page.theme === 'dark' ? ' dk' : '')} />
      <CmsFormRuntime />
    </>
  );
}
