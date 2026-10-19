import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CRM_BUCKET, thumbPath } from '@/lib/crm/server';
import { enaDownloads, surveyPhotos } from '@/lib/surveys/server';
import { ENA_PHOTOS, enaFileName, fieldIndex } from '@/lib/surveys/solar-schema';

type Db = ReturnType<typeof createAdminClient>;
type Survey = { id: string; type: string; status: string; completed_at: string | null };

export type EnaPhoto = { id: string; thumb: string | null; download: string | null; name: string };
export type EnaInfo = {
  survey: { id: string; completed_at: string | null } | null;
  open: { id: string } | null;
  photos: { slot: string; label: string; items: EnaPhoto[] }[];
};

const LABELS = fieldIndex();

/**
 * "For the ENA application" on the job's paperwork (the owner's ask): the main electric cut-out and
 * meter photos from the job's latest finished solar survey, each with a small copy to show and a link
 * that downloads the original (no drawing), named after the job, e.g. "HX-0042-main-cut-out.jpg"
 * (Unit S's enaDownloads, as on the survey report). `open` is a solar survey still to finish, so the
 * page can say where to take them. `base` is the job's ref, or the customer's name before refs exist.
 * Reads only after surveys.sql; never throws (a blip shows "Not in a survey yet").
 */
export async function enaForJob(db: Db, surveys: Survey[], base: string): Promise<EnaInfo> {
  const solar = surveys.filter((s) => s.type === 'solar');
  const done = solar.filter((s) => s.status === 'complete').sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))[0] ?? null;
  const open = solar.find((s) => s.status === 'booked' || s.status === 'draft') ?? null;
  const empty = ENA_PHOTOS.map(({ slot }) => ({ slot, label: LABELS.get(slot)?.field.label ?? slot, items: [] as EnaPhoto[] }));
  const info: EnaInfo = { survey: done ? { id: done.id, completed_at: done.completed_at } : null, open: open ? { id: open.id } : null, photos: empty };
  if (!done) return info;
  try {
    const [rows, downloads] = await Promise.all([surveyPhotos(db, done.id), enaDownloads(db, done.id, base)]);
    const shown = rows.filter((p) => ENA_PHOTOS.some((e) => e.slot === p.slot));
    // The small copy, else the photo itself (signed for an hour, like the job's other photos).
    const paths = shown.flatMap((p) => [thumbPath(p.storage_path), p.storage_path]);
    const thumbs = new Map<string, string>();
    if (paths.length) {
      const { data } = await db.storage.from(CRM_BUCKET).createSignedUrls(paths, 3600);
      for (const s of data ?? []) if (s.path && s.signedUrl) thumbs.set(s.path, s.signedUrl);
    }
    info.photos = ENA_PHOTOS.map(({ slot, file }, i) => {
      const list = shown.filter((p) => p.slot === slot);
      return {
        ...empty[i],
        items: list.map((p, n) => ({
          id: p.id,
          thumb: thumbs.get(thumbPath(p.storage_path)) ?? thumbs.get(p.storage_path) ?? null,
          download: downloads[p.id] ?? null,
          name: enaFileName(base, file, n + 1, list.length, /\.([a-z0-9]+)$/i.exec(p.storage_path)?.[1] ?? 'jpg'),
        })),
      };
    });
  } catch {
    // The photos can't be read right now: the page says they're not in a survey yet.
  }
  return info;
}
