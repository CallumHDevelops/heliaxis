import { canAccess } from '@/lib/portals';
import { fetchAndStore, mediaLink, mediaRow, saveToJobPhotos } from '@/lib/whatsapp/media';
import { mediaStatusText } from '@/lib/whatsapp/media-shared';
import { chatSession, isUuid, json, mayOpenChat } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';
// A file that didn't arrive with the webhook is fetched from WhatsApp here (up to 50 MB), in one try.
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/**
 * One WhatsApp message's photo, video, voice note, sticker or file (id = whatsapp_messages.id), for
 * anyone who can open that chat (404 for everyone else, so it doesn't give away that it exists).
 * Answers with a redirect to a link to the file that lasts a few minutes. ?thumb=1: a photo's small
 * copy. ?download=1: as a download, whatever it is. ?info=1: { status, error } instead of the file.
 *
 * Not saved yet (still coming, or it went wrong) but still at WhatsApp: it's fetched once, now.
 * Only Try again (a failed one) fetches it past the chat's daily allowance.
 */
export async function GET(req: Request, { params }: Ctx) {
  const s = await chatSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  const found = isUuid(id) ? await mediaRow(id) : null;
  if (!found?.media_status || !(await mayOpenChat(s, found.enquiry_id))) return json({ error: 'Not found' }, 404);
  const row = found.media_status === 'saved' ? found : ((await fetchAndStore(found.id, { tries: 1, asked: found.media_status === 'failed' })) ?? found);

  const q = new URL(req.url).searchParams;
  if (q.has('info')) return json({ status: row.media_status, error: row.media_status === 'saved' ? null : mediaStatusText(row) });
  const link = await mediaLink(row, { thumb: q.has('thumb'), download: q.has('download') });
  if (!link) return json({ error: mediaStatusText(row) || 'Not found' }, row.media_status === 'saved' ? 404 : 409);
  return new Response(null, {
    status: 302,
    headers: {
      Location: link,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** { action: 'job', projectId }: put this photo in the job's photos (CRM access). */
export async function POST(req: Request, { params }: Ctx) {
  const s = await chatSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  const row = isUuid(id) ? await mediaRow(id) : null;
  if (!row?.media_status || !(await mayOpenChat(s, row.enquiry_id))) return json({ error: 'Not found' }, 404);
  if (!canAccess(s.profile, 'crm')) return json({ error: 'Only CRM staff can add photos to a job.' }, 403);
  const b = await req.json().catch(() => ({}));
  if (b.action !== 'job') return json({ error: 'Unknown action' }, 400);
  const projectId = typeof b.projectId === 'string' ? b.projectId : '';
  if (!isUuid(projectId)) return json({ error: 'Job not found' }, 404);
  const r = await saveToJobPhotos(row, projectId, s.user.id);
  return r.ok ? json({ ok: true, already: r.already }) : json({ error: r.error }, r.status);
}
