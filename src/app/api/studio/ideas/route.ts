import { NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { aiConfig, aiHeaders } from '@/lib/studio/ai';
import { BRAND, VOICE } from '@/lib/studio/prompt';

export const runtime = 'nodejs';


export async function POST(req: Request) {
  if (!(await requirePortal('social'))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

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

  const prompt = `You are Heliaxis's social media strategist, proposing what to post next.

${BRAND}

${VOICE}

Suggest 5 DISTINCT, specific post ideas the team could make next. Deliberately spread across different angles — e.g. myth-busting, a customer proof point, a seasonal/timely tip, funding/grant news, buyer advice ("what to check in a quote"), a local case study, a quick explainer, a behind-the-scenes. No two ideas should feel similar.
Each idea must be concrete and act-on-able (a real angle, not a vague theme), grounded in what Heliaxis actually does, and relevant to South Wales homeowners or local businesses.

${avoid ? `AVOID repeating these recent posts — make the ideas genuinely fresh:\n${avoid}\n` : ''}
Return ONLY a JSON object of this exact shape (no markdown, no commentary):
{"ideas":[{"title":"short punchy title, max ~8 words","brief":"one clear sentence on the angle and what the post would say"}]}
Exactly 5 ideas.`;

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: aiHeaders(apiKey),
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
