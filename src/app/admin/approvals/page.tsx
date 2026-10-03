import { redirect } from 'next/navigation';

/** Approvals now live on the Users page (status + role + portal access). */
export default function ApprovalsRedirect() {
  redirect('/admin/users');
}
