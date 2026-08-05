import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ReelStudio from '@/components/ReelStudio';

export default async function ReelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <ReelStudio userEmail={user.email ?? ''} />;
}
