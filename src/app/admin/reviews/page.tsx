import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { ReviewsAdmin } from './ReviewsAdmin';

export const dynamic = 'force-dynamic';

/** CRM › Reviews: the review links and wording, and every request sent with what came of it. */
export default async function ReviewsPage() {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  return (
    <AdminShell active="reviews" fluid>
      <ReviewsAdmin admin={session.profile.role === 'admin'} />
    </AdminShell>
  );
}
