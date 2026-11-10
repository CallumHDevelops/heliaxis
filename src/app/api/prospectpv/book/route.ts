/**
 * POST /api/prospectpv/book. Stores a survey booking with the calculator
 * inputs, after consent (spec 7.4), then notifies the team.
 * The quoted total is recomputed here from stored prices.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { CONSENT_TEXT, quote, validateBooking } from '@/lib/prospectpv/booking';
import { oneLineAddress } from '@/lib/prospectpv/format';
import { parseExtras } from '@/lib/prospectpv/landing';
import { notifyTeam } from '@/lib/prospectpv/server/notify';
import { clientKey, rateLimit } from '@/lib/prospectpv/server/requestGuard';
import { supabaseAdmin } from '@/lib/prospectpv/server/supabaseAdmin';
import { parseLandingSettings } from '@/lib/prospectpv/settings';
import { normaliseShortCode } from '@/lib/prospectpv/shortCode';
import type { LetterData } from '@/lib/prospectpv/types';

export const dynamic = 'force-dynamic';

const fail = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status });

export async function POST(req: NextRequest) {
  if (!req.headers.get('content-type')?.includes('application/json')) return fail(415, 'Send JSON.');
  const text = await req.text();
  if (text.length > 8_000) return fail(413, 'Request too large.');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, 'Request could not be read.');
  }

  const code = normaliseShortCode((body as { code?: string })?.code);
  if (!code) return fail(404, 'This link has expired. Call us and we’ll book you in.');

  const db = supabaseAdmin();
  const { data: ctx, error: ctxErr } = await db.rpc('pv_booking_context', { p_code: code });
  if (ctxErr) return fail(500, 'Something went wrong on our side. Please call us to book.');
  if (!ctx) return fail(404, 'This link has expired. Call us and we’ll book you in.');

  const settings = parseLandingSettings({ battery: ctx.battery, landing: ctx.landing, 'calc.inputs': ctx.inputs });
  const key = clientKey(req.headers);
  if (!(await rateLimit(`book:${key}`, 3600, settings.landing.booking_rate_limit_per_hour))) {
    return fail(429, 'You’ve sent a few bookings already. Please call us instead.');
  }

  const v = validateBooking(body, settings.inputs);
  if (!v.ok) return NextResponse.json({ ok: false, errors: v.errors }, { status: 422 });
  // Honeypot filled: look successful, store nothing.
  if (v.value.company) return NextResponse.json({ ok: true });

  const letter = ctx.printed as LetterData;
  const q = quote(
    {
      packagePrice: letter.package.priceIncVat,
      baseBatteryKwh: letter.estimate.batteryKwh,
      moduleKwh: settings.battery.module_kwh,
      modulePrice: settings.battery.module_price_gbp,
      maxKwh: settings.battery.max_kwh,
      extras: parseExtras(ctx.extras),
      claims: letter.package.claims,
    },
    v.value.extraModules,
    v.value.extras,
  );

  const payload = {
    name: v.value.name,
    phone: v.value.phone,
    email: v.value.email,
    best_time: v.value.bestTime,
    consent: true,
    consent_text: CONSENT_TEXT,
    usage_kwh: v.value.usageKwh,
    monthly_bill: v.value.monthlyBill,
    home_pattern: v.value.homePattern,
    battery_kwh: q.batteryKwh,
    extra_modules: v.value.extraModules,
    extras: q.extras,
    quoted_total: q.total,
    package_name: letter.package.name,
    letter_code: code,
    submitted_at: new Date().toISOString(),
  };

  const { data: responseId, error } = await db.rpc('pv_submit_booking', { p_code: code, p_payload: payload });
  if (error || !responseId) return fail(500, 'We couldn’t save your booking. Please call us to book.');

  await notifyTeam({
    responseId,
    letterCode: code,
    address: oneLineAddress(letter.address),
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    bestTime: payload.best_time,
    packageName: letter.package.name,
    quotedTotal: q.total,
    extras: q.extras.map((e) => e.name),
    batteryKwh: q.batteryKwh,
  });

  return NextResponse.json({ ok: true });
}
