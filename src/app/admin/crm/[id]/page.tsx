import { recordPage, type RecordPageProps } from './record-page';

export const dynamic = 'force-dynamic';

export default async function CrmProjectPage(props: RecordPageProps) {
  return recordPage(props, 'crm');
}
