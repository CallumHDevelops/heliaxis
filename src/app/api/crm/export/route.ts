import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { productLabel, stageLabel } from '@/lib/crm/stages';
import { todayISO } from '@/lib/tasks';
import { ENQUIRY_STATUS_LABEL } from '@/lib/enquiries';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Row = Record<string, unknown>;

/**
 * One cell: always quoted. A cell starting = + - @ (or a tab or carriage return) gets a ' in front,
 * so Excel shows it as text instead of running it as a formula.
 */
function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** UTF-8 with a BOM (so Excel keeps £ signs and accents), CRLF line endings. */
const toCsv = (rows: unknown[][]) => `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;

const ukParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
/** "2026-10-19 14:30" (UK time): Excel reads it as a date and time. */
function ukDateTime(v: unknown): string {
  if (!v) return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(ukParts.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
const ukDate = (v: unknown) => ukDateTime(v).slice(0, 10);

function pounds(v: unknown): string {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return '';
  return n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

/** UK numbers as "07700 900123" (the space keeps Excel from dropping the 0); anything else as it was. */
function phone(v: unknown): string {
  const raw = String(v ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  const national = digits.startsWith('44') && digits.length === 12 ? `0${digits.slice(2)}` : digits.startsWith('0') && digits.length === 11 ? digits : null;
  return national ? `${national.slice(0, 5)} ${national.slice(5)}` : raw;
}

const DNO: Record<string, string> = {
  not_started: 'Not started',
  submitted: 'Applied, waiting',
  approved: 'Approved',
  rejected: 'Rejected or changes',
  not_required: 'Not needed',
};
const OPT_IN_SOURCE: Record<string, string> = {
  'website-form': 'website form',
  'booking-form': 'booking form',
  'meta-lead-form': 'Meta lead form',
  inbound: 'they messaged us',
  import: 'imported',
  'stop-reply': 'replied STOP',
};
function permission(e: Row): string {
  const source = String(e.whatsapp_opt_in_source || '');
  const how = source.startsWith('staff:') ? `ticked by ${source.slice(6)}` : OPT_IN_SOURCE[source] || '';
  if (e.whatsapp_opt_in === true) return how ? `Yes (${how})` : 'Yes';
  if (source === 'stop-reply') return 'No (replied STOP)';
  return 'Not recorded';
}

/** Every row of a table, 1,000 at a time (select('*'): newer columns may not exist yet). */
async function everything(table: 'enquiries' | 'crm_projects'): Promise<Row[]> {
  const db = createAdminClient();
  const out: Row[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db.from(table).select('*').order('created_at', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** Admin only: GET ?what=customers | projects → a CSV that opens in Excel. One row per customer or job. */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only an admin can export the CRM.' }, 403);
  const what = new URL(req.url).searchParams.get('what');
  if (what !== 'customers' && what !== 'projects') return json({ error: 'Choose customers or projects.' }, 400);

  let rows: unknown[][];
  try {
    const [customers, jobs] = await Promise.all([everything('enquiries'), everything('crm_projects')]);
    if (what === 'customers') {
      const count = new Map<string, number>();
      for (const p of jobs) count.set(String(p.enquiry_id), (count.get(String(p.enquiry_id)) ?? 0) + 1);
      rows = [
        ['Name', 'Email', 'Phone', 'Postcode', 'Source', 'Status', 'WhatsApp permission', 'Permission date', 'Created', 'Number of projects'],
        ...customers.map((e) => [
          e.name,
          e.email,
          phone(e.phone),
          e.postcode,
          e.source,
          ENQUIRY_STATUS_LABEL[String(e.status) as keyof typeof ENQUIRY_STATUS_LABEL] ?? e.status,
          permission(e),
          ukDate(e.whatsapp_opt_in_at),
          ukDateTime(e.created_at),
          count.get(String(e.id)) ?? 0,
        ]),
      ];
    } else {
      const { data: people } = await createAdminClient().from('profiles').select('id, full_name, email');
      const person = new Map((people ?? []).map((x) => [x.id as string, (x.full_name || x.email || '') as string]));
      const customer = new Map(customers.map((e) => [String(e.id), e]));
      rows = [
        [
          'Ref',
          'Title',
          'Customer',
          'Stage',
          'Products',
          'Value',
          'Address',
          'Postcode',
          'Survey date',
          'Install date',
          'Install days',
          'Owner',
          'Accepted',
          'Deposit',
          'Deposit paid',
          'DNO status',
          'MCS number',
          'Created',
        ],
        ...jobs.map((p) => {
          const c = customer.get(String(p.enquiry_id));
          const paperwork = (p.paperwork ?? {}) as Row;
          return [
            p.project_ref,
            p.title,
            c?.name,
            stageLabel(String(p.stage)),
            (Array.isArray(p.products) ? (p.products as string[]) : []).map(productLabel).join(', '),
            pounds(p.value),
            p.address,
            p.postcode || c?.postcode,
            ukDateTime(p.survey_at),
            ukDateTime(p.install_at),
            p.install_at ? (p.install_days ?? 1) : '',
            p.owner_id ? person.get(String(p.owner_id)) : '',
            ukDateTime(p.accepted_at),
            pounds(p.deposit_amount),
            ukDate(p.deposit_paid_at),
            p.dno_status ? (DNO[String(p.dno_status)] ?? p.dno_status) : '',
            paperwork.mcs_cert_no,
            ukDateTime(p.created_at),
          ];
        }),
      ];
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Export failed' }, 500);
  }
  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="heliaxis-${what}-${todayISO()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
