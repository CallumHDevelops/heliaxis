import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Handles the "Get my free quote" form on the landing page (public/pages/home.html).
// Mirrors the subcontractor route: sends an admin notification via Resend.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const data = {
      name: (body.name || '').toString().trim(),
      phone: (body.phone || '').toString().trim(),
      email: (body.email || '').toString().trim(),
      postcode: (body.postcode || '').toString().trim(),
      interest: (body.interest || '').toString().trim(),
      propertyType: (body.propertyType || '').toString().trim(), // "home" | "business"
    };

    // Basic validation
    if (!data.name || !data.email) {
      return NextResponse.json(
        { success: false, error: 'Name and email are required.' },
        { status: 400 }
      );
    }

    // Best-effort: capture the enquiry in Supabase so it shows in the admin
    // dashboard. Never blocks the email path if Supabase isn't configured.
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createAdminClient();
        const { error } = await supabase.from('enquiries').insert({
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          postcode: data.postcode || null,
          interest: data.interest || null,
          property_type: data.propertyType || null,
          source: 'quote-form',
        });
        if (error) console.error('❌ Supabase enquiry insert failed:', error.message);
      } catch (e) {
        console.error('❌ Supabase enquiry insert threw:', e);
      }
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY is not set');
      return NextResponse.json(
        { success: false, error: 'Email service is not configured.' },
        { status: 500 }
      );
    }

    const propertyLabel =
      data.propertyType === 'business' ? 'Business' : data.propertyType === 'home' ? 'Home' : 'Not specified';

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
            <div class="header"><h1>☀️ New Free Quote Request</h1></div>
            <div class="content">
              <div class="row"><div class="label">Name</div><div class="value">${data.name}</div></div>
              <div class="row"><div class="label">Property</div><div class="value">${propertyLabel}</div></div>
              <div class="row"><div class="label">Email</div><div class="value"><a href="mailto:${data.email}">${data.email}</a></div></div>
              <div class="row"><div class="label">Phone</div><div class="value">${data.phone || 'Not provided'}</div></div>
              <div class="row"><div class="label">Postcode</div><div class="value">${data.postcode || 'Not provided'}</div></div>
              <div class="row"><div class="label">Interested in</div><div class="value">${data.interest || 'Not specified'}</div></div>
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
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Heliaxis <noreply@heliaxis.co.uk>',
        to: [process.env.ADMIN_EMAIL || 'your-email@example.com'],
        subject: `☀️ New quote request: ${data.name}${data.postcode ? ` (${data.postcode})` : ''}`,
        html: adminEmailHtml,
        reply_to: data.email,
      }),
    });

    const adminEmail = await adminEmailResponse.json();

    if (!adminEmailResponse.ok) {
      console.error('❌ Failed to send quote email:', adminEmail);
      throw new Error(adminEmail.message || 'Failed to send email');
    }

    return NextResponse.json({ success: true, message: 'Quote request sent', id: adminEmail.id });
  } catch (error) {
    console.error('❌ Error processing quote request:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send request' },
      { status: 500 }
    );
  }
}
