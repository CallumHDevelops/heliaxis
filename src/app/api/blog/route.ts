import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireApproved } from '@/lib/auth';
import {
  createSanityPost,
  isSanityWriteConfigured,
  updateSanityPostStatus,
  deleteSanityPost,
  ensureDefaultCategories,
  slugExistsInSanity,
  uploadSanityImage,
} from '@/lib/blog/sanity';
import type { BlogBodyBlock, BlogPostStatus } from '@/lib/blog/types';
import { sanitizeCtaHref } from '@/lib/blog/ai';

export const runtime = 'nodejs';

function revalidateBlog(slug?: string, categorySlugs?: string[]) {
  revalidatePath('/blog');
  revalidatePath('/blog', 'layout');
  if (slug) revalidatePath(`/blog/${slug}`);
  for (const c of categorySlugs || []) {
    revalidatePath(`/blog/category/${c}`);
  }
  revalidatePath('/sitemap.xml');
}

type CreateBody = {
  title?: string;
  slug?: string;
  excerpt?: string;
  body?: BlogBodyBlock[];
  status?: BlogPostStatus;
  publishAt?: string;
  seoTitle?: string;
  seoDescription?: string;
  aiPrompt?: string;
  categorySlugs?: string[];
  mainImageAlt?: string;
  mainImageUrl?: string;
};

async function parseCreateRequest(req: Request): Promise<{
  data: CreateBody;
  imageFile: File | null;
}> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const payloadRaw = String(form.get('payload') || '{}');
    let data: CreateBody;
    try {
      data = JSON.parse(payloadRaw) as CreateBody;
    } catch {
      throw new Error('Invalid payload JSON');
    }
    const image = form.get('image');
    const imageFile = image instanceof File && image.size > 0 ? image : null;
    const alt = form.get('mainImageAlt');
    if (typeof alt === 'string' && alt.trim()) data.mainImageAlt = alt.trim();
    return { data, imageFile };
  }
  const data = (await req.json()) as CreateBody;
  return { data, imageFile: null };
}

async function resolveMainImage(
  imageFile: File | null,
  imageUrl: string | undefined,
  alt: string | undefined,
  title: string,
): Promise<{ assetId?: string; alt: string }> {
  const imageAlt = (alt || title).trim() || title;

  if (imageFile) {
    if (imageFile.size > 8 * 1024 * 1024) {
      throw new Error('Image must be under 8MB');
    }
    if (!imageFile.type.startsWith('image/')) {
      throw new Error('File must be an image');
    }
    const buf = Buffer.from(await imageFile.arrayBuffer());
    const uploaded = await uploadSanityImage(buf, imageFile.name || 'blog.jpg', imageFile.type);
    return { assetId: uploaded.assetId, alt: imageAlt };
  }

  if (imageUrl?.trim()) {
    const url = imageUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Image URL must start with http:// or https://');
    }
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Could not fetch image URL (${res.status})`);
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new Error('URL did not return an image');
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) throw new Error('Image must be under 8MB');
    const name = url.split('/').pop()?.split('?')[0] || 'blog-image.jpg';
    const uploaded = await uploadSanityImage(buf, name, contentType);
    return { assetId: uploaded.assetId, alt: imageAlt };
  }

  return { alt: imageAlt };
}

export async function POST(req: Request) {
  const session = await requireApproved();
  if (!session || session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSanityWriteConfigured()) {
    return NextResponse.json(
      {
        error:
          'Sanity write is not configured. Set NEXT_PUBLIC_SANITY_PROJECT_ID, NEXT_PUBLIC_SANITY_DATASET, and SANITY_API_TOKEN.',
      },
      { status: 503 },
    );
  }

  let data: CreateBody;
  let imageFile: File | null;
  try {
    ({ data, imageFile } = await parseCreateRequest(req));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Invalid request' },
      { status: 400 },
    );
  }

  if (!data.title || !data.slug || !data.excerpt || !data.body?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const status: BlogPostStatus = data.status || 'draft';
  const publishAt = data.publishAt || new Date().toISOString();

  const safeBody = data.body.map((b) =>
    b.type === 'cta' ? { ...b, href: sanitizeCtaHref(b.href) } : b,
  );

  try {
    if (await slugExistsInSanity(data.slug)) {
      return NextResponse.json({ error: `Slug “${data.slug}” already exists` }, { status: 409 });
    }

    const cats = await ensureDefaultCategories();
    const categoryIds = (data.categorySlugs || [])
      .map((s) => cats.find((c) => c.slug === s)?.id)
      .filter(Boolean) as string[];

    const image = await resolveMainImage(
      imageFile,
      data.mainImageUrl,
      data.mainImageAlt,
      data.title,
    );

    const id = await createSanityPost({
      title: data.title,
      slug: data.slug,
      excerpt: data.excerpt,
      body: safeBody,
      status,
      publishAt,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      aiPrompt: data.aiPrompt,
      categoryIds,
      mainImageAssetId: image.assetId,
      mainImageAlt: image.alt,
    });

    revalidateBlog(data.slug, data.categorySlugs);

    return NextResponse.json({ id, slug: data.slug, hasImage: Boolean(image.assetId) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Save failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await requireApproved();
  if (!session || session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSanityWriteConfigured()) {
    return NextResponse.json({ error: 'Sanity write is not configured' }, { status: 503 });
  }

  let body: { id?: string; status?: BlogPostStatus; publishAt?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.id || !body.status) {
    return NextResponse.json({ error: 'id and status required' }, { status: 400 });
  }

  try {
    await updateSanityPostStatus(body.id, body.status, body.publishAt);
    revalidateBlog(body.slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await requireApproved();
  if (!session || session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSanityWriteConfigured()) {
    return NextResponse.json({ error: 'Sanity write is not configured' }, { status: 503 });
  }

  let body: { id?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  // Don't delete mock / local-only ids
  if (body.id.startsWith('mock-') || body.id === 'preview-draft') {
    return NextResponse.json({ error: 'Cannot delete mock posts' }, { status: 400 });
  }

  try {
    await deleteSanityPost(body.id);
    revalidateBlog(body.slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
