/**
 * The AI provider for Post Studio: OpenAI-compatible (OpenRouter by default), the same account and keys the blog and the
 * CMS writers already use. One place, so the routes can't drift apart.
 */
export function aiConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_API_BASE_URL || process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || process.env.AI_MODEL || 'openai/gpt-4o-mini';
  return { apiKey, baseUrl, model };
}

/** Headers OpenRouter asks for, on top of the bearer key. */
export function aiHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk',
    'X-Title': 'Heliaxis Post Studio',
  };
}
