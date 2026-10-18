import { requireApproved } from '@/lib/auth';
import { json } from '@/lib/crm/server';
import {
  errorText,
  importFormPage,
  importLead,
  leadLabel,
  listLeadSources,
  noCounts,
  type GraphLead,
} from '@/lib/meta-import';
import { CSV_LIMITS } from '@/lib/meta-leads-csv';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Import is admins only: it adds people in bulk. A Response means no. */
async function adminSession() {
  const s = await requireApproved();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only admins can import leads.' }, 403);
  return s;
}

/** The Pages and lead forms the CRM's Meta token can see. */
export async function GET() {
  const s = await adminSession();
  if (s instanceof Response) return s;
  const r = await listLeadSources();
  return json(r, r.error ? 502 : 200);
}

const isGraphId = (v: unknown): v is string => typeof v === 'string' && /^\d{1,30}$/.test(v);
const isCursor = (v: unknown): v is string => typeof v === 'string' && v.length <= 1000 && /^[\w=%.+/-]+$/.test(v);

/** A lead from a CSV, checked field by field; a string says what's wrong with it. */
function cleanLead(v: unknown, now: number): GraphLead | string {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'not a lead';
  const l = v as Record<string, unknown>;
  const out: GraphLead = { field_data: [] };

  if (l.id !== undefined && l.id !== null && l.id !== '') {
    if (!isGraphId(l.id) || l.id.length < 8) return 'the lead id isn’t one of Meta’s';
    out.id = l.id;
  }
  if (typeof l.created_time !== 'string' || l.created_time.length > 40) return 'no date';
  const t = Date.parse(l.created_time);
  if (!Number.isFinite(t)) return 'the date can’t be read';
  if (t > now + 5 * 60_000) return 'the date is in the future';
  if (t < Date.UTC(2010, 0, 1)) return 'the date is before Meta lead forms existed';
  out.created_time = new Date(t).toISOString();

  for (const k of ['ad_name', 'campaign_name', 'form_name', 'platform'] as const) {
    const x = l[k];
    if (x === undefined || x === null || x === '') continue;
    if (typeof x !== 'string' || x.length > CSV_LIMITS.text) return `the ${k.replace('_', ' ')} is too long`;
    out[k] = x.trim();
  }

  if (!Array.isArray(l.field_data) || l.field_data.length > CSV_LIMITS.fields) return 'its answers aren’t in the right shape';
  for (const f of l.field_data as unknown[]) {
    if (!f || typeof f !== 'object') return 'its answers aren’t in the right shape';
    const { name, values } = f as { name?: unknown; values?: unknown };
    if (typeof name !== 'string' || !name.trim() || name.length > CSV_LIMITS.name) return 'a question has no name, or too long a one';
    if (
      !Array.isArray(values) ||
      values.length > 10 ||
      !values.every((x): x is string => typeof x === 'string' && x.length <= CSV_LIMITS.value)
    ) {
      return `the answer to “${name.slice(0, 60)}” isn’t text, or is too long`;
    }
    out.field_data!.push({ name: name.trim(), values });
  }
  return out;
}

/**
 * { action: 'form', pageId, formId, after? } imports one page (up to 50) of a form's leads from Meta;
 * call again with the returned `next` until it's null.
 * { action: 'rows', leads } imports up to 100 leads from a CSV (parsed in the browser).
 */
export async function POST(req: Request) {
  const s = await adminSession();
  if (s instanceof Response) return s;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return json({ error: 'bad request' }, 400);

  if (b.action === 'form') {
    if (!isGraphId(b.pageId) || !isGraphId(b.formId)) return json({ error: 'Unknown Page or form' }, 400);
    if (b.after != null && !isCursor(b.after)) return json({ error: 'bad request' }, 400);
    const r = await importFormPage(b.pageId, b.formId, (b.after as string | null | undefined) ?? null, s.user.id);
    return r.ok ? json(r) : json({ error: r.error }, 502);
  }

  if (b.action === 'rows') {
    if (!Array.isArray(b.leads) || !b.leads.length || b.leads.length > 100) {
      return json({ error: 'Send between 1 and 100 leads at a time.' }, 400);
    }
    const counts = noCounts();
    const errors: string[] = [];
    const now = Date.now();
    for (const [i, raw] of (b.leads as unknown[]).entries()) {
      const lead = cleanLead(raw, now);
      try {
        if (typeof lead === 'string') throw new Error(lead);
        counts[await importLead(lead, lead.form_name, s.user.id)]++;
      } catch (e) {
        counts.failed++;
        if (errors.length < 5) errors.push(`${typeof lead === 'string' ? `Row ${i + 1} of this batch` : leadLabel(lead)}: ${errorText(e)}`);
      }
    }
    return json({ counts, errors });
  }

  return json({ error: 'bad request' }, 400);
}
