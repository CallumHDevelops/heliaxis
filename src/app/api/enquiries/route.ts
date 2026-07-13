import { NextRequest, NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ENQUIRY_STATUSES,
  enrichLeadsWithGeo,
  labelToDbStatus,
  rowToCrmLead,
  type EnquiryRow,
} from '@/lib/enquiries';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  const session = await requireApproved();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('enquiries')
    .select('id, name, email, phone, postcode, interest, property_type, source, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  const rows = (data ?? []) as EnquiryRow[];
  const leads = await enrichLeadsWithGeo(rows.map(rowToCrmLead));
  return NextResponse.json({ items: rows, leads }, { headers: NO_STORE });
}

export async function PATCH(req: NextRequest) {
  const session = await requireApproved();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const body = await req.json().catch(() => null);
  const id = String(body?.id || '').trim();
  const rawStatus = String(body?.status || '').trim();
  const status =
    labelToDbStatus(rawStatus) ||
    ((ENQUIRY_STATUSES as readonly string[]).includes(rawStatus.toLowerCase())
      ? (rawStatus.toLowerCase() as (typeof ENQUIRY_STATUSES)[number])
      : null);

  if (!id || !status) {
    return NextResponse.json({ error: 'id and valid status required' }, { status: 400, headers: NO_STORE });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('enquiries').update({ status }).eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true, status }, { headers: NO_STORE });
}
