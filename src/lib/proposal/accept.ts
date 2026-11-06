/**
 * What pressing Accept does once the proposal pack is switched on. Pure, so the route, the portal and
 * the tests share one rule.
 *
 * The pack's accept check is OFF unless the PROPOSAL_PACK environment variable is "on" and
 * proposal-pack.sql has been run: until then Accept opens the signature sheet exactly as it always has.
 * Nothing in here can block a customer who is able to sign: when in doubt the answer is 'sign'.
 */
import { acceptPath, type ProposalView } from './slots';

export const proposalPackOn = (env: Record<string, string | undefined>) => (env.PROPOSAL_PACK ?? '').trim().toLowerCase() === 'on';

export type IntentInput = {
  /** The PROPOSAL_PACK switch. */
  on: boolean;
  /** proposal-pack.sql has been run. */
  ready: boolean;
  /** The customer has already signed (or the office marked the quote signed). */
  signed: boolean;
  /** When they last pressed Accept while the paperwork was unfinished (crm_projects.accepted_pending_at). */
  pendingAt: string | null;
  /** The job's pack, item by item. */
  views: ProposalView[];
};

export type Intent =
  /** Open the signature sheet. */
  | { kind: 'sign' }
  /** Nothing to do: they have already signed. */
  | { kind: 'signed' }
  /** The paperwork is unfinished: thank them, tell the Project Admins. `already`: they had been held before, so nobody is told twice. */
  | { kind: 'hold'; open: ProposalView[]; already: boolean };

export function acceptIntent(i: IntentInput): Intent {
  if (i.signed) return { kind: 'signed' };
  if (!i.on || !i.ready) return { kind: 'sign' };
  const r = acceptPath(i.views);
  // A pack finished since they were held: they can sign now.
  if (r.path === 'sign') return { kind: 'sign' };
  return { kind: 'hold', open: r.open, already: !!i.pendingAt };
}
