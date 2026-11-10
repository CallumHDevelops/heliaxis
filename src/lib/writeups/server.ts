import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOCS_BUCKET } from '@/lib/crm/server';
import { lineNet, money, totalsOf } from '@/lib/quotes/types';
import { quoteRow } from '@/lib/quotes/server';
import { cleanContent, type WriteupContent } from './types';

/** A saved document (crm_writeups), as the editor and the downloads read it. */
export type WriteupRow = {
  id: string;
  number: string;
  kind: string;
  title: string;
  enquiry_id: string | null;
  organisation_id: string | null;
  project_id: string | null;
  content: WriteupContent;
  created_at: string;
  updated_at: string;
};

export const rowOf = (r: Record<string, unknown>): WriteupRow => ({ ...(r as unknown as WriteupRow), content: cleanContent(r.content) });

export async function readWriteup(id: string): Promise<WriteupRow | null> {
  const { data } = await createAdminClient().from('crm_writeups').select('*').eq('id', id).maybeSingle();
  return data ? rowOf(data) : null;
}

/** Who a document is for: their name, address and reference, from the customer or organisation it is assigned to. */
export type WriteupFor = { kind: 'customer' | 'organisation' | null; id: string | null; name: string; address: string; ref: string | null };

export async function forWhom(w: Pick<WriteupRow, 'enquiry_id' | 'organisation_id' | 'project_id'>): Promise<WriteupFor> {
  const db = createAdminClient();
  if (w.organisation_id) {
    const { data } = await db.from('organisations').select('id, name, address, postcode').eq('id', w.organisation_id).maybeSingle();
    if (data) return { kind: 'organisation', id: data.id as string, name: data.name as string, address: [data.address, data.postcode].filter(Boolean).join(', '), ref: null };
  }
  if (w.enquiry_id) {
    const { data } = await db.from('enquiries').select('id, name, postcode, customer_ref').eq('id', w.enquiry_id).maybeSingle();
    let address = '';
    if (w.project_id) {
      const { data: p } = await db.from('crm_projects').select('address, postcode').eq('id', w.project_id).maybeSingle();
      address = [p?.address, p?.postcode].filter(Boolean).join(', ');
    }
    if (data) return { kind: 'customer', id: data.id as string, name: data.name as string, address: address || String(data.postcode ?? ''), ref: (data.customer_ref as string | null) ?? null };
  }
  return { kind: null, id: null, name: '', address: '', ref: null };
}

/** The pictures a document uses, fetched from storage: path → bytes. A picture that can't be read is left out. */
export async function loadImages(content: WriteupContent): Promise<Map<string, { bytes: Uint8Array; mime: string }>> {
  const out = new Map<string, { bytes: Uint8Array; mime: string }>();
  const db = createAdminClient();
  const paths = [...new Set(content.blocks.flatMap((b) => (b.type === 'image' && b.path ? [b.path] : [])))];
  await Promise.all(
    paths.map(async (p) => {
      const { data } = await db.storage.from(DOCS_BUCKET).download(p);
      if (!data) return;
      const bytes = new Uint8Array(await data.arrayBuffer());
      out.set(p, { bytes, mime: /\.png$/i.test(p) ? 'image/png' : 'image/jpeg' });
    })
  );
  return out;
}

/** A quote as a table for a document: the customer-facing lines (never costs or internal lines) and the totals. */
export type QuoteTable = { number: string; title: string; headers: string[]; rows: string[][]; totals: [string, string][] };

export async function loadQuoteTables(content: WriteupContent): Promise<Map<string, QuoteTable>> {
  const out = new Map<string, QuoteTable>();
  const ids = [...new Set(content.blocks.flatMap((b) => (b.type === 'quote' && b.quote_id ? [b.quote_id] : [])))];
  if (!ids.length) return out;
  const { data } = await createAdminClient().from('crm_quotes').select('*').in('id', ids);
  for (const r of data ?? []) {
    const q = quoteRow(r);
    const rows: string[][] = [];
    for (const b of q.content.blocks) {
      if (b.type !== 'items') continue;
      for (const l of b.lines) {
        if (l.internal || !l.description.trim()) continue;
        const desc = l.detail ? `${l.description}\n${l.detail}` : l.description;
        if (l.text) rows.push([desc, '', '', '']);
        else rows.push([desc, String(l.qty), money(l.unit_pence), money(lineNet(l))]);
      }
    }
    const t = totalsOf(q.content);
    out.set(q.id, {
      number: q.number,
      title: q.title,
      headers: ['Item', 'Qty', 'Price', 'Total'],
      rows,
      totals: [
        ['Total before VAT', money(t.net)],
        ['VAT', money(t.vat)],
        ['Total to pay', money(t.gross)],
      ],
    });
  }
  return out;
}

/** The quotes a customer or organisation has, for the Quote table block's picker. */
export async function quotesFor(w: Pick<WriteupRow, 'enquiry_id' | 'organisation_id'>): Promise<{ id: string; number: string; title: string; status: string }[]> {
  const db = createAdminClient();
  const projectIds = new Set<string>();
  if (w.enquiry_id) {
    const { data } = await db.from('crm_projects').select('id').eq('enquiry_id', w.enquiry_id).limit(200);
    for (const p of data ?? []) projectIds.add(p.id as string);
  }
  if (w.organisation_id) {
    const { data } = await db.from('crm_projects').select('id').eq('organisation_id', w.organisation_id).limit(200);
    for (const p of data ?? []) projectIds.add(p.id as string);
  }
  if (!projectIds.size) return [];
  const { data } = await db.from('crm_quotes').select('id, number, title, status').in('project_id', [...projectIds]).order('created_at', { ascending: false }).limit(50);
  return (data ?? []).map((q) => ({ id: q.id as string, number: q.number as string, title: q.title as string, status: q.status as string }));
}
