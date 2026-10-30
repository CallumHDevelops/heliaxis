import { NextResponse } from 'next/server';
import { projectByToken } from '@/lib/crm/portal';
import { recordQuoteEvent, TRACK_EVENTS, type TrackEvent } from '@/lib/crm/quote-track';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** The customer's page tells us a step was reached: { type }. Only a known step, only for a real link; always a quiet 204. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = (await req.json().catch(() => ({}))) as { type?: string };
  const type = (TRACK_EVENTS as readonly string[]).includes(String(b.type)) ? (b.type as TrackEvent) : null;
  const p = type ? await projectByToken(token) : null;
  if (p && type) {
    const { data } = await createAdminClient().from('crm_projects').select('owner_id, title').eq('id', p.id).maybeSingle();
    await recordQuoteEvent({ id: p.id, enquiry_id: p.enquiry_id, owner_id: (data?.owner_id as string | null) ?? p.owner_id, title: (data?.title as string) || p.title }, type).catch(() => null);
  }
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
