import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBookingSettings } from '@/lib/booking/settings-server';
import { surveyorProfileId } from '@/lib/booking/diary';

/**
 * Who gets a task nobody owns (a call back from a customer whose job has no owner yet): the first person in the booking diary, else the
 * first approved admin. Without someone, its reminders and its Outlook copy would go to nobody.
 */
export async function defaultOwnerId(db = createAdminClient()): Promise<string | null> {
  try {
    const sv = (await getBookingSettings()).surveyors[0];
    const id = sv ? await surveyorProfileId(sv) : null;
    if (id) return id;
  } catch {
    // Fall through to the admin.
  }
  const { data } = await db.from('profiles').select('id').eq('status', 'approved').eq('role', 'admin').order('created_at', { ascending: true }).limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}
