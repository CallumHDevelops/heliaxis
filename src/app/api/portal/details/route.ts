import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, logEvent } from '@/lib/subcontractors/server';
import { jsonError, portalRequest, str } from '@/lib/subcontractors/portal-request';
import { missingDetails, type SubDetails } from '@/lib/subcontractors/types';

const ENTITY = ['limited', 'sole_trader', 'partnership'] as const;
const CIS = ['gross', 'net', 'unregistered'] as const;

function clean(raw: Record<string, unknown>): SubDetails {
  const pick = <T extends string>(v: unknown, allowed: readonly T[]) =>
    allowed.includes(v as T) ? (v as T) : undefined;
  return {
    entityType: pick(raw.entityType, ENTITY),
    legalName: str(raw.legalName, 160),
    registeredAddress: str(raw.registeredAddress, 400),
    baseAddress: str(raw.baseAddress, 400),
    companyNumber: str(raw.companyNumber, 20).toUpperCase(),
    vatNumber: str(raw.vatNumber, 20).toUpperCase(),
    utr: str(raw.utr, 20).replace(/\s+/g, ''),
    cisStatus: pick(raw.cisStatus, CIS),
    cisNumber: str(raw.cisNumber, 40),
    noticesEmail: str(raw.noticesEmail, 160).toLowerCase(),
    accountsEmail: str(raw.accountsEmail, 160).toLowerCase(),
    primaryContact: str(raw.primaryContact, 120),
    phone: str(raw.phone, 40),
    bankAccountName: str(raw.bankAccountName, 120),
    sortCode: str(raw.sortCode, 10).replace(/\s+/g, ''),
    accountNumber: str(raw.accountNumber, 12).replace(/\s+/g, ''),
    employsStaff: typeof raw.employsStaff === 'boolean' ? raw.employsStaff : undefined,
    operatives: str(raw.operatives, 2000),
  };
}

export async function POST(req: Request) {
  const r = await portalRequest<{ token: string; details: Record<string, unknown> }>(req);
  if ('error' in r) return r.error;
  const { sub, body } = r;

  const admin = createAdminClient();
  const { count } = await admin
    .from('subcontractor_agreements')
    .select('id', { count: 'exact', head: true })
    .eq('subcontractor_id', sub.id);
  if (count) {
    return jsonError('Your agreement is signed, so these details are locked. Email Heliaxis to change them.', 409);
  }

  const details = clean(body.details || {});
  const complete = missingDetails(details).length === 0;
  const { error } = await admin
    .from('subcontractors')
    .update({
      details,
      details_completed_at: complete ? new Date().toISOString() : null,
      status: sub.status === 'invited' ? 'in_progress' : sub.status,
    })
    .eq('id', sub.id);
  if (error) return jsonError('Could not save your details — please try again.', 500);

  await logEvent(sub.id, 'subcontractor', 'details_saved', { complete }, clientIp(req.headers));
  return NextResponse.json({ ok: true, complete, missing: missingDetails(details) });
}
