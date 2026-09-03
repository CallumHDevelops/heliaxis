import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProjectStatusBadge, RamsStatusBadge } from '@/components/rams/StatusBadge';
import { Badge, Button, EmptyState, LinkButton, PageHeader, Panel } from '@/components/ui';
import { isManager, requireUser } from '@/lib/auth';
import { technology as tech } from '@/lib/content/technologies';
import { getProject, listProjectFiles, listRams } from '@/lib/db';
import { formatBytes, formatDate, titleCase } from '@/lib/format';
import { deleteProject, deleteProjectFile } from '../actions';
import { DownloadFileButton } from './FileRow';
import { FileUploader } from './FileUploader';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const project = await getProject((await params).id);
  return { title: project?.name ?? 'Project' };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireUser(`/projects/${id}`);

  const project = await getProject(id);
  if (!project) notFound();

  const [files, rams] = await Promise.all([listProjectFiles(id), listRams(id)]);

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <span className="mono">{project.reference}</span>
          </>
        }
        title={project.name}
        description={project.site_address ?? undefined}
        action={
          <>
            <LinkButton href={`/projects/${id}/edit`} variant="ghost">
              Edit
            </LinkButton>
            <LinkButton href={`/rams/new?project=${id}`} variant="solar">
              New RAMS
            </LinkButton>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <ProjectStatusBadge status={project.status} />
        <Badge tone="neutral">{titleCase(project.sector)}</Badge>
        {(project.technologies ?? []).map((t) => (
          <Badge key={t} tone="solar">
            {tech(t).name}
          </Badge>
        ))}
        {project.cdm_notifiable && <Badge tone="warn">CDM notifiable</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Panel
            title="RAMS documents"
            eyebrow="Documents"
            action={
              <LinkButton href={`/rams/new?project=${id}`} variant="ghost" size="sm">
                New RAMS
              </LinkButton>
            }
          >
            {rams.length === 0 ? (
              <EmptyState
                title="No documents for this project"
                description="Create a RAMS and the site details above are carried into it automatically."
                action={
                  <LinkButton href={`/rams/new?project=${id}`} variant="solar" size="sm">
                    New RAMS
                  </LinkButton>
                }
              />
            ) : (
              <ul className="divide-y divide-[color:var(--line)]">
                {rams.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/rams/${r.id}`}
                      className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[2px] px-2 py-2.5 hover:bg-paper-2"
                    >
                      <span className="mono text-[0.72rem] text-muted">
                        {r.reference} v{r.version}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span>
                      <Badge tone="neutral">{tech(r.technology).shortName}</Badge>
                      <RamsStatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Project files" eyebrow="Uploads">
            <FileUploader projectId={id} />

            {files.length > 0 && (
              <ul className="mt-5 divide-y divide-[color:var(--line)] border-t border-[color:var(--line)]">
                {files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Badge tone="neutral">{titleCase(f.kind)}</Badge>
                    <span className="min-w-0 flex-1 truncate text-[0.86rem] font-semibold">
                      {f.file_name}
                    </span>
                    <span className="mono text-[0.72rem] text-muted">
                      {formatBytes(f.size_bytes)} · {formatDate(f.created_at)}
                    </span>
                    <DownloadFileButton path={f.file_path} name={f.file_name} />
                    <form action={deleteProjectFile}>
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="project_id" value={id} />
                      <input type="hidden" name="file_path" value={f.file_path} />
                      <Button type="submit" variant="quiet" size="sm">
                        Remove
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Site" eyebrow="Details">
            <Detail label="Address" value={project.site_address} />
            <Detail label="Postcode" value={project.site_postcode} />
            <Detail label="what3words" value={project.what3words} mono />
            <Detail label="Site contact" value={project.site_contact} />
            <Detail label="Site phone" value={project.site_contact_phone} />
            <Detail label="Nearest A&E" value={project.nearest_hospital} />
            <Detail label="Access notes" value={project.access_notes} />
            <Detail label="Welfare" value={project.welfare_notes} />
          </Panel>

          <Panel title="Client" eyebrow="Details">
            <Detail label="Client" value={project.client_name} />
            <Detail label="Contact" value={project.client_contact} />
            <Detail label="Phone" value={project.client_phone} />
            <Detail label="Email" value={project.client_email} />
          </Panel>

          <Panel title="CDM 2015" eyebrow="Details">
            <Detail label="Principal contractor" value={project.principal_contractor} />
            <Detail label="Principal designer" value={project.principal_designer} />
            <Detail label="Notifiable" value={project.cdm_notifiable ? 'Yes' : 'No'} />
            <Detail label="F10 reference" value={project.f10_reference} mono />
            <Detail label="Start" value={formatDate(project.start_date)} />
            <Detail label="Completion" value={formatDate(project.end_date)} />
          </Panel>

          {project.notes && (
            <Panel title="Internal notes" eyebrow="Notes">
              <p className="whitespace-pre-wrap text-[0.86rem] text-muted">{project.notes}</p>
            </Panel>
          )}

          {isManager(profile) && (
            <form action={deleteProject}>
              <input type="hidden" name="id" value={id} />
              <Button type="submit" variant="danger" size="sm" className="w-full">
                Delete project and all its documents
              </Button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="border-b border-[color:var(--line)] py-2 last:border-0">
      <div className="mono text-[0.64rem] uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className={`mt-0.5 whitespace-pre-wrap text-[0.86rem] ${mono ? 'mono' : ''}`}>
        {value || <span className="text-muted">—</span>}
      </div>
    </div>
  );
}
