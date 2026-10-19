import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createImportedEnquiry, findExistingEnquiry, opportunityFor, type ExistingEnquiry } from '@/lib/crm/import';
import { deletedBefore } from '@/lib/crm/delete-customer';
import { isTestLead } from '@/lib/meta-leads-csv';
import { graph, type GraphResult, type LeadField } from '@/lib/whatsapp/api';
import { leadToEnquiry, mapLeadFields } from '@/lib/whatsapp/leads';

/**
 * Meta Lead Ads leads from before the CRM (or ones the webhook missed): the Pages and lead forms
 * the token can see, then each form's leads a page at a time. Meta only hands over the last 90
 * days; older ones come from the form's CSV download (src/lib/meta-leads-csv.ts) and go through
 * importLead too. Everything goes in via src/lib/crm/import.ts, so nobody is messaged or notified.
 * Page access tokens never leave the server: each request finds the Page's token again by its id.
 *
 * Live leads: the webhook (/api/meta/webhook) only hears about a new lead if the Meta app has a Page
 * webhook for leadgen (set up in Meta's dashboard) AND the Page itself is subscribed to the app
 * (subscribePageToLeads below, from the button on Enquiries → Import).
 */

const baseToken = () => process.env.META_PAGE_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '';

const PERMISSIONS = 'leads_retrieval, pages_show_list, pages_read_engagement and pages_manage_metadata';

/**
 * Meta's error → what to do about it, in plain English. 'live' is for checking or switching on a
 * Page's live leads, which needs pages_manage_metadata and control of the Page.
 */
export function plainMetaError(r: { error: string; code?: number }, what: 'leads' | 'live' = 'leads'): string {
  const m = r.error;
  // Our own time limit (AbortSignal.timeout), not Meta's words.
  if (/operation was aborted/i.test(m)) return 'Meta took too long to answer. Try again in a minute.';
  // 210 is "A page access token is required": the wrong kind of token, not an expired one.
  if (r.code === 190 || (r.code !== 210 && /access token|session has expired|has not authori[sz]ed application/i.test(m))) {
    return `Meta didn’t accept the CRM’s access token (it may have expired or been removed). Make a new one with ${PERMISSIONS}, update META_PAGE_ACCESS_TOKEN (or WHATSAPP_TOKEN) in Vercel, then redeploy.`;
  }
  if (what === 'live' && r.code === 100 && /subscribed_fields|leadgen/i.test(m)) {
    return (
      'Meta wouldn’t take leadgen for this app yet. In the Meta app, add the “Capture & manage ad leads with ' +
      'Marketing API” use case and subscribe its Page webhook to leadgen (the steps are on your “From Claude” ' +
      `list), then try again. (Meta said: “${m}”)`
    );
  }
  if (what === 'live' && ([10, 200, 210].includes(r.code ?? 0) || /permission|pages_manage_metadata|page access token/i.test(m))) {
    return (
      'Meta won’t let the CRM check or switch on live leads for this Page. Its access token needs ' +
      'pages_manage_metadata (as well as leads_retrieval and pages_show_list), and the CRM’s system user needs ' +
      'full control of the Page: Business Settings → Users → System users → the CRM’s user → Assign assets. ' +
      'If the token was made without pages_manage_metadata, make a new one with it, update ' +
      `META_PAGE_ACCESS_TOKEN in Vercel and redeploy. (Meta said: “${m}”)`
    );
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
    return `Meta is limiting how fast the CRM can ${what === 'live' ? 'ask about Pages' : 'fetch leads'}. Wait a few minutes, then try again.`;
  }
  return `Meta said: “${m}”`;
}

type Paged<T> = { data?: T[]; paging?: { cursors?: { after?: string }; next?: string } };

/** Every page of a Graph list (up to `max` pages). `path` already has a query string. */
async function all<T>(path: string, token: string, max = 20, signal?: AbortSignal): Promise<GraphResult<T[]>> {
  const out: T[] = [];
  let after = '';
  for (let i = 0; i < max; i++) {
    const r = await graph<Paged<T>>(`${path}${after ? `&after=${encodeURIComponent(after)}` : ''}`, { token, signal });
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
  // A Page token has no accounts ("nonexisting field (accounts) on node type (Page)"). Any other
  // failure (permissions, rate limits, a blip) is said as it is, and not remembered.
  if (!accounts.ok && !(accounts.code === 100 && /nonexist|node type/i.test(accounts.error))) {
    return { ok: false, error: plainMetaError(accounts) };
  }
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
  let pages = await findPages();
  // Not in the remembered list (it may be from before the Page was shared): ask Meta once more.
  if (pages.ok && !pages.data.some((x) => x.id === pageId)) pages = await findPages(true);
  if (!pages.ok) return pages;
  const p = pages.data.find((x) => x.id === pageId);
  return p
    ? { ok: true, data: p.token }
    : { ok: false, error: 'The CRM’s Meta token can’t see that Page any more. Press “Look again” to see what it can reach.' };
}

// The app behind the CRM's token. Pages are matched to it by id, not name: a Page's subscribed_apps
// can list other apps too, and names change. Page tokens from /me/accounts belong to the same app.
let appCache: { token: string; id: string } | null = null;

/** This app's id. GET /app answers with the app of whichever token asks. */
async function thisAppId(): Promise<GraphResult<string>> {
  const token = baseToken();
  if (appCache?.token === token) return { ok: true, data: appCache.id };
  const r = await graph<{ id?: string }>('/app?fields=id', { token });
  if (!r.ok) return r;
  if (!r.data.id) return { ok: false, error: 'Meta didn’t say which app the CRM’s token belongs to.' };
  appCache = { token, id: r.data.id };
  return { ok: true, data: r.data.id };
}

/**
 * The webhook fields this app gets from a Page, from the Page's own list of apps (null: the app
 * isn't subscribed to the Page at all). Needs the Page's token, with pages_manage_metadata.
 */
async function fieldsOnPage(pageId: string, token: string, appId: string, signal?: AbortSignal): Promise<GraphResult<string[] | null>> {
  const r = await all<{ id?: string; subscribed_fields?: unknown }>(`/${encodeURIComponent(pageId)}/subscribed_apps?limit=100`, token, 5, signal);
  if (!r.ok) return r;
  const app = r.data.find((a) => a.id === appId);
  if (!app) return { ok: true, data: null };
  // Meta lists them for every app; without the list there's nothing known to keep.
  const fields = Array.isArray(app.subscribed_fields) ? app.subscribed_fields : [];
  return { ok: true, data: fields.filter((f): f is string => typeof f === 'string') };
}

/**
 * 'on': the Page sends this app its new leads (with the app's Page webhook set up, they reach
 * Enquiries by themselves). 'unknown': the check failed.
 */
export type LiveLeads = 'on' | 'off' | 'unknown';
type LiveState = { liveLeads: LiveLeads; liveLeadsError: string | null };

// The check runs beside each Page's forms and mustn't hold up the list.
const LIVE_CHECK_MS = 8_000;

async function liveLeadsState(pageId: string, token: string, app: GraphResult<string>, signal?: AbortSignal): Promise<LiveState> {
  if (!app.ok) return { liveLeads: 'unknown', liveLeadsError: plainMetaError(app, 'live') };
  const r = await fieldsOnPage(pageId, token, app.data, signal);
  if (!r.ok) return { liveLeads: 'unknown', liveLeadsError: plainMetaError(r, 'live') };
  return { liveLeads: r.data?.includes('leadgen') ? 'on' : 'off', liveLeadsError: null };
}

/**
 * Live leads on for a Page: subscribes this app to the Page's leadgen field, with the Page's own
 * token (pages_manage_metadata). Meta replaces the app's whole list of fields on each call, so the
 * ones it already gets from the Page (feed, messages…) go in again with leadgen. Then reads it back.
 */
export async function subscribePageToLeads(pageId: string): Promise<({ ok: true } & LiveState) | { ok: false; error: string }> {
  const [token, app] = await Promise.all([pageToken(pageId), thisAppId()]);
  if (!token.ok) return token;
  if (!app.ok) return { ok: false, error: plainMetaError(app, 'live') };
  // Without today's list, subscribing could switch off something else this app gets from the Page.
  const now = await fieldsOnPage(pageId, token.data, app.data);
  if (!now.ok) return { ok: false, error: plainMetaError(now, 'live') };
  if (now.data?.includes('leadgen')) return { ok: true, liveLeads: 'on', liveLeadsError: null };

  const fields = [...new Set([...(now.data ?? []), 'leadgen'])].join(',');
  const r = await graph<{ success?: boolean | string }>(
    `/${encodeURIComponent(pageId)}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}`,
    { method: 'POST', token: token.data }
  );
  if (!r.ok) return { ok: false, error: plainMetaError(r, 'live') };
  if (String(r.data.success) === 'false') {
    return { ok: false, error: 'Meta didn’t switch live leads on for this Page. Try again in a minute.' };
  }
  const after = await liveLeadsState(pageId, token.data, app);
  // Meta said yes: if reading it back fails, take its word for it.
  return after.liveLeads === 'unknown' ? { ok: true, liveLeads: 'on', liveLeadsError: null } : { ok: true, ...after };
}

export type LeadForm = { id: string; name: string; status: string | null; leads: number | null; createdTime: string | null };
export type LeadSource = { pageId: string; pageName: string; forms: LeadForm[]; error: string | null } & LiveState;

type RawForm = { id: string; name?: string; status?: string; leads_count?: number; created_time?: string };

/** The Pages the CRM can see, their lead forms (newest first) and whether live leads are on. */
export async function listLeadSources(): Promise<{ pages: LeadSource[]; error: string | null }> {
  const [pages, app] = await Promise.all([findPages(true), thisAppId()]);
  if (!pages.ok) return { pages: [], error: pages.error };

  let noPages = false;
  const out = await Promise.all(
    pages.data.map(async (p): Promise<LeadSource> => {
      const formsOf = async (): Promise<Omit<LeadSource, keyof LiveState>> => {
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
      };
      // Side by side with the forms; if it fails, the Page just says it couldn't check.
      const [source, live] = await Promise.all([
        formsOf(),
        liveLeadsState(p.id, p.token, app, AbortSignal.timeout(LIVE_CHECK_MS)).catch(
          (e): LiveState => ({ liveLeads: 'unknown', liveLeadsError: plainMetaError({ error: errorText(e) }, 'live') })
        ),
      ]);
      return { ...source, ...live };
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

export type ImportCounts = { imported: number; matched: number; already: number; skipped: number; deleted: number; failed: number };
export const noCounts = (): ImportCounts => ({ imported: 0, matched: 0, already: 0, skipped: 0, deleted: 0, failed: 0 });

// Newer than this, a lead is the live webhook's: taking it first would skip its alert and rotation.
const LIVE_MS = 60 * 60_000;

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
 * is already in the CRM (their timeline gets a line saying so), 'skipped' for Meta test leads and
 * ones from the last hour (the live webhook's), 'deleted' for someone deleted from the CRM on
 * purpose, otherwise 'imported' as a new enquiry at its original date. Throws if it can't be saved.
 */
export async function importLead(
  lead: GraphLead,
  formName?: string | null,
  byId?: string | null
): Promise<'imported' | 'matched' | 'already' | 'skipped' | 'deleted'> {
  if (isTestLead(lead.field_data ?? [])) return 'skipped';
  const metaLeadId = lead.id?.trim() || null;
  // Only their own answer counts: META_LEADS_WHATSAPP_OPT_IN is about what today's forms say, not old ones.
  const { lead: who, interest, source, whatsappOptIn } = leadToEnquiry(lead.field_data ?? [], lead.ad_name, false);
  if (!who.name && !who.email && !who.phone) throw new Error('no name, email or phone number');
  const name = (who.name || 'Meta lead').trim().slice(0, 200);

  const at = lead.created_time ? new Date(lead.created_time) : null;
  const when = at && Number.isFinite(at.getTime()) ? at.toISOString() : null;
  const form = formName || lead.form_name;
  const where = form ? `Meta lead form “${form}”` : 'a Meta lead form';
  const via = [lead.ad_name && `ad: ${lead.ad_name}`, lead.campaign_name && `campaign: ${lead.campaign_name}`, PLATFORMS[lead.platform?.toLowerCase() ?? '']]
    .filter(Boolean)
    .join(', ');

  const db = createAdminClient();
  let existing = await findExistingEnquiry({ metaLeadId, phone: who.phone, email: who.email });
  if (!existing && when) {
    // Nothing to match on (no lead id, phone or email we can use): an earlier import of this lead
    // has the same name at the same moment.
    const { data } = await db.from('enquiries').select('id, name, meta_lead_id, wa_id').eq('name', name).eq('created_at', when).limit(1);
    existing = (data?.[0] as ExistingEnquiry | undefined) ?? null;
  }
  if (existing && metaLeadId && existing.meta_lead_id === metaLeadId) return 'already';
  if (when && Date.now() - Date.parse(when) < LIVE_MS) return 'skipped';
  // Deleted on purpose: this lead never comes back. Nor do they, unless they're in the CRM again
  // (a new lead or WhatsApp since), when it's matched as usual, or this lead is from after they
  // were deleted. Null: the deleted list isn't set up.
  const gone = await deletedBefore({ metaLeadId, phone: who.phone, email: who.email }, when);
  if (gone === 'meta_lead' || (gone && !existing)) return 'deleted';

  if (existing) {
    // The same file (or the same lead without its id) imported again: it's on their timeline already.
    let seen = false;
    if (when) {
      const { data } = await db
        .from('crm_activities')
        .select('id')
        .eq('enquiry_id', existing.id)
        .eq('kind', 'system')
        .eq('at', when)
        .ilike('body', '%Meta lead form%')
        .limit(1);
      seen = !!data?.length;
    }
    if (!seen) {
      const { error } = await db.from('crm_activities').insert({
        enquiry_id: existing.id,
        project_id: await opportunityFor(existing.id),
        kind: 'system',
        body: `Also filled in ${where}${when ? ` on ${day(when)}` : ''}${via ? ` (${via})` : ''}${interest ? `: ${interest}` : ''}. Added by import.`.slice(0, 2000),
        by_id: byId ?? null,
        at: when ?? new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    }
    if (metaLeadId && !existing.meta_lead_id) {
      // So the Conversions API can name the lead. After the line, so a line that failed isn't taken as
      // already imported next time. Unique: if another enquiry claimed it meanwhile, leave it.
      const { error } = await db.from('enquiries').update({ meta_lead_id: metaLeadId }).eq('id', existing.id).is('meta_lead_id', null);
      if (error && error.code !== '23505') throw new Error(error.message);
    }
    return seen ? 'already' : 'matched';
  }

  try {
    await createImportedEnquiry({
      name,
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
