import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { CmsGuide } from './CmsGuide';
import './cms-guide.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'CMS guide · Heliaxis', robots: { index: false, follow: false } };

/** CMS › CMS guide: an interactive, step-by-step course for learning to build, check and publish website pages. Anyone with the Website CMS access. */
export default async function CmsGuidePage() {
  const s = await requirePortal('cms');
  if (!s) redirect('/admin?denied=1');
  return (
    <AdminShell active="cmsguide" fluid>
      <CmsGuide admin={s.profile.role === 'admin'} />
    </AdminShell>
  );
}
