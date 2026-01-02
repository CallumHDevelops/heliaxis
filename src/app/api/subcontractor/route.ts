import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Check if environment variables are set
    console.log('🔑 Resend API Key exists:', !!process.env.RESEND_API_KEY);
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

    // Admin email HTML - Simple and Clean
    const adminEmailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
            .container { max-width: 650px; margin: 20px auto; background: white; }
            .header { background: #2563eb; color: white; padding: 25px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; }
            .info-row { margin: 15px 0; padding: 12px; background: #f9fafb; border-radius: 5px; }
            .label { font-weight: bold; color: #374151; }
            .value { color: #1f2937; margin-top: 5px; }
            .section { margin: 25px 0; }
            .section-title { font-size: 16px; font-weight: bold; color: #1f2937; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #e5e7eb; }
            .footer { background: #f9fafb; padding: 15px; text-align: center; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📋 New Subcontractor Form Submission</h1>
              <p style="margin: 5px 0; opacity: 0.9;">Company: ${data.companyName}</p>
            </div>
            <div class="content">
              <div class="section">
                <div class="section-title">Contact Information</div>
                <div class="info-row">
                  <div class="label">Full Name</div>
                  <div class="value">${data.fullName}</div>
                </div>
                <div class="info-row">
                  <div class="label">Email</div>
                  <div class="value"><a href="mailto:${data.email}">${data.email}</a></div>
                </div>
                <div class="info-row">
                  <div class="label">Phone</div>
                  <div class="value"><a href="tel:${data.contactNumber}">${data.contactNumber}</a></div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">Company Details</div>
                <div class="info-row">
                  <div class="label">Business Registration Number</div>
                  <div class="value">${data.businessRegNumber}</div>
                </div>
                <div class="info-row">
                  <div class="label">Business Address</div>
                  <div class="value">${data.businessAddress}</div>
                </div>
                <div class="info-row">
                  <div class="label">VAT Number</div>
                  <div class="value">${data.vatNumber || 'Not provided'}</div>
                </div>
                <div class="info-row">
                  <div class="label">CIS Number</div>
                  <div class="value">${data.cisNumber || 'Not provided'}</div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">Payment Information</div>
                <div class="info-row">
                  <div class="label">Bank Details</div>
                  <div class="value">${data.bankDetails}</div>
                </div>
                <div class="info-row">
                  <div class="label">Payment Terms</div>
                  <div class="value">${data.paymentTerms}</div>
                </div>
              </div>

              ${data.additionalInfo ? `
              <div class="section">
                <div class="section-title">Additional Information</div>
                <div class="info-row">
                  <div class="value">${data.additionalInfo}</div>
                </div>
              </div>
              ` : ''}

              ${attachments.length > 0 ? `
              <div class="section">
                <div class="section-title">📎 Attachments</div>
                <div class="info-row">
                  <div class="value">${attachments.length} file(s) attached to this email</div>
                </div>
              </div>
              ` : ''}
            </div>
            
            <div class="footer">
              <p style="margin: 5px 0;">Submitted: ${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // User receipt email HTML
    const userReceiptHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.8; color: #374151; background: #f9fafb; }
            .container { max-width: 600px; margin: 30px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; }
            .success-icon { font-size: 60px; margin-bottom: 15px; animation: bounce 1s; }
            .content { padding: 40px 30px; background: white; }
            .greeting { font-size: 18px; color: #111827; margin-bottom: 20px; }
            .summary-card { background: #f0fdf4; border: 2px solid #86efac; border-radius: 8px; padding: 20px; margin: 25px 0; }
            .summary-card h3 { color: #065f46; margin: 0 0 15px 0; }
            .field { margin: 10px 0; padding: 5px 0; }
            .label { font-weight: 600; color: #6b7280; font-size: 14px; }
            .value { color: #111827; font-size: 15px; }
            .timeline { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 25px 0; border-radius: 5px; }
            .timeline h3 { color: #1e40af; margin: 0 0 15px 0; }
            .timeline-step { margin: 10px 0; padding-left: 10px; }
            .help-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 25px 0; border-radius: 5px; }
            .footer { background: #f9fafb; padding: 25px; text-align: center; color: #6b7280; font-size: 13px; }
            @keyframes bounce { 0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-20px); } 60% { transform: translateY(-10px); } }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="success-icon">✅</div>
              <h1 style="margin: 0; font-size: 28px;">Application Received!</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 16px;">Thank you for submitting your information</p>
            </div>
            <div class="content">
              <p class="greeting">Dear <strong>${data.fullName}</strong>,</p>
              
              <p>Great news! We've successfully received your subcontractor onboarding application for <strong>${data.companyName}</strong>.</p>

              <div class="summary-card">
                <h3>📋 Your Submission Summary</h3>
                <div class="field"><span class="label">Company:</span> <span class="value">${data.companyName}</span></div>
                <div class="field"><span class="label">Contact Email:</span> <span class="value">${data.email}</span></div>
                <div class="field"><span class="label">Phone:</span> <span class="value">${data.contactNumber}</span></div>
                <div class="field"><span class="label">Payment Terms:</span> <span class="value">${data.paymentTerms}</span></div>
                ${attachments.length > 0 ? `<div class="field"><span class="label">Documents Uploaded:</span> <span class="value">${attachments.length} file(s)</span></div>` : ''}
              </div>

              <div class="timeline">
                <h3>⏰ What Happens Next?</h3>
                <div class="timeline-step"><strong>1-2 Days:</strong> Our team reviews your application and documents</div>
                <div class="timeline-step"><strong>3 Days:</strong> We'll contact you via email or phone</div>
                <div class="timeline-step"><strong>Next Steps:</strong> If approved, we'll send you the onboarding documents</div>
              </div>

              <div class="help-box">
                <strong>💬 Need Help?</strong><br>
                If you have any questions or need to update your information, please reply to this email. We're here to help!
              </div>

              <p style="margin: 30px 0 0 0; color: #6b7280;">
                Thank you for choosing to work with us. We look forward to a successful partnership!
              </p>

              <p style="margin: 15px 0 0 0; color: #111827;">
                <strong>Best regards,</strong><br>
                The Heliaxis Team
              </p>
            </div>
            
            <div class="footer">
              <p style="margin: 5px 0;"><strong>Submitted:</strong> ${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}</p>
              <p style="margin: 10px 0;">Keep this email for your records</p>
              <p style="margin: 10px 0; font-size: 11px; color: #9ca3af;">This is an automated confirmation from Subcontractor Portal</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send email to admin (YOU) - Using direct fetch like drip-v1
    console.log('📤 Sending admin email to:', process.env.ADMIN_EMAIL);
    
    const adminEmailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Subcontractor Portal <onboarding@resend.dev>',
        to: [process.env.ADMIN_EMAIL || 'your-email@example.com'],
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
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Subcontractor Portal <onboarding@resend.dev>',
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
        apiKeyExists: !!process.env.RESEND_API_KEY,
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

