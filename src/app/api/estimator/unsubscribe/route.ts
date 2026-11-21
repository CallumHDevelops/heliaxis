import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { REFERENCE_PATTERN } from '@/lib/estimator/quote-input';
import { validUnsubscribe } from '@/lib/estimator/unsubscribe';

export const dynamic = 'force-dynamic';

const page = (title: string, body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;background:#F7F2E7;color:#211F18;margin:0;padding:48px 20px"><main style="max-width:520px;margin:0 auto;background:#FFFDF8;border:1px solid #D9D4CA;padding:28px"><h1 style="font-size:22px;margin:0 0 12px">${title}</h1><p style="line-height:1.6;margin:0">${body}</p></main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

/** The unsubscribe link in estimator emails: stops the follow-ups about their quote and similar products. The quote itself, already sent, is not affected. */
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('r') ?? '';
  const token = req.nextUrl.searchParams.get('t') ?? '';
  if (!REFERENCE_PATTERN.test(ref) || !validUnsubscribe(ref, token)) return page('That link did not work', 'Please reply to any email from us and we will stop the follow-ups straight away, or call 01633 965205.', 400);
  const db = createAdminClient();
  const { data } = await db.from('estimator_quotes').select('id, consent').eq('reference', ref).maybeSingle();
  if (data) {
    const consent = { ...((data.consent as Record<string, unknown>) ?? {}), emailFollowUps: false, whatsappMarketing: false, unsubscribedAt: new Date().toISOString() };
    await db.from('estimator_quotes').update({ consent }).eq('id', data.id);
  }
  return page('You are unsubscribed', 'We will not send you any more follow-ups about your quote. If you change your mind, just get in touch.');
}
