import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { callCostUsd, type Usage } from './costs';

/** Saves what one model call cost. Never throws: a missing table or a failed write must not stop a comment being handled. */
export async function recordUsage(kind: 'classify' | 'draft', model: string, usage: Usage | null | undefined) {
  if (!usage) return;
  try {
    await createAdminClient().from('social_usage').insert({
      kind,
      model,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
      cost_usd: callCostUsd(model, usage),
    });
  } catch {
    // best effort
  }
}
