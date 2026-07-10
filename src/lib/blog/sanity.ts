import type { BlogCategory, BlogPost, BlogBodyBlock, BlogPostStatus } from './types';

export function isSanityConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID &&
      process.env.NEXT_PUBLIC_SANITY_DATASET &&
      process.env.NEXT_PUBLIC_SANITY_PROJECT_ID !== 'your-project-id',
  );
}

/** True when the app can create/update posts (needs write token). */
export function isSanityWriteConfigured(): boolean {
  return isSanityConfigured() && Boolean(process.env.SANITY_API_TOKEN);
}

/** GROQ: only posts that should ever be considered for the public site. */
const PUBLIC_POST_FILTER = `_type == "post" && (
  status == "published" ||
  (status == "scheduled" && defined(publishAt) && publishAt <= now())
)`;

type SanityImage = { asset?: { url?: string }; alt?: string } | null;

type SanityPostDoc = {
  _id: string;
  title?: string;
  slug?: { current?: string };
  excerpt?: string;
  body?: unknown;
  mainImage?: SanityImage;
  categories?: { _id: string; title?: string; slug?: { current?: string }; description?: string }[];
  author?: string;
  status?: BlogPostStatus;
  publishAt?: string;
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: SanityImage;
  aiPrompt?: string;
  generatedAt?: string;
};

function imageUrl(img: SanityImage | undefined, fallbackAlt: string) {
  const src = img?.asset?.url || 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1600&q=80';
  return { src, alt: img?.alt || fallbackAlt };
}

/** Minimal Portable Text → BlogBodyBlock (paragraphs, headings, lists, blockquote). */
export function portableTextToBlocks(body: unknown): BlogBodyBlock[] {
  if (!Array.isArray(body)) return [];
  const blocks: BlogBodyBlock[] = [];
  for (const block of body) {
    if (!block || typeof block !== 'object') continue;
    const b = block as {
      _type?: string;
      style?: string;
      listItem?: string;
      children?: { text?: string }[];
      label?: string;
      href?: string;
    };
    if (b._type === 'cta' && b.label && b.href) {
      blocks.push({ type: 'cta', label: b.label, href: b.href });
      continue;
    }
    if (b._type !== 'block') continue;
    const text = (b.children || []).map((c) => c.text || '').join('');
    if (!text.trim()) continue;
    if (b.listItem === 'bullet') {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'ul') last.items.push(text);
      else blocks.push({ type: 'ul', items: [text] });
      continue;
    }
    if (b.style === 'h2') blocks.push({ type: 'h2', text });
    else if (b.style === 'h3') blocks.push({ type: 'h3', text });
    else if (b.style === 'blockquote') blocks.push({ type: 'quote', text });
    else blocks.push({ type: 'p', text });
  }
  return blocks;
}

function mapPost(doc: SanityPostDoc): BlogPost {
  const cats: BlogCategory[] = (doc.categories || [])
    .filter((c) => c?.slug?.current)
    .map((c) => ({
      id: c._id,
      title: c.title || c.slug!.current!,
      slug: c.slug!.current!,
      description: c.description,
    }));
  return {
    id: doc._id,
    title: doc.title || 'Untitled',
    slug: doc.slug?.current || doc._id,
    excerpt: doc.excerpt || '',
    body: portableTextToBlocks(doc.body),
    mainImage: imageUrl(doc.mainImage, doc.title || 'Blog image'),
    categories: cats,
    author: doc.author || 'Heliaxis',
    status: doc.status || 'draft',
    publishAt: doc.publishAt || new Date(0).toISOString(),
    seoTitle: doc.seoTitle,
    seoDescription: doc.seoDescription,
    ogImage: doc.ogImage?.asset?.url,
    aiPrompt: doc.aiPrompt,
    generatedAt: doc.generatedAt,
  };
}

const POST_PROJECTION = `{
  _id,
  title,
  slug,
  excerpt,
  body,
  mainImage{ alt, asset->{ url } },
  categories[]->{ _id, title, slug, description },
  author,
  status,
  publishAt,
  seoTitle,
  seoDescription,
  ogImage{ alt, asset->{ url } },
  aiPrompt,
  generatedAt
}`;

async function getClient() {
  const { createClient } = await import('@sanity/client');
  return createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
    apiVersion: '2025-01-01',
    useCdn: true,
  });
}

async function getWriteClient() {
  const { createClient } = await import('@sanity/client');
  const token = process.env.SANITY_API_TOKEN;
  if (!token) throw new Error('SANITY_API_TOKEN is not set');
  return createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
    apiVersion: '2025-01-01',
    token,
    useCdn: false,
  });
}

/** Public listing — never returns draft/archived bodies. */
export async function fetchSanityPosts(): Promise<BlogPost[]> {
  const client = await getClient();
  const docs = await client.fetch<SanityPostDoc[]>(
    `*[${PUBLIC_POST_FILTER}] | order(publishAt desc)${POST_PROJECTION}`,
  );
  return (docs || []).map(mapPost);
}

export async function fetchSanityPostBySlug(slug: string): Promise<BlogPost | null> {
  const client = await getClient();
  const doc = await client.fetch<SanityPostDoc | null>(
    `*[${PUBLIC_POST_FILTER} && slug.current == $slug][0]${POST_PROJECTION}`,
    { slug },
  );
  return doc ? mapPost(doc) : null;
}

/** Admin preview — any status including draft/archived. */
export async function fetchSanityPostBySlugAdmin(slug: string): Promise<BlogPost | null> {
  const client = await getWriteClient();
  const doc = await client.fetch<SanityPostDoc | null>(
    `*[_type == "post" && slug.current == $slug][0]${POST_PROJECTION}`,
    { slug },
  );
  return doc ? mapPost(doc) : null;
}

/** Admin listing — all statuses (requires write token). */
export async function fetchSanityPostsForAdmin(): Promise<BlogPost[]> {
  const client = await getWriteClient();
  const docs = await client.fetch<SanityPostDoc[]>(
    `*[_type == "post"] | order(publishAt desc)${POST_PROJECTION}`,
  );
  return (docs || []).map(mapPost);
}

export async function fetchSanityCategories(): Promise<BlogCategory[]> {
  const client = await getClient();
  const docs = await client.fetch<{ _id: string; title?: string; slug?: { current?: string }; description?: string }[]>(
    `*[_type == "category"]{ _id, title, slug, description } | order(title asc)`,
  );
  return (docs || [])
    .filter((c) => c.slug?.current)
    .map((c) => ({
      id: c._id,
      title: c.title || c.slug!.current!,
      slug: c.slug!.current!,
      description: c.description,
    }));
}

export async function ensureDefaultCategories(): Promise<BlogCategory[]> {
  const client = await getWriteClient();
  const defaults = [
    { title: 'Solar', slug: 'solar', description: 'Solar PV for homes and businesses' },
    { title: 'Battery', slug: 'battery', description: 'Storage and self-consumption' },
    { title: 'Funding', slug: 'funding', description: 'Grants, finance and PPA' },
    { title: 'Business', slug: 'business', description: 'Commercial and public sector' },
    { title: 'Home', slug: 'home', description: 'Residential energy guides' },
  ];
  const existing = await fetchSanityCategories();
  const have = new Set(existing.map((c) => c.slug));
  for (const c of defaults) {
    if (have.has(c.slug)) continue;
    await client.create({
      _type: 'category',
      title: c.title,
      slug: { _type: 'slug', current: c.slug },
      description: c.description,
    });
  }
  return fetchSanityCategories();
}

export async function slugExistsInSanity(slug: string): Promise<boolean> {
  const client = await getWriteClient();
  const id = await client.fetch<string | null>(
    `*[_type == "post" && slug.current == $slug][0]._id`,
    { slug },
  );
  return Boolean(id);
}

export function blocksToPortableText(blocks: BlogBodyBlock[]) {
  return blocks.map((block, i) => {
    const key = `b${i}`;
    if (block.type === 'cta') {
      return { _type: 'cta', _key: key, label: block.label, href: block.href };
    }
    if (block.type === 'ul') {
      return block.items.map((item, j) => ({
        _type: 'block',
        _key: `${key}-${j}`,
        style: 'normal',
        listItem: 'bullet',
        markDefs: [],
        children: [{ _type: 'span', _key: `s${j}`, text: item, marks: [] }],
      }));
    }
    const style =
      block.type === 'h2' ? 'h2' : block.type === 'h3' ? 'h3' : block.type === 'quote' ? 'blockquote' : 'normal';
    return {
      _type: 'block',
      _key: key,
      style,
      markDefs: [],
      children: [{ _type: 'span', _key: 's0', text: block.text, marks: [] }],
    };
  }).flat();
}

export async function uploadSanityImage(
  data: Buffer | ArrayBuffer,
  filename: string,
  contentType: string,
): Promise<{ assetId: string; url: string }> {
  const client = await getWriteClient();
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const asset = await client.assets.upload('image', buffer, {
    filename: filename || 'blog-image.jpg',
    contentType: contentType || 'image/jpeg',
  });
  return { assetId: asset._id, url: asset.url || '' };
}

export async function createSanityPost(input: {
  title: string;
  slug: string;
  excerpt: string;
  body: BlogBodyBlock[];
  author?: string;
  status: BlogPostStatus;
  publishAt: string;
  seoTitle?: string;
  seoDescription?: string;
  aiPrompt?: string;
  categoryIds?: string[];
  mainImageAssetId?: string;
  mainImageAlt?: string;
}): Promise<string> {
  const client = await getWriteClient();
  const doc: {
    _type: 'post';
    title: string;
    slug: { _type: 'slug'; current: string };
    excerpt: string;
    body: ReturnType<typeof blocksToPortableText>;
    author: string;
    status: BlogPostStatus;
    publishAt: string;
    seoTitle?: string;
    seoDescription?: string;
    aiPrompt?: string;
    generatedAt?: string;
    categories: { _type: 'reference'; _ref: string; _key: string }[];
    mainImage?: {
      _type: 'image';
      alt: string;
      asset: { _type: 'reference'; _ref: string };
    };
  } = {
    _type: 'post',
    title: input.title,
    slug: { _type: 'slug', current: input.slug },
    excerpt: input.excerpt,
    body: blocksToPortableText(input.body),
    author: input.author || 'Heliaxis',
    status: input.status,
    publishAt: input.publishAt,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    aiPrompt: input.aiPrompt,
    generatedAt: input.aiPrompt ? new Date().toISOString() : undefined,
    categories: (input.categoryIds || []).map((id) => ({
      _type: 'reference' as const,
      _ref: id,
      _key: id,
    })),
  };
  if (input.mainImageAssetId) {
    doc.mainImage = {
      _type: 'image',
      alt: input.mainImageAlt || input.title,
      asset: { _type: 'reference', _ref: input.mainImageAssetId },
    };
  }
  const created = await client.create(doc);
  return created._id;
}

export async function updateSanityPostStatus(
  id: string,
  status: BlogPostStatus,
  publishAt?: string,
): Promise<void> {
  const client = await getWriteClient();
  const patch: Record<string, string> = { status };
  if (publishAt) patch.publishAt = publishAt;
  await client.patch(id).set(patch).commit();
}

export async function deleteSanityPost(id: string): Promise<void> {
  const client = await getWriteClient();
  await client.delete(id);
}

/** Flip due scheduled posts to published (for cron / Studio clarity). Public site already shows due scheduled. */
export async function publishDueScheduledPosts(): Promise<{ id: string; slug: string }[]> {
  const client = await getWriteClient();
  const due = await client.fetch<{ _id: string; slug?: { current?: string } }[]>(
    `*[_type == "post" && status == "scheduled" && defined(publishAt) && publishAt <= now()]{ _id, slug }`,
  );
  const updated: { id: string; slug: string }[] = [];
  for (const doc of due || []) {
    await client.patch(doc._id).set({ status: 'published' }).commit();
    updated.push({ id: doc._id, slug: doc.slug?.current || doc._id });
  }
  return updated;
}
