import 'server-only';
import { NextResponse } from 'next/server';
import { getPortalSub } from './session';
import type { SubcontractorRow } from './types';

export function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Same-origin check for state-changing portal calls (defence in depth on top of
 * the SameSite=Lax session cookie): a browser always sends Origin on POST/DELETE.
 */
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Resolve the signed-in subcontractor from the session cookie and parse the JSON body. */
export async function portalRequest<T = Record<string, unknown>>(
  req: Request
): Promise<{ sub: SubcontractorRow; body: T } | { error: NextResponse }> {
  if (req.method !== 'GET' && !sameOrigin(req)) return { error: jsonError('Forbidden', 403) };
  const sub = await getPortalSub();
  if (!sub) return { error: jsonError('Your session has ended — please sign in again.', 401) };
  let body = {} as T;
  if (req.method !== 'GET') {
    try {
      body = (await req.json()) as T;
    } catch {
      return { error: jsonError('Invalid request') };
    }
  }
  return { sub, body };
}

export function str(v: unknown, max = 300) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
