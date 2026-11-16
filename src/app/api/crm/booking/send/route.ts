import { crmSession, isUuid, json } from '@/lib/crm/server';
import { sendSurveyLink, surveyLinkInfo } from '@/lib/booking/survey-link-send';
import { CHASE_CHOICES, emailParagraphs, smsWords, whatsappWords } from '@/lib/booking/survey-link-text';

export const dynamic = 'force-dynamic';

/** What can be sent for this job and how it will read: ?project_id= → { first, can, preview }. */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const id = new URL(req.url).searchParams.get('project_id') ?? '';
  if (!isUuid(id)) return json({ error: 'Pick a job first.' }, 400);
  const info = await surveyLinkInfo(id);
  if ('error' in info) return json({ error: info.error }, 409);
  const me = String(s.profile?.full_name ?? '').trim().split(/\s+/)[0] || 'Heliaxis';
  const w = { first: info.first, url: info.url, me };
  return json({ customer: info.customer, first: info.first, email: info.email, phone: info.phone, can: info.can, preview: { whatsapp: whatsappWords(w), sms: smsWords(w), email: emailParagraphs(w).slice(0, 2).join('\n\n') } });
}

/** Send it: { project_id, whatsapp?, sms?, email?, chase_days? } → { ok, lines }. */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = (await req.json().catch(() => ({}))) as { project_id?: string; whatsapp?: boolean; sms?: boolean; email?: boolean; chase_days?: number };
  if (!isUuid(String(b.project_id ?? ''))) return json({ error: 'Pick a job first.' }, 400);
  const chase = (CHASE_CHOICES as readonly number[]).includes(Number(b.chase_days)) ? Number(b.chase_days) : 0;
  const r = await sendSurveyLink({ projectId: b.project_id!, channels: { whatsapp: !!b.whatsapp, sms: !!b.sms, email: !!b.email }, by: { id: s.user.id, name: String(s.profile?.full_name ?? '') }, chaseDays: chase });
  return json(r, r.error && !r.lines.length ? 400 : 200);
}
