import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { ASSISTANT_MODEL, assistantConfigured } from '@/lib/assistant/run';

/**
 * Reading the MCS certificate number off an uploaded certificate (SPEC 4.3), with the same client,
 * model and fallback as the site app's label reads (src/lib/site/vision.ts). The file goes as base64,
 * so no link to it leaves Supabase. Only ever a suggestion: the office taps to save it to the job's
 * paperwork, never filled in silently. No ANTHROPIC_API_KEY: no read.
 */

const McsRead = z.object({
  readable: z.boolean(),
  certificate_number: z.string().nullable(),
});

const PROMPT =
  'This is an MCS certificate for a home renewable energy installation. Copy the MCS certificate number exactly as printed. ' +
  'Only copy what is printed. If there is no certificate number, or you cannot read it, give null and set readable to false.';

export async function readMcsNumber(bytes: Uint8Array, mime: string): Promise<string | null> {
  if (!assistantConfigured()) return null;
  const data = Buffer.from(bytes).toString('base64');
  const file =
    mime === 'application/pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: mime === 'image/png' ? 'image/png' : mime === 'image/webp' ? 'image/webp' : 'image/jpeg', data } } as const);
  try {
    const res = await new Anthropic().beta.messages.create(
      {
        model: ASSISTANT_MODEL,
        max_tokens: 500,
        output_config: { effort: 'low', format: betaZodOutputFormat(McsRead) },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: [{ role: 'user', content: [file, { type: 'text', text: PROMPT }] }],
      },
      { timeout: 15_000 }
    );
    if (res.stop_reason === 'refusal') return null;
    const last = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').at(-1)?.text;
    const parsed = last ? McsRead.safeParse(JSON.parse(last)) : null;
    const n = parsed?.success && parsed.data.readable ? parsed.data.certificate_number?.trim() : null;
    return n && n.length <= 60 ? n : null;
  } catch {
    return null;
  }
}
