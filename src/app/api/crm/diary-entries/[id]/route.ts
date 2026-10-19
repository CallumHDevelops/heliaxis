import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { msConfigured } from '@/lib/ms365';
import { entryFromInput, entryView, type EntryRow } from '@/lib/booking/diary';
import { getBookingSettings } from '@/lib/booking/settings-server';
import { readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

async function load(id: string): Promise<EntryRow | null> {
  const { data } = await createAdminClient().from('diary_entries').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  return (data as EntryRow | null) ?? null;
}

/** Change a diary entry (only the fields sent). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const current = await load(id);
  if (!current) return json({ error: 'Not found' }, 404);
  const next = await entryFromInput(await readBody(req), current, await getBookingSettings());
  if ('error' in next) return json({ error: next.error }, 400);
  const { data, error } = await createAdminClient().from('diary_entries').update(next.row).eq('id', id).select('*').single();
  if (error || !data) return json({ error: error?.message || 'Not saved' }, 500);
  return json({ entry: entryView(data as EntryRow) });
}

/**
 * Delete a diary entry. Once Outlook is connected (or if it has an Outlook copy) it's only marked
 * deleted: the sync removes the copy first, then the entry. Otherwise it goes straight away.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const current = await load(id);
  if (!current) return json({ ok: true });
  const db = createAdminClient();
  const { error } = current.outlook_event_id || msConfigured()
    ? await db.from('diary_entries').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    : await db.from('diary_entries').delete().eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
