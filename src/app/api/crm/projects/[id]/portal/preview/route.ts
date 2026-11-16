import { NextResponse } from 'next/server';
import { crmSession, ensurePortalToken, isUuid } from '@/lib/crm/server';
import { PORTAL_CLOSED_MSG } from '@/lib/crm/stages';
import { PREVIEW_COOKIE, PREVIEW_SECONDS } from '@/lib/crm/portal-preview';

export const dynamic = 'force-dynamic';

const page = (text: string, back: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Customer portal</title><body style="font:16px system-ui;max-width:32rem;margin:15vh auto;padding:0 1rem"><p>${text}</p><p><a href="${back}">Back to the job</a></p>`,
    { status: 409, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );

/** "View as customer": opens their portal (the quote page, or the full portal) as a read-only staff preview. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return NextResponse.redirect(new URL('/login', req.url));
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse('Not found', { status: 404 });
  const token = await ensurePortalToken(id);
  if (!token) return page(PORTAL_CLOSED_MSG, `/admin/crm/${id}`);
  const res = NextResponse.redirect(new URL(`/my/${token}`, req.url));
  res.cookies.set(PREVIEW_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: PREVIEW_SECONDS });
  return res;
}
