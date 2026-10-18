import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { CopyButton } from '@/components/admin/CopyButton';
import { isSqlFile, readSql } from '@/lib/setup-files';
import '../../setup.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'SQL · Heliaxis', robots: { index: false, follow: false } };

/** A Supabase SQL file, readable and copyable. */
export default async function SqlPage({ params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  await guardAdmin(`/admin/setup/sql/${file}`);
  if (!isSqlFile(file)) notFound();
  const sql = await readSql(file);
  return (
    <AdminShell active="dashboard">
      <div className="su">
        <Link href="/admin" className="su-back">← Dashboard</Link>
        <p className="su-kicker">Supabase SQL</p>
        <div className="su-sqlhead">
          <h1>{file}</h1>
          <CopyButton value={sql} label="Copy SQL" className="su-btn su-btn--primary" />
        </div>
        <p className="su-muted">Copy it, paste it into the Supabase SQL editor and press Run. It’s safe to run more than once.</p>
        <pre className="su-pre">{sql}</pre>
      </div>
    </AdminShell>
  );
}
