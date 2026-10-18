import type { Metadata } from 'next';
import Link from 'next/link';
import '../home.css';
import { COMPANY, LegalPage, type LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Delete your data | Heliaxis',
  description: 'How to ask Heliaxis to delete the personal information we hold about you, what we delete, and what the law says we must keep.',
  alternates: { canonical: '/data-deletion' },
};

const UPDATED = '18 October 2026';

const sections: LegalSection[] = [
  {
    id: 'how',
    title: 'How to ask',
    body: (
      <>
        <p>Contact us in whichever way suits you:</p>
        <ul>
          <li>
            Email <a href={`mailto:${COMPANY.email}?subject=Delete%20my%20data`}>{COMPANY.email}</a> with the subject{' '}
            <strong>“Delete my data”</strong>
          </li>
          <li>Send us a WhatsApp message on the number you’ve been chatting with us on</li>
          <li>
            Call <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>
          </li>
          <li>Write to {COMPANY.name}, {COMPANY.address}</li>
        </ul>
        <p>
          Tell us your name and the email address or phone number you used with us (and your postcode, if you had a survey or
          installation), so we can find everything. If we can’t be sure the request is from you, we may ask you to confirm
          who you are before we delete anything.
        </p>
      </>
    ),
  },
  {
    id: 'what',
    title: 'What we delete',
    body: (
      <>
        <p>Unless the law says we must keep it (see below), we delete:</p>
        <ul>
          <li>your enquiry and contact details</li>
          <li>our notes, tasks and the timeline we keep about you</li>
          <li>WhatsApp messages and emails stored in our systems</li>
          <li>photos and documents we hold for your project, and access to your customer portal</li>
          <li>any drafts or notes our team or our assistant prepared about you</li>
        </ul>
        <p>
          We also stop all messages to you, including reminders and follow-ups. Messages already in your own WhatsApp or email
          stay on your device. You can delete those yourself.
        </p>
      </>
    ),
  },
  {
    id: 'keep',
    title: 'What we may have to keep',
    body: (
      <>
        <p>If we’ve done work for you, the law and the schemes we belong to require us to keep some records for a set time:</p>
        <ul>
          <li>
            <strong>Invoices and payment records</strong>, for at least 6 years, for HMRC
          </li>
          <li>
            <strong>Installation, certification and warranty records</strong> (for example MCS certificates, electrical
            certificates and grid (DNO) notifications), for as long as the warranty or scheme requires
          </li>
          <li>
            <strong>Records we need to deal with a complaint or legal claim</strong>, until it’s resolved
          </li>
        </ul>
        <p>We keep only what those reasons need, use it only for them, and delete it when the time is up.</p>
      </>
    ),
  },
  {
    id: 'when',
    title: 'How long it takes',
    body: (
      <p>
        We’ll confirm we’ve received your request and finish within <strong>one month</strong>, as UK data protection law
        requires. Most requests take a few days. We’ll tell you when it’s done and what, if anything, we’ve had to keep and why.
      </p>
    ),
  },
  {
    id: 'facebook',
    title: 'If you contacted us through Facebook, Instagram or WhatsApp',
    body: (
      <>
        <p>
          If you sent us an enquiry through a Facebook or Instagram lead form, or messaged us on WhatsApp, the steps above
          delete the copy <strong>we</strong> hold. Meta (Facebook, Instagram and WhatsApp) keeps its own copy under its own
          privacy policy. You can manage that in your Facebook, Instagram or WhatsApp settings.
        </p>
        <p>We don’t use Facebook Login and we don’t get access to your Facebook account.</p>
      </>
    ),
  },
  {
    id: 'more',
    title: 'More about your data',
    body: (
      <p>
        Our <Link href="/privacy-policy">privacy policy</Link> explains what we collect, why, who helps us process it and all your
        rights. If you’re unhappy with how we handle a request, you can complain to the Information Commissioner’s Office at{' '}
        <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer">
          ico.org.uk
        </a>
        .
      </p>
    ),
  },
];

export default function DataDeletionPage() {
  return (
    <LegalPage
      eyebrow="Your data"
      title="Delete your data"
      intro={<p>You can ask us to delete the personal information we hold about you at any time. Here’s how, and what happens next.</p>}
      updated={UPDATED}
      sections={sections}
    />
  );
}
