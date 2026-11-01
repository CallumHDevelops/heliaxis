import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { recordAi } from '@/lib/ai-usage';
import { PROCEDURE_HEADINGS } from './checks';
import type { QmsComment, QmsDoc } from './types';

/**
 * "Draft with Claude" and "Revise with Claude" for the QMS. Draft writes a first version of a procedure, form or
 * internal document from its title and the other documents it sits among. Revise rewrites the current text to
 * answer the reviewer's open comments, and says what it did about each one. Either way the result is a DRAFT: it
 * goes back through the checker and an approver. It writes only from what it is given and marks anything it
 * cannot know as [to confirm: …], which the checker will not let through to approval.
 */
const MODEL = process.env.QMS_MODEL || 'claude-sonnet-5-5';

const Out = z.object({
  body_md: z.string().min(20),
  summary: z.string().nullable().optional(),
  responses: z.array(z.object({ id: z.string(), response: z.string() })).default([]),
});

const SYSTEM = `You write and revise controlled quality management documents for Heliaxis, a UK company that designs and installs solar PV, battery storage and heat pump systems for homes and businesses, working to MCS and TrustMark requirements.

Rules:
- Write in plain UK English, short sentences, for installers and office staff.
- Use Markdown. Procedures use these headings in this order: Purpose, Scope, Responsibilities, Procedure (numbered steps), Records. Name forms and records by their reference (for example F03, R02) and only reference documents from the register you are given.
- Use only what is in the request. Never invent warranties, certification numbers, accreditation claims, prices, timescales or names of people. If something has to be filled in by Heliaxis, write [to confirm: what is needed] in its place.
- Do not copy another company's wording. Describe the process from first principles.
- When revising, change only what the comments ask for, keep everything else, and answer every comment by id with one sentence saying what you changed (or why you did not).
- Reply with one JSON object and nothing else: {"body_md": string, "summary": string | null, "responses": [{"id": string, "response": string}]}.`;

export async function writeWithClaude(
  doc: QmsDoc,
  comments: Pick<QmsComment, 'id' | 'body' | 'quote' | 'author'>[],
  register: { ref: string; title: string; kind: string }[]
): Promise<{ ok: true; body: string; summary: string | null; responses: { id: string; response: string }[] } | { ok: false; error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'The writing assistant isn’t set up (no ANTHROPIC_API_KEY).' };
  const shape =
    doc.kind === 'procedure'
      ? `A procedure with these headings: ${PROCEDURE_HEADINGS.map((h) => h.label).join(', ')}.`
      : doc.kind === 'form'
        ? 'A form: a title block (Heliaxis, reference, revision, date), then the fields to fill in as a Markdown table or checklist, then a sign-off block.'
        : 'An internal document laid out in clear sections.';
  const prompt = [
    `Document: ${doc.ref} — ${doc.title} (${doc.kind}${doc.section ? `, ${doc.section}` : ''}), revision ${doc.revision}.`,
    doc.summary ? `What it is for: ${doc.summary}` : '',
    `Shape: ${shape}`,
    `The register (the only documents you may refer to):\n${register.map((r) => `${r.ref} ${r.title}`).join('\n')}`,
    doc.body_md?.trim() ? `Current text:\n"""\n${doc.body_md}\n"""` : 'There is no text yet: write the first draft.',
    comments.length
      ? `Reviewer comments to answer:\n${comments.map((c) => `- id ${c.id}${c.quote ? ` (about “${c.quote}”)` : ''}: ${c.body}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  try {
    const res = await new Anthropic().messages.create(
      { model: MODEL, max_tokens: 8000, system: SYSTEM, messages: [{ role: 'user', content: prompt }] },
      { timeout: 120_000 }
    );
    await recordAi('qms', res.model, res.usage, doc.ref);
    if (res.stop_reason === 'refusal') return { ok: false, error: 'It couldn’t write that one.' };
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    const j = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const parsed = j ? Out.safeParse(JSON.parse(j)) : null;
    if (!parsed?.success) return { ok: false, error: 'It couldn’t make sense of its own answer this time. Try again.' };
    const ids = new Set(comments.map((c) => c.id));
    return { ok: true, body: parsed.data.body_md.trim(), summary: parsed.data.summary ?? null, responses: parsed.data.responses.filter((r) => ids.has(r.id)) };
  } catch (e) {
    console.error('QMS write failed', e);
    return { ok: false, error: 'The writing assistant didn’t answer. Try again in a moment.' };
  }
}
