import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { distanceM, inUk, mapsUrl, metresWords } from '@/lib/booking/location';
import { locationView } from '@/lib/booking/location-server';
import { pushStaff } from '@/lib/booking/book';
import { syncProjectCalendar } from '@/lib/booking/calendar-sync';

export const dynamic = 'force-dynamic';

const hits = new Map<string, number[]>();
const tooMany = (key: string) => {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 30) return true;
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return false;
};

/** The customer confirms where we should come: { lat, lng } (the pin, moved or not). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (tooMany(token)) return NextResponse.json({ error: 'Please try again in a little while.' }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { lat?: unknown; lng?: unknown };
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!inUk(lat, lng)) return NextResponse.json({ error: 'That doesn’t look like a place in the UK.' }, { status: 400 });
  const v = await locationView(token);
  if (!v) return NextResponse.json({ error: 'This link has expired.' }, { status: 404 });
  const moved = Math.round(distanceM({ lat: v.lat, lng: v.lng }, { lat, lng }));
  // Nobody's house is 5 km from where we put the pin: that's a slip of the finger.
  if (moved > 5000) return NextResponse.json({ error: 'That is a long way from the address. Drag the pin closer, or call us.' }, { status: 400 });
  const db = createAdminClient();
  const at = new Date().toISOString();
  // The newer columns come with location-confirm.sql: without them the point is still saved.
  let r = await db.from('crm_projects').update({ site_lat: lat, site_lng: lng, location_confirmed_at: at, location_moved_m: moved }).eq('id', v.projectId);
  if (r.error) r = await db.from('crm_projects').update({ site_lat: lat, site_lng: lng }).eq('id', v.projectId);
  if (r.error) return NextResponse.json({ error: 'Couldn’t save that. Please call us.' }, { status: 500 });
  const link = mapsUrl({ lat, lng });
  const name = v.firstName || 'The customer';
  await logActivity({ enquiryId: v.enquiryId, projectId: v.projectId, kind: 'system', body: `📍 ${name} confirmed the pin${moved > 10 ? ` (moved it ${metresWords(moved)})` : ' (it was right)'}: ${link}` }).catch(() => null);
  after(async () => {
    await pushStaff({ projectId: v.projectId, title: `📍 ${name} confirmed the pin`, body: moved > 10 ? `Moved ${metresWords(moved)} from ours` : 'It was right', href: `/admin/crm/${v.projectId}`, tag: `pin-${v.projectId}` }).catch(() => null);
    await syncProjectCalendar(v.projectId).catch(() => null);
  });
  return NextResponse.json({ ok: true, moved });
}
