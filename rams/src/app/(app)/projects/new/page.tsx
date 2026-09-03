import { PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { createProject } from '../actions';
import { ProjectForm } from '../ProjectForm';

export const metadata = { title: 'New project' };

export default async function NewProjectPage() {
  await requireUser('/projects/new');
  return (
    <>
      <PageHeader
        eyebrow="Projects"
        title="New project"
        description="A project holds the site details every RAMS for that job inherits."
      />
      <div className="max-w-4xl">
        <ProjectForm action={createProject} submitLabel="Create project" />
      </div>
    </>
  );
}
