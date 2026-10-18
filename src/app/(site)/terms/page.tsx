import type { Metadata } from 'next';
import Link from 'next/link';
import '../home.css';
import { COMPANY, LegalPage, type LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Website terms | Heliaxis',
  description: 'The terms for using the Heliaxis website, our online tools, messaging and the customer portal.',
  alternates: { canonical: '/terms' },
};

const UPDATED = '18 October 2026';

const sections: LegalSection[] = [
  {
    id: 'who',
    title: 'Who we are',
    body: (
      <p>
        heliaxis.co.uk is run by {COMPANY.name}, a company registered in England &amp; Wales (No. {COMPANY.number}), at{' '}
        {COMPANY.address}. You can reach us at <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> or{' '}
        <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>. By using this website you agree to these terms. If you don’t agree,
        please don’t use it.
      </p>
    ),
  },
  {
    id: 'information',
    title: 'Information, estimates and quotes',
    body: (
      <>
        <p>
          The information on this website is general guidance. It isn’t advice for your particular home or business. Figures
          from our online tools, such as the solar estimator and roof designer, are <strong>estimates</strong>, not quotes or
          promises of savings, generation or payback.
        </p>
        <p>
          A quote only becomes binding once we’ve issued it to you in writing and you’ve accepted it. Any installation is then
          covered by that written quote and our terms of business, not by these website terms.
        </p>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights as a customer',
    body: (
      <p>
        Nothing in these terms affects your legal rights as a consumer, including your right to cancel within 14 days where
        the Consumer Contracts Regulations apply. As a member of RECC (the Renewable Energy Consumer Code), we also follow its
        standards for selling and installing renewable energy systems to homes.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Messages from us',
    body: (
      <>
        <p>
          When you send us an enquiry, you agree that we can contact you about it by WhatsApp, email or phone using the details
          you gave. That includes follow-ups, booking confirmations and reminders about your survey or installation.
        </p>
        <p>
          You can ask us to stop at any time. Just tell us in reply on WhatsApp, or email{' '}
          <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>, and we’ll stop. We don’t send marketing unless you’ve agreed to it.
        </p>
      </>
    ),
  },
  {
    id: 'portal',
    title: 'Your customer portal',
    body: (
      <>
        <p>
          Once your job starts, we may give you a private link to your project page. It shows your progress, documents and
          photos, and lets you pay a deposit. Anyone with the link can open it, so please don’t share it. If you think someone
          else has it, tell us and we’ll issue a new link.
        </p>
        <p>Card payments are handled securely by Stripe. We never see or store your full card details.</p>
      </>
    ),
  },
  {
    id: 'use',
    title: 'Using the website',
    body: (
      <>
        <p>Please don’t:</p>
        <ul>
          <li>use the website for anything unlawful, or to send spam or harmful material</li>
          <li>try to get into parts of the website, our systems or other people’s information that aren’t meant for you</li>
          <li>copy large parts of the website, or use automated tools to scrape it</li>
        </ul>
        <p>
          The website’s text, images, designs and logos belong to us or the people who license them to us. You’re welcome to
          share links and view or print pages for your own use.
        </p>
      </>
    ),
  },
  {
    id: 'availability',
    title: 'Availability and links',
    body: (
      <p>
        We try to keep the website accurate and available, but we can’t promise it will always be error-free or online. Where
        we link to other websites, such as grant schemes, manufacturers or regulators, we aren’t responsible for their content.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Our responsibility to you',
    body: (
      <p>
        We’re not responsible for losses that come from relying on general information or estimates on this website rather than
        a written quote. Nothing in these terms limits our liability for death or personal injury caused by our negligence, for
        fraud, or for anything else the law doesn’t allow us to limit.
      </p>
    ),
  },
  {
    id: 'privacy',
    title: 'Privacy',
    body: (
      <p>
        How we use personal information is explained in our <Link href="/privacy-policy">privacy policy</Link>. You can ask us to
        delete your data at any time. See <Link href="/data-deletion">delete your data</Link>.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes and law',
    body: (
      <p>
        We may update these terms from time to time; the date at the top shows when they last changed. These terms are governed
        by the law of England and Wales, and the courts of England and Wales can deal with any dispute. If you live in
        Scotland or Northern Ireland, you can also bring proceedings in your local courts.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Website terms"
      intro={<p>The plain-English terms for using our website, our online tools, messages from us and your customer portal.</p>}
      updated={UPDATED}
      sections={sections}
    />
  );
}
