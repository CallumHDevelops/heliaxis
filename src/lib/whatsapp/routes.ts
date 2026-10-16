import 'server-only';
import { NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';

/** Shared bits for /api/whatsapp/* — all of it is behind the Enquiries portal. */
export const NO_STORE = { 'Cache-Control': 'no-store' };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
export const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export async function session() {
  return requirePortal('enquiries');
}
