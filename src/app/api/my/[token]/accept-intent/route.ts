import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { projectByToken, projectSigned } from '@/lib/crm/portal';
import { acceptIntent } from '@/lib/proposal/accept';
import { HOLD_MESSAGE } from '@/lib/proposal/messages';
import { holdAcceptance, loadViews, pendingSince, proposalSwitch } from '@/lib/proposal/server';

export const dynamic = 'force-dynamic';

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * The customer pressed Accept. Before the signature sheet opens, the proposal pack says whether the
 * contract is ready to sign (path 'sign') or the paperwork is still being finished (path 'hold': they
 * are thanked, and the Project Admins are given a task). Off unless PROPOSAL_PACK is "on" and
 * proposal-pack.sql has been run; and if anything here goes wrong the answer is 'sign', so a customer
 * who is able to sign is never stopped by it. This route signs nothing and takes no payment.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await projectByToken(token);
  if (!p) return json({ error: 'Not found' }, 404);
  try {
    const signed = await projectSigned(p);
    const sw = await proposalSwitch();
    const live = sw.on && sw.ready && !signed;
    const db = createAdminClient();
    const [views, pendingAt] = live ? await Promise.all([loadViews(db, p.id), pendingSince(db, p.id)]) : [[], null];
    const intent = acceptIntent({ on: sw.on, ready: sw.ready, signed, pendingAt, views });
    if (intent.kind === 'signed') return json({ path: 'signed' });
    if (intent.kind === 'sign') return json({ path: 'sign' });
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
    const { data: e } = await db.from('enquiries').select('name').eq('id', p.enquiry_id).maybeSingle();
    const held = await holdAcceptance(db, { id: p.id, enquiry_id: p.enquiry_id, owner_id: (p.owner_id as string | null) ?? null, title: p.title }, { ip, views, customer: (e?.name as string | undefined) ?? '' });
    after(held.alert);
    return json({ path: 'hold', message: HOLD_MESSAGE });
  } catch {
    return json({ path: 'sign' });
  }
}
