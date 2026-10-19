import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { canAccess } from '@/lib/portals';
import { msConfigured, mailbox, testCalendar } from '@/lib/ms365';
import { schemaReady } from '@/lib/schema-ready';
import { getBookingSettings, saveBookingSettings } from '@/lib/booking/settings-server';
import { googleKey, googleUsageToday, pickProvider } from '@/lib/booking/travel';
import { readBody, turnstileOn } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/** Booking settings, the team, and what's connected. */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const [settings, ready, { data: people }, googleUsed] = await Promise.all([
    getBookingSettings({ fresh: true }),
    schemaReady(),
    createAdminClient().from('profiles').select('*').eq('status', 'approved'),
    googleUsageToday(),
  ]);
  return json({
    settings,
    ready: ready.booking,
    team: (people ?? []).filter((p) => canAccess(p, 'crm')).map((p) => ({ id: p.id, name: p.full_name || p.email, email: p.email })),
    connected: {
      outlook: msConfigured(),
      mailbox: msConfigured() ? mailbox() : null,
      provider: pickProvider(settings).name,
      googleKey: !!googleKey(),
      googleUsedToday: googleUsed,
      turnstile: turnstileOn(),
    },
  });
}

/** Admins only. Sections not sent keep their current values (Advanced is merged key by key). */
export async function PUT(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only admins can change survey booking settings.' }, 403);
  const current = await getBookingSettings({ fresh: true });
  const body = await readBody(req);
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  try {
    const settings = await saveBookingSettings({
      ...current,
      ...body,
      durations: { ...current.durations, ...obj(body.durations) },
      advanced: { ...current.advanced, ...obj(body.advanced) },
    });
    return json({ settings });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Not saved' }, 500);
  }
}

/** { action: 'test' }: can the CRM read each surveyor's calendar (and the install calendar)? */
export async function POST(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const body = await readBody(req);
  if (body.action !== 'test') return json({ error: 'Unknown action' }, 400);
  const settings = await getBookingSettings({ fresh: true });
  const boxes = [...new Set([...settings.surveyors.map((x) => x.key), (settings.advanced.installMailbox || mailbox()).toLowerCase()].filter(Boolean))];
  const results = [];
  for (const box of boxes) results.push({ mailbox: box, ...(await testCalendar(box)) });
  return json({ results });
}
