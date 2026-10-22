import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { projectByToken } from '@/lib/crm/portal';
import { portalHandover } from '@/lib/handover/portal';
import { customerSign, refreshHandover } from '@/lib/handover/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * The customer signs in their portal (SPEC 4.10, C2) when they didn't on the electrician's phone:
 * { kind: 'completion' | 'g98', name, signature, agree }. Only when the portal is offering that card; each
 * document gets its own signature (D15), and the first one counts. The completion record (or the
 * G98 data sheet) is made straight after, and goes into their pack.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await projectByToken(token);
  if (!p || p.mode !== 'full') return fail('Not found', 404);
  const b = await req.json().catch(() => ({}));
  const kind = b.kind === 'completion' || b.kind === 'g98' ? (b.kind as 'completion' | 'g98') : null;
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const sig = String(b.signature || '');
  if (!kind) return fail('Not found', 404);
  if (name.length < 3) return fail('Type your full name.', 400);
  if (!b.agree) return fail('Please tick to confirm.', 400);
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 600_000) return fail('Please sign in the box.', 400);
  const offered = (await portalHandover(p.id))?.signs.find((x) => x.kind === kind);
  if (!offered) return fail('This has already been signed.', 409);
  const db = createAdminClient();
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
  const r = await customerSign(db, p.id, { kind, name, signature: sig, declaration: offered.declaration, ip }).catch(() => null);
  if (!r) return fail('Could not save your signature. Please try again.', 500);
  if (r.again) return fail('This has already been signed.', 409);
  after(() => refreshHandover(db, p.id, { by: null }).then(() => null));
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
