import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import ReelStudio from '../ReelStudio';

export const dynamic = 'force-dynamic';

export default async function ReelPage() {
  const s = await requirePortal('social');
  if (!s) redirect('/admin?denied=1');
  return <ReelStudio userEmail={s.user.email ?? ''} />;
}
