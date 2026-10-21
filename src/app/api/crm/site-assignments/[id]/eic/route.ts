import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { certificateStatus, previewCertificate, saveCertificate } from '@/lib/site/eic/server';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { notReady, readAssignment, siteReady } from '@/lib/site/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/**
 * The electrician's certificate for the office (Site tab): where it stands (what's still to come, the
 * design part, the filed PDF, the Notify building control copy fields). ?pdf=1 gives the certificate
 * as it would be made now, to look at (a draft until it's complete; never filed or shown to the
 * customer from here).
 */
export async function GET(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a || a.trade !== 'electrician') return json({ error: 'That electrician isn’t on the job any more.' }, 404);
  if (new URL(req.url).searchParams.get('pdf')) {
    const pdf = await previewCertificate(db, a);
    if (!pdf) return json({ error: 'They’re using their own certificate: it comes as an upload.' }, 404);
    return new Response(Buffer.from(pdf.bytes), {
      headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${pdf.name.replace(/"/g, '')}"`, 'cache-control': 'no-store' },
    });
  }
  // The designer's particulars to start from when the office signs the design part.
  const office = { name: s.profile.full_name || '', company: HELIAXIS_COMPANY.tradingName, address: HELIAXIS_COMPANY.addressLines.slice(0, -1).join(', '), postcode: HELIAXIS_COMPANY.addressLines.at(-1) ?? '', tel: HELIAXIS_COMPANY.phone };
  return json({ ...(await certificateStatus(db, a)), office });
}

/**
 * { action: 'make', force? }: make and file it again now (it's made by itself at sign-off and when the
 * design is signed). force: replace a version the customer can already see.
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { action?: unknown; force?: unknown };
  if (b.action !== 'make') return json({ error: 'Unknown action' }, 400);
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a || a.trade !== 'electrician') return json({ error: 'That electrician isn’t on the job any more.' }, 404);
  const saved = await saveCertificate(db, a.id, s.user.id, { force: b.force === true });
  return json({ ok: true, saved, status: await certificateStatus(db, a) });
}
