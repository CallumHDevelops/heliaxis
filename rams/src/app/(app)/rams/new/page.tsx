import { PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { listProjects } from '@/lib/db';
import { NewRamsForm } from './NewRamsForm';

export const metadata = { title: 'New RAMS' };

export default async function NewRamsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await requireUser('/rams/new');
  const [projects, params] = await Promise.all([listProjects(), searchParams]);

  return (
    <>
      <PageHeader
        eyebrow="Documents"
        title="New RAMS"
        description="Pick the project and technology — the document starts pre-filled from the Heliaxis template and you edit from there."
      />
      <div className="max-w-3xl">
        <NewRamsForm projects={projects} initialProjectId={params.project} />
      </div>
    </>
  );
}
