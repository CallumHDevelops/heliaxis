import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import Studio from './Studio';

export const dynamic = 'force-dynamic';

/** Post Studio: on-brand social posts. Open to admins and anyone with the "Social media studio" tick. */
export default async function StudioPage() {
  const s = await requirePortal('social');
  if (!s) redirect('/admin?denied=1');
  return <Studio userEmail={s.user.email ?? ''} />;
}
