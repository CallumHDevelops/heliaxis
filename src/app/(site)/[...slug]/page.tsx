import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cmsFaqJsonLd, findCmsPage, getCmsRendered } from '@/lib/cms-rendered';
import { CmsFormRuntime } from '@/components/cms/CmsFormRuntime';

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
  const rendered = await getCmsRendered();
  const page = findCmsPage(rendered, pathFromSlug(slug));
  if (!rendered || !page) notFound();
  const faqLd = cmsFaqJsonLd(page);

  return (
    <>
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd }} />}
      <style dangerouslySetInnerHTML={{ __html: rendered.css }} />
      <div
        className={'pv-live' + (page.theme === 'dark' ? ' dk' : '')}
        dangerouslySetInnerHTML={{ __html: page.html }}
      />
      <CmsFormRuntime />
    </>
  );
}
