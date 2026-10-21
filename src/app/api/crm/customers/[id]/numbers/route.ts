import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { aliasValue } from '@/lib/crm/merge-rules';
import { shownNumber } from '@/lib/crm/aliases';
import { toWaId } from '@/lib/whatsapp/shared';

export const dynamic = 'force-dynamic';

/**
 * The other numbers and emails a merge kept on a customer (crm_aliases, src/lib/crm/merge.ts), from
 * their card. { kind: 'phone' | 'email', value, action: 'main' } makes it their mobile (and WhatsApp
 * number) or email, and the one it replaces becomes an other one; action: 'remove' forgets it, so
 * search and incoming messages no longer find them by it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { kind?: string; value?: string; action?: string };
  const kind = b.kind === 'email' ? 'email' : b.kind === 'phone' ? 'phone' : null;
  const value = kind ? aliasValue(kind, b.value) : null;
  if (!kind || !value || (b.action !== 'main' && b.action !== 'remove')) return json({ error: 'Pick a number or email.' }, 400);
  const db = createAdminClient();
  const { data: alias } = await db.from('crm_aliases').select('kind, value, shown').eq('kind', kind).eq('value', value).eq('enquiry_id', id).maybeSingle();
  if (!alias) return json({ error: 'That isn’t one of their other numbers any more.' }, 404);
  const who = s.profile.full_name?.trim() || s.profile.email?.split('@')[0] || 'Someone';
  const shown = alias.shown || (kind === 'phone' ? shownNumber(value) : value);

  if (b.action === 'remove') {
    const { error } = await db.from('crm_aliases').delete().eq('kind', kind).eq('value', value).eq('enquiry_id', id);
    if (error) return json({ error: error.message }, 500);
    await logActivity({ enquiryId: id, kind: 'system', body: `${who} removed ${shown} from their other ${kind === 'phone' ? 'numbers' : 'emails'}`, byId: s.user.id });
    return json({ ok: true });
  }

  const { data: c } = await db.from('enquiries').select('*').eq('id', id).maybeSingle();
  if (!c) return json({ error: 'Not found' }, 404);
  // Their phone and, when it's a different one, the number they WhatsApp from: both stay findable.
  const olds = kind === 'phone' ? [(c.phone as string | null) || null, c.wa_id ? shownNumber(String(c.wa_id)) : null] : [(c.email as string | null) || null];
  const update = kind === 'phone' ? { phone: shown, ...('wa_id' in c ? { wa_id: toWaId(shown) ?? value } : {}) } : { email: shown };
  const { error } = await db.from('enquiries').update(update).eq('id', id);
  if (error) return json({ error: error.message }, 500);
  await db.from('crm_aliases').delete().eq('kind', kind).eq('value', value);
  const kept: string[] = [];
  for (const old of olds) {
    const oldValue = old ? aliasValue(kind, old) : null;
    if (!old || !oldValue || oldValue === value || kept.some((k) => aliasValue(kind, k) === oldValue)) continue;
    kept.push(old);
    await db.from('crm_aliases').upsert({ kind, value: oldValue, shown: old, enquiry_id: id, from_ref: (c.customer_ref as string | null) ?? null }, { onConflict: 'kind,value', ignoreDuplicates: true });
  }
  const keptWords = kept.length ? `; ${kept.join(' and ')} ${kept.length > 1 ? 'are' : 'is'} kept as ${kind === 'phone' ? (kept.length > 1 ? 'other numbers' : 'another number') : 'another email'}` : '';
  await logActivity({
    enquiryId: id,
    kind: 'system',
    body: kind === 'phone' ? `${who} made ${shown} their main number (WhatsApp replies go to it)${keptWords}` : `${who} made ${shown} their email${keptWords}`,
    byId: s.user.id,
  });
  return json({ ok: true });
}
