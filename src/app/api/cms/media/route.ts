import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_BUCKET = 'cms-media';

function safeName(name: string): string {
  return String(name || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';
}

async function ensureBucket(bucket: string) {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(bucket);
  if (data) return;
  await admin.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: '20MB',
    allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png', 'image/avif'],
  });
}

export async function POST(req: Request) {
  const session = await requireApproved();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!file.type || !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    const bucket = String(process.env.CMS_MEDIA_BUCKET || DEFAULT_BUCKET);
    await ensureBucket(bucket);

    const ext = (safeName(file.name).split('.').pop() || 'webp').replace(/[^a-z0-9]/g, '') || 'webp';
    const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'image';
    const path = `cms/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}.${ext}`;

    const admin = createAdminClient();
    const buf = new Uint8Array(await file.arrayBuffer());
    const { error } = await admin.storage.from(bucket).upload(path, buf, {
      upsert: false,
      contentType: file.type || 'image/webp',
      cacheControl: '31536000',
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data } = admin.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ ok: true, url: data.publicUrl, path, bucket });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not upload image';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
