/**
 * Who is told when the proposal pack needs finishing. Pure.
 *
 * Project Admins (the tick in /admin/users, profiles.project_admin) are told. Until anyone is
 * ticked, or before proposal-pack.sql has run, it is the job's owner and the admins, so a
 * held acceptance is never left with nobody looking at it.
 */
export type Person = { id: string; status?: string | null; role?: string | null; project_admin?: boolean | null };

const approved = (p: Person) => p.status === 'approved';

export function taskRecipients(people: Person[], ownerId: string | null): string[] {
  const live = people.filter(approved);
  const projectAdmins = live.filter((p) => p.project_admin === true).map((p) => p.id);
  if (projectAdmins.length) return projectAdmins;
  const owner = ownerId && live.some((p) => p.id === ownerId) ? [ownerId] : [];
  return [...new Set([...owner, ...live.filter((p) => p.role === 'admin').map((p) => p.id)])];
}

/** The one person the task is assigned to: the owner when they are among the recipients, else the first. Others are still alerted. */
export function taskAssignee(recipients: string[], ownerId: string | null): string | null {
  if (ownerId && recipients.includes(ownerId)) return ownerId;
  return recipients[0] ?? null;
}
