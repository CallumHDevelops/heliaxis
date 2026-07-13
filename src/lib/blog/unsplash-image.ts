/**
 * Free Unsplash images for AI blog media blocks.
 * Uses the Unsplash API when UNSPLASH_ACCESS_KEY is set (free demo apps OK),
 * otherwise picks from a curated images.unsplash.com pool (verified CDN IDs).
 * Hotlinking images.unsplash.com is allowed under Unsplash guidelines.
 */

export type CmsPlacementImage = {
  src: string;
  alt: string;
  title: string;
  desc: string;
  caption: string;
  keywords: string;
  loading: 'lazy' | 'eager';
  decorative: boolean;
};

type Curated = { id: string; alt: string; keywords: string[] };

/** Only IDs verified to return HTTP 200 from images.unsplash.com. */
const CURATED: Curated[] = [
  { id: '1509391366360-2e959784a276', alt: 'Solar panels under blue sky', keywords: ['solar', 'panel', 'pv', 'renewable'] },
  { id: '1508514177221-188b1cf16e9d', alt: 'Rooftop solar installation', keywords: ['solar', 'roof', 'home', 'house', 'residential'] },
  { id: '1497435334941-8c899ee9e8e9', alt: 'Solar farm at sunset', keywords: ['solar', 'farm', 'energy', 'field'] },
  { id: '1558618666-fcd25c85cd64', alt: 'Wind turbines in open countryside', keywords: ['wind', 'turbine', 'renewable', 'green'] },
  { id: '1473341304170-971dccb5ac1e', alt: 'Renewable energy power lines at dusk', keywords: ['energy', 'power', 'electricity', 'grid'] },
  { id: '1613665813446-82a78c468a1d', alt: 'Battery energy storage system', keywords: ['battery', 'storage', 'powerwall'] },
  { id: '1581094794329-c8112a89af12', alt: 'Engineer inspecting commercial equipment', keywords: ['commercial', 'warehouse', 'industrial', 'install'] },
  { id: '1454165804606-c3d57bc86b40', alt: 'Business planning documents and laptop', keywords: ['business', 'funding', 'finance', 'grant'] },
  { id: '1486406146926-c627a92ad1ab', alt: 'City skyline and modern buildings', keywords: ['city', 'urban', 'building', 'office'] },
  { id: '1560518883-ce09059eeffa', alt: 'Residential house exterior', keywords: ['home', 'house', 'residential', 'property'] },
  { id: '1506905925346-21bda4d32df4', alt: 'Mountain landscape under clear sky', keywords: ['nature', 'landscape', 'outdoor', 'mountain'] },
  { id: '1476514525535-07fb3b4ae5f1', alt: 'Lake and hills at dusk', keywords: ['travel', 'getaway', 'holiday', 'wales', 'lake'] },
  { id: '1551882547-ff40c63fe5fa', alt: 'Boutique hotel lobby seating', keywords: ['hotel', 'travel', 'stay', 'guest'] },
  { id: '1571934811356-5cc061b6821f', alt: 'Cup of tea with steam', keywords: ['tea', 'brew', 'cup', 'drink', 'herbal'] },
  { id: '1556679343-c7306c1976bc', alt: 'Teapot and tea leaves', keywords: ['tea', 'teapot', 'leaves', 'brew'] },
  { id: '1511920170033-f8396924c348', alt: 'Fresh coffee beans and cup', keywords: ['coffee', 'cafe', 'espresso', 'beans'] },
  { id: '1544787219-7f47ccb76574', alt: 'Coffee being poured into a cup', keywords: ['coffee', 'cafe', 'latte', 'drink'] },
  { id: '1559056199-641a0ac8b55e', alt: 'Hot drink on a wooden table', keywords: ['drink', 'mug', 'warm', 'beverage'] },
  { id: '1517336714731-489689fd1ca8', alt: 'Laptop on a wooden desk', keywords: ['laptop', 'computer', 'tech', 'work'] },
  { id: '1544551763-46a013bb70d5', alt: 'Colourful tropical fish underwater', keywords: ['fish', 'ocean', 'sea', 'marine'] },
  { id: '1470071459604-3b5ec3a7fe05', alt: 'Foggy hills and countryside', keywords: ['nature', 'hills', 'countryside', 'wales'] },
  { id: '1621905252507-b35492cc74b4', alt: 'Electrician working on wiring', keywords: ['wiring', 'electrician', 'trade', 'work'] },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function buildQuery(topic: string): string {
  const raw = String(topic || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stop = new Set([
    'the',
    'and',
    'for',
    'your',
    'with',
    'from',
    'that',
    'this',
    'guide',
    'benefits',
    'daily',
    'part',
    'should',
    'into',
    'about',
  ]);
  const words = raw.split(/[\s|]+/).filter((w) => w.length > 2 && !stop.has(w));
  const q = words.slice(0, 5).join(' ') || 'solar energy';
  return q.slice(0, 80);
}

function unsplashCdnUrl(photoId: string): string {
  return `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=1600&q=80`;
}

function tokenSet(q: string): Set<string> {
  return new Set(q.split(/\s+/).filter(Boolean));
}

function scoreCurated(c: Curated, tokens: Set<string>, q: string): number {
  let score = 0;
  for (const k of c.keywords) {
    if (tokens.has(k)) score += 3;
    else if (q.includes(k)) score += 1;
  }
  // Prefer exact drink match over generic "drink/brew"
  if (tokens.has('tea') && c.keywords.includes('tea')) score += 6;
  if (tokens.has('coffee') && c.keywords.includes('coffee')) score += 6;
  if (tokens.has('tea') && c.keywords.includes('coffee')) score -= 8;
  if (tokens.has('coffee') && c.keywords.includes('tea')) score -= 8;
  return score;
}

function pickCurated(topic: string): CmsPlacementImage {
  const q = buildQuery(topic);
  const tokens = tokenSet(q);
  let best = CURATED[0];
  let bestScore = -1;
  const tied: Curated[] = [];

  for (const c of CURATED) {
    const score = scoreCurated(c, tokens, q);
    if (score > bestScore) {
      bestScore = score;
      best = c;
      tied.length = 0;
      tied.push(c);
    } else if (score === bestScore) {
      tied.push(c);
    }
  }

  if (bestScore <= 0) {
    best = CURATED[hash(q) % CURATED.length];
  } else if (tied.length > 1) {
    best = tied[hash(q) % tied.length];
  }

  return {
    src: unsplashCdnUrl(best.id),
    alt: best.alt,
    title: best.alt,
    desc: `${best.alt} — Photo from Unsplash`,
    caption: '',
    keywords: best.keywords.join(', '),
    loading: 'lazy',
    decorative: false,
  };
}

async function fetchFromApi(topic: string): Promise<CmsPlacementImage | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) return null;

  const query = buildQuery(topic);
  const url = new URL('https://api.unsplash.com/photos/random');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('content_filter', 'high');

  try {
    const r = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${key}`,
        'Accept-Version': 'v1',
      },
      next: { revalidate: 0 },
    });
    if (!r.ok) return null;
    const data = (await r.json()) as {
      urls?: { regular?: string; raw?: string };
      alt_description?: string | null;
      description?: string | null;
      user?: { name?: string };
    };
    const src =
      data.urls?.regular ||
      (data.urls?.raw ? `${data.urls.raw}&w=1600&q=80&auto=format&fit=crop` : '');
    if (!src) return null;
    const photographer = data.user?.name || 'Unsplash';
    const alt = data.alt_description || data.description || `Photo by ${photographer} on Unsplash`;
    const credit = `Photo by ${photographer} on Unsplash`;
    return {
      src,
      alt,
      title: credit,
      desc: credit,
      caption: '',
      keywords: query,
      loading: 'lazy',
      decorative: false,
    };
  } catch {
    return null;
  }
}

/** Resolve a free Unsplash image for an AI blog media section. */
export async function resolveUnsplashBlogImage(topic: string): Promise<CmsPlacementImage> {
  const fromApi = await fetchFromApi(topic);
  if (fromApi) return fromApi;
  return pickCurated(topic);
}
