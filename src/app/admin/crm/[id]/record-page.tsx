import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { mergedInto } from '@/lib/crm/aliases';
import { canAccess } from '@/lib/portals';
import { schemaReady } from '@/lib/schema-ready';
import { DOCS_VIEWS, type DocsView } from './DocsHub';
import { ProjectView } from './ProjectView';
import { TABS, type Area, type Tab } from './record-shared';

export type RecordPageProps = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The job record page, from the CRM or from Projects (`area`: the back link and the default tab). */
export async function recordPage({ params, searchParams }: RecordPageProps, area: Area) {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const [{ id }, sp, schema] = await Promise.all([params, searchParams, schemaReady()]);
  const tab = typeof sp.tab === 'string' && (TABS as string[]).includes(sp.tab) ? (sp.tab as Tab) : null;
  // A job joined into another (src/lib/crm/merge.ts): old links and notifications open that one.
  const joined = await mergedInto('job', id);
  if (joined?.project_id) redirect(`/admin/${area === 'projects' ? 'projects' : 'crm'}/${joined.project_id}${tab ? `?tab=${tab}` : ''}`);
  // ?tab=docs&view=inhouse opens a pack (proposal, inhouse, handover) or general; &form=HX-HP-02 goes straight into one form.
  // The old links still work: ?tab=handover is Docs on the Handover pack, ?view=mcs is the In-House pack.
  const asked = sp.view === 'mcs' ? 'inhouse' : sp.view;
  const view = (DOCS_VIEWS as string[]).includes(String(asked)) ? (asked as DocsView) : tab === 'handover' ? 'handover' : null;
  const form = view === 'inhouse' && typeof sp.form === 'string' && /^HX-[A-Z]{2,4}-\d{2}$/.test(sp.form) ? sp.form : null;
  const entry = typeof sp.entry === 'string' && /^[\w-]{1,64}$/.test(sp.entry) ? sp.entry : null;
  return (
    <AdminShell active={area === 'projects' ? 'projects' : 'crm'} fluid>
      <ProjectView
        // A different job starts the page afresh (its tab, sheets and polling).
        key={id}
        id={id}
        me={session.user.id}
        isAdmin={session.profile.role === 'admin'}
        canInbox={canAccess(session.profile, 'enquiries')}
        area={area}
        initialTab={tab}
        initialView={view}
        initialForm={form}
        entry={entry}
        schema={schema}
      />
    </AdminShell>
  );
}
