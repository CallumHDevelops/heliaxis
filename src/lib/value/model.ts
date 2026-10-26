/**
 * The Added value (HAP overview) maths. Pure: no I/O. Counts come from the database (measured); the minutes
 * each event saves, hourly cost and the platform's running costs are assumptions an admin can change. The
 * page labels which is which, so a number is never presented as more certain than it is.
 */

export type BenefitKey =
  | 'smart_replies'
  | 'auto_messages'
  | 'online_bookings'
  | 'booking_reminders'
  | 'leads_captured'
  | 'emails_logged'
  | 'metis_drafts'
  | 'sub_chasers'
  | 'handover_packs'
  | 'purchase_orders'
  | 'site_returns'
  | 'social_triage'
  | 'social_replies'
  | 'social_monitoring';

export type BenefitDef = { key: BenefitKey; area: string; label: string; unit: string; why: string };

/** Everything the platform does that saves someone's time, and what one event replaces. */
export const BENEFITS: BenefitDef[] = [
  { key: 'smart_replies', area: 'WhatsApp', label: 'Instant smart replies', unit: 'replies', why: 'Answered while nobody was at a screen, instead of waiting for someone to pick it up.' },
  { key: 'auto_messages', area: 'WhatsApp', label: 'Reminders and chasers sent automatically', unit: 'messages', why: 'Survey reminders, install reminders, review requests and follow-ups nobody had to remember to send.' },
  { key: 'leads_captured', area: 'Leads', label: 'Enquiries captured without typing', unit: 'enquiries', why: 'Website, quote form and Meta lead ads go straight into one customer record.' },
  { key: 'online_bookings', area: 'Surveys', label: 'Surveys booked online by the customer', unit: 'bookings', why: 'No phone tag, no diary check, no travel-time sums, no Outlook entry.' },
  { key: 'booking_reminders', area: 'Surveys', label: 'Survey reminders sent automatically', unit: 'reminders', why: 'Fewer no-shows and no one making reminder calls.' },
  { key: 'emails_logged', area: 'CRM', label: 'Emails filed on the customer record', unit: 'emails', why: 'Sent and received emails appear on the customer timeline without copying them across.' },
  { key: 'metis_drafts', area: 'Metis', label: 'Emails and messages drafted by Metis', unit: 'drafts', why: 'A first draft in seconds instead of writing from scratch.' },
  { key: 'sub_chasers', area: 'Subcontractors', label: 'Document and notice chasers sent automatically', unit: 'chasers', why: 'Expiring certificates and notices chased without a person keeping a list.' },
  { key: 'handover_packs', area: 'Handover', label: 'Handover packs built', unit: 'packs', why: 'Photos, certificates and documents gathered and packaged for the customer automatically.' },
  { key: 'purchase_orders', area: 'Purchasing', label: 'Purchase orders raised', unit: 'orders', why: 'Raised, sent to the supplier and tracked in one place.' },
  { key: 'site_returns', area: 'Site app', label: 'Site returns and snags tracked', unit: 'returns', why: 'Snags reported from the phone, chased and signed off without paperwork.' },
  { key: 'social_triage', area: 'Social monitoring', label: 'Comments and reviews triaged automatically', unit: 'comments', why: 'Each is read, classified and risk-scored for you. Anything risky gets an instant alert.' },
  { key: 'social_replies', area: 'Social monitoring', label: 'Suggested replies used', unit: 'replies', why: 'A checked, on-brand reply ready to review instead of writing one from scratch.' },
  { key: 'social_monitoring', area: 'Social monitoring', label: 'Not checking each platform by hand', unit: 'days', why: 'Nobody has to keep refreshing Facebook, Instagram, Trustpilot and Google to spot a problem.' },
];

/** Benefits that are real but cannot be priced from the data. Listed on the page, never added to the totals. */
export const QUALITATIVE: { title: string; text: string }[] = [
  { title: 'Faster response to new leads', text: 'New Meta leads alert the team straight away and are handed out in turn. Speed to first contact is one of the biggest drivers of whether a lead becomes a customer.' },
  { title: 'Safety comments caught within seconds', text: 'A comment about fire or a battery alerts everyone with access immediately, day or night. The cost of missing one is reputational and potentially legal.' },
  { title: 'One record per customer', text: 'WhatsApp, emails, surveys, documents, payments and notes live on one customer, so nobody asks a customer to repeat themselves and nothing is lost when someone is off.' },
  { title: 'Works offline on site', text: 'Surveys and site paperwork keep working with no signal and sync later.' },
  { title: 'Fewer dropped balls', text: 'Tasks, next steps and reminders push to phones, so follow-ups happen without a manual list.' },
  { title: 'Safer by design', text: 'Social replies are drafted from approved wording, checked by rules, approved by an admin where it matters, and never posted automatically.' },
  { title: 'Owned data and no per-seat fees', text: 'Adding a team member costs nothing extra, where most off-the-shelf CRMs and social tools charge per user per month.' },
  { title: 'Tailored to how Heliaxis works', text: 'Survey booking uses your real surveyors, diaries and travel times, and handover packs follow your own process.' },
];

export type Assumptions = {
  staff_hourly_cost_gbp: number;
  /** Minutes saved by ONE event of each benefit. */
  minutes: Record<BenefitKey, number>;
  /** Monthly running costs you pay for the platform, in pounds. */
  costs_gbp: Record<string, number>;
  /** Pence per WhatsApp template message sent (Meta's conversation fee). */
  whatsapp_template_pence: number;
  /** Estimated monthly cost of Metis (the assistant), which is not metered yet. */
  metis_monthly_gbp: number;
  usd_to_gbp: number;
  /** What you would pay for the off-the-shelf tools this replaces, per month. */
  replaced_tools_monthly_gbp: Record<string, number>;
};

export const DEFAULTS: Assumptions = {
  staff_hourly_cost_gbp: 20,
  minutes: {
    smart_replies: 1.5,
    auto_messages: 2,
    leads_captured: 3,
    online_bookings: 12,
    booking_reminders: 3,
    emails_logged: 0.5,
    metis_drafts: 5,
    sub_chasers: 3,
    handover_packs: 30,
    purchase_orders: 8,
    site_returns: 6,
    social_triage: 2,
    social_replies: 4.5,
    social_monitoring: 0,
  },
  costs_gbp: { 'Supabase (database)': 0, 'Vercel (hosting)': 0, 'Microsoft 365 (share used for the CRM)': 0, 'Other subscriptions': 0 },
  whatsapp_template_pence: 2,
  metis_monthly_gbp: 0,
  usd_to_gbp: 0.78,
  replaced_tools_monthly_gbp: { 'CRM (for example HubSpot or Pipedrive, per user)': 0, 'Booking and scheduling tool': 0, 'Social inbox tool': 0 },
};

/** Minutes per day spent checking each platform by hand, and the days in a working month. Only used for social_monitoring. */
export const MONITORING = { minutesPerDay: 20, daysPerMonth: 22 };

export type Counts = Partial<Record<BenefitKey, number | null>>;
export type MeasuredCosts = { socialAiUsd: number | null; templateMessages: number | null };

export type BenefitRow = BenefitDef & { count: number | null; minutesEach: number; hours: number; valueGbp: number };
export type CostRow = { label: string; gbp: number; measured: boolean };
export type ValueReport = {
  rows: BenefitRow[];
  costs: CostRow[];
  totalHours: number;
  timeValueGbp: number;
  runningCostGbp: number;
  netGbp: number;
  returnPerPound: number | null;
  replacedToolsGbp: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildValueReport(counts: Counts, measured: MeasuredCosts, a: Assumptions): ValueReport {
  const rows: BenefitRow[] = BENEFITS.map((b) => {
    // Checking each platform by hand is a flat monthly saving, not per event.
    const count = b.key === 'social_monitoring' ? (counts.social_triage != null ? MONITORING.daysPerMonth : null) : (counts[b.key] ?? null);
    const minutesEach = b.key === 'social_monitoring' ? MONITORING.minutesPerDay : a.minutes[b.key] ?? 0;
    const hours = count ? (count * minutesEach) / 60 : 0;
    return { ...b, count, minutesEach, hours: r2(hours), valueGbp: r2(hours * a.staff_hourly_cost_gbp) };
  });
  const totalHours = r2(rows.reduce((s, r) => s + r.hours, 0));
  const timeValueGbp = r2(totalHours * a.staff_hourly_cost_gbp);

  const costs: CostRow[] = [];
  if (measured.socialAiUsd != null) costs.push({ label: 'AI for social monitoring', gbp: r2(measured.socialAiUsd * a.usd_to_gbp), measured: true });
  if (measured.templateMessages != null) costs.push({ label: `WhatsApp template fees (${measured.templateMessages} sent)`, gbp: r2((measured.templateMessages * a.whatsapp_template_pence) / 100), measured: true });
  if (a.metis_monthly_gbp > 0) costs.push({ label: 'Metis assistant (estimated)', gbp: r2(a.metis_monthly_gbp), measured: false });
  for (const [label, gbp] of Object.entries(a.costs_gbp)) if (gbp > 0) costs.push({ label, gbp: r2(gbp), measured: false });
  const runningCostGbp = r2(costs.reduce((s, c) => s + c.gbp, 0));
  const replacedToolsGbp = r2(Object.values(a.replaced_tools_monthly_gbp).reduce((s, n) => s + (Number(n) || 0), 0));

  return {
    rows,
    costs,
    totalHours,
    timeValueGbp,
    runningCostGbp,
    netGbp: r2(timeValueGbp - runningCostGbp),
    returnPerPound: runningCostGbp > 0 ? Math.round((timeValueGbp / runningCostGbp) * 10) / 10 : null,
    replacedToolsGbp,
  };
}
