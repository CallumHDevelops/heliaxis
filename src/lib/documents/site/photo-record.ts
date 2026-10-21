import 'server-only';
import { newDocument, type PhotoItem } from '@/lib/documents/pdf-kit';
import { siteBox, type ElectricianDocInput } from './common';

/**
 * The electrician's photo record (FORMS 0.9): every photo slot with its instruction as the caption,
 * then the serials captured, and the declaration they signed (as signed) with their signature. Made
 * only when the office asks (Site tab), because a job's photos make a big file. Internal: it goes to
 * the customer only if the office chooses.
 */

export type RecordSlot = { title: string; instruction: string | null; photos: PhotoItem[] };
export type RecordSerial = { what: string; serials: string[]; unread: number };
/** The trade's declaration as signed (site_signoffs.declaration, or a put right's). */
export type RecordDeclaration = { title: string; text: string; name: string; at: string | null; signature: Uint8Array | null };

export async function makePhotoRecord(d: ElectricianDocInput, slots: RecordSlot[], serials: RecordSerial[], declarations: RecordDeclaration[] = []): Promise<Uint8Array> {
  const kit = await newDocument({ code: 'EP_RECORD', label: 'Photo record', title: 'Electrician photo record', jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Project reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Electrician');
  if (serials.length) {
    kit.section('Serial numbers');
    kit.rows(serials.map((s) => ({ label: s.what, value: [s.serials.join(', '), s.unread ? `${s.unread} label${s.unread === 1 ? '' : 's'} couldn’t be read (photo below)` : ''].filter(Boolean).join('; ') || null })));
  }
  for (const s of slots) {
    if (!s.photos.length) continue;
    // Kept with its first row of photos, so a heading never ends a page on its own.
    kit.section(s.title, { intro: s.instruction, keep: 170 });
    await kit.photos(s.photos);
  }
  for (const x of declarations) {
    kit.section(`${x.title}: declaration`, { keep: 120 });
    kit.paragraph(x.text);
    await kit.signatures([{ title: x.title, png: x.signature, name: x.name, at: x.at }]);
  }
  return kit.save();
}
