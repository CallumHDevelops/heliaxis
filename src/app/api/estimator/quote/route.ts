import { after, NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientKey, rateLimit } from '@/lib/prospectpv/server/requestGuard';
import { ATTR_COOKIE, CONSENT_COOKIE, hasConsent, parseAttribution, parseFirstTouch, sourceLabel } from '@/lib/attribution';
import { classifyChannel } from '@/lib/search/channel';
import { ensureOpportunity } from '@/lib/crm/server';
import { notifyEnquiryTeam } from '@/lib/whatsapp/inbox';
import { grantPermission } from '@/lib/whatsapp/permission';
import { leadRef } from '@/lib/notification-refs';
import { estimate } from '@/lib/estimator/calc';
import { readEstimatorSettings } from '@/lib/estimator/settings';
import { buildEstimateMessage } from '@/lib/estimator/lead';
import { buildQuoteFacts } from '@/lib/estimator/quote-facts';
import { deliverQuote } from '@/lib/estimator/quote-send';
import { buildConsent, DELIVERIES, makeReference, normaliseUkMobile, ownImagePath, parseQuoteInputs, validEmail, type Delivery } from '@/lib/estimator/quote-input';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
const gbp50 = (n: number) => gbp(Math.round(n / 50) * 50);
const num = (n: number) => Math.round(n).toLocaleString('en-GB');
const yrs = (n: number) => (Math.round(n * 2) / 2).toString().replace(/\.0$/, '');
const text = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * "Send me my full quote" from the solar estimator. The browser sends the answers to the questions, never prices: the figures are worked out
 * again here from the stored settings. Records the enquiry (so it lands in the CRM like any other lead), what the visitor agreed to, and the
 * quote itself; the PDF, email and WhatsApp are sent from the same request (src/lib/estimator/quote-send.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 400 });
    // The hidden "company website" box: only bots fill it in.
    if (typeof body.company_website === 'string' && body.company_website.trim()) return NextResponse.json({ ok: true, reference: 'HX-EST-000000' });

    const name = text(body.name, 80);
    const email = text(body.email, 200).toLowerCase();
    const delivery: Delivery = DELIVERIES.includes(body.delivery) ? body.delivery : 'both';
    const mobile = normaliseUkMobile(body.phone);
    const phoneRaw = text(body.phone, 30);
    if (!name) return NextResponse.json({ ok: false, error: 'Please tell us your first name.' }, { status: 400 });
    if (!validEmail(email)) return NextResponse.json({ ok: false, error: 'That email address does not look right.' }, { status: 400 });
    if (delivery !== 'email' && !mobile) return NextResponse.json({ ok: false, error: 'To send it on WhatsApp we need a UK mobile number (starting 07).' }, { status: 400 });
    const parsed = parseQuoteInputs(body);
    if (!parsed) return NextResponse.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 400 });

    // Slow down repeats: from one device, and for one email address.
    const ip = clientKey(req.headers);
    if (!(await rateLimit(`est-quote:${ip}`, 3600, 12)) || !(await rateLimit(`est-quote-mail:${email}`, 3600, 4))) {
      return NextResponse.json({ ok: false, error: 'That is a lot of quotes in a short time. Please try again in a little while, or call us on 01633 965205.' }, { status: 429 });
    }

    const settings = await readEstimatorSettings();
    const live = { ...settings, importPence: parsed.imp, exportPence: parsed.exp };
    const r = estimate(parsed.inputs, live);

    const postcode = text(body.postcode, 12).toUpperCase();
    const address = text(body.address, 200);
    const interests = ['Solar panels', ...(parsed.inputs.battery ? ['Battery storage'] : []), ...(parsed.inputs.heatpump ? ['Heat pump'] : []), ...(parsed.inputs.ev ? ['EV charger'] : [])];
    const reference = await freeReference();
    const summary = buildEstimateMessage({
      kwp: r.kwp,
      panels: r.panels,
      batteryKwh: r.batteryKwh,
      generation: num(r.generation),
      saving: gbp(r.saving),
      cost: `${gbp50(r.costLow)} – ${gbp50(r.costHigh)}`,
      payback: yrs(r.paybackYears),
      uses: parsed.inputs.usage.kind === 'bill' ? `£${parsed.inputs.usage.value}/month` : `${num(parsed.inputs.usage.value)} kWh/year`,
      shade: parsed.inputs.shade,
      daytime: parsed.inputs.daytime,
      ev: !!parsed.inputs.ev,
      heatpump: !!parsed.inputs.heatpump,
      roof: address || 'answered by the visitor',
      packageName: r.packageName,
    });
    const message = `${summary}\nQuote reference: ${reference}\nInverter: ${r.inverter ?? 'to be confirmed'}\nGrid: ${r.gridRoute ?? 'to be confirmed'}`;

    // Where they came from (only with cookie consent, as on every other form).
    const attribution = hasConsent(req.cookies.get(CONSENT_COOKIE)?.value) ? parseAttribution(req.cookies.get(ATTR_COOKIE)?.value) : null;
    const origin = attribution ?? parseFirstTouch(body.ft);
    const channelFields = {
      channel: classifyChannel(origin),
      landing_path: origin?.p ?? null,
      referrer_host: origin?.r ?? null,
      first_seen_at: origin?.t ? new Date(origin.t).toISOString() : null,
    };
    const source = sourceLabel(attribution) ?? 'solar-estimator';

    const db = createAdminClient();
    const consent = buildConsent(delivery, body.emailFollowUps !== false, body.whatsappMarketing === true);
    const { data: row, error } = await db
      .from('enquiries')
      .insert({
        name,
        email,
        phone: mobile ? `+${mobile}` : phoneRaw || null,
        postcode: postcode || null,
        interest: [interests.join(', '), `Message: ${message}`].join(' · '),
        property_type: parsed.inputs.who === 'home' ? 'Residential' : 'Commercial',
        source,
        ...channelFields,
      })
      .select('id')
      .single();
    if (error || !row) {
      console.error('❌ Estimator quote: enquiry insert failed:', error?.message);
      return NextResponse.json({ ok: false, error: 'We could not save that just now. Please try again, or call us on 01633 965205.' }, { status: 500 });
    }
    const enquiryId = row.id as string;

    // The quote itself, with what they agreed to. (estimator-quotes.sql: if it has not been run yet the quote still goes out.)
    const { error: qErr } = await db.from('estimator_quotes').insert({
      reference,
      enquiry_id: enquiryId,
      delivery,
      inputs: { ...parsed, address, postcode, mapPath: ownImagePath(body.mapPath) },
      result: { panels: r.panels, kwp: r.kwp, cost: r.cost, costLow: r.costLow, costHigh: r.costHigh, inverter: r.inverter, gridRoute: r.gridRoute, batteryKwh: r.batteryKwh },
      consent,
      meta_event_id: enquiryId,
    });
    if (qErr) console.error('❌ Estimator quote: could not store the quote (estimator-quotes.sql run?):', qErr.message);

    after(async () => {
      if (attribution?.fbc) await db.from('enquiries').update({ meta_fbc: attribution.fbc }).eq('id', enquiryId).then(() => null, () => null);
      // WhatsApp: asking for it by WhatsApp is the request for the quote. Marketing is its own, separate yes.
      if (consent.whatsappMarketing) await grantPermission(enquiryId, 'estimator-marketing');
      else if (delivery !== 'email') await grantPermission(enquiryId, 'website-form');
      await ensureOpportunity(enquiryId, source);
      await db.from('crm_lead_origins').update(channelFields).eq('enquiry_id', enquiryId).then(() => null, () => null);
    });
    after(() => notifyEnquiryTeam(`New estimate request: ${name}${postcode ? ` (${postcode})` : ''}`, `${gbp50(r.costLow)} – ${gbp50(r.costHigh)} · ${r.panels} panels · ${reference}`, `/admin/enquiries?enquiry=${enquiryId}`, { tag: `enq-${enquiryId}`, ref: leadRef(enquiryId) }).catch(() => {}));

    // The PDF, the email and the WhatsApp go after the reply, so the visitor sees "on its way" at once.
    const facts = buildQuoteFacts({ reference, customerName: name, address, postcode, inputs: parsed.inputs, settings, imp: parsed.imp, exp: parsed.exp });
    after(() => deliverQuote({ reference, enquiryId, name, email, mobile, delivery, facts, mapPath: ownImagePath(body.mapPath), origin: req.nextUrl.origin, whatsappMarketing: consent.whatsappMarketing }).then(() => null, (e) => console.error('Estimator quote: delivery failed', e)));

    return NextResponse.json({ ok: true, reference, enquiryId, delivery });
  } catch (e) {
    console.error('❌ Estimator quote failed:', e);
    return NextResponse.json({ ok: false, error: 'We could not send that just now. Please try again, or call us on 01633 965205.' }, { status: 500 });
  }
}

/** A reference nobody has: random, checked against the quotes already made. */
async function freeReference(): Promise<string> {
  const db = createAdminClient();
  for (let i = 0; i < 5; i++) {
    const ref = makeReference((n) => randomBytes(n));
    const { data, error } = await db.from('estimator_quotes').select('id').eq('reference', ref).maybeSingle();
    if (error || !data) return ref;
  }
  return makeReference((n) => randomBytes(n));
}
