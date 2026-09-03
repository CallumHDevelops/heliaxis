import Link from 'next/link';
import { Spark } from '@/components/brand/Spark';
import { RamsStatusBadge } from '@/components/rams/StatusBadge';
import { Badge, Card, EmptyState, LinkButton, PageHeader, Panel } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { daysUntil, expiryState } from '@/lib/content/certifications';
import { technology as tech } from '@/lib/content/technologies';
import { listCertifications, listProjects, listRamsWithProjects } from '@/lib/db';
import { formatDate, relativeTime } from '@/lib/format';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const { profile } = await requireUser();
  const [projects, rams, certifications] = await Promise.all([
    listProjects(),
    listRamsWithProjects(),
    listCertifications(),
  ]);

  const activeProjects = projects.filter((p) => p.status === 'planning' || p.status === 'active');
  const drafts = rams.filter((r) => r.status === 'draft' || r.status === 'in_review');
  const issued = rams.filter((r) => r.status === 'issued');

  const attention = certifications
    .map((c) => ({ cert: c, state: expiryState(c.expiry_date), days: daysUntil(c.expiry_date) }))
    .filter((x) => x.state === 'expired' || x.state === 'expiring')
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

  const firstName = (profile.full_name || '').split(' ')[0];

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Spark size={12} />
            Overview
          </>
        }
        title={firstName ? `Afternoon, ${firstName}` : 'Dashboard'}
        description="Everything in flight across Heliaxis installations."
        action={
          <>
            <LinkButton href="/projects/new" variant="ghost">
              New project
            </LinkButton>
            <LinkButton href="/rams/new" variant="solar">
              New RAMS
            </LinkButton>
          </>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active projects" value={activeProjects.length} href="/projects" />
        <Stat label="Drafts in progress" value={drafts.length} href="/rams?status=draft" />
        <Stat label="Issued documents" value={issued.length} href="/rams?status=issued" />
        <Stat
          label="Certificates needing action"
          value={attention.length}
          href="/certifications"
          tone={attention.length > 0 ? 'alert' : 'default'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Panel
          title="Recent RAMS"
          eyebrow="Documents"
          action={
            <Link href="/rams" className="text-[0.8rem] font-semibold text-amber-2 hover:underline">
              View all
            </Link>
          }
        >
          {rams.length === 0 ? (
            <EmptyState
              title="No documents yet"
              description="Create a project, then build its first RAMS from the technology template."
              action={<LinkButton href="/rams/new" variant="solar" size="sm">New RAMS</LinkButton>}
            />
          ) : (
            <ul className="divide-y divide-[color:var(--line)]">
              {rams.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/rams/${r.id}`}
                    className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[2px] px-2 py-2.5 hover:bg-paper-2"
                  >
                    <span className="mono text-[0.72rem] text-muted">{r.reference}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span>
                    <Badge tone="neutral">{tech(r.technology).shortName}</Badge>
                    <RamsStatusBadge status={r.status} />
                    <span className="mono w-full text-[0.7rem] text-muted sm:w-auto">
                      {relativeTime(r.updated_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Certificates needing action"
            eyebrow="Compliance"
            action={
              <Link
                href="/certifications"
                className="text-[0.8rem] font-semibold text-amber-2 hover:underline"
              >
                Manage
              </Link>
            }
          >
            {attention.length === 0 ? (
              <p className="text-[0.86rem] text-muted">
                Everything is in date. Certificates within 60 days of expiry appear here.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {attention.slice(0, 8).map(({ cert, state }) => (
                  <li key={cert.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[0.86rem] font-semibold">{cert.title}</p>
                      <p className="truncate text-[0.76rem] text-muted">
                        {cert.holder_name || 'Company'} · {formatDate(cert.expiry_date)}
                      </p>
                    </div>
                    <Badge tone={state === 'expired' ? 'danger' : 'warn'}>
                      {state === 'expired' ? 'Expired' : 'Expiring'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Active projects"
            eyebrow="Sites"
            action={
              <Link
                href="/projects"
                className="text-[0.8rem] font-semibold text-amber-2 hover:underline"
              >
                View all
              </Link>
            }
          >
            {activeProjects.length === 0 ? (
              <p className="text-[0.86rem] text-muted">No active projects.</p>
            ) : (
              <ul className="space-y-2.5">
                {activeProjects.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="block hover:underline">
                      <p className="truncate text-[0.86rem] font-semibold">{p.name}</p>
                      <p className="mono truncate text-[0.72rem] text-muted">
                        {p.reference} · {p.site_postcode || 'No postcode'}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  href,
  tone = 'default',
}: {
  label: string;
  value: number;
  href: string;
  tone?: 'default' | 'alert';
}) {
  return (
    <Link href={href}>
      <Card className="h-full px-4 py-3.5 transition-colors hover:border-[color:var(--line-strong)]">
        <div className="mono text-[0.66rem] uppercase tracking-[0.12em] text-muted">{label}</div>
        <div
          className={`mt-1 text-[2rem] font-extrabold leading-none ${
            tone === 'alert' && value > 0 ? 'text-danger' : 'text-ink'
          }`}
        >
          {value}
        </div>
      </Card>
    </Link>
  );
}
