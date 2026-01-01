# 📧 "Send Me an Email Receipt" - Explained Simply

## What Does This Checkbox Mean?

When someone fills out your subcontractor form, they see this option:

```
☑️ Send me a confirmation email
   Check this box to receive a copy of your submission for your records.
```

---

## Who Gets What Email?

### Scenario 1: User CHECKS the box ✅

**YOU (Admin) receive:**
- ✉️ Email with complete form details
- 📋 All company information
- 👤 Contact details
- 💰 Payment terms
- 📎 List of uploaded files
- **Subject:** "🔔 New Subcontractor Onboarding: [Company Name]"

**THEY (User) receive:**
- ✉️ Confirmation email (receipt)
- ✅ "Your submission was successful"
- 📄 Copy of everything they submitted
- ⏰ "We'll review within 2-3 business days"
- **Subject:** "✅ Confirmation: Your Subcontractor Onboarding Submission"

### Scenario 2: User DOESN'T check the box ⬜

**YOU (Admin) receive:**
- ✉️ Email with complete form details (same as above)

**THEY (User) receive:**
- ❌ Nothing
- Only see success message on the page

---

## Real-World Example

Imagine I'm a contractor named "John Smith" from "ABC Construction":

### If I CHECK the box:
1. I fill out the form
2. I check ☑️ "Send me a confirmation email"
3. I click "Submit"
4. **I see:** Green success message on screen
5. **I receive:** Email confirmation at my inbox
6. **You receive:** Notification about my submission

### If I DON'T check the box:
1. I fill out the form
2. I leave ⬜ "Send me a confirmation email" unchecked
3. I click "Submit"
4. **I see:** Green success message on screen (that's it)
5. **I receive:** Nothing
6. **You receive:** Notification about my submission (same as above)

---

## Why Would Users Want a Receipt?

✅ **Proof of Submission**
- They have evidence they submitted on a specific date/time

✅ **Record Keeping**
- They can file it with their business records

✅ **Reference**
- They can refer back to exactly what they submitted

✅ **Professional**
- Shows your business is organized and professional

✅ **Peace of Mind**
- Confirms their submission didn't get lost

---

## What's in Each Email?

### Admin Email (What YOU Get)

```
Subject: 🔔 New Subcontractor Onboarding: ABC Construction

┌─────────────────────────────────────┐
│   New Onboarding Submission         │
│   A new subcontractor has submitted │
└─────────────────────────────────────┘

📋 Company Information
━━━━━━━━━━━━━━━━━━━━━━
Company Name: ABC Construction
Business Reg #: 12345678
Address: 123 Main St, London
VAT: GB123456789

👤 Contact Information  
━━━━━━━━━━━━━━━━━━━━━━
Name: John Smith
Email: john@abcconstruction.com
Phone: 07700 900000

💰 Financial Information
━━━━━━━━━━━━━━━━━━━━━━
Bank: HSBC, Acc: 12345678, Sort: 12-34-56
Payment Terms: 14 Day

📎 Insurance Documents
━━━━━━━━━━━━━━━━━━━━━━
📄 public-liability.pdf
📄 employers-liability.pdf

Submitted: Monday, 31 Dec 2025, 14:30
```

### User Receipt Email (What THEY Get if checked)

```
Subject: ✅ Confirmation: Your Subcontractor Onboarding Submission

┌─────────────────────────────────────┐
│        ✅ Submission Confirmed!     │
│   Thank you for completing the form │
└─────────────────────────────────────┘

Dear John Smith,

We have successfully received your subcontractor 
onboarding form submission.

Below is a copy of your information:

Company Information
━━━━━━━━━━━━━━━━━━━
Company: ABC Construction
Registration: 12345678
Email: john@abcconstruction.com
Phone: 07700 900000

Payment Information
━━━━━━━━━━━━━━━━━━━
Terms: 14 Day

Uploaded Documents
━━━━━━━━━━━━━━━━━━━
Insurance Documents: 2 file(s)

⏰ What happens next?
Our team will review your submission within 
2-3 business days.

Best regards,
The Team

Submitted: Monday, 31 Dec 2025, 14:30
```

---

## Technical Details

### How It Works:

```javascript
if (userCheckedTheBox) {
  sendEmail({
    to: ADMIN_EMAIL,      // You
    subject: "New submission"
  });
  
  sendEmail({
    to: userEmail,         // Them
    subject: "Confirmation"
  });
} else {
  sendEmail({
    to: ADMIN_EMAIL,      // Only you
    subject: "New submission"
  });
}
```

### Behind the Scenes:
1. User submits form
2. Form data sent to `/api/subcontractor`
3. API checks if `sendEmailReceipt` is `true`
4. Always sends email to YOU (admin)
5. If checked: Also sends email to THEM (user)

---

## Key Points

✅ **You ALWAYS get notified** - regardless of checkbox

✅ **They ONLY get email if they want it** - their choice

✅ **Completely optional** - not required to submit

✅ **Professional touch** - makes your business look good

✅ **No extra cost** - same price whether checked or not

---

## Comparison with Other Services

**Like Google Forms:**
- "Send me a copy of my responses" ✅

**Like TypeForm:**
- "Email me a confirmation" ✅

**Like Online Shopping:**
- "Send order confirmation to my email" ✅

It's a standard practice for professional forms!

---

## Bottom Line

**The checkbox = User wants proof of what they submitted**

- YOU always get their submission ✅
- THEY get a copy only if they check the box ✅
- Simple, professional, optional ✅

---

**Still confused? Think of it like this:**

When you buy something online:
- Store always gets the order ✅ (like you getting the admin email)
- You get receipt IF you want ✅ (like the user receipt email)
- Your choice! ✅ (the checkbox)

