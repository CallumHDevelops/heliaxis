import { recordPage, type RecordPageProps } from '../../crm/[id]/record-page';

export const dynamic = 'force-dynamic';

/** A job opened from Projects: the same record page as the CRM's (spec D1), with Projects as its back link. */
export default async function ProjectPage(props: RecordPageProps) {
  return recordPage(props, 'projects');
}
