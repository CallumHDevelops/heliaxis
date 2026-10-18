/** The customer's progress tracker (portal + CRM). Pure, so it works on server and client. */
import { STAGE_KEYS } from './stages';

export type TrackerProject = {
  stage: string;
  created_at: string;
  survey_at: string | null;
  install_at: string | null;
  dno_status: string | null;
  dno_submitted_at: string | null;
  dno_approved_at: string | null;
  accepted_at: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  stage_changed_at: string | null;
  products: string[];
};

export type TrackerStep = { key: string; label: string; state: 'done' | 'current' | 'upcoming'; date?: string | null; note?: string };

const at = (stage: string) => STAGE_KEYS.indexOf(stage as (typeof STAGE_KEYS)[number]);

export function buildTracker(p: TrackerProject): TrackerStep[] {
  if (p.stage === 'lost') return [];
  const i = at(p.stage);
  const past = (k: string) => i >= at(k);
  const needsDno = p.dno_status !== 'not_required' && p.products.some((x) => ['solar', 'battery', 'heatpump', 'ev'].includes(x));
  const steps: TrackerStep[] = [
    { key: 'enquiry', label: 'Enquiry received', state: 'done', date: p.created_at },
    {
      key: 'survey',
      label: 'Survey',
      state: past('surveyed') ? 'done' : p.survey_at ? 'current' : 'upcoming',
      date: p.survey_at,
      note: !past('surveyed') && p.survey_at ? 'Booked' : undefined,
    },
    { key: 'quote', label: 'Your quote', state: past('quote_sent') ? (past('won') || p.accepted_at ? 'done' : 'current') : 'upcoming' },
    {
      key: 'order',
      label: 'Order confirmed',
      state: past('won') || p.accepted_at ? 'done' : 'upcoming',
      date: p.accepted_at,
      note: p.deposit_amount && !p.deposit_paid_at && (past('won') || p.accepted_at) ? 'Deposit due' : p.deposit_paid_at ? 'Deposit paid' : undefined,
    },
  ];
  if (needsDno) {
    steps.push({
      key: 'dno',
      label: 'Grid connection (DNO)',
      state: p.dno_status === 'approved' ? 'done' : p.dno_status === 'submitted' ? 'current' : 'upcoming',
      date: p.dno_status === 'approved' ? p.dno_approved_at : p.dno_submitted_at,
      note: p.dno_status === 'submitted' ? 'Applied — waiting for approval' : p.dno_status === 'rejected' ? 'We’re dealing with it' : undefined,
    });
  }
  steps.push(
    {
      key: 'install',
      label: 'Installation',
      state: past('complete') ? 'done' : p.stage === 'installing' || p.install_at ? 'current' : 'upcoming',
      date: p.install_at,
      note: p.stage === 'installing' ? 'In progress' : p.install_at && !past('installing') ? 'Booked' : undefined,
    },
    { key: 'handover', label: 'Handover & certificates', state: past('complete') ? 'done' : 'upcoming', date: past('complete') ? p.stage_changed_at : null }
  );
  // Only one "current": the first not-done step that's in play.
  let seen = false;
  for (const s of steps) {
    if (s.state === 'current') {
      if (seen) s.state = 'upcoming';
      seen = true;
    }
  }
  if (!seen) {
    const next = steps.find((s) => s.state === 'upcoming');
    if (next) next.state = 'current';
  }
  return steps;
}

/** "in 3 days" / "tomorrow" / "today". */
export function daysWord(n: number) {
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
}
