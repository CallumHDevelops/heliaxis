import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { buildReport, PERIODS, periodStart, type ReportInput } from '@/lib/quotes/report';
import { readQuoteSettings } from '@/lib/quotes/settings';
import { schemaReady } from '@/lib/schema-ready';
import { createAdminClient } from '@/lib/supabase/admin';
import { MarginView } from './MarginView';

export const dynamic = 'force-dynamic';

/** Sales › Margin report: what the quotes we have sent and won are worth, and the profit and margin on them. Admins only. */
export default async function MarginReport({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const session = await requirePortal('crm');
  if (!session || session.profile.role !== 'admin') redirect('/admin?denied=1');
  const { p } = await searchParams;
  const period = PERIODS.find((x) => x.key === p)?.key ?? '6m';
  const ready = (await schemaReady()).quotes;
  const settings = await readQuoteSettings();
  let report = buildReport([], { from: null, targetPct: settings.minMarginPct });
  if (ready) {
    const db = createAdminClient();
    const { data } = await db.from('crm_quotes').select('id, number, title, status, sent_at, created_at, enquiry_id, project_id, content').in('status', ['sent', 'accepted']).order('sent_at', { ascending: false }).limit(2000);
    const rows = data ?? [];
    const pids = [...new Set(rows.map((r) => r.project_id as string))];
    const eids = [...new Set(rows.map((r) => r.enquiry_id as string))];
    const [{ data: projects }, { data: people }] = await Promise.all([
      pids.length ? db.from('crm_projects').select('id, accepted_at').in('id', pids) : Promise.resolve({ data: [] }),
      eids.length ? db.from('enquiries').select('id, name').in('id', eids) : Promise.resolve({ data: [] }),
    ]);
    const acc = new Map((projects ?? []).map((x) => [x.id as string, x.accepted_at as string | null]));
    const name = new Map((people ?? []).map((x) => [x.id as string, x.name as string]));
    const inputs: ReportInput[] = rows.map((r) => ({
      id: r.id as string, number: r.number as string, title: r.title as string, status: r.status as string, sent_at: r.sent_at as string | null,
      accepted_at: r.status === 'accepted' ? (acc.get(r.project_id as string) ?? null) : null, created_at: r.created_at as string,
      customer: name.get(r.enquiry_id as string) ?? 'Customer', project_id: r.project_id as string, content: r.content,
    }));
    report = buildReport(inputs, { from: periodStart(period, new Date().toISOString().slice(0, 10)), targetPct: settings.minMarginPct });
  }
  return (
    <AdminShell active="sales" fluid>
      <MarginView ready={ready} report={report} period={period} target={settings.minMarginPct} />
    </AdminShell>
  );
}
