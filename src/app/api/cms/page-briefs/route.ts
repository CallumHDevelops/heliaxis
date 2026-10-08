import { NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { PAGE_BRIEFS, GLOBAL_RULES } from '@/lib/cms/page-briefs';

export const dynamic = 'force-dynamic';

// Serve the bundled top-20 content briefs to the CMS "Bulk create pages" tool.
// Admin-only, read-only — the briefs are static data, not user content.
export async function GET() {
  const session = await requirePortal('cms');
  if (!session || session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(
    { briefs: PAGE_BRIEFS, rules: GLOBAL_RULES },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
