import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CRM_BUCKET, crmSession, ensureCrmBucket, isUuid, json, logActivity, MAX_PHOTO_BYTES, PHOTO_MIME, thumbPath } from '@/lib/crm/server';
import { PHOTO_KEYS, photoLabel } from '@/lib/crm/stages';
import { cleanMarkup, MARKUP_MAX_BYTES, markupBytes, markupPathFor } from '@/lib/surveys/markup';
import { recomputeFlags } from '@/lib/surveys/server';
import { SLOT_RE } from '@/lib/surveys/solar-schema';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const isHeicMime = (m: unknown) => typeof m === 'string' && /^image\/hei[cf]$/i.test(m);

/**
 * Step 1 — { action: 'prepare', category, mime, size, client_id?, survey_id?, slot?, with_markup? }:
 * one-time signed upload URLs (photo + thumbnail, and the flattened drawing when asked), so images go
 * straight from the phone to storage (Vercel caps request bodies at ~4.5 MB). With client_id (the
 * phone's queue id) the file is named after it and may be overwritten, so a retry repeats harmlessly.
 * Step 2 — { action: 'save', items }: record the uploaded photos (upserts on the file path). Survey
 * photos carry survey_id, slot and any drawing, get no timeline entry each, and the reply maps each
 * path to its photo id. HEIC photos are turned into JPEGs afterwards.
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: project } = await db.from('crm_projects').select('id, enquiry_id').eq('id', id).maybeSingle();
  if (!project) return json({ error: 'Not found' }, 404);

  /** The survey ids among these that belong to this job (crm_surveys may not exist yet). */
  const surveysOfJob = async (ids: string[]) => {
    if (!ids.length) return new Set<string>();
    if (!ids.every(isUuid)) return null;
    const { data } = await db
      .from('crm_surveys')
      .select('id')
      .eq('project_id', id)
      .in('id', ids)
      .then(
        (r) => r,
        () => ({ data: null })
      );
    return new Set((data ?? []).map((r) => r.id as string));
  };

  if (b.action === 'prepare') {
    let category = String(b.category || '');
    const surveyId = b.survey_id ? String(b.survey_id) : null;
    if (surveyId) {
      const ok = await surveysOfJob([surveyId]);
      if (!ok?.has(surveyId)) return json({ error: 'survey_not_found' }, 404);
      if (!SLOT_RE.test(String(b.slot || ''))) return json({ error: 'Unknown survey question for this photo.' }, 400);
      category = 'survey';
    }
    if (!PHOTO_KEYS.includes(category)) return json({ error: 'Pick a photo type.' }, 400);
    const mime = String(b.mime || 'image/jpeg');
    if (!PHOTO_MIME.includes(mime)) return json({ error: 'Photos only (JPG, PNG, WebP, HEIC).' }, 400);
    if (!(Number(b.size) > 0) || Number(b.size) > MAX_PHOTO_BYTES) return json({ error: 'Photos must be under 20 MB.' }, 400);
    await ensureCrmBucket();
    const clientId = typeof b.client_id === 'string' && isUuid(b.client_id) ? b.client_id.toLowerCase() : null;
    const store = db.storage.from(CRM_BUCKET);
    let path: string;
    if (clientId) {
      // HEIC is named .jpg: the save step turns it into a JPEG in place.
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      path = `${id}/${category}/${clientId}.${ext}`;
    } else {
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime.startsWith('image/hei') ? 'heic' : 'jpg';
      path = `${id}/${category}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    }
    const opts = clientId ? { upsert: true } : undefined;
    const wantMarkup = !!surveyId && b.with_markup === true;
    const [main, thumb, markup] = await Promise.all([
      store.createSignedUploadUrl(path, opts),
      store.createSignedUploadUrl(thumbPath(path), opts),
      wantMarkup ? store.createSignedUploadUrl(markupPathFor(path), { upsert: true }) : Promise.resolve(null),
    ]);
    if (main.error || thumb.error || !main.data || !thumb.data) return json({ error: 'Could not prepare the upload — try again.' }, 500);
    return json({
      bucket: CRM_BUCKET,
      path,
      token: main.data.token,
      thumbPath: thumbPath(path),
      thumbToken: thumb.data.token,
      ...(markup?.data ? { markupPath: markupPathFor(path), markupToken: markup.data.token } : {}),
    });
  }

  if (b.action === 'save') {
    type Item = {
      path: string;
      category: string;
      caption?: string;
      width?: number;
      height?: number;
      taken_at?: string;
      mime?: string;
      survey_id?: string;
      slot?: string;
      markup?: unknown;
      markup_path?: string;
    };
    const raw = (Array.isArray(b.items) ? (b.items as Item[]) : []).filter(
      (i) => typeof i?.path === 'string' && i.path.startsWith(`${id}/`) && !i.path.includes('..')
    );
    const items = raw.map((i) => (i.survey_id ? { ...i, category: 'survey' } : i)).filter((i) => PHOTO_KEYS.includes(i.category));
    if (!items.length) return json({ error: 'Nothing to save' }, 400);

    const survey = items.filter((i) => i.survey_id);
    const known = await surveysOfJob([...new Set(survey.map((i) => String(i.survey_id)))]);
    if (survey.length && (!known || survey.some((i) => !known.has(String(i.survey_id))))) return json({ error: 'survey_not_found' }, 404);
    if (survey.some((i) => !SLOT_RE.test(String(i.slot || '')))) return json({ error: 'Unknown survey question for this photo.' }, 400);

    const { error } = await db.from('crm_photos').upsert(
      items.map((i) => ({
        project_id: id,
        category: i.category,
        storage_path: i.path,
        caption: i.caption ? String(i.caption).slice(0, 500) : null,
        width: Number(i.width) || null,
        height: Number(i.height) || null,
        taken_at: i.taken_at && !Number.isNaN(Date.parse(i.taken_at)) ? new Date(i.taken_at).toISOString() : null,
        uploaded_by: s.user.id,
      })),
      { onConflict: 'storage_path', ignoreDuplicates: true }
    );
    if (error) return json({ error: error.message }, 500);
    const { data: rows } = await db
      .from('crm_photos')
      .select('id, storage_path')
      .in(
        'storage_path',
        items.map((i) => i.path)
      );
    const ids: Record<string, string> = {};
    for (const r of rows ?? []) ids[r.storage_path as string] = r.id as string;

    // Survey columns (surveys.sql) go in a follow-up update, so the save above works without them.
    for (const i of survey) {
      const photoId = ids[i.path];
      if (!photoId) continue;
      const markup = cleanMarkup(i.markup);
      const drawn = markup && markupBytes(markup) <= MARKUP_MAX_BYTES && i.markup_path === markupPathFor(i.path) ? markup : null;
      await db
        .from('crm_photos')
        .update({ survey_id: i.survey_id, slot: i.slot, ...(drawn ? { markup: drawn, markup_path: i.markup_path } : {}) })
        .eq('id', photoId)
        .then(
          () => null,
          () => null
        );
    }

    const plain = items.filter((i) => !i.survey_id);
    if (plain.length) {
      const cats = [...new Set(plain.map((i) => photoLabel(i.category).toLowerCase()))].join(', ');
      await logActivity({
        enquiryId: project.enquiry_id,
        projectId: id,
        kind: 'photo',
        body: `${plain.length} ${cats} photo${plain.length === 1 ? '' : 's'} added`,
        meta: { count: plain.length },
        byId: s.user.id,
      });
    }
    await db.from('crm_projects').update({ updated_at: new Date().toISOString() }).eq('id', id);

    const heic = items.filter((i) => isHeicMime(i.mime) || /\.hei[cf]$/i.test(i.path)).map((i) => i.path);
    const surveyIds = [...new Set(survey.map((i) => String(i.survey_id)))];
    if (heic.length || surveyIds.length) {
      after(async () => {
        for (const p of heic) await heicToJpeg(p);
        for (const sid of surveyIds) await recomputeFlags(sid);
      });
    }
    return json({ ok: true, saved: items.length, ids });
  }

  return json({ error: 'Unknown action' }, 400);
}

/** ISO base media "ftyp" box with a HEIF brand: an iPhone photo, whatever the file is called. */
function isHeic(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString('ascii', 4, 8) !== 'ftyp') return false;
  return /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(buf.toString('ascii', 8, 12));
}

type HeicDecode = (input: { buffer: Buffer }) => Promise<{ width: number; height: number; data: Uint8ClampedArray }>;

/**
 * Replace a HEIC upload (from the gallery: the phone can't shrink those) with a JPEG at the same path,
 * plus its thumbnail. Checks the bytes, so running it twice (a retried upload) is harmless. Never throws.
 */
async function heicToJpeg(path: string) {
  try {
    const db = createAdminClient();
    const store = db.storage.from(CRM_BUCKET);
    const { data: file } = await store.download(path);
    if (!file) return;
    const buf = Buffer.from(await file.arrayBuffer());
    if (!isHeic(buf)) return;
    // @ts-expect-error -- heic-decode ships without type declarations
    const mod = await import('heic-decode');
    const decode = (mod.default ?? mod) as HeicDecode;
    const { width, height, data } = await decode({ buffer: buf });
    const sharp = (await import('sharp')).default;
    const raw = () => sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
    const full = await raw().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
    const thumb = await raw().resize(480, 480, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 70 }).toBuffer();
    // A path ending .heic (an older phone queue) keeps its name; the file is a JPEG either way.
    const up = await store.upload(path, full.data, { contentType: 'image/jpeg', upsert: true });
    if (up.error) return;
    await store.upload(thumbPath(path), thumb, { contentType: 'image/jpeg', upsert: true });
    await db.from('crm_photos').update({ width: full.info.width, height: full.info.height }).eq('storage_path', path);
  } catch (e) {
    console.error('[crm photos] HEIC to JPEG failed', path, e);
  }
}
