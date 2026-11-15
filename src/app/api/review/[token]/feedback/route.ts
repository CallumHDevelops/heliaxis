import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { notify } from '@/lib/notify';
import { readRequestByToken } from '@/lib/reviews/server';

export const dynamic = 'force-dynamic';

/** Private feedback from the review page: kept on the request, noted on the customer's record, and the person who asked is told. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const db = createAdminClient();
  const row = await readRequestByToken(db, (await params).token);
  if (!row) return NextResponse.json({ error: 'This link isn’t working any more.' }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { message?: string };
  const message = String(b.message ?? '').replace(/\r/g, '').trim().slice(0, 3000);
  if (message.length < 3) return NextResponse.json({ error: 'Write a few words first.' }, { status: 400 });
  await db.from('review_requests').update({ feedback: message, feedback_at: new Date().toISOString() }).eq('id', row.id);
  const { data: e } = await db.from('enquiries').select('name').eq('id', row.enquiry_id).maybeSingle();
  const { data: who } = await db.from('review_requests').select('sent_by').eq('id', row.id).maybeSingle();
  await logActivity({ enquiryId: row.enquiry_id, projectId: row.project_id, kind: 'note', body: `Private feedback after a review request: ${message}` }).catch(() => null);
  const to = (who as { sent_by?: string | null } | null)?.sent_by;
  if (to) await notify({ userId: to, kind: 'review', title: `Feedback from ${(e as { name?: string } | null)?.name ?? 'a customer'}`, body: message.slice(0, 140), href: `/admin/crm/${row.project_id ?? ''}`.replace(/\/$/, '') || '/admin/reviews', tag: `review-${row.id}` }).catch(() => null);
  return NextResponse.json({ ok: true });
}
