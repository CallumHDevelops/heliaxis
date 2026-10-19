import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { EnquiryRow } from '@/lib/enquiries';

const COLUMNS = 'id, name, email, phone, postcode, interest, property_type, source, status, created_at';

/**
 * Every enquiry, newest first, for the Enquiries list. Includes the customer reference (HX-0042)
 * once customer-refs.sql has been run; until then the list loads without it.
 */
export async function listEnquiryRows(): Promise<{ rows: EnquiryRow[]; error: string | null }> {
  const db = createAdminClient();
  const list = (columns: string) => db.from('enquiries').select(columns).order('created_at', { ascending: false });
  let r = await list(`${COLUMNS}, customer_ref`);
  if (r.error) r = await list(COLUMNS);
  return { rows: (r.data ?? []) as unknown as EnquiryRow[], error: r.error?.message ?? null };
}

/**
 * Customer references by enquiry id (customer-refs.sql). Empty before that's been run, or if the
 * read fails: a reference is worth showing, never worth failing a page for.
 */
export async function customerRefs(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (!unique.length) return out;
  const db = createAdminClient();
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += 100) batches.push(unique.slice(i, i + 100));
  const results = await Promise.all(
    batches.map((b) =>
      db
        .from('enquiries')
        .select('id, customer_ref')
        .in('id', b)
        .then(
          (r) => (r.error ? [] : ((r.data ?? []) as { id: string; customer_ref: string | null }[])),
          () => []
        )
    )
  );
  for (const row of results.flat()) if (row.customer_ref) out.set(row.id, row.customer_ref);
  return out;
}
