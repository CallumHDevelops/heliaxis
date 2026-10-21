import { createAdminClient } from '@/lib/supabase/admin';
import { requirePortal } from '@/lib/auth';
import { isUuid, json } from '@/lib/crm/server';
import { isCisRate } from '@/lib/site/money';
import { cleanContact, ensureFirmContact, firmsById, notReady, searchPeople, siteReady, type ContactRow } from '@/lib/site/server';
import { getSiteSettings } from '@/lib/site/settings';
import { isTrade } from '@/lib/site/types';

export const dynamic = 'force-dynamic';

/** The CRM (putting people on jobs) or Subcontractors (a firm's site contacts card). */
async function session() {
  return (await requirePortal('crm')) ?? (await requirePortal('subcontractors'));
}

const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * ?q=&trade=: the people picker (site contacts and subcontractor firms, that trade first).
 * ?firm=<id>: a firm's people who go to site, with their operatives to add from. ?meta=1: the VAT default.
 */
export async function GET(req: Request) {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const sp = new URL(req.url).searchParams;
  const db = createAdminClient();
  // ?meta=1: what New project needs to know (the VAT default for VAT-registered subcontractors).
  if (sp.get('meta')) return json({ vatDefault: (await getSiteSettings()).vatDefault });
  const firm = sp.get('firm');
  if (firm) {
    if (!isUuid(firm)) return json({ error: 'Not found' }, 404);
    const [{ data: contacts }, { data: operatives }] = await Promise.all([
      db.from('site_contacts').select('*').eq('subcontractor_id', firm).is('archived_at', null).order('created_at'),
      db.from('subcontractor_operatives').select('id, full_name, phone, email, archived_at').eq('subcontractor_id', firm).is('archived_at', null).order('full_name'),
    ]);
    return json({ contacts: contacts ?? [], operatives: operatives ?? [] });
  }
  const trade = sp.get('trade');
  return json({ people: await searchPeople(db, (sp.get('q') ?? '').slice(0, 80), isTrade(trade) ? trade : null) });
}

/**
 * A new person who goes to site: a quick contact { name, company, email, mobile, vat_number,
 * trades }, or one of a firm's people { firm_id, operative_id? } (the firm's main contact when no
 * operative is given; an operative's name, mobile and email default from the firm's records).
 */
export async function POST(req: Request) {
  const s = await session();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = createAdminClient();
  if (typeof b.firm_id === 'string') {
    if (!isUuid(b.firm_id)) return json({ error: 'Not found' }, 404);
    const firm = (await firmsById(db, [b.firm_id])).get(b.firm_id);
    if (!firm) return json({ error: 'That subcontractor isn’t there any more.' }, 404);
    if (!b.operative_id) {
      const c = await ensureFirmContact(db, firm, s.user.id);
      return c ? json({ contact: c }) : json({ error: 'Not saved. Try again.' }, 500);
    }
    if (!isUuid(String(b.operative_id))) return json({ error: 'Not found' }, 404);
    const { data: op } = await db.from('subcontractor_operatives').select('*').eq('id', String(b.operative_id)).eq('subcontractor_id', firm.id).maybeSingle();
    if (!op) return json({ error: 'That person isn’t on the firm’s team any more.' }, 404);
    const { data: have } = await db.from('site_contacts').select('*').eq('operative_id', op.id).is('archived_at', null).maybeSingle();
    if (have) return json({ contact: have });
    const c = cleanContact({ name: op.full_name, company: firm.company_name, email: b.email ?? op.email ?? '', mobile: b.mobile ?? op.phone ?? '', trades: b.trades ?? [] });
    if (!c.ok) return json({ error: c.error }, 422);
    const { data, error } = await db
      .from('site_contacts')
      .insert({ ...c.fields, subcontractor_id: firm.id, operative_id: op.id, created_by: s.user.id })
      .select('*')
      .single();
    return error ? json({ error: error.message }, 500) : json({ contact: data });
  }
  const c = cleanContact(b);
  if (!c.ok) return json({ error: c.error }, 422);
  const ok = b.whatsapp_ok === true;
  const { data, error } = await db
    .from('site_contacts')
    .insert({ ...c.fields, ...(ok ? { whatsapp_ok: true, whatsapp_ok_at: new Date().toISOString(), whatsapp_ok_by: s.user.id } : {}), created_by: s.user.id })
    .select('*')
    .single();
  return error ? json({ error: error.message }, 500) : json({ contact: data });
}

/**
 * Change a person: name, company, email, mobile, VAT number, trades, scheme details; "Happy to get
 * job messages on WhatsApp" (who recorded it, and when); a quick contact's CIS verification
 * { cis_verified_on, cis_rate }; linking a quick contact to a firm { subcontractor_id }; { archived }.
 */
export async function PATCH(req: Request) {
  const s = await session();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id ?? '');
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { data: cur } = await db.from('site_contacts').select('*').eq('id', id).maybeSingle();
  const c = cur as ContactRow | null;
  if (!c) return json({ error: 'That person isn’t there any more.' }, 404);
  const clean = cleanContact(b, true);
  if (!clean.ok) return json({ error: clean.error }, 422);
  const u: Record<string, unknown> = { ...clean.fields, updated_at: new Date().toISOString() };
  if ('whatsapp_ok' in b) {
    const ok = b.whatsapp_ok === true;
    Object.assign(u, ok ? { whatsapp_ok: true, whatsapp_ok_at: new Date().toISOString(), whatsapp_ok_by: s.user.id } : { whatsapp_ok: false, whatsapp_ok_at: null, whatsapp_ok_by: null });
  }
  if ('cis_verified_on' in b || 'cis_rate' in b) {
    if (c.subcontractor_id) return json({ error: 'Their CIS verification is on the firm’s record (Subcontractors).' }, 409);
    if (b.cis_verified_on === null || b.cis_verified_on === '') Object.assign(u, { cis_verified_on: null, cis_rate: null });
    else {
      if (!isDay(b.cis_verified_on) || !isCisRate(b.cis_rate)) return json({ error: 'Give the date HMRC verified them and the rate: gross, net or higher.' }, 400);
      Object.assign(u, { cis_verified_on: b.cis_verified_on, cis_rate: b.cis_rate });
    }
  }
  if ('subcontractor_id' in b) {
    if (b.subcontractor_id === null) u.subcontractor_id = null;
    else {
      const fid = String(b.subcontractor_id);
      if (!isUuid(fid) || !(await firmsById(db, [fid])).has(fid)) return json({ error: 'That subcontractor isn’t there.' }, 404);
      u.subcontractor_id = fid;
    }
  }
  if ('archived' in b) u.archived_at = b.archived ? new Date().toISOString() : null;
  const { data, error } = await db.from('site_contacts').update(u).eq('id', id).select('*').single();
  return error ? json({ error: error.message }, 500) : json({ contact: data });
}
