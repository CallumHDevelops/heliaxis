import { after, NextRequest, NextResponse } from 'next/server';
import { notifyEnquiryTeam } from '@/lib/whatsapp/inbox';
import { ensureOpportunity } from '@/lib/crm/server';
import { leadRef } from '@/lib/notification-refs';
import { ATTR_COOKIE, CONSENT_COOKIE, hasConsent, parseAttribution, sourceLabel } from '@/lib/attribution';
import { createAdminClient } from '@/lib/supabase/admin';
import { getResendApiKey } from '@/lib/resend';
import { grantPermission } from '@/lib/whatsapp/permission';
import { sendEnquiryReceipt } from '@/lib/enquiry-receipt';
import { detailRows, emailShell } from '@/lib/email-brand';

// Handles quote / CMS contact form submissions.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // The hidden "company website" box: only bots fill it in. Say thanks and do nothing.
    if (typeof body.company_website === 'string' && body.company_website.trim()) {
      return NextResponse.json({ success: true, message: 'Thank you.' });
    }

    const interestsArr = Array.isArray(body.interests)
      ? body.interests.map((x: unknown) => String(x || '').trim()).filter(Boolean)
      : [];
    const interestFromArr = interestsArr.join(', ');

    const data = {
      name: (body.name || '').toString().trim(),
      phone: (body.phone || '').toString().trim(),
      email: (body.email || '').toString().trim(),
      postcode: (body.postcode || '').toString().trim(),
      organization: (body.organization || body.org || '').toString().trim(),
      message: (body.message || '').toString().trim(),
      sector: (body.sector || '').toString().trim(),
      interest: (body.interest || interestFromArr || '').toString().trim(),
      propertyType: (body.propertyType || '').toString().trim(),
      source: (body.source || 'quote-form').toString().trim() || 'quote-form',
      // The unticked "OK to message me on WhatsApp about my enquiry" box.
      whatsappOptIn: body.whatsappOptIn === true || body.whatsappOptIn === 'on' || body.whatsappOptIn === 'true',
    };
    // Came from an ad or a tagged link? Label the enquiry with it ("meta-ad: <campaign>"). Only with
    // cookie consent: an hx_attr set before the cookie banner existed (or without Accept) is ignored.
    const attribution = hasConsent(request.cookies.get(CONSENT_COOKIE)?.value)
      ? parseAttribution(request.cookies.get(ATTR_COOKIE)?.value)
      : null;
    const adSource = sourceLabel(attribution);
    if (adSource) data.source = adSource;

    if (!data.name || !data.email) {
      return NextResponse.json(
        { success: false, error: 'Name and email are required.' },
        { status: 400 }
      );
    }

    // Store interests cleanly for CRM icons; fold org/message into parseable suffixes.
    const interestParts = [
      data.interest || interestFromArr,
      data.organization ? `Org: ${data.organization}` : '',
      data.message ? `Message: ${data.message}` : '',
    ].filter(Boolean);
    const interestStored = interestParts.join(' · ') || null;
    const sectorStored =
      data.sector ||
      (data.propertyType === 'home'
        ? 'Residential'
        : data.propertyType === 'business'
          ? 'Commercial'
          : data.propertyType) ||
      null;

    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createAdminClient();
        const { data: row, error } = await supabase.from('enquiries').insert({
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          postcode: data.postcode || null,
          interest: interestStored,
          property_type: sectorStored,
          source: data.source,
        }).select('id').single();
        if (error) console.error('❌ Supabase enquiry insert failed:', error.message);
        else if (row) {
          // Push to everyone on Enquiries (phone app + browsers), alongside the email below.
          const where = data.postcode ? ` (${data.postcode})` : '';
          after(async () => {
            // Meta click id for the Conversions API (column added by crm-v2.sql; ignore if missing).
            if (attribution?.fbc) await supabase.from('enquiries').update({ meta_fbc: attribution.fbc }).eq('id', row.id).then(() => null, () => null);
            // Ticked the WhatsApp box: permission, with when and how (crm-v3.sql columns, when they exist).
            if (data.whatsappOptIn) await grantPermission(row.id, 'website-form');
            await ensureOpportunity(row.id, data.source);
          });
          // The "we have your request" email to them, from the Heliaxis mailbox and logged on the enquiry.
          after(() => sendEnquiryReceipt(row.id, { name: data.name, email: data.email, postcode: data.postcode, interest: data.interest, source: data.source, message: data.message }).then(() => null, () => null));
          after(() =>
            notifyEnquiryTeam(`New enquiry: ${data.name}${where}`, data.interest || data.message || 'From the website', `/admin/enquiries?enquiry=${row.id}`, {
              tag: `enq-${row.id}`,
              ref: leadRef(row.id),
            }).catch(() => {})
          );
        }
      } catch (e) {
        console.error('❌ Supabase enquiry insert threw:', e);
      }
    }

    const resendKey = getResendApiKey();
    if (!resendKey) {
      console.error('❌ Heliaxis_Resend_API_Key / RESEND_API_KEY is not set');
      return NextResponse.json(
        { success: false, error: 'Email service is not configured.' },
        { status: 500 }
      );
    }

    const propertyLabel =
      data.propertyType === 'business'
        ? 'Business'
        : data.propertyType === 'home'
          ? 'Home'
          : data.sector || 'Not specified';

    const adminEmailHtml = emailShell(
      'New enquiry',
      detailRows(
        [
          ['Name', data.name],
          ['Sector / property', propertyLabel],
          ['Organisation', data.organization],
          ['Email', data.email],
          ['Phone', data.phone || 'Not provided'],
          ['WhatsApp', data.whatsappOptIn ? 'Happy to be messaged on WhatsApp' : 'Didn’t tick the WhatsApp box'],
          ['Postcode', data.postcode || 'Not provided'],
          ['Interested in', data.interest || 'Not specified'],
          ['Message', data.message],
          ['Source', data.source],
        ],
        { Email: `mailto:${data.email}`, ...(data.phone ? { Phone: `tel:${data.phone.replace(/\s/g, '')}` } : {}) }
      ) + `<p style="font-size:12px;color:#6E6A5E;margin:0">Submitted ${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}</p>`,
      { href: `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '')}/admin/enquiries`, label: 'Open Enquiries' },
      'Website enquiry',
      'heliaxis.co.uk · An enquiry came in on the website.'
    );

    const adminEmailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'Heliaxis <noreply@heliaxis.co.uk>',
        to: [process.env.ADMIN_EMAIL || 'hello@heliaxis.co.uk'],
        subject: `☀️ New enquiry: ${data.name}${data.postcode ? ` (${data.postcode})` : ''}`,
        html: adminEmailHtml,
        reply_to: data.email,
      }),
    });

    const adminEmail = await adminEmailResponse.json();

    if (!adminEmailResponse.ok) {
      console.error('❌ Failed to send quote email:', adminEmail);
      throw new Error(adminEmail.message || 'Failed to send email');
    }

    return NextResponse.json({
      success: true,
      message: "Thank you — we've received your enquiry and will be in touch shortly.",
      id: adminEmail.id,
    });
  } catch (error) {
    console.error('❌ Error processing quote request:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send request' },
      { status: 500 }
    );
  }
}
