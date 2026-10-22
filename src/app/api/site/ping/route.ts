import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** The site app's signal check: a real answer from the server, never a cached one (navigator.onLine can't be trusted on a roof). */
export function GET() {
  return NextResponse.json({ ok: true, at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
