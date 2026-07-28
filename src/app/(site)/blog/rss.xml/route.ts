import { getPublicPosts } from '@/lib/blog/queries';

export const revalidate = 60;

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');
  const posts = await getPublicPosts();

  const items = posts
    .map(
      (p) => `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(`${base}/blog/${p.slug}`)}</link>
      <guid isPermaLink="true">${escapeXml(`${base}/blog/${p.slug}`)}</guid>
      <pubDate>${new Date(p.publishAt).toUTCString()}</pubDate>
      <description>${escapeXml(p.excerpt)}</description>
    </item>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Heliaxis Blog</title>
    <link>${escapeXml(`${base}/blog`)}</link>
    <description>Solar, battery and funding guides for South Wales</description>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
    },
  });
}
