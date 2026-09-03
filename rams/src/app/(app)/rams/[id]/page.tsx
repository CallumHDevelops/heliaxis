import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RamsStatusBadge } from '@/components/rams/StatusBadge';
import { Badge, Button, Card, Input, LinkButton, PageHeader, Panel } from '@/components/ui';
import { isManager, requireUser } from '@/lib/auth';
import { technology as tech } from '@/lib/content/technologies';
import {
  getProject,
  getRams,
  listApprovedProfiles,
  listBriefings,
  listCertifications,
  listShareLinks,
} from '@/lib/db';
import { formatDate, formatDateTime } from '@/lib/format';
import { addBriefing, deleteRams, removeBriefing, reviseRams, setRamsStatus } from '../actions';
import { RamsBuilder } from './RamsBuilder';
import { SharePanel } from './SharePanel';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const doc = await getRams((await params).id);
  return { title: doc?.title ?? 'RAMS' };
}

export default async function RamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await requireUser(`/rams/${id}`);

  const doc = await getRams(id);
  if (!doc) notFound();

  const [project, certifications, staff, links, briefings] = await Promise.all([
    getProject(doc.project_id),
    listCertifications(),
    listApprovedProfiles(),
    listShareLinks(id),
    listBriefings(id),
  ]);

  const manager = isManager(profile);
  const readOnly = doc.status === 'issued' || doc.status === 'archived';
  const canApprove = manager && (doc.author_id !== user.id || profile.role === 'admin');
  const canShare = doc.status === 'approved' || doc.status === 'issued';

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <span className="mono">{doc.reference}</span>
            <span className="text-muted">v{doc.version}</span>
          </>
        }
        title={doc.title}
        description={
          project ? (
            <>
              <Link href={`/projects/${project.id}`} className="font-semibold hover:underline">
                {project.name}
              </Link>
              {project.site_postcode && ` · ${project.site_postcode}`}
            </>
          ) : undefined
        }
        action={
          <>
            <LinkButton href={`/rams/${id}/print`} variant="ghost" target="_blank">
              Preview &amp; PDF
            </LinkButton>
            {doc.status === 'draft' && (
              <StatusButton id={id} to="in_review" label="Submit for review" variant="dark" />
            )}
            {doc.status === 'in_review' && canApprove && (
              <StatusButton id={id} to="approved" label="Approve" variant="solar" />
            )}
            {doc.status === 'approved' && manager && (
              <StatusButton id={id} to="issued" label="Issue" variant="solar" />
            )}
            {doc.status === 'issued' && (
              <form action={reviseRams}>
                <input type="hidden" name="id" value={id} />
                <Button type="submit" variant="ghost">
                  Create new version
                </Button>
              </form>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <RamsStatusBadge status={doc.status} />
        <Badge tone="solar">{tech(doc.technology).name}</Badge>
        <Badge tone="neutral">{doc.sector === 'commercial' ? 'Commercial' : 'Residential'}</Badge>
        {doc.review_date && <Badge tone="neutral">Review by {formatDate(doc.review_date)}</Badge>}
        {doc.approved_at && <Badge tone="ok">Approved {formatDate(doc.approved_at)}</Badge>}

        <span className="ml-auto flex flex-wrap gap-2">
          {doc.status === 'in_review' && (
            <StatusButton id={id} to="draft" label="Return to draft" variant="quiet" size="sm" />
          )}
          {doc.status === 'approved' && manager && (
            <StatusButton id={id} to="in_review" label="Withdraw approval" variant="quiet" size="sm" />
          )}
          {doc.status === 'issued' && manager && (
            <StatusButton id={id} to="archived" label="Archive" variant="quiet" size="sm" />
          )}
        </span>
      </div>

      <RamsBuilder doc={doc} certifications={certifications} staff={staff} readOnly={readOnly} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Share links" eyebrow="Distribution">
          <SharePanel ramsId={id} links={links} canShare={canShare} />
        </Panel>

        <Panel title="Briefing record" eyebrow="Sign-on">
          <form action={addBriefing} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="rams_id" value={id} />
            <Input name="person_name" required placeholder="Name" />
            <Input name="person_role" placeholder="Role" />
            <Button type="submit" variant="ghost" size="sm">
              Add
            </Button>
            <label className="mono flex items-center gap-2 text-[0.74rem] text-muted sm:col-span-3">
              <input type="checkbox" name="signed" className="accent-[#C77F04]" />
              Record as briefed and signed now
            </label>
          </form>

          {briefings.length === 0 ? (
            <p className="mt-4 text-[0.85rem] text-muted">
              Nobody recorded yet. Blank rows are printed on the PDF for on-site signatures.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[color:var(--line)] border-t border-[color:var(--line)]">
              {briefings.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[0.85rem] font-semibold">
                    {b.person_name}
                  </span>
                  <span className="text-[0.78rem] text-muted">{b.person_role || '—'}</span>
                  {b.signed_at ? (
                    <Badge tone="ok">Signed {formatDate(b.signed_at)}</Badge>
                  ) : (
                    <Badge tone="neutral">Not signed</Badge>
                  )}
                  <form action={removeBriefing}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="rams_id" value={id} />
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

      <Card className="mt-6 p-4">
        <div className="mono grid gap-2 text-[0.74rem] text-muted sm:grid-cols-4">
          <div>Created {formatDateTime(doc.created_at)}</div>
          <div>Updated {formatDateTime(doc.updated_at)}</div>
          <div>Approved {doc.approved_at ? formatDateTime(doc.approved_at) : '—'}</div>
          <div>Issued {doc.issued_at ? formatDateTime(doc.issued_at) : '—'}</div>
        </div>
        {manager && (
          <form action={deleteRams} className="mt-4 border-t border-[color:var(--line)] pt-4">
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="danger" size="sm">
              Delete this document
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}

function StatusButton({
  id,
  to,
  label,
  variant = 'ghost',
  size,
}: {
  id: string;
  to: string;
  label: string;
  variant?: 'solar' | 'dark' | 'ghost' | 'quiet';
  size?: 'sm' | 'md';
}) {
  return (
    <form action={setRamsStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={to} />
      <Button type="submit" variant={variant} size={size}>
        {label}
      </Button>
    </form>
  );
}
