import 'server-only';
import { ukDay } from '@/lib/bank-holidays';
import { DOCS_BUCKET } from '@/lib/crm/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { quotePdf, type QuoteFacts } from './pdf';
import { cleanContent, type QuoteContent } from './types';

export type QuoteRow = {
  id: string;
  number: string;
  project_id: string;
  enquiry_id: string;
  title: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  content: QuoteContent;
  valid_until: string | null;
  deposit_pence: number | null;
  document_id: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export const quoteRow = (r: Record<string, unknown>): QuoteRow => ({ ...(r as unknown as QuoteRow), content: cleanContent(r.content), deposit_pence: r.deposit_pence == null ? null : Number(r.deposit_pence) });

export async function readQuote(id: string): Promise<QuoteRow | null> {
  const { data } = await createAdminClient().from('crm_quotes').select('*').eq('id', id).maybeSingle();
  return data ? quoteRow(data) : null;
}

const MIME_OF: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

/** The quote as a PDF: its customer, site and job reference, the images and the datasheets it uses, fetched. */
export async function renderQuote(q: QuoteRow, signed?: QuoteFacts['signed']): Promise<Uint8Array> {
  const db = createAdminClient();
  const [{ data: c }, { data: p }] = await Promise.all([
    db.from('enquiries').select('name, email, phone').eq('id', q.enquiry_id).maybeSingle(),
    db.from('crm_projects').select('address, postcode, project_ref').eq('id', q.project_id).maybeSingle(),
  ]);
  const images = new Map<string, { bytes: Uint8Array; mime: string }>();
  const datasheets = new Map<string, Uint8Array>();
  const paths = q.content.blocks.flatMap((b) => (b.type === 'images' ? b.images.map((i) => i.path) : []));
  const libIds = q.content.blocks.flatMap((b) => (b.type === 'datasheets' ? b.files.map((f) => f.library_id) : []));
  await Promise.all(
    paths.map(async (path) => {
      const { data } = await db.storage.from(DOCS_BUCKET).download(path);
      const ext = path.split('.').pop()?.toLowerCase() ?? '';
      if (data && MIME_OF[ext]) images.set(path, { bytes: new Uint8Array(await data.arrayBuffer()), mime: MIME_OF[ext] });
    })
  );
  if (libIds.length) {
    const { data: lib } = await db.from('crm_library').select('id, storage_path, mime').in('id', libIds);
    await Promise.all(
      (lib ?? [])
        .filter((l) => l.mime === 'application/pdf')
        .map(async (l) => {
          const { data } = await db.storage.from(DOCS_BUCKET).download(l.storage_path as string);
          if (data) datasheets.set(l.id as string, new Uint8Array(await data.arrayBuffer()));
        })
    );
  }
  const facts: QuoteFacts = {
    number: q.number,
    title: q.title,
    issued: ukDay(new Date()),
    validUntil: q.valid_until,
    jobRef: (p?.project_ref as string | null) ?? null,
    customer: {
      name: (c?.name as string) || '',
      email: (c?.email as string | null) || null,
      phone: (c?.phone as string | null) || null,
      address: [p?.address, p?.postcode].filter(Boolean).join(', ') || null,
    },
    content: q.content,
    depositPence: q.deposit_pence,
    images,
    datasheets,
    signed,
  };
  return quotePdf(facts);
}

/** Signed links for the quote's images, so the builder can show them. */
export async function imageUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await createAdminClient().storage.from(DOCS_BUCKET).createSignedUrls(paths, 3600);
  return Object.fromEntries((data ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl as string]));
}

/**
 * Once the customer signs a quote made in the builder: a copy of it with their signature, name and time,
 * stored on the job and shown in their portal (the PDF they signed stays as it was, for the record).
 */
export async function saveSignedQuote(documentId: string, who: { name: string; at: string; signaturePath: string }): Promise<void> {
  const db = createAdminClient();
  const { data } = await db.from('crm_quotes').select('*').eq('document_id', documentId).maybeSingle();
  if (!data) return;
  const q = quoteRow(data);
  const { data: png } = await db.storage.from(DOCS_BUCKET).download(who.signaturePath);
  if (!png) return;
  const bytes = await renderQuote(q, { png: new Uint8Array(await png.arrayBuffer()), name: who.name, at: who.at });
  const { data: p } = await db.from('crm_projects').select('project_ref').eq('id', q.project_id).maybeSingle();
  const { saveGenerated } = await import('@/lib/documents/store');
  const { docFileName } = await import('@/lib/documents/pdf-kit');
  await saveGenerated(db, q.project_id, {
    key: `${q.number}-SIGNED`,
    name: docFileName((p?.project_ref as string | null) ?? null, 'Signed quote', q.number),
    bytes,
    inputs: { documentId, who },
    category: 'quote',
    visible: true,
    force: true,
  });
}
