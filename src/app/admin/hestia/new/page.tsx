import { assistantConfigured } from '@/lib/assistant/run';
import { HestiaScreen } from '../HestiaScreen';
import { hestiaMetadata, hestiaSession, hestiaViewport } from '../session';

export const dynamic = 'force-dynamic';
export const metadata = hestiaMetadata;
export const viewport = hestiaViewport;

/**
 * A new conversation with Hestia, full-screen (heliaxis://hestia/new, the app shortcut and the widget).
 * ?voice=1: open with the mic on (heliaxis://hestia/new?voice=1, "Talk").
 */
export default async function HestiaNew({ searchParams }: { searchParams: Promise<{ voice?: string | string[] }> }) {
  const [{ firstName }, { voice }] = await Promise.all([hestiaSession(), searchParams]);
  return <HestiaScreen key="new" firstName={firstName} configured={assistantConfigured()} threadId={null} initial={[]} voice={voice === '1'} />;
}
