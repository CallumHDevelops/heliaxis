import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendStageToMeta } from '@/lib/meta-capi';
import { enquiryStatusFor, logActivity } from './server';
import { isStage, stageIndex, stageLabel, type StageKey } from './stages';

/**
 * One place for stage changes and what follows them: the timeline entry, the customer's Enquiries
 * status and Meta. The job number (project_ref) and project_started_at come from the database
 * trigger in crm-v3.sql, so nothing here sets them.
 */

/** Things that happen to a job, and the stage each moves it to (only from the stages listed). */
export type StageEvent = 'survey_booked' | 'surveyed' | 'quote_sent' | 'accepted' | 'install_booked' | 'install_started';

const RULES: Record<StageEvent, { to: StageKey; from: StageKey[] }> = {
  survey_booked: { to: 'survey_booked', from: ['lead', 'contacted'] },
  surveyed: { to: 'surveyed', from: ['lead', 'contacted', 'survey_booked'] },
  quote_sent: { to: 'quote_sent', from: ['lead', 'contacted', 'survey_booked', 'surveyed'] },
  accepted: { to: 'won', from: ['lead', 'contacted', 'survey_booked', 'surveyed', 'quote_sent'] },
  install_booked: { to: 'install_booked', from: ['won', 'design', 'ready'] },
  install_started: { to: 'installing', from: ['install_booked'] },
};

export type StageMove = { moved: boolean; from: string | null };

/**
 * Move a job to `to`. Only moves it if it's still at the stage just read (two moves at once can't
 * both win), and with `onlyFrom` only from those stages. Never throws.
 */
export async function moveStage(
  projectId: string,
  to: StageKey,
  opts: { byId?: string | null; note?: string; onlyFrom?: StageKey[] } = {}
): Promise<StageMove> {
  let from: string | null = null;
  try {
    if (!isStage(to)) return { moved: false, from };
    const db = createAdminClient();
    const { data: p } = await db.from('crm_projects').select('id, enquiry_id, stage').eq('id', projectId).maybeSingle();
    if (!p) return { moved: false, from };
    from = p.stage as string;
    if (from === to) return { moved: false, from };
    if (opts.onlyFrom && !(opts.onlyFrom as string[]).includes(from)) return { moved: false, from };
    const now = new Date().toISOString();
    const { data: moved } = await db
      .from('crm_projects')
      .update({ stage: to, stage_changed_at: now, updated_at: now })
      .eq('id', projectId)
      .eq('stage', from)
      .select('id');
    if (!moved?.length) return { moved: false, from };

    const enquiryId = p.enquiry_id as string;
    await logActivity({
      enquiryId,
      projectId,
      kind: 'stage',
      body: `${stageLabel(from)} → ${stageLabel(to)}${opts.note ? ` (${opts.note})` : ''}`,
      meta: { from, to },
      byId: opts.byId ?? null,
    }).catch(() => null);

    // The customer's Enquiries status follows their most advanced open job, not whichever moved last.
    const { data: all } = await db.from('crm_projects').select('stage').eq('enquiry_id', enquiryId);
    const open = (all ?? []).map((r) => r.stage as string).filter((s) => s !== 'lost' && isStage(s)) as StageKey[];
    const best = open.length ? open.reduce((a, b) => (stageIndex(b) > stageIndex(a) ? b : a)) : 'lost';
    await db.from('enquiries').update({ status: enquiryStatusFor(best) }).eq('id', enquiryId);

    await sendStageToMeta(projectId, to).catch(() => null);
    return { moved: true, from };
  } catch {
    return { moved: false, from };
  }
}

/** Move a job because something happened to it (a booking, a signature…), if the rule allows it from where it is. */
export async function applyStageEvent(projectId: string, event: StageEvent, opts: { byId?: string | null; note?: string } = {}): Promise<StageMove> {
  const rule = RULES[event];
  if (!rule) return { moved: false, from: null };
  return moveStage(projectId, rule.to, { ...opts, onlyFrom: rule.from });
}
