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

    // Extract files (note: file handling with Resend requires different approach)
    const insuranceDocs: string[] = [];
    const qualificationDocs: string[] = [];
    
    formData.forEach((value, key) => {
      if (key.startsWith('insuranceDoc') && value instanceof File) {
        insuranceDocs.push(value.name);
      }
      if (key.startsWith('qualificationDoc') && value instanceof File) {
        qualificationDocs.push(value.name);
      }
    });

    // Admin email HTML
    const adminEmailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
            .field { margin-bottom: 20px; }
            .label { font-weight: bold; color: #555; display: block; margin-bottom: 5px; }
            .value { background: white; padding: 10px; border-radius: 5px; border: 1px solid #e0e0e0; }
            .section-title { font-size: 18px; font-weight: bold; color: #667eea; margin-top: 25px; margin-bottom: 15px; border-bottom: 2px solid #667eea; padding-bottom: 5px; }
            .file-list { background: white; padding: 10px; border-radius: 5px; border: 1px solid #e0e0e0; }
            .file-item { padding: 5px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔔 New Subcontractor Onboarding Submission</h1>
              <p>A new subcontractor has submitted their onboarding form</p>
            </div>
            <div class="content">
              <div class="section-title">📋 Company Information</div>
              
              <div class="field">
                <span class="label">Company Name</span>
                <div class="value">${data.companyName}</div>
              </div>
              
              <div class="field">
                <span class="label">Business Registration Number</span>
                <div class="value">${data.businessRegNumber}</div>
              </div>
              
              <div class="field">
                <span class="label">Registered Business Address</span>
                <div class="value">${data.businessAddress}</div>
              </div>
              
              <div class="field">
                <span class="label">VAT Number</span>
                <div class="value">${data.vatNumber || 'Not provided'}</div>
              </div>
              
              <div class="field">
                <span class="label">CIS Number</span>
                <div class="value">${data.cisNumber || 'Not applicable'}</div>
              </div>

              <div class="section-title">👤 Contact Information</div>
              
              <div class="field">
                <span class="label">Full Name</span>
                <div class="value">${data.fullName}</div>
              </div>
              
              <div class="field">
                <span class="label">Email Address</span>
                <div class="value"><a href="mailto:${data.email}">${data.email}</a></div>
              </div>
              
              <div class="field">
                <span class="label">Contact Number</span>
                <div class="value"><a href="tel:${data.contactNumber}">${data.contactNumber}</a></div>
              </div>

              <div class="section-title">💰 Financial Information</div>
              
              <div class="field">
                <span class="label">Bank Details</span>
                <div class="value">${data.bankDetails}</div>
              </div>
              
              <div class="field">
                <span class="label">Payment Terms</span>
                <div class="value">${data.paymentTerms}</div>
              </div>

              ${insuranceDocs.length > 0 ? `
              <div class="section-title">📎 Insurance Documents</div>
              <div class="file-list">
                ${insuranceDocs.map((file, idx) => `<div class="file-item">📄 ${file}</div>`).join('')}
              </div>
              ` : ''}

              ${qualificationDocs.length > 0 ? `
              <div class="section-title">🎓 Qualification Documents</div>
              <div class="file-list">
                ${qualificationDocs.map((file, idx) => `<div class="file-item">📄 ${file}</div>`).join('')}
              </div>
              ` : ''}

              ${data.additionalInfo ? `
              <div class="section-title">📝 Additional Information</div>
              <div class="field">
                <div class="value">${data.additionalInfo}</div>
              </div>
              ` : ''}

              <p style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #ddd; color: #666; font-size: 12px;">
                This form was submitted on ${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}
              </p>
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
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
            .success-icon { font-size: 48px; margin-bottom: 10px; }
            .field { margin-bottom: 15px; }
            .label { font-weight: bold; color: #555; }
            .value { color: #333; }
            .section-title { font-size: 18px; font-weight: bold; color: #667eea; margin-top: 25px; margin-bottom: 15px; }
            .note { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-top: 20px; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="success-icon">✅</div>
              <h1>Submission Confirmed!</h1>
              <p>Thank you for completing your subcontractor onboarding form</p>
            </div>
            <div class="content">
              <p>Dear <strong>${data.fullName}</strong>,</p>
              
              <p>We have successfully received your subcontractor onboarding form submission. Below is a copy of the information you provided for your records:</p>

              <div class="section-title">Company Information</div>
              <div class="field"><span class="label">Company Name:</span> ${data.companyName}</div>
              <div class="field"><span class="label">Business Registration Number:</span> ${data.businessRegNumber}</div>
              <div class="field"><span class="label">Business Address:</span> ${data.businessAddress}</div>
              <div class="field"><span class="label">VAT Number:</span> ${data.vatNumber || 'Not provided'}</div>
              
              <div class="section-title">Contact Details</div>
              <div class="field"><span class="label">Email:</span> ${data.email}</div>
              <div class="field"><span class="label">Phone:</span> ${data.contactNumber}</div>
              
              <div class="section-title">Payment Information</div>
              <div class="field"><span class="label">Payment Terms:</span> ${data.paymentTerms}</div>

              ${insuranceDocs.length > 0 ? `
              <div class="section-title">Uploaded Documents</div>
              <div class="field">
                <span class="label">Insurance Documents:</span> ${insuranceDocs.length} file(s)
              </div>
              ` : ''}

              ${qualificationDocs.length > 0 ? `
              <div class="field">
                <span class="label">Qualification Documents:</span> ${qualificationDocs.length} file(s)
              </div>
              ` : ''}

              <div class="note">
                <strong>⏰ What happens next?</strong><br>
                Our team will review your submission within 2-3 business days. You will receive an email from us once the review is complete.
              </div>

              <p style="margin-top: 30px;">
                If you have any questions or need to make changes to your submission, please don't hesitate to contact us.
              </p>

              <p style="margin-top: 20px;">
                Best regards,<br>
                <strong>The Team</strong>
              </p>

              <p style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #ddd; color: #666; font-size: 12px;">
                Submitted on: ${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}
              </p>
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

