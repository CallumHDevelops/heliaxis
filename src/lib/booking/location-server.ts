import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { projectByBookingToken } from '@/lib/crm/booking-link';
import { siteUrl } from '@/lib/crm/server';
import { isHit, lookupPostcode } from './geo';

export type LocationView = {
  projectId: string;
  enquiryId: string;
  firstName: string;
  address: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
  /** True when the point came from the site itself, not just the middle of the postcode. */
  exact: boolean;
  surveyAt: string | null;
  confirmedAt: string | null;
  movedM: number | null;
};

export const locationUrl = (token: string) => `${siteUrl()}/where/${token}`;

/** What the "check the pin" page needs for a booking link: where to start the pin, and whether they have confirmed it. */
export async function locationView(token: string): Promise<LocationView | null> {
  const p = await projectByBookingToken(token);
  if (!p) return null;
  const db = createAdminClient();
  const [{ data: row }, { data: e }] = await Promise.all([db.from('crm_projects').select('*').eq('id', p.id).maybeSingle(), db.from('enquiries').select('name').eq('id', p.enquiry_id).maybeSingle()]);
  let lat = typeof row?.site_lat === 'number' ? (row.site_lat as number) : null;
  let lng = typeof row?.site_lng === 'number' ? (row.site_lng as number) : null;
  const exact = lat !== null && lng !== null;
  if (!exact && p.postcode) {
    const g = await lookupPostcode(p.postcode).catch(() => null);
    if (g && isHit(g)) {
      lat = g.ll.lat;
      lng = g.ll.lng;
    }
  }
  if (lat === null || lng === null) return null;
  return {
    projectId: p.id,
    enquiryId: p.enquiry_id,
    firstName: String(e?.name ?? '').trim().split(/\s+/)[0] || '',
    address: p.address,
    postcode: p.postcode,
    lat,
    lng,
    exact,
    surveyAt: p.survey_at,
    confirmedAt: (row?.location_confirmed_at as string | null) ?? null,
    movedM: typeof row?.location_moved_m === 'number' ? (row.location_moved_m as number) : null,
  };
}
