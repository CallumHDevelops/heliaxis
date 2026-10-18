import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createImportedEnquiry, findExistingEnquiry, opportunityFor } from '@/lib/crm/import';
import { graph, type GraphResult, type LeadField } from '@/lib/whatsapp/api';
import { leadToEnquiry, mapLeadFields } from '@/lib/whatsapp/leads';

/**
 * Meta Lead Ads leads from before the CRM (or ones the webhook missed): the Pages and lead forms
 * the token can see, then each form's leads a page at a time. Meta only hands over the last 90
 * days; older ones come from the form's CSV download (src/lib/meta-leads-csv.ts) and go through
 * importLead too. Everything goes in via src/lib/crm/import.ts, so nobody is messaged or notified.
 * Page access tokens never leave the server: each request finds the Page's token again by its id.
 */

const baseToken = () => process.env.META_PAGE_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '';

const PERMISSIONS = 'leads_retrieval, pages_show_list, pages_read_engagement and pages_manage_metadata';

/** Meta's error → what to do about it, in plain English. */
export function plainMetaError(r: { error: string; code?: number }): string {
  const m = r.error;
  if (r.code === 190 || /access token|session has expired|has not authori[sz]ed application/i.test(m)) {
    return `Meta didn’t accept the CRM’s access token (it may have expired or been removed). Make a new one with ${PERMISSIONS}, and update META_PAGE_ACCESS_TOKEN (or WHATSAPP_TOKEN) in Vercel.`;
  }
  if (
    r.code === 10 ||
    r.code === 200 ||
    /permission|leads_retrieval|leads access|pages_read_engagement|pages_show_list|pages_manage_metadata/i.test(m)
  ) {
    return (
      `Meta won’t let the CRM read these leads. Its access token needs ${PERMISSIONS}, and the CRM’s app ` +
      'needs Leads Access on the Page: Page settings → Leads access, or Meta Business Suite → Settings → ' +
      `Integrations → Leads access, then give the app access. (Meta said: “${m}”)`
    );
  }
  if ([4, 17, 32, 613].includes(r.code ?? 0) || /request limit|too many calls/i.test(m)) {
    return 'Meta is limiting how fast the CRM can fetch leads. Wait a few minutes, then try again.';
  }
  return `Meta said: “${m}”`;
}

type Paged<T> = { data?: T[]; paging?: { cursors?: { after?: string }; next?: string } };

/** Every page of a Graph list (up to `max` pages). `path` already has a query string. */
async function all<T>(path: string, token: string, max = 20): Promise<GraphResult<T[]>> {
  const out: T[] = [];
  let after = '';
  for (let i = 0; i < max; i++) {
    const r = await graph<Paged<T>>(`${path}${after ? `&after=${encodeURIComponent(after)}` : ''}`, { token });
    if (!r.ok) return r;
    out.push(...(r.data.data ?? []));
    // Only the cursor: paging.next is a full URL with the token in it.
    const next = r.data.paging?.next ? r.data.paging.cursors?.after : undefined;
    if (!next || next === after) break;
    after = next;
  }
  return { ok: true, data: out };
}

type Page = { id: string; name: string; token: string; viaMe?: boolean };

// Saves looking the Pages up again for every 50 leads. Server memory only.
let pagesCache: { at: number; token: string; pages: Page[] } | null = null;

/** The Pages the token can see, each with its own token. A Page token just sees its own Page. */
async function findPages(fresh = false): Promise<{ ok: true; data: Page[] } | { ok: false; error: string }> {
  const token = baseToken();
  if (!token) {
    return { ok: false, error: 'Meta isn’t connected yet: add META_PAGE_ACCESS_TOKEN (or WHATSAPP_TOKEN) in Vercel. See WHATSAPP_SETUP.md.' };
  }
  if (!fresh && pagesCache?.token === token && Date.now() - pagesCache.at < 10 * 60_000) return { ok: true, data: pagesCache.pages };

  const accounts = await all<{ id: string; name?: string; access_token?: string }>('/me/accounts?fields=id,name,access_token&limit=100', token);
  let pages: Page[] = accounts.ok
    ? accounts.data.map((p) => ({ id: p.id, name: p.name || p.id, token: p.access_token || token }))
    : [];
  if (!pages.length) {
    const me = await graph<{ id: string; name?: string }>('/me?fields=id,name', { token });
    if (!me.ok) return { ok: false, error: plainMetaError(me) };
    pages = [{ id: me.data.id, name: me.data.name || me.data.id, token, viaMe: true }];
  }
  pagesCache = { at: Date.now(), token, pages };
  return { ok: true, data: pages };
}

async function pageToken(pageId: string): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
  const pages = await findPages();
  if (!pages.ok) return pages;
  const p = pages.data.find((x) => x.id === pageId);
  return p
    ? { ok: true, data: p.token }
    : { ok: false, error: 'The CRM’s Meta token can’t see that Page any more. Press “Find lead forms” again.' };
}

export type LeadForm = { id: string; name: string; status: string | null; leads: number | null; createdTime: string | null };
export type LeadSource = { pageId: string; pageName: string; forms: LeadForm[]; error: string | null };

type RawForm = { id: string; name?: string; status?: string; leads_count?: number; created_time?: string };

/** The Pages the CRM can see and their lead forms, newest first. */
export async function listLeadSources(): Promise<{ pages: LeadSource[]; error: string | null }> {
  const pages = await findPages(true);
  if (!pages.ok) return { pages: [], error: pages.error };

  let noPages = false;
  const out = await Promise.all(
    pages.data.map(async (p): Promise<LeadSource> => {
      const path = (fields: string) => `/${encodeURIComponent(p.id)}/leadgen_forms?fields=${fields}&limit=100`;
      let r = await all<RawForm>(path('id,name,status,leads_count,created_time'), p.token);
      // A field this API version won't give: names alone will do.
      if (!r.ok && r.code === 100 && !/permission/i.test(r.error)) r = await all<RawForm>(path('id,name'), p.token);
      if (!r.ok) {
        // /me was a person or system user, not a Page, and they have no Pages.
        if (p.viaMe && r.code === 100 && /nonexist|node type/i.test(r.error)) noPages = true;
        return { pageId: p.id, pageName: p.name, forms: [], error: plainMetaError(r) };
      }
      const forms = r.data
        .map((f) => ({
          id: f.id,
          name: f.name || `Form ${f.id}`,
          status: f.status ?? null,
          leads: typeof f.leads_count === 'number' ? f.leads_count : null,
          createdTime: f.created_time ?? null,
        }))
        .sort((a, b) => (b.createdTime ?? '').localeCompare(a.createdTime ?? ''));
      return { pageId: p.id, pageName: p.name, forms, error: null };
    })
  );
  if (noPages) {
    return {
      pages: [],
      error:
        'The CRM’s Meta token can’t see any Facebook Pages. In Meta Business Settings → Users → System users, ' +
        'assign the Heliaxis Page to the system user (with leads access), or set META_PAGE_ACCESS_TOKEN to a Page access token.',
    };
  }
  return { pages: out, error: null };
}

/** A lead as the Graph API returns it (CSV rows are turned into the same shape). */
export type GraphLead = {
  id?: string;
  created_time?: string;
  field_data?: LeadField[];
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_id?: string;
  form_name?: string;
  platform?: string;
  is_organic?: boolean;
};

export type ImportCounts = { imported: number; matched: number; already: number; failed: number };
export const noCounts = (): ImportCounts => ({ imported: 0, matched: 0, already: 0, failed: 0 });

const PLATFORMS: Record<string, string> = { fb: 'Facebook', facebook: 'Facebook', ig: 'Instagram', instagram: 'Instagram' };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });

/** Who a lead is, for an error line. */
export function leadLabel(lead: GraphLead): string {
  const m = mapLeadFields(lead.field_data ?? []);
  return m.name || m.email || m.phone || (lead.id ? `Lead ${lead.id}` : 'A lead');
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Unknown error');

/**
 * One lead, from Meta or a CSV: 'already' if it's been brought in before, 'matched' if the person
 * is already in the CRM (their timeline gets a line saying so), otherwise 'imported' as a new
 * enquiry at its original date. Throws if it can't be saved.
 */
export async function importLead(
  lead: GraphLead,
  formName?: string | null,
  byId?: string | null
): Promise<'imported' | 'matched' | 'already'> {
  const metaLeadId = lead.id?.trim() || null;
  const { lead: who, interest, source, whatsappOptIn } = leadToEnquiry(
    lead.field_data ?? [],
    lead.ad_name,
    process.env.META_LEADS_WHATSAPP_OPT_IN === 'true'
  );
  if (!who.name && !who.email && !who.phone) throw new Error('no name, email or phone number');

  const at = lead.created_time ? new Date(lead.created_time) : null;
  const when = at && Number.isFinite(at.getTime()) ? at.toISOString() : null;
  const form = formName || lead.form_name;
  const where = form ? `Meta lead form “${form}”` : 'a Meta lead form';
  const via = [lead.ad_name && `ad: ${lead.ad_name}`, lead.campaign_name && `campaign: ${lead.campaign_name}`, PLATFORMS[lead.platform?.toLowerCase() ?? '']]
    .filter(Boolean)
    .join(', ');

  const existing = await findExistingEnquiry({ metaLeadId, phone: who.phone, email: who.email });
  if (existing && metaLeadId && existing.meta_lead_id === metaLeadId) return 'already';

  if (existing) {
    const db = createAdminClient();
    if (metaLeadId && !existing.meta_lead_id) {
      // So the Conversions API can name the lead. Unique: if another enquiry claimed it meanwhile, leave it.
      const { error } = await db.from('enquiries').update({ meta_lead_id: metaLeadId }).eq('id', existing.id).is('meta_lead_id', null);
      if (error && error.code !== '23505') throw new Error(error.message);
    }
    // The same file (or the same lead without its id) imported again: it's on their timeline already.
    if (when) {
      const { data: seen } = await db
        .from('crm_activities')
        .select('id')
        .eq('enquiry_id', existing.id)
        .eq('kind', 'system')
        .eq('at', when)
        .ilike('body', '%Meta lead form%')
        .limit(1);
      if (seen?.length) return 'already';
    }
    const { error } = await db.from('crm_activities').insert({
      enquiry_id: existing.id,
      project_id: await opportunityFor(existing.id),
      kind: 'system',
      body: `Also filled in ${where}${when ? ` on ${day(when)}` : ''}${via ? ` (${via})` : ''}${interest ? `: ${interest}` : ''}. Added by import.`.slice(0, 2000),
      by_id: byId ?? null,
      at: when ?? new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return 'matched';
  }

  try {
    await createImportedEnquiry({
      name: who.name || 'Meta lead',
      email: who.email,
      phone: who.phone || null,
      postcode: who.postcode || null,
      interest,
      source,
      createdAt: when ?? new Date().toISOString(),
      metaLeadId,
      whatsappOptIn,
      activity: `Imported from ${where}${via ? ` (${via})` : ''}`,
      byId,
    });
  } catch (e) {
    // The same lead saved a moment ago (the webhook, or another import running): that one stands.
    if (/duplicate key|unique/i.test(errorText(e))) return 'already';
    throw e;
  }
  return 'imported';
}

const LEAD_FIELDS = 'id,created_time,field_data,ad_name,adset_name,campaign_name,form_id,platform,is_organic';
// Ad and campaign names need ads access on some setups; the answers matter more.
const LEAD_FIELDS_MIN = 'id,created_time,field_data,form_id,platform,is_organic';

/** One Graph page (up to 50) of a form's leads → imported. `next` is the cursor for the next call, or null when done. */
export async function importFormPage(
  pageId: string,
  formId: string,
  after?: string | null,
  byId?: string | null
): Promise<{ ok: true; counts: ImportCounts; errors: string[]; next: string | null } | { ok: false; error: string }> {
  const token = await pageToken(pageId);
  if (!token.ok) return token;
  const id = encodeURIComponent(formId);
  const leadsPath = (fields: string) => `/${id}/leads?fields=${fields}&limit=50${after ? `&after=${encodeURIComponent(after)}` : ''}`;

  const [form, first] = await Promise.all([
    graph<{ name?: string }>(`/${id}?fields=name`, { token: token.data }),
    graph<Paged<GraphLead>>(leadsPath(LEAD_FIELDS), { token: token.data }),
  ]);
  let r = first;
  if (!r.ok && [10, 100, 200].includes(r.code ?? 0) && !/leads_retrieval/i.test(r.error)) {
    r = await graph<Paged<GraphLead>>(leadsPath(LEAD_FIELDS_MIN), { token: token.data });
  }
  if (!r.ok) return { ok: false, error: plainMetaError(r) };

  const formName = form.ok ? form.data.name : null;
  const counts = noCounts();
  const errors: string[] = [];
  // One at a time, so the same person twice in a page is matched rather than added twice.
  for (const lead of r.data.data ?? []) {
    try {
      counts[await importLead(lead, formName, byId)]++;
    } catch (e) {
      counts.failed++;
      if (errors.length < 5) errors.push(`${leadLabel(lead)}: ${errorText(e)}`);
    }
  }
  const next = r.data.paging?.next ? (r.data.paging.cursors?.after ?? null) : null;
  return { ok: true, counts, errors, next: next && next !== after ? next : null };
}
