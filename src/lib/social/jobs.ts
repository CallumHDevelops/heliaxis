import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { classifyMention } from './classify';

type Job = { id: number; kind: string; payload: Record<string, unknown>; attempts: number; max_attempts: number };

/** Waits longer after each failed attempt: 1, 2, 4, 8 minutes. */
export const backoffMinutes = (attempts: number) => 2 ** Math.max(0, attempts - 1);

/**
 * Claims due jobs (FOR UPDATE SKIP LOCKED, so two runs never take the same one) and runs them.
 * A failed job goes back in the queue with a delay until it runs out of attempts. The comment's
 * keyword result and alert are already saved, so a failed AI step never loses a safety comment.
 */
export async function runSocialJobs(limit = 10, until = Date.now() + 40_000): Promise<{ done: number; retried: number; failed: number }> {
  const db = createAdminClient();
  const out = { done: 0, retried: 0, failed: 0 };
  const { data, error } = await db.rpc('social_claim_jobs', { n: limit });
  if (error || !data) return out;
  for (const job of data as Job[]) {
    if (Date.now() > until) {
      // Out of time: hand it back untouched.
      await db.from('social_job').update({ status: 'queued', locked_at: null, attempts: Math.max(0, job.attempts - 1) }).eq('id', job.id);
      continue;
    }
    let ok = false;
    let message = '';
    try {
      if (job.kind === 'classify') ok = await classifyMention(String(job.payload.mentionId), Number(job.payload.version));
      else {
        ok = true; // an unknown kind (a later phase's job): nothing to do here
      }
    } catch (e) {
      message = e instanceof Error ? e.message : 'failed';
    }
    const now = new Date();
    if (ok) {
      await db.from('social_job').update({ status: 'done', finished_at: now.toISOString(), last_error: null }).eq('id', job.id);
      out.done++;
    } else if (job.attempts >= job.max_attempts) {
      await db.from('social_job').update({ status: 'failed', finished_at: now.toISOString(), last_error: message || 'gave up' }).eq('id', job.id);
      out.failed++;
    } else {
      const next = new Date(now.getTime() + backoffMinutes(job.attempts) * 60_000);
      await db.from('social_job').update({ status: 'queued', locked_at: null, run_after: next.toISOString(), last_error: message || 'model did not answer' }).eq('id', job.id);
      out.retried++;
    }
  }
  return out;
}
