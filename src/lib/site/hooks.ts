import 'server-only';
import type { AssignmentRow, Db } from './server';
import type { Flag } from './types';

/**
 * What the server does as a trade's answers and sign-offs arrive, per form. The forms engine
 * (forms/index.ts and rules.ts) plugs in here: which keys stay open after a sign-off, and the flags
 * the answers raise. Electrician paperwork (Unit 2) and the EIC (Unit 3) add theirs the same way.
 */

/** Answer keys and photo slots that still take changes after this assignment's sign-off. */
export const lateKeysFor: (db: Db, a: AssignmentRow) => Promise<string[]> = async () => [];

/** Work out the flags again from what the server holds, store them, and tell the office about new urgent ones. */
export const afterAnswers: (db: Db, a: AssignmentRow) => Promise<Flag[]> = async (_db, a) => a.flags;

/** A photo has arrived: label and data-badge photos are read when it asks (1G). */
export const afterPhoto: (db: Db, a: AssignmentRow, photo: { id: string; slot: string; read: boolean }) => Promise<void> = async () => {};
