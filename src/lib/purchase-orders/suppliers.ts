import 'server-only';
import { isEmail } from './shared';

/**
 * A supplier's details from a request, checked and tidied (the suppliers API uses it for adding and
 * editing). Only the fields sent are returned, so an edit can change one thing.
 */
export type SupplierFields = Partial<Record<'name' | 'contact_name' | 'email' | 'phone' | 'account_number' | 'address' | 'notes', string | null>>;

const LIMITS = { name: 120, contact_name: 120, email: 200, phone: 40, account_number: 60, address: 300, notes: 1000 } as const;

export function cleanSupplier(b: Record<string, unknown>, creating: boolean): { ok: true; fields: SupplierFields } | { ok: false; error: string } {
  const fields: SupplierFields = {};
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    if (!(k in b)) continue;
    const raw = String(b[k] ?? '');
    // Addresses and notes keep their lines; everything else is one line.
    const v = (k === 'address' || k === 'notes' ? raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n') : raw.replace(/\s+/g, ' ').trim()).slice(0, LIMITS[k]);
    fields[k] = v || null;
  }
  if (creating || 'name' in fields) {
    if (!fields.name) return { ok: false, error: 'The supplier needs a name.' };
  }
  if (fields.email) {
    fields.email = fields.email.toLowerCase();
    if (!isEmail(fields.email)) return { ok: false, error: `“${fields.email}” isn’t an email address.` };
  }
  return { ok: true, fields };
}

/** A clash on the "one live supplier per name" index. */
export const nameTaken = (e: { code?: string } | null, name: string | null | undefined) =>
  e?.code === '23505' ? `There’s already a supplier called ${name}. Use that one, or give this one a different name.` : null;
