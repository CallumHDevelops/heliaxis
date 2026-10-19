'use client';

import type { TeamMember } from '@/lib/projects/server';
import type { SchemaReady } from '@/lib/schema-ready';
import { LatestNotes } from './LatestNotes';
import { MyWork } from './MyWork';
import { NeedsReply } from './NeedsReply';
import { isSales, type PipelineProject } from './crm-shared';
import type { useWaActive } from './dock-link';

/**
 * The CRM home below the counts: My work on the left and Latest notes in the middle; the WhatsApp dock
 * is the column on the right. Tablets and phones get a Needs reply card first instead (no dock column
 * there), and phones end with a link to the pipeline list. CSS sets the columns per width.
 */
export function CrmHome({
  me,
  projects,
  team,
  today,
  now,
  schema,
  canTasks,
  canInbox,
  wa,
  scope,
  onScope,
  dueOnly,
  onDueOnly,
  onNudge,
  onList,
  onChanged,
  refreshKey,
}: {
  me: string;
  projects: PipelineProject[];
  team: TeamMember[];
  today: string;
  now: number;
  schema: SchemaReady;
  canTasks: boolean;
  canInbox: boolean;
  wa: ReturnType<typeof useWaActive>;
  scope: 'mine' | 'all';
  onScope: (s: 'mine' | 'all') => void;
  dueOnly: boolean;
  onDueOnly: (v: boolean) => void;
  onNudge: () => void;
  onList: () => void;
  onChanged: () => void;
  refreshKey: number;
}) {
  const open = projects.filter((p) => isSales(p.stage)).length;
  return (
    <div className="crmh-lanes">
      <NeedsReply rows={wa.rows} missing={wa.missing} now={now} canInbox={canInbox} />
      <MyWork
        me={me}
        projects={projects}
        team={team}
        today={today}
        schema={schema}
        canTasks={canTasks}
        canInbox={canInbox}
        scope={scope}
        onScope={onScope}
        dueOnly={dueOnly}
        onDueOnly={onDueOnly}
        onNudge={onNudge}
        onChanged={onChanged}
        refreshKey={refreshKey}
      />
      <LatestNotes me={me} projects={projects} today={today} onChanged={onChanged} refreshKey={refreshKey} />
      <button type="button" className="crmh-linkrow crmh-pipelink" onClick={onList}>
        Open the pipeline list ({open})<span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
