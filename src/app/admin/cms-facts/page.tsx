import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { readFacts } from '@/lib/cms/facts-server';
import { FactsEditor } from './FactsEditor';
import './facts.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Facts sheet · Heliaxis', robots: { index: false, follow: false } };

/** CMS › Facts sheet: what pages may say about Heliaxis. Anyone with CMS access reads it; only an admin saves. */
export default async function CmsFactsPage() {
  const s = await requirePortal('cms');
  if (!s) redirect('/admin?denied=1');
  const { facts, saved } = await readFacts();
  return (
    <AdminShell active="cmsfacts" fluid>
      <FactsEditor initial={facts} saved={saved} admin={s.profile.role === 'admin'} />
    </AdminShell>
  );
}
