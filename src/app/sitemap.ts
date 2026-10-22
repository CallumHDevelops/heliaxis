import { MetadataRoute } from 'next';
import { getBlogCategories, getPublicPosts } from '@/lib/blog/queries';
import { getCmsRendered } from '@/lib/cms-rendered';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://heliaxis.co.uk';

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'monthly', priority: 1 },
    { url: `${baseUrl}/commercial-funding`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/solar-estimator`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/book-a-survey`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.85 },
    { url: `${baseUrl}/case-studies`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/newport-net-zero-grant`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/warehousing`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
  ];

  let blogRoutes: MetadataRoute.Sitemap = [];
  try {
    const [posts, categories] = await Promise.all([getPublicPosts(), getBlogCategories()]);
    blogRoutes = [
      ...posts.map((p) => ({
        url: `${baseUrl}/blog/${p.slug}`,
        lastModified: new Date(p.publishAt),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      })),
      ...categories.map((c) => ({
        url: `${baseUrl}/blog/category/${c.slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.65,
      })),
    ];
  } catch {
    /* ignore */
  }

  // Published CMS pages (service pages, landing pages, case studies) — skipping noindexed pages,
  // blog articles (listed above) and anything a static route already covers.
  let cmsRoutes: MetadataRoute.Sitemap = [];
  try {
    const rendered = await getCmsRendered();
    const seen = new Set([...staticRoutes, ...blogRoutes].map((r) => r.url));
    cmsRoutes = (rendered?.pages || [])
      .filter((p) => !p.seo?.noindex && (p.html || '').trim())
      .map((p) => (p.slug || '/').replace(/\/$/, '') || '/')
      .filter((slug) => slug !== '/' && !slug.startsWith('/blog/'))
      .map((slug) => `${baseUrl}${slug.startsWith('/') ? slug : `/${slug}`}`)
      .filter((url) => !seen.has(url) && (seen.add(url), true))
      .map((url) => ({ url, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.75 }));
  } catch {
    /* ignore */
  }

  return [...staticRoutes, ...blogRoutes, ...cmsRoutes];
}

