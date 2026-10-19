/**
 * The one main button a job's header shows, and the matching tile in the + sheet, by stage (research
 * 2.6). The screens decide what each action does; this only says which one and what it's called.
 *
 * Pure (no imports), so scripts/test-projects.mjs loads it straight into node.
 */

export type ActionKey =
  | 'mark_contacted'
  | 'booking_link'
  | 'start_survey'
  | 'find_time'
  | 'send_quote'
  | 'chase_quote'
  | 'mark_won'
  | 'move_next'
  | 'install_dates'
  | 'upload_certificate'
  | 'ask_review'
  | 'reopen';

export type PrimaryAction = {
  action: ActionKey;
  label: string;
  /** move_next: the stage it moves to. */
  to?: string;
  /** Ask this first (moving on with key checklist items not done). */
  confirm?: string;
  /** Other actions in the button's menu. */
  menu: { action: ActionKey; label: string }[];
  /** The stage's tile in the + sheet, if it has one. */
  tile: { action: ActionKey; label: string } | null;
};

/** Project stages in order, with their staff names. Keep in step with STAGES in src/lib/crm/stages.ts (test-projects.mjs checks it). */
const DELIVERY: [string, string][] = [
  ['won', 'Won'],
  ['design', 'Design & approvals'],
  ['ready', 'Ready to book'],
  ['install_booked', 'Install booked'],
  ['installing', 'Installing'],
  ['commissioning', 'Commissioning'],
  ['handover', 'Paperwork & handover'],
  ['complete', 'Complete'],
];

/** The stage after this one on the delivery side (handover → complete), or null. */
export function nextDeliveryStage(stage: string): { key: string; label: string } | null {
  const i = DELIVERY.findIndex(([k]) => k === stage);
  if (i < 0 || i >= DELIVERY.length - 1) return null;
  const [key, label] = DELIVERY[i + 1];
  return { key, label };
}

const tile = (action: ActionKey, label: string) => ({ action, label });

/**
 * `surveyDay`: the survey's UK date (YYYY-MM-DD), so "Start survey" shows on the day. `today`: UK date.
 * `keyMissing`: key checklist items not done at the current stage (stageProgress).
 */
export function primaryActionFor(stage: string, p: { surveyDay?: string | null; today?: string | null; keyMissing?: number } = {}): PrimaryAction {
  const plural = (n: number) => `${n} key item${n === 1 ? '' : 's'}`;
  switch (stage) {
    case 'lead':
      return { action: 'mark_contacted', label: 'Mark contacted', menu: [], tile: tile('booking_link', 'Send booking link') };
    case 'contacted':
      return { action: 'booking_link', label: 'Send booking link', menu: [], tile: tile('booking_link', 'Send booking link') };
    case 'survey_booked': {
      const onTheDay = !!p.surveyDay && !!p.today && p.surveyDay === p.today;
      return onTheDay
        ? { action: 'start_survey', label: 'Start survey', menu: [{ action: 'find_time', label: 'Find a time' }], tile: tile('start_survey', 'Start survey') }
        : { action: 'find_time', label: 'Find a time', menu: [], tile: tile('start_survey', 'Start survey') };
    }
    case 'surveyed':
      return { action: 'send_quote', label: 'Send quote for signing', menu: [], tile: tile('send_quote', 'Send quote for signing') };
    case 'quote_sent':
      return { action: 'chase_quote', label: 'Chase quote', menu: [{ action: 'mark_won', label: 'Mark Won' }], tile: tile('chase_quote', 'Chase quote') };
    case 'complete':
      return { action: 'ask_review', label: 'Ask for a review', menu: [], tile: tile('upload_certificate', 'Upload certificate') };
    case 'lost':
      return { action: 'reopen', label: 'Reopen', menu: [], tile: null };
  }
  const next = nextDeliveryStage(stage);
  if (!next) return { action: 'reopen', label: 'Reopen', menu: [], tile: null };
  const missing = Math.max(0, Math.trunc(p.keyMissing ?? 0));
  const deliveryTile =
    stage === 'won' || stage === 'ready'
      ? tile('install_dates', 'Add install dates')
      : stage === 'commissioning' || stage === 'handover'
        ? tile('upload_certificate', 'Upload certificate')
        : null;
  return {
    action: 'move_next',
    to: next.key,
    label: missing ? `Move to ${next.label} anyway · ${plural(missing)} not done` : `Move to ${next.label} →`,
    ...(missing ? { confirm: `${plural(missing)} ${missing === 1 ? 'isn’t' : 'aren’t'} done yet. Move to ${next.label} anyway?` } : {}),
    menu: [],
    tile: deliveryTile,
  };
}
