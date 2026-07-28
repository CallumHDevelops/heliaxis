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
  focusX: number;
  focusY: number;
  zoom: number;
};

type Curated = { id: string; alt: string; keywords: string[] };

/** Only IDs verified to return HTTP 200 from images.unsplash.com. */
const CURATED: Curated[] = [
  { id: '1509391366360-2e959784a276', alt: 'Solar panels under blue sky', keywords: ['solar', 'panel', 'pv', 'renewable', 'energy'] },
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
  { id: '1571934811356-5cc061b6821f', alt: 'Cup of tea with steam', keywords: ['tea', 'brew', 'cup', 'herbal'] },
  { id: '1556679343-c7306c1976bc', alt: 'Teapot and tea leaves', keywords: ['tea', 'teapot', 'leaves', 'brew'] },
  { id: '1511920170033-f8396924c348', alt: 'Fresh coffee beans and cup', keywords: ['coffee', 'cafe', 'espresso', 'beans'] },
  { id: '1544787219-7f47ccb76574', alt: 'Coffee being poured into a cup', keywords: ['coffee', 'cafe', 'latte'] },
  { id: '1559056199-641a0ac8b55e', alt: 'Hot drink on a wooden table', keywords: ['drink', 'mug', 'warm', 'beverage'] },
  { id: '1517336714731-489689fd1ca8', alt: 'Laptop on a wooden desk', keywords: ['laptop', 'computer', 'tech', 'work'] },
  { id: '1544551763-46a013bb70d5', alt: 'Colourful tropical fish underwater', keywords: ['fish', 'ocean', 'sea', 'marine'] },
  { id: '1470071459604-3b5ec3a7fe05', alt: 'Foggy hills and countryside', keywords: ['nature', 'hills', 'countryside', 'wales'] },
  { id: '1621905252507-b35492cc74b4', alt: 'Electrician working on wiring', keywords: ['wiring', 'electrician', 'trade', 'work'] },
  // Science / education — for biology, tissue, lab-style topics
  { id: '1576086213369-97a306d36557', alt: 'Scientific research and biology imagery', keywords: ['tissue', 'cell', 'cells', 'biology', 'anatomy', 'science', 'medical', 'body', 'organ', 'histology'] },
  { id: '1532187863486-abf9dbad1b69', alt: 'Microscope in a laboratory', keywords: ['microscope', 'lab', 'laboratory', 'science', 'research', 'biology', 'tissue', 'cell'] },
  { id: '1579154204601-01588f351e67', alt: 'Laboratory science workspace', keywords: ['science', 'laboratory', 'research', 'experiment', 'chemistry'] },
  { id: '1582719471384-894fbb16e074', alt: 'Scientist working in a lab', keywords: ['laboratory', 'science', 'lab', 'research', 'scientist'] },
  { id: '1554475901-4538ddfbccc2', alt: 'Learning and education setting', keywords: ['education', 'classroom', 'learning', 'study', 'school', 'teaching'] },
  { id: '1581092160562-40aa08e78837', alt: 'Technology and engineering work', keywords: ['engineer', 'technology', 'electronics', 'circuit', 'tech'] },
];

const DEFAULT_CURATED = CURATED[0]; // solar — brand-safe when nothing matches

const STOP = new Set([
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
  'understanding',
  'their',
  'what',
  'are',
  'how',
  'why',
  'when',
  'where',
  'which',
  'types',
  'type',
  'functions',
  'function',
  'introduction',
  'article',
  'blog',
  'heliaxis',
  'south',
  'wales',
]);

export function buildImageSearchQuery(...parts: Array<string | undefined | null>): string {
  const raw = parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9\s|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = raw.split(/[\s|]+/).filter((w) => w.length > 2 && !STOP.has(w));
  // Prefer distinctive topic words first (dedupe, keep order)
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    unique.push(w);
  }
  const q = unique.slice(0, 6).join(' ') || 'solar energy renewable';
  return q.slice(0, 80);
}

function unsplashCdnUrl(photoId: string): string {
  return `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=1600&q=80`;
}

function tokenSet(q: string): Set<string> {
  return new Set(q.split(/\s+/).filter(Boolean));
}

function hasDrinkIntent(tokens: Set<string>): boolean {
  return (
    tokens.has('tea') ||
    tokens.has('coffee') ||
    tokens.has('drink') ||
    tokens.has('beverage') ||
    tokens.has('brew') ||
    tokens.has('latte') ||
    tokens.has('espresso')
  );
}

function scoreCurated(c: Curated, tokens: Set<string>, q: string): number {
  let score = 0;
  for (const k of c.keywords) {
    if (tokens.has(k)) score += 4;
    else if (q.includes(k)) score += 1;
  }
  if (tokens.has('tea') && c.keywords.includes('tea')) score += 8;
  if (tokens.has('coffee') && c.keywords.includes('coffee')) score += 8;
  if (tokens.has('tea') && c.keywords.includes('coffee')) score -= 10;
  if (tokens.has('coffee') && c.keywords.includes('tea')) score -= 10;

  // Never surface drinks for unrelated topics (e.g. tissue biology → tea)
  if (!hasDrinkIntent(tokens) && (c.keywords.includes('tea') || c.keywords.includes('coffee') || c.keywords.includes('beverage'))) {
    score -= 12;
  }
  return score;
}

function pickCurated(query: string): CmsPlacementImage {
  const q = buildImageSearchQuery(query);
  const tokens = tokenSet(q);
  let best = DEFAULT_CURATED;
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

  // Require a real topical match — otherwise brand-safe solar, not a random tea photo
  if (bestScore < 4) {
    best = DEFAULT_CURATED;
  } else if (tied.length > 1) {
    best = tied[Math.abs(hash(q)) % tied.length];
  }

  return placementFromCurated(best, q);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function placementFromCurated(best: Curated, query: string): CmsPlacementImage {
  return {
    src: unsplashCdnUrl(best.id),
    alt: best.alt,
    title: best.alt,
    desc: `${best.alt} — Photo from Unsplash`,
    caption: '',
    keywords: best.keywords.join(', ') || query,
    loading: 'lazy',
    decorative: false,
    focusX: 50,
    focusY: 50,
    zoom: 1,
  };
}

type UnsplashPhoto = {
  urls?: { regular?: string; raw?: string };
  alt_description?: string | null;
  description?: string | null;
  user?: { name?: string };
};

function photoToPlacement(data: UnsplashPhoto, query: string): CmsPlacementImage | null {
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
    focusX: 50,
    focusY: 50,
    zoom: 1,
  };
}

async function fetchFromApi(query: string): Promise<CmsPlacementImage | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) return null;

  const q = buildImageSearchQuery(query);
  // Search (ranked) is far more relevant than /photos/random
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', q);
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('content_filter', 'high');
  url.searchParams.set('per_page', '8');

  try {
    const r = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${key}`,
        'Accept-Version': 'v1',
      },
      next: { revalidate: 0 },
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { results?: UnsplashPhoto[] };
    const results = Array.isArray(data.results) ? data.results : [];
    for (const photo of results) {
      const placed = photoToPlacement(photo, q);
      if (placed) return placed;
    }
    return null;
  } catch {
    return null;
  }
}

export type ResolveUnsplashOpts = {
  /** AI-suggested Unsplash search phrase (preferred). */
  imageQuery?: string;
  /** Extra title/tags/intro text used if imageQuery is weak or missing. */
  topic?: string;
};

/** Resolve a free Unsplash image closely matching the article topic. */
export async function resolveUnsplashBlogImage(
  topicOrOpts: string | ResolveUnsplashOpts,
): Promise<CmsPlacementImage> {
  const opts: ResolveUnsplashOpts =
    typeof topicOrOpts === 'string' ? { topic: topicOrOpts } : topicOrOpts || {};

  const query = buildImageSearchQuery(opts.imageQuery, opts.topic);
  const fromApi = await fetchFromApi(query);
  if (fromApi) return fromApi;
  return pickCurated(query);
}
