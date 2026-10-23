import { NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { decideSuggestion, geoOverview, geoReady, runGeoJobs, saveGeoSettings, startRun } from '@/lib/geo/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** /admin/geo's data, re-read while a check is running. */
export async function GET() {
  const session = await requirePortal('cms');
  if (!session || session.profile.role !== 'admin') return json({ error: 'Unauthorized' }, 401);
  return json(await geoOverview());
}

/**
 * /admin/geo's actions (admins only): run now, a step of the running check (the screen sends these
 * while it's open, so a run finishes without the 5-minute cron), apply or dismiss a suggestion, the
 * tracked questions and the settings.
 */
export async function POST(req: Request) {
  const session = await requirePortal('cms');
  if (!session || session.profile.role !== 'admin') return json({ error: 'Unauthorized' }, 401);
  if (!(await geoReady())) return json({ error: 'Run geo.sql in Supabase first.' }, 400);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const who = session.profile.full_name || session.profile.email || 'Admin';
  const db = createAdminClient();

  try {
    switch (body?.action) {
      case 'run':
        await startRun(who);
        return json({ ok: true, step: await runGeoJobs({ until: Date.now() + 40_000, schedule: false }) });
      case 'step':
        return json({ ok: true, step: await runGeoJobs({ until: Date.now() + 40_000, schedule: false }) });
      case 'retry': {
        // A run whose analysis failed: analyse its answers again.
        const id = String(body.id || '');
        const { data } = await db.from('geo_runs').update({ status: 'checking', error: null, finished_at: null }).eq('id', id).eq('status', 'failed').select('id').maybeSingle();
        if (!data) return json({ error: 'That check can’t be retried.' }, 400);
        return json({ ok: true, step: await runGeoJobs({ until: Date.now() + 1_000, schedule: false }) });
      }
      case 'apply':
      case 'dismiss':
        return json({ ok: true, suggestion: await decideSuggestion(String(body.id || ''), body.action, who) });
      case 'add-prompt': {
        const prompt = String(body.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 300);
        if (prompt.length < 8) return json({ error: 'Type the question as a customer would ask it.' }, 400);
        const { error } = await db.from('geo_prompts').insert({ prompt });
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }
      case 'toggle-prompt': {
        const { error } = await db.from('geo_prompts').update({ active: body.active === true }).eq('id', String(body.id || ''));
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }
      case 'delete-prompt': {
        const { error } = await db.from('geo_prompts').delete().eq('id', String(body.id || ''));
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }
      case 'settings': {
        const s = (body.settings ?? {}) as Record<string, unknown>;
        return json({
          ok: true,
          settings: await saveGeoSettings({
            ...(s.everyDays !== undefined ? { everyDays: Number(s.everyDays) } : {}),
            ...(s.autoMeta !== undefined ? { autoMeta: s.autoMeta === true } : {}),
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
