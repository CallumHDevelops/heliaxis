'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LogComposer, NextStepEditor, TaskEditor, type SavedTask } from '@/app/admin/crm/[id]/RecordSheets';
import { send, ukWhen } from '@/app/admin/crm/[id]/record-shared';
import { stageLabel } from '@/lib/crm/stages';
import type { TeamMember } from '@/lib/projects/server';
import { useNow } from '@/lib/use-now';
import { callTimeOf, dayWords, whenWords, type Suggestion } from '@/lib/whatsapp/chat-time';
import '@/app/admin/crm/crm.css';

/**
 * The sheets behind a WhatsApp chat's "+ Add task" (ChatTasks.tsx): the record page's own Next step, Task
 * and Note sheets, started from the customer's message and saved to their job. The job is the one
 * GET /api/crm/chat-job found; with none open, Save opens one first, the way the CRM does for a customer
 * (POST /api/crm/projects with open_existing, so a second Save never makes a second one).
 *
 * Portalled to the page inside `.crm` (the CRM's colours), over the dock like the record page's sheets.
 * Escape closes the sheet and stops there: in the dock it would otherwise close the chat too.
 */

export type TaskKind = 'callback' | 'task' | 'note';
export type ChatJob = {
  id: string;
  enquiryId: string;
  ref: string | null;
  title: string;
  stage: string;
  /** Who looks after it (and so hears when its next step is due); null: everyone on the CRM does. */
  owner: { id: string; name: string } | null;
  nextStep: string | null;
  nextStepAt: string | null;
};
/** GET /api/crm/chat-job: their open job, else their latest one (`last`), and the team. */
export type ChatJobInfo = { job: ChatJob | null; last: ChatJob | null; team: TeamMember[]; me: string };
/** What was set, for the line in the chat. */
export type Done = { text: string; jobId: string };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function ChatTaskSheet({
  kind,
  s,
  name,
  threadId,
  me,
  info,
  lookupError,
  readJob,
  onDone,
  onClose,
}: {
  kind: TaskKind;
  /** What the sheet starts with, from the message. */
  s: Suggestion;
  name: string;
  threadId: string;
  me: string;
  info: ChatJobInfo | null;
  lookupError: string;
  readJob: (fresh?: boolean) => Promise<ChatJobInfo>;
  onDone: (d: Done) => void;
  onClose: () => void;
}) {
  const now = useNow(30_000);
  const today = now ? callTimeOf(now).day : '';
  const first = firstName(name);
  const [note, setNote] = useState(s.quote);
  /** The job the save went on (found, or opened by it). */
  const savedOn = useRef('');
  const job = info?.job ?? null;
  const team = info?.team ?? [];

  // Phones: a call-back or task is already filled in, so no keyboard over Save (tap a field to change it).
  // A note is for writing, so it keeps the cursor.
  useEffect(() => {
    if (kind !== 'note' && window.matchMedia('(hover: none)').matches) document.querySelector<HTMLElement>('.wa-tasksheet .crm-sheet-box')?.focus({ preventScroll: true });
  }, [kind]);

  /**
   * Their open job; else, for a task or note, their last one; else one opened now. A call-back always
   * needs a live job: a closed job's reminder never goes off.
   */
  async function ensureJob(): Promise<string> {
    const found = await readJob();
    let id = found.job?.id ?? (kind === 'callback' ? undefined : found.last?.id);
    if (!id) {
      const d = await send<{ id: string }>(
        '/api/crm/projects',
        'POST',
        { enquiry_id: found.last?.enquiryId ?? threadId, open_existing: true, live_only: kind === 'callback', from_chat: true },
        'Couldn’t open a CRM record for them.'
      );
      id = d.id;
      await readJob(true).catch(() => null);
    }
    savedOn.current = id;
    return id;
  }

  // Who the cron tells when a call-back is due: whoever looks after the job (a new one is yours), else everyone on the CRM.
  const owner = job ? job.owner : { id: me, name: '' };
  const hearer = !owner ? 'everyone on the CRM' : owner.id === me ? 'you' : firstName(owner.name);
  const lead = <JobLine info={info} error={lookupError} kind={kind} first={first} />;
  let sheet: ReactNode;

  if (kind === 'callback') {
    sheet = (
      <NextStepEditor
        project={null}
        initial={{ text: s.callTitle, at: s.at }}
        now={now}
        title="Call-back reminder"
        hint={
          <>
            {s.phrase && (
              <>
                From {first}’s message: <q>{s.phrase}</q>.{' '}
              </>
            )}
            {!owner
              ? `Everyone on the CRM gets a notification when it’s due (nobody looks after ${first}’s job yet).`
              : owner.id === me
                ? 'You’ll get a notification when it’s due.'
                : `${hearer} looks after ${first}’s job, so the notification goes to ${hearer}: one now, and another when it’s due.`}
          </>
        }
        extra={
          <>
            {job?.nextStep && (
              <p className="crm-banner">
                This replaces the job’s next step: <b>{job.nextStep}</b>
                {job.nextStepAt ? ` (${ukWhen(job.nextStepAt)})` : ''}.
              </p>
            )}
            <label className="crm-label" htmlFor="wa-cb-note">
              Note on {first}’s timeline
            </label>
            <textarea id="wa-cb-note" className="crm-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to remember for the call" />
          </>
        }
        onClose={onClose}
        onSave={async (text, at) => {
          if (!text) return;
          const id = await ensureJob();
          const was = job?.id === id && job.nextStep ? ` It replaces “${job.nextStep}”${job.nextStepAt ? ` (${ukWhen(job.nextStepAt)})` : ''}.` : '';
          await send(`/api/crm/projects/${id}`, 'PATCH', { next_step: text, next_step_at: at, notify_owner: true });
          // On the job's timeline too (the reminder is set even if this doesn't save).
          const body = [`⏰ Call-back reminder: ${text}${at ? `, ${ukWhen(at)}` : ''}.${was}`, note.trim()].filter(Boolean).join('\n\n');
          await send(`/api/crm/projects/${id}/activities`, 'POST', { kind: 'note', body }).catch(() => null);
          const tell = !at ? 'no time set, so no notification' : hearer === 'you' ? 'you’ll get a notification' : `${hearer} gets a notification`;
          onDone({ text: `Reminder set: ${text}${at ? ` ${whenWords(callTimeOf(at), Date.now())}` : ''} — ${tell}`, jobId: id });
        }}
      >
        {lead}
      </NextStepEditor>
    );
  } else if (kind === 'task') {
    sheet = (
      <TaskEditor
        id={ensureJob}
        team={team}
        today={today}
        defaultAssignee={me}
        initial={{ title: s.taskTitle, due: s.day, notes: s.quote }}
        onClose={onClose}
        onSaved={(t: SavedTask) => {
          const due = t.due_date ? `, due ${dayWords(t.due_date, Date.now())}` : '';
          const person = team.find((x) => x.id === t.assignee_id)?.name;
          const who = !t.assignee_id ? 'nobody’s on it yet' : t.assignee_id === me ? 'it’s in your My work' : `${firstName(person || 'They')} has been told`;
          onDone({ text: `Task added: ${t.title}${due} — ${who}`, jobId: savedOn.current });
        }}
      >
        {lead}
      </TaskEditor>
    );
  } else {
    sheet = (
      <LogComposer
        id={ensureJob}
        kind="note"
        phone={null}
        initial={s.quote ? `${s.quote}\n\n` : ''}
        onClose={onClose}
        onSaved={() => onDone({ text: `Note added to ${first}’s timeline`, jobId: savedOn.current })}
      >
        {lead}
      </LogComposer>
    );
  }

  return createPortal(
    <div
      className="crm wa-tasksheet"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      {sheet}
    </div>,
    document.body
  );
}

/** Which job it goes on, in words: "On David’s job HX-0108 · Contacted", or that Save opens one. */
function JobLine({ info, error, kind, first }: { info: ChatJobInfo | null; error: string; kind: TaskKind; first: string }) {
  if (!info) {
    return error ? (
      <p className="crm-banner crm-banner--err">Couldn’t find {first}’s job ({error}). Save tries again.</p>
    ) : (
      <p className="wa-tasksheet__job">Finding {first}’s job…</p>
    );
  }
  const j = info.job;
  if (j) {
    return (
      <p className="wa-tasksheet__job">
        On {first}’s job <b>{j.ref || j.title}</b> · {stageLabel(j.stage)}
      </p>
    );
  }
  const l = info.last;
  if (l && kind !== 'callback') {
    return (
      <p className="wa-tasksheet__job">
        Goes on {first}’s last job <b>{l.ref || l.title}</b> ({stageLabel(l.stage)})
      </p>
    );
  }
  return (
    <p className="wa-tasksheet__job is-new">
      {l
        ? `${first}’s last job (${l.ref || l.title}) is ${stageLabel(l.stage)}, so this also opens a new CRM record for ${first}.`
        : `This also opens a CRM record for ${first}.`}
    </p>
  );
}
