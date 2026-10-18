import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { isSqlFile, readSql } from '@/lib/setup-files';

export const dynamic = 'force-dynamic';

/** ?name=crm.sql → the SQL as text, for the "Copy SQL" button (admins only). */
export async function GET(req: Request) {
  const { profile } = await getSessionProfile();
  if (profile?.role !== 'admin' || profile.status !== 'approved') return new NextResponse('unauthorized', { status: 401 });
  const name = new URL(req.url).searchParams.get('name') || '';
  if (!isSqlFile(name)) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(await readSql(name), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
