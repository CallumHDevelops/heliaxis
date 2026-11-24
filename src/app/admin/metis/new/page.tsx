import { assistantConfigured } from '@/lib/assistant/run';
import { MetisScreen } from '../MetisScreen';
import { metisMetadata, metisSession, metisViewport } from '../session';

export const dynamic = 'force-dynamic';
export const metadata = metisMetadata;
export const viewport = metisViewport;

/**
 * A new conversation with Metis, full-screen (heliaxis://metis/new, the app shortcut and the widget).
 * ?voice=1: open with the mic on (heliaxis://metis/new?voice=1, "Talk").
 */
export default async function MetisNew({ searchParams }: { searchParams: Promise<{ voice?: string | string[] }> }) {
  const [{ firstName }, { voice }] = await Promise.all([metisSession(), searchParams]);
  return <MetisScreen key="new" firstName={firstName} configured={assistantConfigured()} threadId={null} initial={[]} voice={voice === '1'} />;
}
