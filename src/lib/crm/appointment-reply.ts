/**
 * A customer's reply about an appointment that is coming up: are they confirming it, cancelling it or asking to move it?
 * Pure, so it can be tested; src/lib/crm/appointment-alert.ts decides when it matters (an appointment within the next
 * three days) and tells the team. Nothing here ever changes the diary.
 */
export type AppointmentIntent = 'confirm' | 'cancel' | 'move';

const norm = (t: string) => t.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

const CANCEL = /\b(cancel|call (it|this) off|no longer (need|want|require)|won't be (needing|going ahead)|don't (need|want) (it|the survey|you) (any ?more|now)|not (going ahead|proceeding))\b/;
const MOVE = /\b(re-?schedul\w*|move (it|this|the|our)|change (it|the|our) (time|date|day|appointment)|(can|could) (we|you|it) (do|make|go|move|change)\b.*\b(another|different|later|earlier|instead|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)|(can't|cannot|can not|won't be able to|unable to|not able to) (make|do|be (in|there|home|here))|something('s| has) come up|another (day|time)|different (day|time)|put (it )?back|postpone)\b/;
const CONFIRM = /^(yes|yep|yeah|yup|ok|okay|great|perfect|lovely|brilliant|fine|sure|thanks|thank you|cheers|that's? (fine|great|perfect|good)|sounds good|see you (then|there|soon)|confirmed?|all good|no problem|will do)\b[\s\S]{0,60}$/;

export function appointmentIntent(body: string): AppointmentIntent | null {
  const t = norm(body);
  if (!t) return null;
  if (CANCEL.test(t)) return 'cancel';
  if (MOVE.test(t)) return 'move';
  if (t.length <= 80 && CONFIRM.test(t)) return 'confirm';
  return null;
}

export const INTENT_WORDS: Record<AppointmentIntent, string> = {
  confirm: 'looks like they are confirming',
  cancel: 'looks like they want to cancel',
  move: 'looks like they want to move it',
};
