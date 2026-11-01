import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { callCostUsd, type Usage } from '@/lib/social/costs';

export type AiFeature = 'proposal_read' | 'quote_intro' | 'quote_included' | 'mcs_read' | 'label_read' | 'blog' | 'assistant';

/** Saves what one model call cost (ai-usage.sql). Never throws: a missing table or a failed write must never stop the work itself. */
export async function recordAi(feature: AiFeature, model: string, usage: Usage | null | undefined, ref?: string | null) {
  if (!usage) return;
  try {
    await createAdminClient().from('ai_usage').insert({
      feature,
      ref: ref ?? null,
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
