import { NextResponse } from 'next/server';
import { endSession } from '@/lib/subcontractors/session';
import { jsonError, sameOrigin } from '@/lib/subcontractors/portal-request';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError('Forbidden', 403);
  await endSession();
  return NextResponse.json({ ok: true });
}
