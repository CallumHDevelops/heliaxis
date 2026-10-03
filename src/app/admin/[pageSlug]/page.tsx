import { redirect } from 'next/navigation';

/** The CMS moved from /admin to /admin/cms — keep old page-editor links working. */
export default async function LegacyCmsEditorRedirect({ params }: { params: Promise<{ pageSlug: string }> }) {
  const { pageSlug } = await params;
  redirect(`/admin/cms/${pageSlug}`);
}
