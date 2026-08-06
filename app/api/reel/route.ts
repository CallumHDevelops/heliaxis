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

// Fetch + strip a page's text, with a basic SSRF guard (public http(s) only).
async function fetchUrlText(raw: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  const host = url.hostname;
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return '';
  }
  try {
    const ctrl = AbortSignal.timeout(8000);
    const res = await fetch(url.toString(), {
      headers: { 'user-agent': 'Mozilla/5.0 HeliaxisReelBot' },
      signal: ctrl,
    });
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
  } catch {
    return '';
  }
}

function platformGuidance(platform: string) {
  const p = platform.toLowerCase();
  if (p.includes('linkedin'))
    return {
      audience:
        'B2B — commercial decision-makers, facilities/finance/estate managers. Professional and credible; lead with ROI, compliance and reliability.',
      length: '20-35 seconds; a little more informative is fine.',
    };
  if (p.includes('tiktok'))
    return {
      audience: 'B2C — homeowners, younger-leaning. Casual, fast, scroll-stopping.',
      length: 'Keep it very tight — 12-22 seconds.',
    };
  if (p.includes('facebook'))
    return {
      audience: 'B2C — homeowners, often 35+. Clear, friendly, trust-led.',
      length: '20-30 seconds.',
    };
  return {
    audience: 'B2C — homeowners. Punchy, benefit-led, scroll-stopping.',
    length: 'Tight — 15-25 seconds.',
  };
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const type = String(body?.type || 'Explainer');
  const platform = String(body?.platform || 'Instagram');
  const context = String(body?.context || '').slice(0, 2000);
  const referenceUrl = String(body?.referenceUrl || '').trim();

  const grantText = referenceUrl ? await fetchUrlText(referenceUrl) : '';
  const { audience, length } = platformGuidance(platform);

  const prompt = `You are a short-form vertical video (Reel) scriptwriter for Heliaxis, an MCS-certified renewable energy installer in South Wales (solar PV, battery storage, infrared/alternative heating, LED lighting, EV charging).

BRAND VOICE: confident, plain-spoken, benefit-led, honest. UK English. No hype ("revolutionary", "leading").

FORMAT: a Reel made of short text scenes over background footage/photos. Each scene shows a few words on screen for ~2-3 seconds. On-screen text MUST be short enough to read instantly.

TYPE: ${type}
PLATFORM: ${platform} — ${audience}
USER CONTEXT: ${context || '(none provided)'}
${grantText ? `SOURCE MATERIAL (extracted from ${referenceUrl}) — use only facts supported here:\n${grantText}\n` : referenceUrl ? `(Could not read ${referenceUrl}; do not invent its details.)\n` : ''}
ATTENTION & LENGTH: Optimise for ${platform}. ${length} Use 4-6 scenes. Scene 1 MUST be a strong hook (a question, a myth, or a bold fact) that lands in ~2 seconds. The final scene is a clear, low-pressure call to action (free survey · 01633 965205 · heliaxis.co.uk).

PER-SCENE FIELDS: 'eyebrow' = optional 2-4 word ALL-CAPS kicker. 'headline' = the main on-screen line, short and punchy; wrap ONE key word in *asterisks* for a gold accent. 'sub' = optional one short supporting line. 'seconds' = 2-4 (hook can be 2, CTA ~3). 'theme' = 'dark' | 'light' | 'gold' (mostly 'dark'). 'anim' = 'up' | 'fade' | 'left'.

COMPLIANCE: never invent specific savings, payback, grant amounts, deadlines or prices. If a figure isn't in the provided source/context, keep the claim general.

Return ONLY JSON of this exact shape (no markdown):
{"recommendedSeconds": number, "scenes":[{"eyebrow":"","headline":"","sub":"","seconds":3,"theme":"dark","anim":"up"}], "caption":"an engaging caption with a hook and CTA", "hashtags":"#.. #.."}`;

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://social.heliaxis.co.uk',
      'X-Title': 'Heliaxis Reel Studio',
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      max_tokens: 1100,
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
  let parsed: any = null;
  try {
    parsed = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
  } catch {
    return NextResponse.json({ error: 'Could not parse reel', raw: text }, { status: 502 });
  }

  const themes = ['dark', 'light', 'gold'];
  const anims = ['up', 'fade', 'left'];
  const scenes = (Array.isArray(parsed?.scenes) ? parsed.scenes : [])
    .filter((s: any) => s && (s.headline || s.eyebrow || s.sub))
    .slice(0, 8)
    .map((s: any) => ({
      eyebrow: String(s.eyebrow || ''),
      headline: String(s.headline || ''),
      sub: String(s.sub || ''),
      seconds: Math.max(1.5, Math.min(10, Number(s.seconds) || 3)),
      theme: themes.includes(s.theme) ? s.theme : 'dark',
      anim: anims.includes(s.anim) ? s.anim : 'up',
    }));

  if (!scenes.length)
    return NextResponse.json({ error: 'No scenes returned', raw: text }, { status: 502 });

  return NextResponse.json({
    scenes,
    caption: String(parsed?.caption || ''),
    hashtags: String(parsed?.hashtags || ''),
    sourced: !!grantText,
  });
}
