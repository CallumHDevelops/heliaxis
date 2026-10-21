import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from './server';
import { followsCustomerPostcode, retitled } from './site-postcode';
import { isProjectStage } from './stages';

/**
 * The customer's postcode went from `was` to `now` (Customer → Edit, or a merge that took the other
 * record's postcode): their jobs that were only carrying a copy of the old one (or none) follow it, each
 * with a note on its timeline; a job with a site of its own keeps its postcode (followsCustomerPostcode).
 * From Won onwards a survey or booking has checked the site, so a later change is a house move and the
 * job keeps its postcode. A name made as "Jane Smith · 88888" takes the new postcode too (retitled). Its
 * map position clears with it (crm-v3.sql's trigger), so survey drive times come from the new postcode.
 * → the ids of the jobs that moved; none before the CRM tables exist.
 */
export async function moveSitePostcodes(enquiryId: string, was: string | null, now: string, byId: string | null): Promise<string[]> {
  const db = createAdminClient();
  const { data: jobs, error } = await db.from('crm_projects').select('id, stage, title, address, postcode').eq('enquiry_id', enquiryId);
  if (error) return [];
  const moving = (jobs ?? []).filter((j) => !isProjectStage(j.stage) && followsCustomerPostcode(j, was, now));
  if (!moving.length) return [];
  // One save per job, as each has its own name.
  const at = new Date().toISOString();
  const saved = await Promise.all(
    moving.map(async (j) => {
      const title = retitled(j.title, j.postcode?.trim() || was, now);
      const { error: saveError } = await db.from('crm_projects').update({ postcode: now, updated_at: at, ...(title ? { title } : {}) }).eq('id', j.id);
      return saveError ? null : j;
    })
  );
  const done = saved.filter((j): j is NonNullable<typeof j> => !!j);
  await Promise.all(
    done.map((j) =>
      logActivity({
        enquiryId,
        projectId: String(j.id),
        kind: 'system',
        body: j.postcode?.trim() ? `Site postcode changed from ${j.postcode.trim()} to ${now} with the customer’s` : `Site postcode set to ${now} with the customer’s`,
        byId,
      })
    )
  );
  return done.map((j) => String(j.id));
}
