import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { isSqlFile, readSql } from '@/lib/setup-files';

export const dynamic = 'force-dynamic';

/**
 * ?name=crm.sql → the SQL as text, for the "Copy SQL" button. Any approved user: an admin can pass
 * a SQL to-do to a member.
 */
export async function GET(req: Request) {
  if (!(await requireApproved())) return new NextResponse('unauthorized', { status: 401 });
  const name = new URL(req.url).searchParams.get('name') || '';
  if (!isSqlFile(name)) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(await readSql(name), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
