import { notFound } from 'next/navigation';
import { assistantConfigured, type Msg } from '@/lib/assistant/run';
import { visible } from '@/lib/assistant/visible';
import { isUuid } from '@/lib/crm/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MetisScreen } from '../../MetisScreen';
import { metisMetadata, metisSession, metisViewport } from '../../session';

export const dynamic = 'force-dynamic';
export const metadata = metisMetadata;
export const viewport = metisViewport;

/** One of your conversations with Metis, to carry on (heliaxis://metis/thread/{id}). Only ever your own. */
export default async function MetisThread({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ voice?: string | string[] }> }) {
  const [{ session, firstName }, { id }, { voice }] = await Promise.all([metisSession(), params, searchParams]);
  if (!isUuid(id)) notFound();
  const { data } = await createAdminClient().from('assistant_threads').select('id, messages').eq('id', id).eq('user_id', session.user.id).maybeSingle();
  if (!data) notFound();
  return (
    <MetisScreen
      key={id}
      firstName={firstName}
      configured={assistantConfigured()}
      threadId={id}
      initial={visible((data.messages ?? []) as Msg[])}
      voice={voice === '1'}
    />
  );
}
