import { NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { checkSaved } from '@/lib/cms/checks-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

/** The page checks for everything saved in the editor right now: every page, its errors and warnings, and which pages would block Publish. */
export async function GET() {
  const session = await requirePortal('cms');
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  const r = await checkSaved();
  return NextResponse.json({ errors: r.errors, warnings: r.warnings, blocking: r.blocking.length, pages: r.pages }, { headers: NO_STORE });
}
