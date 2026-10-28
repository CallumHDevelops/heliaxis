import { after } from 'next/server';
import { customerFromContact } from '@/lib/crm/from-contact';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity, markContacted } from '@/lib/crm/server';
import { staffBook, staffFrom } from '@/lib/booking/book';
import { inUk } from '@/lib/booking/location';
import { grantPermission } from '@/lib/whatsapp/permission';
import { isProjectStage, PRODUCT_KEYS, PROJECT_START_STAGES, surveyTypeFor, type StageKey } from '@/lib/crm/stages';
import { sendStageToMeta } from '@/lib/meta-capi';
import { pipeline, projectsList, syncEnquiryStatus } from '@/lib/projects/server';
import { createAssignments, siteReady, type NewAssignment } from '@/lib/site/server';
import { toWaId } from '@/lib/whatsapp/shared';

export const dynamic = 'force-dynamic';

/**
 * The CRM pipeline (opportunities and jobs, new enquiries without one, and the CRM home's counts), or
 * with ?scope=projects every job from Won onwards for the Projects page (`ready: false` until
 * crm-v3.sql has been run).
 */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (new URL(req.url).searchParams.get('scope') === 'projects') return json(await projectsList());
  const data = await pipeline();
  if ('error' in data) return json({ error: data.error, projects: [], unassigned: [] }, 500);
  return json(data);
}

/** Where a new job can start: a lead or surveyed opportunity from the CRM, or a job already under way from Projects. */
const START_STAGES: StageKey[] = ['lead', 'surveyed', ...PROJECT_START_STAGES];

/** New opportunity or project: for an existing customer, or a new customer entered here (e.g. a phone call). */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();

  const startStage = String(b.start_stage || 'lead') as StageKey;
  if (!START_STAGES.includes(startStage)) return json({ error: 'Unknown starting stage' }, 400);
  const delivery = isProjectStage(startStage);

  let enquiryId = String(b.enquiry_id || '');
  // Someone added under Contacts: their customer record is made (or found) from their details, and the job is linked back to them.
  let fromContact: { contactId: string; organisationId: string | null } | null = null;
  if (!enquiryId && b.contact_id && isUuid(String(b.contact_id))) {
    const made = await customerFromContact(db, String(b.contact_id), String(b.postcode || '').trim().toUpperCase().slice(0, 12) || null);
    if (!made.ok) return json({ error: made.error }, made.status);
    enquiryId = made.enquiryId;
    fromContact = { contactId: String(b.contact_id), organisationId: made.organisationId };
  }
  let customer: { name: string; postcode: string | null; interest: string | null } | null = null;
  // Their latest job, for the site address, and to tell a second job from their first.
  let latest: { id: string; stage: string; address: string | null; postcode: string | null } | null = null;
  if (enquiryId) {
    if (!isUuid(enquiryId)) return json({ error: 'Unknown customer' }, 400);
    const { data } = await db.from('enquiries').select('name, postcode, interest').eq('id', enquiryId).maybeSingle();
    if (!data) return json({ error: 'Customer not found' }, 404);
    customer = data;
    const { data: theirs } = await db
      .from('crm_projects')
      .select('id, stage, address, postcode')
      .eq('enquiry_id', enquiryId)
      .order('created_at', { ascending: false })
      .limit(50);
    latest = theirs?.[0] ?? null;
    // From an enquiry's "Open in CRM": reuse their latest live job rather than making a duplicate. A
    // chat's call-back reminder asks for a live one only (`live_only`): a closed job's reminder never goes off.
    if (b.open_existing && latest) {
      const live = theirs!.find((p) => p.stage !== 'complete' && p.stage !== 'lost');
      if (live || !b.live_only) return json({ id: (live ?? latest).id, existing: true });
    }
  } else {
    const name = String(b.name || '').trim();
    if (!name) return json({ error: 'Add the customer’s name.' }, 400);
    const phone = String(b.phone || '').trim() || null;
    const { data, error } = await db
      .from('enquiries')
      .insert({
        name,
        email: String(b.email || '').trim(),
        phone,
        postcode: String(b.postcode || '').trim().toUpperCase() || null,
        wa_id: toWaId(phone),
        source: String(b.source || 'crm').trim() || 'crm',
        status: 'contacted',
      })
      .select('id, name, postcode, interest')
      .single();
    if (error || !data) return json({ error: error?.message || 'Could not add the customer' }, 500);
    enquiryId = data.id;
    customer = data;
  }

  const products = (Array.isArray(b.products) ? b.products : []).filter((k: unknown) => PRODUCT_KEYS.includes(String(k)));
  const title = String(b.title || '').trim() || `${customer!.name}${customer!.postcode ? ` · ${customer!.postcode}` : ''}`;
  const address = String(b.address || '').trim().slice(0, 500) || latest?.address || null;
  const postcode = String(b.postcode || '').trim().toUpperCase().slice(0, 12) || latest?.postcode || customer!.postcode;
  const ownerId = b.owner_id && isUuid(String(b.owner_id)) ? String(b.owner_id) : s.user.id;
  const { data: project, error } = await db
    .from('crm_projects')
    .insert({
      enquiry_id: enquiryId,
      title: title.slice(0, 140),
      products,
      value: b.value != null && b.value !== '' && Number.isFinite(Number(b.value)) ? Number(b.value) : null,
      address,
      postcode,
      owner_id: ownerId,
      created_by: s.user.id,
      stage: startStage,
      ...(fromContact ? { contact_id: fromContact.contactId, organisation_id: fromContact.organisationId } : {}),
    })
    .select('id')
    .single();
  if (error || !project) return json({ error: error?.message || 'Could not create the opportunity' }, 500);

  // A second opportunity for someone already in the CRM isn't a new lead, and nor is one opened from a
  // WhatsApp chat that's under way (`from_chat`): no new-lead follow-ups and no "hasn't been contacted"
  // alert. (crm-v2.sql columns, in their own update.)
  if (!delivery && (latest || b.from_chat)) {
    const now = new Date().toISOString();
    await db
      .from('crm_projects')
      .update({ sequence_stopped_at: now, first_response_alerted_at: now })
      .eq('id', project.id)
      .then(
        () => null,
        () => null
      );
  }
  await logActivity({ enquiryId, projectId: project.id, kind: 'system', body: delivery ? 'Project created' : 'Opportunity created', byId: s.user.id });
  // Added by hand after a conversation: what was said goes on the job as a note, and "I've spoken to them" counts as first
  // contact (no "not contacted" alert, no automatic chasers to someone you have just spoken to).
  const said = String(b.note || '').trim().slice(0, 2000);
  if (said) await logActivity({ enquiryId, projectId: project.id, kind: 'note', body: said, byId: s.user.id }).catch(() => null);
  if (!delivery && b.spoken === true) {
    const now = new Date().toISOString();
    await db.from('crm_projects').update({ sequence_stopped_at: now, first_response_alerted_at: now }).eq('id', project.id).then(() => null, () => null);
    await markContacted({ projectId: project.id }, now, { note: 'spoke to them', byId: s.user.id }).catch(() => 0);
  }
  if (startStage !== 'lead') await syncEnquiryStatus(db, enquiryId).catch(() => null);
  // A job loaded straight in at Won or later is still a sale for Meta (sent once per job).
  if (delivery) after(() => sendStageToMeta(project.id, startStage).catch(() => {}));
  // Where the address lookup put the pin: the customer's "check the pin" page starts from it.
  const pinLat = Number(b.site_lat);
  const pinLng = Number(b.site_lng);
  if (inUk(pinLat, pinLng)) await db.from('crm_projects').update({ site_lat: pinLat, site_lng: pinLng }).eq('id', project.id).then(() => null, () => null);
  // "Appointment arranged": book it in the diary (any time they agreed, as long as it doesn't overlap something), then tell them
  // by the ways staff ticked. A booking that can't be made leaves the opportunity in place and says why.
  const appt = b.appointment as { start?: unknown; surveyor_key?: unknown; notify?: Record<string, unknown> } | undefined;
  let notices: string[] = [];
  let apptWarning = '';
  if (!delivery && appt && Number.isFinite(Date.parse(String(appt.start || '')))) {
    const notify = { email: appt.notify?.email === true, whatsapp: appt.notify?.whatsapp === true, sms: appt.notify?.sms === true };
    // Ticking WhatsApp here is staff saying they agreed to it on the call: recorded as their permission.
    if (notify.whatsapp) await grantPermission(enquiryId, 'phone-call').catch(() => false);
    const o = await staffBook({ projectId: project.id, start: Date.parse(String(appt.start)), surveyorKey: typeof appt.surveyor_key === 'string' ? appt.surveyor_key.toLowerCase() : null, type: surveyTypeFor(products) ?? 'solar', override: true, allDayOk: true, notify, by: staffFrom(s) });
    if (o.status === 200) notices = (o.body.notices as string[] | undefined) ?? [];
    else apptWarning = `The opportunity is made, but the appointment wasn’t booked: ${String(o.body.error || o.body.message || 'try Find a time on the job')}`;
  }

  // Who's doing the work (New project, once site-commissioning.sql has run): made after the job.
  const trades = (Array.isArray(b.assignments) ? b.assignments : []) as NewAssignment[];
  if (delivery && trades.length && (await siteReady())) {
    const r = await createAssignments(db, project.id, trades, s.user.id);
    if (!r.ok) return json({ id: project.id, warning: `The job is made, but the trades weren’t added: ${r.error} Add them on the job’s Site tab.` });
  }
  if (apptWarning) return json({ id: project.id, warning: apptWarning });
  return json({ id: project.id, ...(notices.length ? { notices } : {}) });
}
