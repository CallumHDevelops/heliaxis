import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Hestia on her own (the app's launcher and shortcuts): a new conversation. Her history list comes here later. */
export default function HestiaHome() {
  redirect('/admin/hestia/new');
}
