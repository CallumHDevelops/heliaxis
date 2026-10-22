import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { guessProducts, portalMode } from '@/lib/crm/stages';
import { portalUrl } from '@/lib/crm/server';
import { getCrmSettings } from '@/lib/crm/crm-settings';
import { defaultTemplate, graph, type GraphResult } from './api';
import {
  blankLabel,
  checkTemplate,
  cleanBlanks,
  FIELDS,
  customerSendable,
  forUk,
  readyMade,
  READY_MADE,
  interestPhrase,
  type Blank,
  type FieldKey,
  type TemplateDraft,
  type WaTemplate,
} from './templates-shared';

/**
 * The WhatsApp Business Account's message templates (WhatsApp templates page and the Send template
 * pickers): list every one, send new ones to Meta for approval, delete, and what fills each blank.
 * Needs WHATSAPP_BUSINESS_ACCOUNT_ID and a token with whatsapp_business_management. The token
 * never leaves the server.
 */

const BLANKS_KEY = 'whatsapp-template-fields';

const waba = () => process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || '';

/** Why the templates can't be listed, for the page to explain. */
export type TemplatesProblem = { kind: 'not-connected' | 'no-account' | 'permission' | 'other'; message: string };

/** Meta's errors in plain words. `name` = the template it was about. */
export function plainMetaError(r: Extract<GraphResult<unknown>, { ok: false }>, name?: string): TemplatesProblem {
  const msg = r.error || '';
  const it = name ? `“${name}”` : 'this template';
  if (r.code === 190) {
    return { kind: 'permission', message: 'The WhatsApp token has expired or been revoked. Make a new one (WHATSAPP_SETUP.md, step 2) and update WHATSAPP_TOKEN in Vercel.' };
  }
  if (r.code === 10 || r.code === 200 || r.code === 294 || (r.code === 100 && r.subcode === 33)) {
    return {
      kind: 'permission',
      message:
        'The WhatsApp token isn’t allowed to manage templates, or WHATSAPP_BUSINESS_ACCOUNT_ID is wrong. In Meta Business Settings → System users, generate the token again with the whatsapp_business_management permission ticked, put it in WHATSAPP_TOKEN in Vercel, and check the account ID matches WhatsApp → API setup.',
    };
  }
  if ([4, 17, 32, 613, 80004, 80008].includes(r.code ?? 0) || /rate limit|too many (calls|requests)|request limit/i.test(msg)) {
    return { kind: 'other', message: 'Meta is limiting how fast we can do this (about 100 new templates an hour). Wait a while and try again.' };
  }
  if (r.subcode === 2388023 || /being deleted/i.test(msg)) {
    return { kind: 'other', message: `A template called ${it} was deleted recently, and Meta won’t let the name be used again for about 4 weeks. Choose another name.` };
  }
  if (r.subcode === 2388024 || /already (exists|english|content)|there is already/i.test(msg)) {
    return { kind: 'other', message: `There’s already a template called ${it} in English (UK). Choose another name.` };
  }
  if (/too many variable|parameters? relative|ratio/i.test(msg)) {
    return { kind: 'other', message: 'Meta says there are too many blanks for such a short message. Add more words or use fewer blanks.' };
  }
  if (/leading or trailing|at the (start|beginning) or end|dangling/i.test(msg)) {
    return { kind: 'other', message: 'Meta won’t accept a blank at the very start or end of the message. Add some words around it.' };
  }
  if (/WhatsApp is not connected/i.test(msg)) return { kind: 'not-connected', message: 'WhatsApp isn’t connected yet (WHATSAPP_TOKEN is missing in Vercel).' };
  return { kind: 'other', message: `Meta said: ${msg}` };
}

/* ── What fills each blank (cms_kv) ──────────────────────────────────────────── */

type BlankMap = Record<string, Blank[]>;

export async function getBlankMap(): Promise<BlankMap> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', BLANKS_KEY).maybeSingle();
    const raw = data?.value ? (JSON.parse(data.value) as Record<string, unknown>) : {};
    const out: BlankMap = {};
    for (const [name, v] of Object.entries(raw)) {
      const b = cleanBlanks(v);
      if (b) out[name] = b;
    }
    return out;
  } catch {
    return {};
  }
}

/** Saves (or with null, forgets) what fills a template's blanks. Server-only: callers check the user is an admin. */
export async function saveBlanks(name: string, blanks: Blank[] | null) {
  const map = await getBlankMap();
  if (blanks) map[name] = blanks;
  else delete map[name];
  const { error } = await createAdminClient()
    .from('cms_kv')
    .upsert({ key: BLANKS_KEY, value: JSON.stringify(map), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** Saved blanks first, then the ready-made template's own. */
export function blanksFor(name: string, map: BlankMap): Blank[] | null {
  return map[name] ?? readyMade(name)?.fields.map((field) => ({ field })) ?? null;
}

/* ── Listing ─────────────────────────────────────────────────────────────────── */

type RawTemplate = {
  id: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  rejected_reason?: string;
  quality_score?: { score?: string };
  components?: { type: string; format?: string; text?: string; buttons?: { type: string; text?: string; url?: string }[] }[];
};

const FIELDS_FULL = 'id,name,language,category,status,rejected_reason,quality_score,components';
// Fewer fields, for when Meta rejects one of the above on this API version.
const FIELDS_MIN = 'id,name,language,category,status,components';
const SENDABLE_BUTTONS = ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'];

function toTemplate(t: RawTemplate, map: BlankMap): WaTemplate {
  const part = (type: string) => t.components?.find((c) => c.type === type);
  const header = part('HEADER');
  const body = part('BODY')?.text || '';
  const buttons = part('BUTTONS')?.buttons ?? [];
  const params = new Set(body.match(/\{\{\d+\}\}/g) || []).size;
  // sendTemplate() only fills the body: anything else that needs filling can't go from Heliaxis.
  const sendable =
    t.category !== 'AUTHENTICATION' &&
    (!header || (header.format === 'TEXT' && !/\{\{/.test(header.text || ''))) &&
    buttons.every((b) => SENDABLE_BUTTONS.includes(b.type) && !/\{\{/.test(b.url || '')) &&
    !(t.components ?? []).some((c) => !['HEADER', 'BODY', 'FOOTER', 'BUTTONS'].includes(c.type));
  return {
    id: t.id,
    name: t.name,
    language: t.language,
    category: t.category || '',
    status: t.status || '',
    rejected: t.rejected_reason || null,
    quality: t.quality_score?.score || null,
    header: header?.format === 'TEXT' ? header.text || null : header ? `[${header.format?.toLowerCase() || 'media'}]` : null,
    body,
    footer: part('FOOTER')?.text || null,
    buttons: buttons.map((b) => b.text || '').filter(Boolean),
    params,
    sendable,
    blanks: blanksFor(t.name, map),
  };
}

/** Every template on the account, whatever its status. */
export async function fetchTemplates(): Promise<{ ok: true; items: WaTemplate[] } | { ok: false; problem: TemplatesProblem }> {
  if (!process.env.WHATSAPP_TOKEN) {
    return { ok: false, problem: { kind: 'not-connected', message: 'WhatsApp isn’t connected yet (WHATSAPP_TOKEN is missing in Vercel).' } };
  }
  const id = waba();
  if (!id) {
    return {
      ok: false,
      problem: {
        kind: 'no-account',
        message:
          'Add WHATSAPP_BUSINESS_ACCOUNT_ID in Vercel so Heliaxis can see your templates. It’s in the Meta app → WhatsApp → API setup, under “WhatsApp Business Account ID”. Then redeploy.',
      },
    };
  }
  const map = await getBlankMap();
  const items: WaTemplate[] = [];
  let fields = FIELDS_FULL;
  let after = '';
  // Up to 500 (Meta's pages are 100), which is far more than Heliaxis will ever have.
  for (let page = 0; page < 5; ) {
    const path = `/${encodeURIComponent(id)}/message_templates?fields=${fields}&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`;
    const r = await graph<{ data: RawTemplate[]; paging?: { cursors?: { after?: string }; next?: string } }>(path);
    if (!r.ok) {
      if (r.code === 100 && r.subcode !== 33 && fields === FIELDS_FULL && page === 0) {
        fields = FIELDS_MIN;
        continue;
      }
      if (page) break; // show what we have
      return { ok: false, problem: plainMetaError(r) };
    }
    items.push(...(r.data.data ?? []).map((t) => toTemplate(t, map)));
    after = r.data.paging?.next ? r.data.paging.cursors?.after || '' : '';
    if (!after) break;
    page++;
  }
  // Ready-made ones first, in their order; then the rest by name.
  const rank = (n: string) => {
    const i = READY_MADE.findIndex((t) => t.name === n);
    return i < 0 ? READY_MADE.length : i;
  };
  items.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name) || a.language.localeCompare(b.language));
  return { ok: true, items };
}

/**
 * Approved templates Heliaxis can send, for the Send template pickers: no sample, UK English when
 * there is some. Without an account ID, just the default first-message template from Vercel.
 */
export async function sendableTemplates(): Promise<WaTemplate[]> {
  const r = await fetchTemplates();
  if (!r.ok) {
    const def = defaultTemplate();
    if (!def.name) return [];
    const map = await getBlankMap();
    return [
      {
        id: '',
        name: def.name,
        language: def.lang,
        category: '',
        status: 'APPROVED',
        rejected: null,
        quality: null,
        header: null,
        body: '',
        footer: null,
        buttons: [],
        params: 1,
        sendable: true,
        blanks: blanksFor(def.name, map),
      },
    ];
  }
  // The site app's trade templates (site_*) never appear in a customer's chat.
  return forUk(customerSendable(r.items));
}

/* ── Creating and deleting ───────────────────────────────────────────────────── */

export type NewTemplate = TemplateDraft & { blanks: Blank[] };

/** A ready-made template, as it's sent to Meta. */
export function readyDraft(name: string): NewTemplate | null {
  const t = readyMade(name);
  if (!t) return null;
  return {
    name: t.name,
    category: t.category,
    body: t.body,
    examples: t.examples ?? t.fields.map((f) => FIELDS[f].example),
    buttons: t.buttons,
    blanks: t.fields.map((field) => ({ field })),
  };
}

/** Sends a new template (English UK) to Meta for approval, and remembers what fills its blanks. */
export async function submitTemplate(d: NewTemplate): Promise<{ ok: true; status: string; category: string } | { ok: false; error: string }> {
  const errs = checkTemplate(d);
  if (d.blanks.length !== d.examples.length) errs.push('Say what fills each blank.');
  if (errs.length) return { ok: false, error: errs.join(' ') };
  const id = waba();
  if (!id) return { ok: false, error: 'Add WHATSAPP_BUSINESS_ACCOUNT_ID in Vercel first.' };

  const components: Record<string, unknown>[] = [
    { type: 'BODY', text: d.body.trim(), ...(d.examples.length ? { example: { body_text: [d.examples.map((e) => e.trim())] } } : {}) },
  ];
  if (d.buttons.length) components.push({ type: 'BUTTONS', buttons: d.buttons.map((text) => ({ type: 'QUICK_REPLY', text: text.trim() })) });
  const r = await graph<{ id: string; status?: string; category?: string }>(`/${encodeURIComponent(id)}/message_templates`, {
    method: 'POST',
    body: JSON.stringify({ name: d.name, language: 'en_GB', category: d.category, allow_category_change: true, components }),
  });
  if (!r.ok) return { ok: false, error: plainMetaError(r, d.name).message };
  // Ready-made templates carry their own blanks; saving them too keeps them if the list changes.
  await saveBlanks(d.name, d.blanks).catch(() => null);
  return { ok: true, status: r.data.status || 'PENDING', category: r.data.category || d.category };
}

/** Deletes a template: one language when `id` is given, otherwise every language. */
export async function deleteTemplate(name: string, id?: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const account = waba();
  if (!account) return { ok: false, error: 'Add WHATSAPP_BUSINESS_ACCOUNT_ID in Vercel first.' };
  const q = new URLSearchParams({ name, ...(id ? { hsm_id: id } : {}) });
  const r = await graph<{ success?: boolean }>(`/${encodeURIComponent(account)}/message_templates?${q}`, { method: 'DELETE' });
  if (!r.ok) return { ok: false, error: plainMetaError(r, name).message };
  await saveBlanks(name, null).catch(() => null);
  return { ok: true };
}

/* ── Filling the blanks ──────────────────────────────────────────────────────── */

const firstName = (name: string | null | undefined) => {
  const first = (name || '').trim().split(/\s+/)[0] || '';
  return /^\+?\d/.test(first) ? '' : first; // a lead named after their number
};

/**
 * What Heliaxis knows for a customer's blanks, to pre-fill the Send template pickers (still editable).
 * Links only for people who can open the CRM, and only once the customer has a link (the quote-only
 * page from Quote sent, the full portal from Won).
 */
export async function leadValues(enquiryId: string, me: { name: string | null; crm: boolean }): Promise<Partial<Record<FieldKey, string>>> {
  const db = createAdminClient();
  const [{ data: e }, { data: projects }, crm] = await Promise.all([
    db.from('enquiries').select('name, interest').eq('id', enquiryId).maybeSingle(),
    db.from('crm_projects').select('products, stage, portal_token').eq('enquiry_id', enquiryId).order('created_at', { ascending: false }).limit(1),
    getCrmSettings(),
  ]);
  const p = projects?.[0] as { products?: string[] | null; stage?: string; portal_token?: string | null } | undefined;
  const portal = me.crm && p?.portal_token && portalMode(p.stage) ? portalUrl(p.portal_token) : '';
  const values: Partial<Record<FieldKey, string>> = {
    first_name: firstName(e?.name),
    my_first_name: firstName(me.name),
    interest: interestPhrase(p?.products?.length ? p.products : guessProducts(e?.interest)),
    quote_link: portal,
    review_link: crm.reviewUrl,
  };
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v)) as Partial<Record<FieldKey, string>>;
}

/**
 * The blanks for a message Heliaxis sends by itself to a lead (first message, chasers), filled by
 * each blank's field. `params: null` = nobody has said what fills them: the caller's old guess
 * ({{1}} = first name) applies.
 */
export async function autoParams(name: string, enquiryId: string, customerName: string): Promise<{ ok: true; params: string[] | null } | { ok: false; error: string }> {
  const blanks = blanksFor(name, await getBlankMap());
  if (!blanks) return { ok: true, params: null };
  let interest = '';
  if (blanks.some((b) => b.field === 'interest')) {
    const db = createAdminClient();
    const [{ data: e }, { data: projects }] = await Promise.all([
      db.from('enquiries').select('interest').eq('id', enquiryId).maybeSingle(),
      db.from('crm_projects').select('products').eq('enquiry_id', enquiryId).order('created_at', { ascending: false }).limit(1),
    ]);
    const products = (projects?.[0]?.products as string[] | null) ?? [];
    interest = interestPhrase(products.length ? products : guessProducts(e?.interest)) || 'your home energy plans';
  }
  const params: string[] = [];
  for (const b of blanks) {
    if (b.field === 'first_name') params.push(firstName(customerName) || 'there');
    else if (b.field === 'interest') params.push(interest);
    else {
      return {
        ok: false,
        error: `The template “${name}” needs “${blankLabel(b)}”, which can’t be filled in automatically. Pick another one in Enquiries → WhatsApp templates → Use for.`,
      };
    }
  }
  return { ok: true, params };
}
