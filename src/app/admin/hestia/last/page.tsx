import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { hestiaSession } from '../session';

export const dynamic = 'force-dynamic';

/** Your most recent conversation with Hestia (heliaxis://hestia/last, "Last chat"), or a new one if there's none. */
export default async function HestiaLast() {
  const { session } = await hestiaSession();
  const { data } = await createAdminClient()
    .from('assistant_threads')
    .select('id')
    .eq('user_id', session.user.id)
    .order('updated_at', { ascending: false })
    .limit(1);
  redirect(data?.[0]?.id ? `/admin/hestia/thread/${data[0].id}` : '/admin/hestia/new');
}
