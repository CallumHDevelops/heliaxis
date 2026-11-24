import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Metis on her own (the app's launcher and shortcuts): a new conversation. Her history list comes here later. */
export default function MetisHome() {
  redirect('/admin/metis/new');
}
