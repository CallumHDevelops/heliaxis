import { NextRequest, NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { getHelpIndexFile } from '@/lib/help/server';

export const dynamic = 'force-dynamic';

/**
 * The index the search box on Help's home searches (src/app/admin/help/HelpSearch.tsx), fetched the first
 * time the box is used rather than sent with every visit to Help. Any approved user. Asked for with the
 * content's version (?v=), so the browser keeps it until the articles change; asked for with any other
 * version (a page from before a change), it's sent but not kept.
 */
export async function GET(req: NextRequest) {
  if (!(await requireApproved())) return NextResponse.json({ error: 'Sign in to use Help.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const { json, version } = getHelpIndexFile();
  const etag = `"${version}"`;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ETag: etag,
    'Cache-Control': req.nextUrl.searchParams.get('v') === version ? 'private, max-age=31536000, immutable' : 'private, no-cache',
  };
  if ((req.headers.get('if-none-match') ?? '').split(/\s*,\s*/).includes(etag)) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(json, { headers });
}
