import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { siteUrl } from './server';
import { mergedInto } from './aliases';

/**
 * The customer's survey booking link (/book/<token>), separate from the portal: a lead can pick or
 * change their survey time before they ever get a portal. Needs survey-booking.sql (booking_token);
 * until then there's no link.
 */

export const BOOKABLE_STAGES = ['lead', 'contacted', 'survey_booked'] as const;
const bookable = (stage: unknown) => typeof stage === 'string' && (BOOKABLE_STAGES as readonly string[]).includes(stage);
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export type BookingProject = {
  id: string;
  enquiry_id: string;
  owner_id: string | null;
  stage: string;
  title: string | null;
  address: string | null;
  postcode: string | null;
  products: string[];
  survey_at: string | null;
  survey_type: string | null;
  survey_booking_id: string | null;
};

/** Like ensurePortalToken: 18 random bytes, base64url. Null if the stage isn't bookable or the column doesn't exist yet. */
export async function ensureBookingToken(projectId: string): Promise<string | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.from('crm_projects').select('booking_token, stage').eq('id', projectId).maybeSingle();
    if (error || !data || !bookable(data.stage)) return null;
    if (data.booking_token) return data.booking_token as string;
    const { randomBytes } = await import('node:crypto');
    const token = randomBytes(18).toString('base64url');
    await db.from('crm_projects').update({ booking_token: token }).eq('id', projectId).is('booking_token', null);
    // Two calls at once: whichever saved first wins, and both return it.
    const { data: again } = await db.from('crm_projects').select('booking_token').eq('id', projectId).maybeSingle();
    return (again?.booking_token as string | null) || null;
  } catch {
    return null;
  }
}

export const bookingUrl = (token: string): string => `${siteUrl()}/book/${token}`;

/** Booking token → the job. Null unless the stage is in BOOKABLE_STAGES (or before survey-booking.sql has run). */
export async function projectByBookingToken(token: string): Promise<BookingProject | null> {
  if (!TOKEN.test(token)) return null;
  try {
    // select('*'): the booking columns may not exist yet, and then this just finds nothing.
    const db = createAdminClient();
    let { data: p, error } = await db.from('crm_projects').select('*').eq('booking_token', token).maybeSingle();
    // The link of a job joined into another (src/lib/crm/merge.ts) books that job's survey.
    if (!p && !error) {
      const hit = await mergedInto('booking_token', token, db);
      if (hit?.project_id) ({ data: p, error } = await db.from('crm_projects').select('*').eq('id', hit.project_id).maybeSingle());
    }
    if (error || !p || !bookable(p.stage)) return null;
    return {
      id: p.id as string,
      enquiry_id: p.enquiry_id as string,
      owner_id: (p.owner_id as string | null) ?? null,
      stage: p.stage as string,
      title: (p.title as string | null) ?? null,
      address: (p.address as string | null) ?? null,
      postcode: (p.postcode as string | null) ?? null,
      products: Array.isArray(p.products) ? (p.products as string[]) : [],
      survey_at: (p.survey_at as string | null) ?? null,
      survey_type: (p.survey_type as string | null) ?? null,
      survey_booking_id: (p.survey_booking_id as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
