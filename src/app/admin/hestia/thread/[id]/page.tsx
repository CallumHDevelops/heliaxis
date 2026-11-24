import { notFound } from 'next/navigation';
import { assistantConfigured, type Msg } from '@/lib/assistant/run';
import { visible } from '@/lib/assistant/visible';
import { isUuid } from '@/lib/crm/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { HestiaScreen } from '../../HestiaScreen';
import { hestiaMetadata, hestiaSession, hestiaViewport } from '../../session';

export const dynamic = 'force-dynamic';
export const metadata = hestiaMetadata;
export const viewport = hestiaViewport;

/** One of your conversations with Hestia, to carry on (heliaxis://hestia/thread/{id}). Only ever your own. */
export default async function HestiaThread({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ voice?: string | string[] }> }) {
  const [{ session, firstName }, { id }, { voice }] = await Promise.all([hestiaSession(), params, searchParams]);
  if (!isUuid(id)) notFound();
  const { data } = await createAdminClient().from('assistant_threads').select('id, messages').eq('id', id).eq('user_id', session.user.id).maybeSingle();
  if (!data) notFound();
  return (
    <HestiaScreen
      key={id}
      firstName={firstName}
      configured={assistantConfigured()}
      threadId={id}
      initial={visible((data.messages ?? []) as Msg[])}
      voice={voice === '1'}
    />
  );
}
