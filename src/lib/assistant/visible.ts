import type Anthropic from '@anthropic-ai/sdk';

type Msg = Anthropic.Beta.BetaMessageParam;

/** What to show: the user's words and Metis's replies (tool calls and thinking left out). */
export function visible(messages: Msg[]) {
  const out: { role: 'user' | 'assistant'; text: string }[] = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (typeof m.content === 'string') {
      if (m.content.trim()) out.push({ role: m.role, text: m.content });
      continue;
    }
    const text = m.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
      .trim();
    if (!text) continue;
    // Several assistant steps in one answer read as one bubble.
    const prev = out[out.length - 1];
    if (m.role === 'assistant' && prev?.role === 'assistant') prev.text += `\n\n${text}`;
    else out.push({ role: m.role, text });
  }
  return out;
}
