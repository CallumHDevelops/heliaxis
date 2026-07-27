import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function aiConfig() {
  const apiKey =
    process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (
    process.env.OPENAI_API_BASE_URL ||
    process.env.AI_BASE_URL ||
    'https://openrouter.ai/api/v1'
  ).replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || process.env.AI_MODEL || 'openai/gpt-4o-mini';
  return { apiKey, baseUrl, model };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { apiKey, baseUrl, model } = aiConfig();
  if (!apiKey)
    return NextResponse.json(
      { error: 'Server is missing AI credentials (set OPENROUTER_API_KEY)' },
      { status: 500 }
    );

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* optional body */
  }
  const recent: string[] = Array.isArray(body?.recent) ? body.recent : [];
  const avoid = recent
    .filter(Boolean)
    .slice(0, 25)
    .map((h) => '- ' + String(h).slice(0, 90))
    .join('\n');

  const prompt = `You are a social media strategist for Heliaxis, an MCS-certified renewable energy installer in South Wales (solar PV, battery storage, infrared/alternative heating, LED lighting, EV charging).

BRAND VOICE: confident, plain-spoken, benefit-led, honest. UK English. No hype.

Suggest 5 DISTINCT post ideas the team could create next. Mix the angles — e.g. myth-busting, a customer proof point, a seasonal tip, funding/grant news, buyer advice ("what to check in a quote"), a local case study, an explainer. Each idea must be genuinely different from the others and specific enough to act on.

${avoid ? `AVOID repeating these recent posts — make the ideas fresh:\n${avoid}\n` : ''}
Return ONLY a JSON object of this exact shape (no markdown, no commentary):
{"ideas":[{"title":"short punchy title, max ~8 words","brief":"one clear sentence on the angle and what the post would say"}]}
Exactly 5 ideas.`;

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://social.heliaxis.co.uk',
      'X-Title': 'Heliaxis Post Studio',
    },
    body: JSON.stringify({
      model,
      temperature: 0.95,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) {
    const detail = await r.text();
    return NextResponse.json({ error: 'AI request failed', detail }, { status: 502 });
  }

  const json = await r.json();
  const text: string = json?.choices?.[0]?.message?.content || '';
  let ideas: { title: string; brief: string }[] = [];
  try {
    const parsed = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
    ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
  } catch {
    return NextResponse.json({ error: 'Could not parse ideas', raw: text }, { status: 502 });
  }

  ideas = ideas
    .filter((i) => i && i.title)
    .map((i) => ({ title: String(i.title), brief: String(i.brief || '') }))
    .slice(0, 5);

  return NextResponse.json({ ideas });
}
