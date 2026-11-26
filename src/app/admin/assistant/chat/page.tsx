import type { Metadata } from 'next';
import { getSessionProfile } from '@/lib/auth';
import { AssistantView } from '../AssistantView';
import '@/components/admin/admin-shell.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Metis',
  robots: { index: false, follow: false },
};

/**
 * Metis on her own: just the chat, no menus, for the Metis app (android/metis opens this page).
 * Signed in like the rest of /admin (the layout guards it).
 */
export default async function MetisChatPage() {
  const { profile } = await getSessionProfile();
  const firstName = (profile?.full_name || profile?.email || '').split(/[\s@]/)[0];
  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AssistantView firstName={firstName} initialText="" />
    </main>
  );
}
