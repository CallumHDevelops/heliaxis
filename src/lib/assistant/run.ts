import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { TOOLS, runTool, type Actor, type AssistantAction } from './tools';

/**
 * Metis, the CRM assistant: a manual tool loop over the CRM tools. Runs on Claude Opus 5.5 with
 * server-side refusal fallbacks ("default"), so a false-positive decline is retried on
 * Anthropic's recommended fallback model instead of failing.
 */

export const ASSISTANT_MODEL = 'claude-opus-5-5';
const MAX_TURNS = 12;
const KEEP_MESSAGES = 40;

export type Msg = Anthropic.Beta.BetaMessageParam;

export function assistantConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function system(me: Actor) {
  const now = new Date().toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `You are Metis, the assistant inside Heliaxis's own CRM (named after the Greek goddess of wisdom and counsel). Heliaxis Ltd is a small UK installer of solar PV, batteries, air source heat pumps and EV chargers (about five staff, some working remotely). You're talking to ${me.name}. It is ${now} (UK time).

People often talk to you straight after a meeting or from the van, by voice, so their messages can be rambling or mis-transcribed (voice typing often hears your name as Mattis, Matisse or similar — that's you). Pull out what needs doing and do it: add notes to the customer, create tasks (for them or a colleague), set next steps, and draft emails and WhatsApps. Use the tools rather than describing what you would do. Look customers up with search_customers before acting on them; if two customers match and it's unclear which, ask. Use list_team to find a colleague's id when a task is for someone else. Businesses we deal with (commercial customers, landlords, schools, partners who refer work, suppliers) and the people there are organisations and their contacts: find them with find_organisation or find_contact (a contact can be part of an organisation or on their own), not search_customers; add one with add_contact.

You cannot send anything to a customer. Emails and WhatsApps you write are saved as drafts that a person checks and sends, so never say a message has been sent. Customers are written to online first (WhatsApp and email) rather than phoned. Write to customers in warm, plain British English, as Heliaxis, signed with the user's first name. Keep WhatsApps short with no markdown.

Don't invent prices, dates or technical promises the user didn't give you. If a date is vague ("next week"), choose a sensible working day and say which.

People also ask how to use this system: "how do I…", "where is…", "what does … mean". For those, call search_help first and answer only from the articles it returns: the steps in a few short lines, using the exact button and menu names the article uses, then the article's link (its url, such as /admin/help/getting-started/using-help) on its own line so they can read the rest. Never invent steps, buttons, menu names or labels. If search_help finds nothing that answers it, say the Help section doesn't cover that yet.

Reply briefly in plain text (it may be read aloud): say what you did in a line or two, then anything you need from them.`;
}

/** Keep the history short enough to send, starting at a real user message. */
function trim(messages: Msg[]) {
  if (messages.length <= KEEP_MESSAGES) return messages;
  let i = messages.length - KEEP_MESSAGES;
  while (i < messages.length && !(messages[i].role === 'user' && typeof messages[i].content === 'string')) i++;
  return messages.slice(i);
}

/**
 * After a mid-output fallback, blocks the declined model produced before the last fallback
 * marker must not be echoed back (except text), and its tool calls must not run.
 */
function afterFallback(content: Anthropic.Beta.BetaContentBlock[]) {
  const last = content.map((b) => b.type).lastIndexOf('fallback');
  if (last < 0) return content;
  return content.filter((b, i) => i > last || b.type === 'text');
}

export type AssistantResult = { messages: Msg[]; reply: string; actions: AssistantAction[] };

export async function runAssistant(history: Msg[], text: string, me: Actor): Promise<AssistantResult> {
  const client = new Anthropic();
  const messages: Msg[] = trim([...history, { role: 'user', content: text }]);
  const actions: AssistantAction[] = [];
  let reply = '';

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.beta.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: system(me),
      tools: TOOLS.map((t) => ({ ...t, strict: true })) as Anthropic.Beta.BetaTool[],
      messages,
    });

    if (res.stop_reason === 'refusal') {
      // Nothing from a refused turn is kept; the user can rephrase.
      reply = 'Sorry — I can’t help with that one. Try rewording it.';
      break;
    }
    const content = afterFallback(res.content);
    messages.push({ role: 'assistant', content: content as Anthropic.Beta.BetaContentBlockParam[] });
    const said = content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (said) reply = said;

    if (res.stop_reason === 'pause_turn') continue;
    const calls = content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !calls.length) {
      if (res.stop_reason === 'max_tokens' && !said) reply = 'That ran long — ask me again in smaller pieces.';
      break;
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const c of calls) {
      let out: string;
      let isError = false;
      try {
        out = await runTool(c.name, (c.input ?? {}) as Record<string, unknown>, me, actions);
      } catch (e) {
        out = e instanceof Error ? e.message : 'Failed';
        isError = true;
      }
      results.push({ type: 'tool_result', tool_use_id: c.id, content: out, ...(isError ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results });
    if (turn === MAX_TURNS - 1) reply ||= 'I’ve done part of that — tell me what’s left.';
  }

  // A history that ends on tool results (we stopped early) can't be continued; close it off.
  const last = messages[messages.length - 1];
  if (last.role === 'user' && typeof last.content !== 'string') messages.push({ role: 'assistant', content: reply || 'Done.' });
  if (last.role === 'user' && typeof last.content === 'string') messages.push({ role: 'assistant', content: reply });
  return { messages, reply: reply || 'Done.', actions };
}
