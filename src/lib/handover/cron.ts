import 'server-only';
import { addSiteJob } from '@/lib/site/cron';
import { handoverReady, refreshHandover, sendQueuedHandover } from './server';

/**
 * The handover pack's part of /api/cron/site (SPEC 13 item 5): messages held by the evening rule go
 * once their time comes, then the jobs being installed or handed over are brought up to date, so a
 * sign-off or a customer's signature on the electrician's phone makes the system summary, the completion sign-off and the rest within
 * minutes, and the office's reminders follow. A job at a time, until the run's time is up.
 */
const BATCH = 40;

addSiteJob({
  name: 'handover',
  run: async (db, until) => {
    if (!(await handoverReady())) return 'handover.sql not run';
    const sent = await sendQueuedHandover(db);
    const { data } = await db.from('crm_projects').select('id').in('stage', ['installing', 'commissioning', 'handover']).order('updated_at', { ascending: false }).limit(BATCH);
    let refreshed = 0;
    for (const p of (data ?? []) as { id: string }[]) {
      if (Date.now() > until) break;
      await refreshHandover(db, p.id).catch((e) => console.error('[cron/site] handover', p.id, e));
      refreshed++;
    }
    return { sent, refreshed };
  },
});
