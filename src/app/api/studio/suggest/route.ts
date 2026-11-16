import { NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { aiConfig, aiHeaders } from '@/lib/studio/ai';
import { BRAND, VOICE, audienceFor } from '@/lib/studio/prompt';

export const runtime = 'nodejs';


// Quick "auto-suggest": short, specific angles to drop into a topic/context field.
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
    headers: aiHeaders(apiKey),
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
