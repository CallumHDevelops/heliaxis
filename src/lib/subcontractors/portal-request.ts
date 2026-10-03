import 'server-only';
import { NextResponse } from 'next/server';
import { findByToken } from './server';
import type { SubcontractorRow } from './types';

export function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Parse a portal JSON request and resolve its magic-link token to a subcontractor. */
export async function portalRequest<T extends { token?: string }>(
  req: Request
): Promise<{ sub: SubcontractorRow; body: T } | { error: NextResponse }> {
  let body: T;
  try {
    body = (await req.json()) as T;
  } catch {
    return { error: jsonError('Invalid request') };
  }
  const sub = await findByToken(body.token);
  if (!sub) return { error: jsonError('This link is no longer valid. Ask Heliaxis to send you a new one.', 401) };
  if (sub.status === 'terminated') return { error: jsonError('This account has been closed.', 403) };
  return { sub, body };
}

export function str(v: unknown, max = 300) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
