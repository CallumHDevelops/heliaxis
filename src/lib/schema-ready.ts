import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Which of the Projects / Surveys / Booking / Purchase orders / Site / Handover / Organisations / Design studio SQL
 * files have been run, so new screens and sections can stay hidden until their tables exist. Server
 * pages pass the result to client components as a prop.
 */
export type SchemaReady = {
  crmV3: boolean;
  surveys: boolean;
  booking: boolean;
  purchaseOrders: boolean;
  /** site-commissioning.sql: trades on jobs, the site app, sign-offs, labour POs, the job document registry. */
  site: boolean;
  /** handover.sql: the Handover tab and the customer's handover pack. */
  handover: boolean;
  /** organisations.sql: CRM › Organisations, their contacts, and a job's organisation. */
  organisations: boolean;
  /** design-studio.sql: the design studio's projects, templates and settings (cloud saves). */
  design: boolean;
  /** social-monitoring.sql: Social Monitoring (comments and reviews, drafts, notifications). Its screens stay hidden until it has run. */
  social: boolean;
};

/** A "false" is re-checked after a minute (so it flips soon after the SQL is run); once everything is true, 10 minutes. */
const TTL_PENDING = 60_000;
const TTL_ALL_READY = 10 * 60_000;
const ttlFor = (v: SchemaReady) => (Object.values(v).every(Boolean) ? TTL_ALL_READY : TTL_PENDING);
let cached: { at: number; value: SchemaReady } | null = null;
let pending: Promise<SchemaReady> | null = null;

/**
 * True if the table (and optionally a column) can be read. Reads at most one row: a HEAD request
 * can't see a missing table (supabase-js turns PostgREST's bodiless 404 into a success).
 */
async function has(table: string, column = 'id') {
  try {
    const { error } = await createAdminClient().from(table).select(column).limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function check(): Promise<SchemaReady> {
  const [crmV3, surveys, bookings, diary, purchaseOrders, siteMessages, docSlots, siteReview, handover, design, social, orgContacts, jobOrgs] = await Promise.all([
    has('crm_projects', 'project_ref'), // crm-v3.sql
    has('crm_surveys'), // surveys.sql
    has('survey_bookings'), // survey-booking.sql
    has('diary_entries'),
    has('purchase_order_lines'), // purchase-orders.sql (its last table)
    has('site_messages'), // site-commissioning.sql (its last table)
    has('crm_documents', 'handover_slot'), // and its document columns
    has('purchase_orders', 'review_status'), // and the office's review (site_returns, the PO's review)
    has('handover_packs', 'project_id'), // handover.sql
    has('design_projects'), // design-studio.sql
    has('social_mention'), // social-monitoring.sql
    has('crm_contacts'), // organisations.sql
    has('crm_projects', 'contact_id'), // and the job's link
  ]);
  const site = siteMessages && docSlots && siteReview;
  return { crmV3, surveys, booking: bookings && diary, purchaseOrders, site, handover: site && handover, design, social, organisations: orgContacts && jobOrgs };
}

/** Cached in memory for 60 s, so a `false` is checked again a minute after the SQL is run. Never throws. */
export async function schemaReady(): Promise<SchemaReady> {
  if (cached && Date.now() - cached.at < ttlFor(cached.value)) return cached.value;
  pending ??= check()
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
