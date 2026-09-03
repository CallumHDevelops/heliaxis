import Link from 'next/link';
import { RamsStatusBadge } from '@/components/rams/StatusBadge';
import { Badge, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { technology as tech } from '@/lib/content/technologies';
import { listRamsWithProjects } from '@/lib/db';
import { formatDate, relativeTime } from '@/lib/format';
import { overallResidual } from '@/lib/risk';
import type { RamsStatus } from '@/lib/types';

export const metadata = { title: 'RAMS' };

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In review' },
  { value: 'approved', label: 'Approved' },
  { value: 'issued', label: 'Issued' },
  { value: 'archived', label: 'Archived' },
];

export default async function RamsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireUser('/rams');

  const status = (await searchParams).status ?? 'all';
  const all = await listRamsWithProjects();
  const rams = status === 'all' ? all : all.filter((r) => r.status === (status as RamsStatus));

  return (
    <>
      <PageHeader
        eyebrow="Documents"
        title="RAMS"
        description="Every Risk Assessment and Method Statement across all projects."
        action={
          <LinkButton href="/rams/new" variant="solar">
            New RAMS
          </LinkButton>
        }
      />

      <nav className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = f.value === 'all' ? all.length : all.filter((r) => r.status === f.value).length;
          return (
            <Link
              key={f.value}
              href={f.value === 'all' ? '/rams' : `/rams?status=${f.value}`}
              className={`rounded-[2px] border px-3 py-1.5 text-[0.8rem] font-semibold transition-colors ${
                status === f.value
                  ? 'border-ink bg-ink text-paper'
                  : 'border-[color:var(--line)] bg-card text-muted hover:border-[color:var(--line-strong)] hover:text-ink'
              }`}
            >
              {f.label}
              <span className="mono ml-1.5 text-[0.72rem] opacity-70">{count}</span>
            </Link>
          );
        })}
      </nav>

      {rams.length === 0 ? (
        <EmptyState
          title={status === 'all' ? 'No documents yet' : `No ${status.replace('_', ' ')} documents`}
          description="Create a RAMS against a project and it starts from the template for that technology."
          action={
            <LinkButton href="/rams/new" variant="solar" size="sm">
              New RAMS
            </LinkButton>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] border-collapse text-[0.86rem]">
              <thead>
                <tr className="border-b border-[color:var(--line)] bg-paper-2">
                  {['Reference', 'Title', 'Project', 'Technology', 'Residual', 'Status', 'Review', 'Updated'].map(
                    (h) => (
                      <th
                        key={h}
                        className="mono px-3 py-2.5 text-left text-[0.66rem] uppercase tracking-[0.1em] text-muted"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rams.map((r) => {
                  const residual = overallResidual(r.content.hazards);
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[color:var(--line)] last:border-0 hover:bg-paper-2/60"
                    >
                      <td className="mono px-3 py-2.5 text-[0.74rem] text-muted">
                        <Link href={`/rams/${r.id}`} className="hover:underline">
                          {r.reference}
                        </Link>
                        <span className="ml-1 opacity-60">v{r.version}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/rams/${r.id}`} className="font-semibold hover:underline">
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.project ? (
                          <Link
                            href={`/projects/${r.project.id}`}
                            className="text-muted hover:underline"
                          >
                            {r.project.name}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone="neutral">{tech(r.technology).shortName}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="mono rounded-[2px] px-1.5 py-0.5 text-[0.72rem] font-bold"
                          style={{ background: residual.bg, color: residual.fg }}
                        >
                          {residual.score}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <RamsStatusBadge status={r.status} />
                      </td>
                      <td className="mono px-3 py-2.5 text-[0.74rem] text-muted">
                        {formatDate(r.review_date)}
                      </td>
                      <td className="mono px-3 py-2.5 text-[0.74rem] text-muted">
                        {relativeTime(r.updated_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
