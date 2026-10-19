import { crmSession, ensurePortalToken, isUuid, json, logActivity, portalUrl, resetPortalToken } from '@/lib/crm/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { quoteMessages, SIGNABLE_CATEGORIES } from '@/lib/crm/portal';
import { PORTAL_CLOSED_MSG, portalMode } from '@/lib/crm/stages';
import { msConfigured } from '@/lib/ms365';
import { schemaReady } from '@/lib/schema-ready';

export const dynamic = 'force-dynamic';

type DocRow = {
  id: string;
  name: string;
  category: string;
  needs_signature: boolean;
  signed_outside_at?: string | null;
  signed_outside_by?: string | null;
  signed_outside_note?: string | null;
};

/**
 * The customer link card: { url, mode, stage, accepted, quoteDocs, … }. mode is 'quote' (the
 * quote-only page), 'full' (the portal from Won) or null (no link yet). Never makes a link.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('*').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  const [{ data: docRows }, { data: c }, { data: owner }, ready] = await Promise.all([
    db.from('crm_documents').select('*').eq('project_id', id).in('category', SIGNABLE_CATEGORIES).order('created_at', { ascending: false }),
    db.from('enquiries').select('name, email').eq('id', p.enquiry_id).maybeSingle(),
    p.owner_id ? db.from('profiles').select('full_name, email').eq('id', p.owner_id).maybeSingle() : Promise.resolve({ data: null }),
    schemaReady(),
  ]);
  const docs = (docRows ?? []) as DocRow[];
  const byIds = [...new Set(docs.map((d) => d.signed_outside_by).filter((x): x is string => !!x))];
  const { data: people } = byIds.length ? await db.from('profiles').select('id, full_name, email').in('id', byIds) : { data: [] };
  const nameOf = new Map((people ?? []).map((x) => [x.id as string, ((x.full_name || x.email || 'Someone') as string).split(/[\s@]/)[0]]));
  const mode = portalMode(p.stage);
  const url = p.portal_token && mode ? portalUrl(p.portal_token) : null;
  const first = ((c?.name as string) || '').split(/\s+/)[0] || '';
  const toSign = docs.find((d) => d.needs_signature);
  const from = ((owner?.full_name || owner?.email || s.profile.full_name || s.profile.email || '') as string).split(/[\s@]/)[0];
  return json({
    url,
    mode,
    /** The wording to send with the quote-only link. */
    messages: url && mode === 'quote' && toSign ? quoteMessages({ first, url, category: toSign.category, from }) : null,
    stage: p.stage,
    accepted: p.accepted_at
      ? {
          at: p.accepted_at,
          name: p.accepted_name,
          documentId: p.accepted_document_id ?? null,
          startEarly: p.accepted_start_early ?? null,
          hash: p.accepted_hash ?? null,
        }
      : null,
    quoteDocs: docs.map((d) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      needs_signature: d.needs_signature,
      signed_outside_at: d.signed_outside_at ?? null,
      signed_outside_by: d.signed_outside_by ? nameOf.get(d.signed_outside_by) || 'Someone' : null,
      signed_outside_note: d.signed_outside_note ?? null,
    })),
    customer: { first, email: (c?.email as string) || null },
    emailConnected: msConfigured(),
    crmV3: ready.crmV3,
  });
}

/**
 * The customer's link (made on first request, once the quote is sent for signing or the job is
 * Won). { reset: true } replaces it, so the old link stops working.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  if (b?.reset === true) {
    const token = await resetPortalToken(id);
    if (!token) return json({ error: PORTAL_CLOSED_MSG, closed: true }, 400);
    const { data: p } = await createAdminClient().from('crm_projects').select('enquiry_id').eq('id', id).maybeSingle();
    if (p) await logActivity({ enquiryId: p.enquiry_id, projectId: id, kind: 'system', body: 'Portal link reset. The old link no longer works', byId: s.user.id });
    return json({ url: portalUrl(token), reset: true });
  }
  const token = await ensurePortalToken(id);
  if (!token) return json({ error: PORTAL_CLOSED_MSG, closed: true }, 400);
  return json({ url: portalUrl(token) });
}
