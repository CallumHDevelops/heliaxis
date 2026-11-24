import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CRM_BUCKET, DOCS_BUCKET, logActivity, thumbPath } from '@/lib/crm/server';
import {
  deleteNotifications,
  forgetInMetis,
  leftoverFiles,
  removeFiles,
  rowsIn,
  type DeleteOutcome,
  type Files,
} from '@/lib/crm/delete-customer';
import { isOrdered } from '@/lib/purchase-orders/money';
import { syncEnquiryStatus } from './server';

/**
 * Deleting one job for good (spec 4.8, addendum 5.8), the same way as deleting a customer
 * (src/lib/crm/delete-customer.ts) but keeping the customer, their WhatsApp chat, emails and other
 * jobs. Its rows go first in one statement (the timeline, photos, documents, surveys, tasks and
 * bookings cascade; survey-booking.sql's trigger writes Outlook tombstones for future events), then
 * its files, so a storage hiccup never leaves a job pointing at missing files.
 *
 * A job with a signed quote or a paid deposit is the evidence of a contract, one with a purchase
 * order that's gone to a supplier has kit bought for it, and one a trade has signed off on site holds
 * their signed sign-offs, the certificates and customer signatures made from them, any return to site
 * and their labour POs (held ones too), so it's only deleted when the person types its reference (or
 * its title before references exist). Draft kit orders just go with it.
 */

export type DeleteJobResult =
  | {
      ok: true;
      filesRemoved: number;
      filesFailed: number;
      /** The customer has no jobs left (their details, chat and emails are kept). */
      lastJob: boolean;
      customer: { id: string; name: string };
    }
  | { ok: false; status: 403 | 404 | 500; error: string }
  | { ok: false; status: 409; needsConfirm: true; label: string; message: string };

const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Unknown error');

export async function deleteProject(
  id: string,
  opts: { confirm?: string | null; by: { id: string; name: string; admin: boolean } }
): Promise<DeleteJobResult> {
  if (!opts.by.admin) return { ok: false, status: 403, error: 'Only admins can delete jobs.' };
  const db = createAdminClient();
  const { data: p, error: readError } = await db.from('crm_projects').select('*').eq('id', id).maybeSingle();
  if (readError) return { ok: false, status: 500, error: readError.message };
  if (!p) return { ok: false, status: 404, error: 'Not found' };
  const enquiryId = String(p.enquiry_id);
  const label = String(p.project_ref || p.title || 'this job');

  // 1. What it has. Nothing has changed yet, so a failure here leaves the job as it was.
  type Doc = { storage_path: string; signed_outside_at?: string | null };
  type Photo = { storage_path: string; markup_path?: string | null };
  type Survey = { id: string; customer_signature?: string | null };
  let docs: Doc[];
  let photos: Photo[];
  let surveys: Survey[];
  let taskIds: string[];
  let orders: { status: string; kind?: string | null }[];
  let site: { status: string; signed_at: string | null }[];
  try {
    // select('*'): signed_outside_at (crm-v3.sql), markup_path and crm_surveys (surveys.sql) may not be there yet.
    [docs, photos, surveys, taskIds, orders, site] = await Promise.all([
      rowsIn<Doc>(db, 'crm_documents', '*', 'project_id', [id], true),
      rowsIn<Photo>(db, 'crm_photos', '*', 'project_id', [id], true),
      rowsIn<Survey>(db, 'crm_surveys', '*', 'project_id', [id], true),
      rowsIn<{ id: string }>(db, 'tasks', 'id', 'crm_project_id', [id], true).then((t) => t.map((x) => x.id)),
      // purchase-orders.sql: none before it's run. '*': the kind column comes with site-commissioning.sql.
      rowsIn<{ status: string; kind?: string | null }>(db, 'purchase_orders', '*', 'project_id', [id], true),
      // site-commissioning.sql: none before it's run.
      rowsIn<{ status: string; signed_at: string | null }>(db, 'site_assignments', 'status, signed_at', 'project_id', [id], true),
    ]);
  } catch (e) {
    return { ok: false, status: 500, error: errorText(e) };
  }

  const contract = !!(p.accepted_at || p.accepted_signature || p.deposit_paid_at || docs.some((d) => d.signed_outside_at));
  const ordered = orders.some((o) => isOrdered(o.status) && o.kind !== 'labour');
  // A trade signed off (the sign-off, its certificates, the customer's signatures), or a labour PO of any status.
  const signedOff = site.some((a) => a.signed_at || a.status === 'signed' || a.status === 'done') || orders.some((o) => o.kind === 'labour');
  if ((contract || ordered || signedOff) && norm(opts.confirm) !== norm(label)) {
    const work = signedOff ? 'trade sign-offs and certificates (and their labour POs)' : '';
    const why = contract
      ? `This job has a signed quote or a paid deposit${ordered ? ', and purchase orders sent to suppliers' : ''}${work ? `, and ${work}` : ''}. That’s your evidence of the contract.`
      : ordered
        ? `This job has purchase orders that have gone to suppliers${work ? `, and ${work}` : ''}: they’d be deleted too.`
        : `This job has ${work}: the signed record of the work. They’d be deleted too.`;
    return {
      ok: false,
      status: 409,
      needsConfirm: true,
      label,
      message: `${why} Mark it as Lost instead, or type ${label} to delete everything.`,
    };
  }

  const files: Files = [
    ...photos.flatMap((f) => [f.storage_path, thumbPath(f.storage_path), f.markup_path].filter((x): x is string => !!x).map((path) => ({ bucket: CRM_BUCKET, path }))),
    ...docs.map((d) => ({ bucket: DOCS_BUCKET, path: d.storage_path })),
    ...(p.accepted_signature ? [{ bucket: DOCS_BUCKET, path: String(p.accepted_signature) }] : []),
    ...surveys.flatMap((s) => (s.customer_signature ? [{ bucket: DOCS_BUCKET, path: s.customer_signature }] : [])),
  ];

  // 2. Notifications that link to the job, its tasks or its surveys (links are text, so nothing cascades to them).
  try {
    await deleteNotifications(db, [id, ...taskIds, ...surveys.map((s) => s.id)]);
  } catch (e) {
    return { ok: false, status: 500, error: errorText(e) };
  }

  // 3. The job. Everything that references it goes in the same statement.
  const { data: gone, error } = await db.from('crm_projects').delete().eq('id', id).select('id');
  if (error) return { ok: false, status: 500, error: error.message };
  if (!gone?.length) return { ok: false, status: 404, error: 'Not found' };

  await forgetInMetis(db, [id], String(p.created_at ?? new Date(0).toISOString()));

  // 4. Its files, plus anything uploaded without being saved. Only ever inside this job's own folders.
  const mine = (f: { bucket: string; path: string }) => {
    const [a, b] = f.path.split('/');
    return f.bucket === CRM_BUCKET ? a === id : (a === 'projects' || a === 'signatures') && b === id;
  };
  const all = [...files, ...(await leftoverFiles(db, new Set([id])))].filter(mine);
  const first: DeleteOutcome = { deleted: 0, gone: 0, errors: [], files: { removed: 0, failed: 0 }, remembered: true };
  await removeFiles(db, all, first);
  let failed = first.files.failed;
  let removed = first.files.removed;
  if (failed) {
    // Once more: files that went the first time aren't found again, so only the stragglers count.
    const again: DeleteOutcome = { ...first, files: { removed: 0, failed: 0 } };
    await removeFiles(db, all, again);
    removed += again.files.removed;
    failed = again.files.failed;
  }

  // 5. The customer's status follows the jobs they have left, and their timeline says what happened.
  const [{ data: customer }, { count }] = await Promise.all([
    db.from('enquiries').select('id, name').eq('id', enquiryId).maybeSingle(),
    db.from('crm_projects').select('id', { count: 'exact', head: true }).eq('enquiry_id', enquiryId),
  ]);
  await syncEnquiryStatus(db, enquiryId).catch(() => null);
  const n = removed;
  await logActivity({
    enquiryId,
    projectId: null,
    kind: 'system',
    body: `Job ${label} deleted by ${opts.by.name} (${n} file${n === 1 ? '' : 's'} removed${failed ? `, ${failed} couldn’t be removed` : ''})`,
    meta: { deleted_project: id, files_failed: failed },
    byId: opts.by.id,
  }).catch(() => null);

  return {
    ok: true,
    filesRemoved: removed,
    filesFailed: failed,
    lastJob: (count ?? 0) === 0,
    customer: { id: enquiryId, name: String(customer?.name ?? '') },
  };
}
