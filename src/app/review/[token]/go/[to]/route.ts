import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readRequestByToken, readReviewSettings } from '@/lib/reviews/server';

export const dynamic = 'force-dynamic';

/** The Google or Trustpilot button: notes that it was pressed (not what they write there) and sends them on. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; to: string }> }) {
  const { token, to } = await params;
  const db = createAdminClient();
  const row = await readRequestByToken(db, token);
  const back = new URL(`/review/${token}`, req.url);
  if (!row || (to !== 'google' && to !== 'trustpilot')) return NextResponse.redirect(back, 302);
  const s = await readReviewSettings(db);
  const url = to === 'google' ? s.googleUrl : s.trustpilotUrl;
  if (!url) return NextResponse.redirect(back, 302);
  const col = to === 'google' ? 'clicked_google_at' : 'clicked_trustpilot_at';
  if (!row[col as 'clicked_google_at']) await db.from('review_requests').update({ [col]: new Date().toISOString() }).eq('id', row.id);
  return NextResponse.redirect(url, 302);
}
