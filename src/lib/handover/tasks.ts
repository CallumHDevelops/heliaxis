import 'server-only';
import { addWorkingDays, ukBankHolidays } from '@/lib/bank-holidays';
import { addSourceTask, closeSourceTask } from '@/lib/surveys/server';
import type { Db } from '@/lib/site/server';
import type { Loaded } from './facts';
import type { SlotCode, SlotView } from './slots';

/**
 * The office's reminders for the items it collects (SPEC 4.3): tasks with source_key
 * 'handover:<item>', made when there's something to do and closed when the item is Complete or Not
 * needed. Registering the MCS certificate, notifying Building Control and buying the guarantee are
 * already deadline tasks (deadlines.ts); these are the step after each, uploading what came back,
 * so no job ever has the same job twice on its list. Runs after paperwork saves, sign-offs (by the
 * cron) and every refresh of the Handover tab. Never throws.
 */

type Rule = { title: (v: SlotView, l: Loaded) => string; when: (v: SlotView, l: Loaded) => boolean; due?: (l: Loaded, hols: ReadonlySet<string>) => string | null };

const READY_ON = ['ready', 'install_booked', 'installing', 'commissioning', 'handover', 'complete'];
// The working day before the install starts.
const before = (l: Loaded, hols: ReadonlySet<string>) => (l.facts.job.installDays[0] ? addWorkingDays(l.facts.job.installDays[0], -1, hols) : null);

const RULES: Partial<Record<SlotCode, Rule>> = {
  CC17: { title: () => 'Upload the MCS certificate into the handover pack', when: (_v, l) => !!l.facts.paperwork.mcs_cert_no },
  CC16: { title: () => 'Upload the guarantee policy into the handover pack', when: (_v, l) => !!l.facts.paperwork.ibg_ref },
  CC14: { title: () => 'Upload the Building Control certificate into the handover pack', when: (_v, l) => !!l.facts.paperwork.building_regs_ref },
  CC10: { title: () => 'Upload the schematic for the handover pack', when: (_v, l) => READY_ON.includes(l.facts.job.stage), due: before },
  CC15: { title: () => 'Upload the design calculations for the handover pack (or mark them not needed)', when: (_v, l) => READY_ON.includes(l.facts.job.stage), due: before },
  F76: { title: () => 'Upload the G99 application, the DNO’s acceptance and the installation document', when: (_v, l) => l.facts.job.dno.route === 'g99' },
};

export async function ensureHandoverTasks(db: Db, l: Loaded, views: SlotView[]): Promise<number> {
  let added = 0;
  try {
    const projectId = l.facts.job.id;
    const owner = (l.project.owner_id as string | null) ?? null;
    const hols = await ukBankHolidays();
    for (const v of views) {
      const rule = RULES[v.code];
      if (!rule) continue;
      const key = `handover:${v.code}`;
      if (v.state === 'complete' || v.state === 'na') {
        await closeSourceTask(db, projectId, key);
        continue;
      }
      if (!rule.when(v, l)) continue;
      if (await addSourceTask(db, { projectId, key, title: rule.title(v, l), notes: v.why, assigneeId: owner, dueDate: rule.due?.(l, hols) ?? v.due ?? null })) added++;
    }
    // The final invoice task (made when the pack goes) closes once an invoice is in the pack.
    if (l.docs.some((d) => d.handover_slot === 'CC13' && !d.archived_at && d.generated_key !== 'CC13_RECEIPT')) await closeSourceTask(db, projectId, 'final-invoice');
  } catch {
    // Reminders never block the pack.
  }
  return added;
}
