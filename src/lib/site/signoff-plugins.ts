import 'server-only';
import type { FormCtx } from './forms/types';
import type { ReviewStatus } from './review-shared';
import type { Missing } from './rules';
import type { AssignmentRow, Db } from './server';
import type { Flag, Stage, Trade } from './types';

/**
 * What each trade adds to a sign-off (signoff.ts): more for the server's gate, updates to the job, and
 * the documents it makes. Kept apart from signoff.ts so a trade's module can register without
 * importing it (signoff.ts imports the trades' modules). Registering twice for a trade adds to what's
 * there: gates are all checked, job updates and documents all run (the electrician's pack, then the
 * EIC's), and one failing doesn't stop the others; the cron runs them again (they're idempotent).
 */

export type SignoffRow = {
  id: string;
  assignment_id: string;
  stage: Stage;
  signed_name: string;
  signature_path: string;
  signed_at: string;
  received_at: string;
  device_id: string | null;
  ip: string | null;
  user_agent: string | null;
  declaration: string;
  answers_hash: string;
  flags: Flag[];
  extra: Record<string, unknown>;
  po_done_at: string | null;
  docs_done_at: string | null;
  notified_at: string | null;
  /** The office's review after it (review-shared.ts): waiting, green, or return to site. */
  review_status?: ReviewStatus;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

export type SignoffPlugin = {
  /** More for the gate to check before a sign-off is taken (what's still missing, in the forms' words). */
  gate?: (db: Db, a: AssignmentRow, stage: Stage, ctx: FormCtx) => Promise<Missing[]>;
  /** Job record updates, only where empty and each logged. */
  job?: (db: Db, a: AssignmentRow, s: SignoffRow) => Promise<void>;
  /** The documents a sign-off makes (after the reply; docs_done_at). */
  docs?: (db: Db, a: AssignmentRow, s: SignoffRow) => Promise<unknown>;
};

const PLUGINS = new Map<Trade, SignoffPlugin[]>();
export const registerSignoff = (trade: Trade, p: SignoffPlugin) => void PLUGINS.set(trade, [...(PLUGINS.get(trade) ?? []), p]);

/** Every registered gate's missing items. */
export async function pluginGate(db: Db, a: AssignmentRow, stage: Stage, ctx: FormCtx): Promise<Missing[]> {
  const out: Missing[] = [];
  for (const p of PLUGINS.get(a.trade) ?? []) if (p.gate) out.push(...(await p.gate(db, a, stage, ctx)));
  return out;
}

/** Run one kind of step for every plugin; throw afterwards if any of them threw (so the cron tries again). */
async function runAll(kind: 'job' | 'docs', db: Db, a: AssignmentRow, s: SignoffRow): Promise<void> {
  let failed: unknown = null;
  for (const p of PLUGINS.get(a.trade) ?? []) {
    try {
      await p[kind]?.(db, a, s);
    } catch (e) {
      failed ??= e;
    }
  }
  if (failed) throw failed;
}
export const pluginJob = (db: Db, a: AssignmentRow, s: SignoffRow) => runAll('job', db, a, s);
export const pluginDocs = (db: Db, a: AssignmentRow, s: SignoffRow) => runAll('docs', db, a, s);
