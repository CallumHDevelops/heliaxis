import { NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { reportOverview, reportReady, runReportJobs, saveReportSettings, startReport } from '@/lib/report/build';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** /admin/cms-report's data (anyone with the CMS), for one report by ?id= or the current one. */
export async function GET(req: Request) {
  const session = await requirePortal('cms');
  if (!session) return json({ error: 'Unauthorized' }, 401);
  const id = new URL(req.url).searchParams.get('id') || undefined;
  return json(await reportOverview(id));
}

/**
 * /admin/cms-report's actions. Building and settings are for admins. "step" moves the report being
 * built on; the screen sends it while open, so a report finishes without the 5-minute cron.
 */
export async function POST(req: Request) {
  const session = await requirePortal('cms');
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!(await reportReady())) return json({ error: 'Run seo-report.sql in Supabase first.' }, 400);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const admin = session.profile.role === 'admin';
  const who = session.profile.full_name || session.profile.email || 'Admin';
  try {
    switch (body?.action) {
      case 'step':
        return json({ ok: true, step: await runReportJobs({ until: Date.now() + 40_000, schedule: false }) });
      case 'build':
        if (!admin) return json({ error: 'Only admins can build reports.' }, 403);
        await startReport(who);
        return json({ ok: true, step: await runReportJobs({ until: Date.now() + 40_000, schedule: false }) });
      case 'retry': {
        if (!admin) return json({ error: 'Only admins can do that.' }, 403);
        // A report whose write-up failed: write it up again from the data already gathered.
        const { data } = await createAdminClient()
          .from('seo_reports')
          .update({ status: 'building', stage: 'analysis', error: null, finished_at: null, locked_at: null })
          .eq('id', String(body.id || ''))
          .eq('status', 'failed')
          .select('id')
          .maybeSingle();
        if (!data) return json({ error: 'That report can’t be retried.' }, 400);
        return json({ ok: true, step: await runReportJobs({ until: Date.now() + 1_000, schedule: false }) });
      }
      case 'settings': {
        if (!admin) return json({ error: 'Only admins can change the report.' }, 403);
        const s = (body.settings ?? {}) as Record<string, unknown>;
        return json({
          ok: true,
          settings: await saveReportSettings({
            ...(Array.isArray(s.keywords) ? { keywords: s.keywords.map(String) } : {}),
            ...(Array.isArray(s.locations) ? { locations: s.locations.map(String) } : {}),
            ...(s.everyDays !== undefined ? { everyDays: Number(s.everyDays) } : {}),
          }),
        });
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Something went wrong' }, 400);
  }
}
