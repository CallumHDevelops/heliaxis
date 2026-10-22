import 'server-only';
import { NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { schemaReady } from '@/lib/schema-ready';
import type { DesignDoc, PageGeometry } from './types';

export const NO_STORE = { 'Cache-Control': 'no-store' };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
export const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/** Signed-in staff with the Design studio portal (admins always). */
export const designSession = () => requirePortal('design');
export const designReady = async () => (await schemaReady()).design;
export const NOT_READY = 'Saving isn’t set up yet: run design-studio.sql from your to-do list.';

export const DESIGN_BUCKET = process.env.DESIGN_BUCKET || 'design-files';
export const PDF_MIME = ['application/pdf'];
export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
export const MAX_PDF_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
/** Saved documents are references only (images live in storage), so this is generous. */
export const MAX_DOC_BYTES = 3_000_000;
const MAX_THUMB_BYTES = 600_000;

let bucketReady = false;
export async function ensureDesignBucket() {
  if (bucketReady) return;
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(DESIGN_BUCKET);
  if (!data) {
    await admin.storage.createBucket(DESIGN_BUCKET, {
      public: false,
      fileSizeLimit: MAX_PDF_BYTES,
      allowedMimeTypes: [...PDF_MIME, ...IMAGE_MIME],
    });
  }
  bucketReady = true;
}

export function safeName(name: string) {
  return (name || 'file').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 80) || 'file';
}

/** Only these folders can be read back through /api/design/file. */
const PREFIXES = ['templates/', 'uploads/', 'thumbs/'];
export function okPath(p: unknown): p is string {
  return typeof p === 'string' && p.length < 300 && !p.includes('..') && !p.startsWith('/') && PREFIXES.some((x) => p.startsWith(x));
}

export async function signedFile(path: string, seconds = 600) {
  const { data } = await createAdminClient().storage.from(DESIGN_BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

/** Store a small JPEG preview (data URL) for a project; returns the storage path or null. */
export async function saveThumb(projectId: string, dataUrl: unknown) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (!buf.length || buf.length > MAX_THUMB_BYTES) return null;
  await ensureDesignBucket();
  const path = `thumbs/${projectId}.jpg`;
  const { error } = await createAdminClient()
    .storage.from(DESIGN_BUCKET)
    .upload(path, buf, { contentType: 'image/jpeg', upsert: true, cacheControl: '60' });
  return error ? null : path;
}

const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export function cleanGeometry(g: unknown): PageGeometry | null {
  if (!g || typeof g !== 'object') return null;
  const o = g as Record<string, unknown>;
  const t = o.trim as Record<string, unknown> | undefined;
  if (!num(o.mediaW, 1, 20000) || !num(o.mediaH, 1, 20000) || !t) return null;
  if (!num(t.x, 0, 20000) || !num(t.y, 0, 20000) || !num(t.w, 1, 20000) || !num(t.h, 1, 20000)) return null;
  if (!num(o.safe, 0, 2000)) return null;
  return o as unknown as PageGeometry;
}

/** Validate a saved document: right version, sane geometry, 1–12 pages, under the size cap. */
export function cleanDoc(doc: unknown): { ok: true; doc: DesignDoc } | { ok: false; error: string } {
  if (!doc || typeof doc !== 'object') return { ok: false, error: 'Nothing to save.' };
  const d = doc as Record<string, unknown>;
  if (d.v !== 2) return { ok: false, error: 'This design was made by a different version of the studio.' };
  if (!cleanGeometry(d.geometry)) return { ok: false, error: 'The page size looks wrong.' };
  if (!Array.isArray(d.pages) || d.pages.length < 1 || d.pages.length > 12) return { ok: false, error: 'A design needs 1–12 pages.' };
  for (const p of d.pages) {
    if (!p || typeof p !== 'object' || typeof (p as { json?: unknown }).json !== 'object') return { ok: false, error: 'A page is damaged.' };
  }
  const t = d.template as Record<string, unknown> | null | undefined;
  if (t && !okPath(t.path)) return { ok: false, error: 'The template file reference is invalid.' };
  if (JSON.stringify(d).length > MAX_DOC_BYTES) {
    return { ok: false, error: 'This design is too large to save — remove pasted images and use Upload instead.' };
  }
  return { ok: true, doc: d as unknown as DesignDoc };
}

export const cleanName = (v: unknown, fallback = 'Untitled design') => String(v ?? '').trim().slice(0, 140) || fallback;
