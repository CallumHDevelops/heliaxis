import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { getProject } from '@/lib/db';
import { updateProject } from '../../actions';
import { ProjectForm } from '../../ProjectForm';

export const metadata = { title: 'Edit project' };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/projects/${id}/edit`);

  const project = await getProject(id);
  if (!project) notFound();

  return (
    <>
      <PageHeader eyebrow={<span className="mono">{project.reference}</span>} title="Edit project" />
      <div className="max-w-4xl">
        <ProjectForm action={updateProject} project={project} submitLabel="Save changes" />
      </div>
    </>
  );
}
