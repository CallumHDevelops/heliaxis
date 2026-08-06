import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BRAND, VOICE, audienceFor } from '@/lib/prompt';

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

// Quick "auto-suggest": short, specific angles to drop into a topic/context field.
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
    /* optional */
  }
  const type = String(body?.type || 'post');
  const platform = String(body?.platform || 'Instagram');
  const context = String(body?.context || '').slice(0, 600);

  const prompt = `You are Heliaxis's social strategist. Suggest 6 SHORT, specific angles the team could turn into a "${type}".

${BRAND}

${VOICE}

AUDIENCE (${platform}): ${audienceFor(platform)}
${context ? `STEER FROM THE USER: ${context}\n` : ''}
Each suggestion is one concrete, click-ready angle of 4-10 words — a hook or topic someone could pick and run with (not a vague theme). Make them genuinely different from each other and grounded in what Heliaxis does.

Return ONLY JSON: {"suggestions":["...","..."]} with exactly 6 items.`;

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://social.heliaxis.co.uk',
      'X-Title': 'Heliaxis Auto-suggest',
    },
    body: JSON.stringify({
      model,
      temperature: 1.0,
      max_tokens: 400,
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
  let suggestions: string[] = [];
  try {
    const parsed = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
    suggestions = (Array.isArray(parsed?.suggestions) ? parsed.suggestions : [])
      .map((s: any) => String(s).trim())
      .filter(Boolean)
      .slice(0, 6);
  } catch {
    return NextResponse.json({ error: 'Could not parse suggestions' }, { status: 502 });
  }

  return NextResponse.json({ suggestions });
}
