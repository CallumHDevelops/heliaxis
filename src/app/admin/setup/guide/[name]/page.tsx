import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { marked } from 'marked';
import { guardAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { GUIDES, isGuide, readGuide } from '@/lib/setup-files';
import '../../setup.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Setup guide · Heliaxis', robots: { index: false, follow: false } };

/** A setup guide (one of the repo's .md files) as a readable page. */
export default async function GuidePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  await guardAdmin(`/admin/setup/guide/${name}`);
  if (!isGuide(name)) notFound();
  // Our own files from the repo, so the HTML is trusted.
  const html = await marked.parse(await readGuide(name));
  return (
    <AdminShell active="dashboard">
      <div className="su">
        <Link href="/admin" className="su-back">← Dashboard</Link>
        <p className="su-kicker">{GUIDES[name].title}</p>
        <article className="su-doc" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </AdminShell>
  );
}
