import Link from 'next/link';
import { ProjectStatusBadge } from '@/components/rams/StatusBadge';
import { Badge, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { technology as tech } from '@/lib/content/technologies';
import { listProjects, listRams } from '@/lib/db';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Projects' };

export default async function ProjectsPage() {
  await requireUser('/projects');
  const [projects, rams] = await Promise.all([listProjects(), listRams()]);

  const counts = new Map<string, number>();
  for (const r of rams) counts.set(r.project_id, (counts.get(r.project_id) ?? 0) + 1);

  return (
    <>
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        description="Every site Heliaxis is working on, and the documents attached to it."
        action={
          <LinkButton href="/projects/new" variant="solar">
            New project
          </LinkButton>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Add your first project to start building RAMS against it."
          action={
            <LinkButton href="/projects/new" variant="solar" size="sm">
              New project
            </LinkButton>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] border-collapse text-[0.86rem]">
              <thead>
                <tr className="border-b border-[color:var(--line)] bg-paper-2">
                  {['Reference', 'Project', 'Sector', 'Technologies', 'Status', 'RAMS', 'Start'].map(
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
                {projects.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[color:var(--line)] last:border-0 hover:bg-paper-2/60"
                  >
                    <td className="mono px-3 py-2.5 text-[0.76rem] text-muted">
                      <Link href={`/projects/${p.id}`} className="hover:underline">
                        {p.reference}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/projects/${p.id}`} className="font-semibold hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-[0.76rem] text-muted">
                        {p.site_postcode || p.client_name || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 capitalize">{p.sector}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(p.technologies ?? []).map((t) => (
                          <Badge key={t} tone="neutral">
                            {tech(t).shortName}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <ProjectStatusBadge status={p.status} />
                    </td>
                    <td className="mono px-3 py-2.5">{counts.get(p.id) ?? 0}</td>
                    <td className="mono px-3 py-2.5 text-[0.76rem] text-muted">
                      {formatDate(p.start_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
