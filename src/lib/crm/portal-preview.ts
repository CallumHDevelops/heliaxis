import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Staff looking at a customer's portal ("View as customer"). The preview route sets this cookie (holding the job's id) for half an
 * hour; while it's there the portal's API refuses everything that would send, sign, pay or record a view as the customer, and the page
 * shows a banner. The cookie only ever turns things OFF, so it can't be used to do anything extra.
 */
export const PREVIEW_COOKIE = 'hx_portal_preview';
export const PREVIEW_SECONDS = 30 * 60;
export const PREVIEW_MESSAGE = 'You’re looking at the portal as a member of staff, so nothing is sent, signed or paid from here.';

/** The job being previewed, if this browser is in preview. */
export async function previewJob(): Promise<string | null> {
  const v = (await cookies()).get(PREVIEW_COOKIE)?.value ?? '';
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

/** For the portal's POST routes: a response if this is a staff preview (nothing is done), else null. `quiet`: a 204, for the page's own tracking. */
export async function previewBlocked(quiet = false): Promise<NextResponse | null> {
  if (!(await previewJob())) return null;
  return quiet ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: PREVIEW_MESSAGE, preview: true }, { status: 403 });
}
