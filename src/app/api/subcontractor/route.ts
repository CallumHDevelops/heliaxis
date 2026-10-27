import { detailRows, emailShell, esc } from '@/lib/email-brand';
import { NextRequest, NextResponse } from 'next/server';
import { getResendApiKey } from '@/lib/resend';

export async function POST(request: NextRequest) {
  try {
    const resendKey = getResendApiKey();
    // Check if environment variables are set
    console.log('🔑 Resend API Key exists:', !!resendKey);
    console.log('📧 Admin Email:', process.env.ADMIN_EMAIL || 'NOT SET');
    
    const formData = await request.formData();
    
    // Extract form fields
    const data = {
      companyName: formData.get('companyName') as string,
      fullName: formData.get('fullName') as string,
      contactNumber: formData.get('contactNumber') as string,
      email: formData.get('email') as string,
      businessAddress: formData.get('businessAddress') as string,
      businessRegNumber: formData.get('businessRegNumber') as string,
      vatNumber: formData.get('vatNumber') as string,
      cisNumber: formData.get('cisNumber') as string,
      bankDetails: formData.get('bankDetails') as string,
      paymentTerms: formData.get('paymentTerms') as string,
      additionalInfo: formData.get('additionalInfo') as string,
      sendEmailReceipt: formData.get('sendEmailReceipt') === 'true',
    };

    console.log('📨 Form submission received from:', data.email);
    console.log('📋 Company:', data.companyName);
    console.log('✅ Send receipt to user:', data.sendEmailReceipt);

    // Extract files and prepare for email attachments
    const insuranceDocs: File[] = [];
    const qualificationDocs: File[] = [];
    
    formData.forEach((value, key) => {
      if (key.startsWith('insuranceDoc') && value instanceof File) {
        insuranceDocs.push(value);
      }
      if (key.startsWith('qualificationDoc') && value instanceof File) {
        qualificationDocs.push(value);
      }
    });

    // Convert files to base64 for Resend attachments
    const attachments = [];
    
    for (const file of insuranceDocs) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      attachments.push({
        filename: file.name,
        content: buffer.toString('base64'),
      });
    }
    
    for (const file of qualificationDocs) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      attachments.push({
        filename: file.name,
        content: buffer.toString('base64'),
      });
    }

    const when = new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });
    const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');
    // To the team: everything they submitted, in the Heliaxis template (every value escaped: it is typed by the public).
    const adminEmailHtml = emailShell(
      'New subcontractor form submission',
      `<p style="margin:0 0 14px">${esc(data.companyName)} has sent the onboarding form.</p>` +
        detailRows(
          [
            ['Full name', data.fullName],
            ['Email', data.email],
            ['Phone', data.contactNumber],
          ],
          { Email: `mailto:${data.email}`, Phone: `tel:${String(data.contactNumber || '').replace(/\s/g, '')}` }
        ) +
        detailRows([
          ['Company', data.companyName],
          ['Registration no.', data.businessRegNumber],
          ['Address', data.businessAddress],
          ['VAT number', data.vatNumber || 'Not provided'],
          ['CIS number', data.cisNumber || 'Not provided'],
        ]) +
        detailRows([
          ['Bank details', data.bankDetails],
          ['Payment terms', data.paymentTerms],
        ]) +
        (data.additionalInfo ? detailRows([['Additional info', data.additionalInfo]]) : '') +
        (attachments.length > 0 ? `<p style="margin:0 0 12px">📎 ${attachments.length} file(s) attached to this email.</p>` : '') +
        `<p style="font-size:12px;color:#6E6A5E;margin:0">Submitted ${esc(when)}</p>`,
      { href: `${site}/admin/subcontractors`, label: 'Open Subcontractors' },
      'Subcontractor portal',
      'heliaxis.co.uk · A subcontractor submitted the form.'
    );

    // To them: a receipt.
    const userReceiptHtml = emailShell(
      'We’ve received your application',
      `<p style="margin:0 0 12px">Dear ${esc(data.fullName)},</p>
       <p style="margin:0 0 16px">Thank you. We’ve received your subcontractor onboarding application for <b>${esc(data.companyName)}</b>.</p>` +
        detailRows([
          ['Company', data.companyName],
          ['Contact email', data.email],
          ['Phone', data.contactNumber],
          ['Payment terms', data.paymentTerms],
          ['Documents', attachments.length > 0 ? `${attachments.length} file(s) uploaded` : ''],
        ]) +
        `<p style="margin:0 0 8px;font-weight:700">What happens next</p>
         <p style="margin:0 0 6px"><b>1 to 2 days:</b> we review your application and documents.</p>
         <p style="margin:0 0 6px"><b>Within 3 days:</b> we contact you by email or phone.</p>
         <p style="margin:0 0 16px"><b>Then:</b> if approved, we send you the onboarding documents.</p>
         <p style="margin:0 0 12px">Questions, or something to update? Just reply to this email.</p>
         <p style="margin:0">Kind regards,<br>The Heliaxis team</p>`,
      undefined,
      'Subcontractor portal',
      `heliaxis.co.uk · Submitted ${when}. Keep this email for your records.`
    );

    // Send email to admin (YOU) - Using direct fetch like drip-v1
    console.log('📤 Sending admin email to:', process.env.ADMIN_EMAIL);
    
    const adminEmailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'Heliaxis Subcontractors <noreply@heliaxis.co.uk>',
        to: [process.env.ADMIN_EMAIL || 'hello@heliaxis.co.uk'],
        subject: `🔔 New Subcontractor Onboarding: ${data.companyName}`,
        html: adminEmailHtml,
        reply_to: data.email,
        attachments: attachments.length > 0 ? attachments : undefined,
      }),
    });

    const adminEmail = await adminEmailResponse.json();
    console.log('✅ Admin email response:', JSON.stringify(adminEmail, null, 2));
    
    if (!adminEmailResponse.ok) {
      console.error('❌ Failed to send admin email:', adminEmail);
      throw new Error(`Failed to send admin email: ${adminEmail.message || 'Unknown error'}`);
    }
    
    console.log('✅ Admin email sent! ID:', adminEmail.id);

    // Send receipt to user if they checked the box
    let userEmail = null;
    if (data.sendEmailReceipt) {
      console.log('📤 Sending receipt email to:', data.email);
      
      const userEmailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'Heliaxis Subcontractors <noreply@heliaxis.co.uk>',
          to: [data.email],
          subject: '✅ Confirmation: Your Subcontractor Onboarding Submission',
          html: userReceiptHtml,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      });

      userEmail = await userEmailResponse.json();
      console.log('📊 User email response:', JSON.stringify(userEmail, null, 2));
      
      if (!userEmailResponse.ok) {
        console.error('❌ Failed to send user receipt:', userEmail);
        // Don't throw error for user receipt - admin email is more important
      } else {
        console.log('✅ User receipt sent! ID:', userEmail.id);
      }
    }

    console.log('✅ Form submission complete!');

    return NextResponse.json({
      success: true,
      message: 'Form submitted successfully',
      adminEmailId: adminEmail.id,
      userEmailId: userEmail?.id,
      debug: {
        apiKeyExists: !!resendKey,
        adminEmail: process.env.ADMIN_EMAIL,
        userEmail: data.email,
        receiptRequested: data.sendEmailReceipt,
      }
    });

  } catch (error) {
    console.error('❌ Error processing form submission:', error);
    console.error('❌ Full error details:', JSON.stringify(error, null, 2));
    
    // Log specific error details
    if (error instanceof Error) {
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to process submission',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
      },
      { status: 500 }
    );
  }
}

