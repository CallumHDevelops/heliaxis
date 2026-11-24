import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { metisSession } from '../session';

export const dynamic = 'force-dynamic';

/** Your most recent conversation with Metis (heliaxis://metis/last, "Last chat"), or a new one if there's none. */
export default async function MetisLast() {
  const { session } = await metisSession();
  const { data } = await createAdminClient()
    .from('assistant_threads')
    .select('id')
    .eq('user_id', session.user.id)
    .order('updated_at', { ascending: false })
    .limit(1);
  redirect(data?.[0]?.id ? `/admin/metis/thread/${data[0].id}` : '/admin/metis/new');
}
