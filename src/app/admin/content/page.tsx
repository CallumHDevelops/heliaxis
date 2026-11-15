import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { contentAccess } from '@/lib/content/server';
import { ContentLibrary } from './ContentLibrary';

export const dynamic = 'force-dynamic';

/** Operations › Content library: project photos for the content team (social media and the website). */
export default async function ContentPage() {
  const s = await contentAccess();
  if (!s) redirect('/admin?denied=1');
  return (
    <AdminShell active="content" fluid>
      <ContentLibrary manage={s.manage} />
    </AdminShell>
  );
}
