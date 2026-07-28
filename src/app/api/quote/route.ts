import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getResendApiKey } from '@/lib/resend';

function escHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Handles quote / CMS contact form submissions.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

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
    };

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
        const { error } = await supabase.from('enquiries').insert({
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          postcode: data.postcode || null,
          interest: interestStored,
          property_type: sectorStored,
          source: data.source,
        });
        if (error) console.error('❌ Supabase enquiry insert failed:', error.message);
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

    const adminEmailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #211F18; background: #F7F2E7; }
            .container { max-width: 600px; margin: 20px auto; background: #FFFDF8; border: 1px solid rgba(33,31,24,.14); }
            .header { background: #211F18; color: #F8BC1E; padding: 24px; }
            .header h1 { margin: 0; font-size: 20px; }
            .content { padding: 24px; }
            .row { margin: 12px 0; padding: 12px; background: #F7F2E7; border-radius: 2px; }
            .label { font-size: 12px; letter-spacing: .05em; text-transform: uppercase; color: #6E6A5E; }
            .value { color: #211F18; margin-top: 4px; font-size: 15px; }
            .footer { padding: 16px 24px; color: #6E6A5E; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>☀️ New enquiry</h1></div>
            <div class="content">
              <div class="row"><div class="label">Name</div><div class="value">${escHtml(data.name)}</div></div>
              <div class="row"><div class="label">Sector / property</div><div class="value">${escHtml(propertyLabel)}</div></div>
              ${data.organization ? `<div class="row"><div class="label">Organisation</div><div class="value">${escHtml(data.organization)}</div></div>` : ''}
              <div class="row"><div class="label">Email</div><div class="value"><a href="mailto:${escHtml(data.email)}">${escHtml(data.email)}</a></div></div>
              <div class="row"><div class="label">Phone</div><div class="value">${escHtml(data.phone || 'Not provided')}</div></div>
              <div class="row"><div class="label">Postcode</div><div class="value">${escHtml(data.postcode || 'Not provided')}</div></div>
              <div class="row"><div class="label">Interested in</div><div class="value">${escHtml(data.interest || 'Not specified')}</div></div>
              ${data.message ? `<div class="row"><div class="label">Message</div><div class="value">${escHtml(data.message)}</div></div>` : ''}
              <div class="row"><div class="label">Source</div><div class="value">${escHtml(data.source)}</div></div>
            </div>
            <div class="footer">Submitted: ${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })} · heliaxis.co.uk</div>
          </div>
        </body>
      </html>
    `;

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
