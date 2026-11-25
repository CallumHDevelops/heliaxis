import { NextRequest, NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { readFacts, saveFacts } from '@/lib/cms/facts-server';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

/** The facts sheet. Anyone with the Website CMS access can read it (the editor and the builder do); only an admin can change it. */
export async function GET() {
  const session = await requirePortal('cms');
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  return NextResponse.json(await readFacts(), { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const session = await requirePortal('cms');
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.profile.role !== 'admin') return NextResponse.json({ error: 'Only an admin can change the facts sheet.' }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.facts !== 'object') return NextResponse.json({ error: 'facts required' }, { status: 400 });
  try {
    const facts = await saveFacts(body.facts, session.profile.full_name || session.profile.email || 'An admin');
    return NextResponse.json({ ok: true, facts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Couldn’t save the facts.' }, { status: 500 });
  }
}
