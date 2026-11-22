import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pickExamples, type Example } from './learning';

/** The approved examples most relevant to this question. Empty (never an error) if the table isn't there yet. */
export async function relevantExamples(db: SupabaseClient, question: string): Promise<Example[]> {
  try {
    const { data } = await db.from('hestia_answers').select('id, example_q, example_a').eq('status', 'approved').not('example_q', 'is', null).order('reviewed_at', { ascending: false }).limit(300);
    const pool = ((data ?? []) as { id: string; example_q: string | null; example_a: string | null }[]).filter((r) => r.example_q && r.example_a).map((r) => ({ id: r.id, q: r.example_q!, a: r.example_a! }));
    return pickExamples(question, pool);
  } catch {
    return [];
  }
}
