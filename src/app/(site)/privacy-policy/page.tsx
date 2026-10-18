import type { Metadata } from 'next';
import Link from 'next/link';
import '../home.css';
import { COMPANY, LegalPage, type LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy policy | Heliaxis',
  description:
    'How Heliaxis collects, uses, shares and protects personal information when you visit our website, enquire, become a customer or work with us.',
  alternates: { canonical: '/privacy-policy' },
};

const UPDATED = '18 October 2026';
const mail = <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>;

const sections: LegalSection[] = [
  {
    id: 'who',
    title: 'Who we are',
    body: (
      <>
        <p>
          {COMPANY.name} (“Heliaxis”, “we”, “us”) designs and installs solar panels, batteries, heat pumps, EV chargers and
          related systems for homes and businesses in South Wales. We’re a company registered in England &amp; Wales (No.{' '}
          {COMPANY.number}) at {COMPANY.address}.
        </p>
        <p>
          We’re the <strong>controller</strong> of the personal information described here, which means we decide how it’s
          used. For anything about your data, contact us at {mail}, on <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>, or by
          post at the address above.
        </p>
      </>
    ),
  },
  {
    id: 'summary',
    title: 'The short version',
    body: (
      <div className="lg-box">
        <ul>
          <li>We use your details to answer your enquiry, quote, install and look after your system.</li>
          <li>We talk to customers mainly by WhatsApp and email. Some reminders and replies are sent automatically.</li>
          <li>We use trusted service providers (for hosting, email, messaging and payments). Some are based in the US.</li>
          <li>We don’t sell your data. We measure our website and our adverts, and you can object to that.</li>
          <li>
            You can see, correct or delete your information at any time. See <Link href="/data-deletion">delete your data</Link>.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'collect',
    title: 'What we collect and where it comes from',
    body: (
      <>
        <h3>When you visit our website</h3>
        <ul>
          <li>
            Technical information your browser sends, such as your IP address, device and browser type, the pages you visit and
            the website or advert that brought you here.
          </li>
          <li>
            If you arrive from one of our adverts, the campaign details and the Facebook/Google click reference in the web
            address (see <a href="#cookies">cookies</a>).
          </li>
          <li>
            Where you click on our pages (as anonymous positions on the page, not linked to you), to help us improve the design.
          </li>
          <li>
            If you use our <strong>roof designer</strong>, the postcode you type is looked up by a postcode service and the map
            loads satellite images of that location. The design itself stays in your browser; we don’t receive it. The{' '}
            <strong>solar estimator</strong> runs entirely in your browser.
          </li>
        </ul>

        <h3>When you enquire</h3>
        <ul>
          <li>
            Your name, email, phone number, postcode, the products you’re interested in, your type of property or business, and
            anything you write in your message. This comes from our website forms, Facebook or Instagram lead forms, WhatsApp,
            email, phone calls or meeting us in person.
          </li>
          <li>
            If you message us on WhatsApp: your WhatsApp number and profile name, and the messages you send, including captions,
            file names and any location you share. Photos and files you send stay with WhatsApp (Meta). We don’t copy them into
            our own systems.
          </li>
          <li>Which advert or campaign your enquiry came from.</li>
        </ul>
        <p>
          Please don’t send us health or other sensitive information unless it’s relevant (for example, if someone in the home
          is vulnerable and we should take extra care). If you do, we’ll only use it for that purpose.
        </p>

        <h3>When you become a customer</h3>
        <ul>
          <li>Your address, survey details, system design, quotes, invoices, contracts and certificates.</li>
          <li>
            Photos of your property taken at survey and during installation (roof, fuse board, meter and work areas), with notes.
          </li>
          <li>
            If you accept a quote online: the name you type, your drawn signature, the date and time, and your IP address, as
            a record of your acceptance.
          </li>
          <li>
            If you pay a deposit online: the amount and the fact it’s paid. Card payments are taken by Stripe. We never see or
            store your card details.
          </li>
          <li>Information from your energy network operator (DNO) about your grid connection application.</li>
          <li>Our notes about calls, visits, messages and emails with you.</li>
        </ul>

        <h3>If you work with us as a subcontractor or operative</h3>
        <p>
          See <a href="#subcontractors">subcontractors and operatives</a>.
        </p>
      </>
    ),
  },
  {
    id: 'use',
    title: 'How we use it, and our legal reasons',
    body: (
      <>
        <p>Data protection law requires a legal reason (“lawful basis”) for each use:</p>
        <table className="lg-table">
          <thead>
            <tr>
              <th>What we do</th>
              <th>Lawful basis</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Reply to your enquiry, arrange a survey and prepare a quote</td>
              <td>Taking steps at your request before a contract; our legitimate interests for business enquiries</td>
            </tr>
            <tr>
              <td>
                Carry out the installation: design, scheduling, booking confirmations and reminders, your project page, documents,
                certificates and aftercare
              </td>
              <td>Performing our contract with you</td>
            </tr>
            <tr>
              <td>Take deposits and payments, and keep accounting records</td>
              <td>Contract; legal obligation (tax and company law)</td>
            </tr>
            <tr>
              <td>Notify your network operator (DNO) and register certificates (for example with MCS)</td>
              <td>Legal obligation; contract</td>
            </tr>
            <tr>
              <td>Keep a record of your quote acceptance and signature</td>
              <td>Contract; legitimate interests (being able to show what was agreed)</td>
            </tr>
            <tr>
              <td>Follow up enquiries you haven’t replied to, and ask customers for a review after an installation</td>
              <td>Legitimate interests. You can opt out at any time</td>
            </tr>
            <tr>
              <td>
                Measure how our website and adverts perform (see <a href="#advertising">advertising</a> and{' '}
                <a href="#cookies">cookies</a>)
              </td>
              <td>Legitimate interests. You can object at any time</td>
            </tr>
            <tr>
              <td>Keep our systems secure, prevent misuse and handle complaints or legal claims</td>
              <td>Legitimate interests; legal obligation</td>
            </tr>
          </tbody>
        </table>
        <p>
          Where we rely on legitimate interests, we’ve weighed our interests against yours, and you have the right to object
          (see <a href="#rights">your rights</a>).
        </p>
      </>
    ),
  },
  {
    id: 'messages',
    title: 'Messages from us, and automation',
    body: (
      <>
        <p>We prefer to keep in touch by WhatsApp and email, so you have everything in writing.</p>
        <ul>
          <li>
            <strong>Some messages are sent automatically</strong>: booking confirmations, reminders before your survey or
            installation, a follow-up if we haven’t heard back, and a review request after your installation. Some quick replies
            to common questions are also prepared automatically and may be sent by our system after a short delay. Every
            conversation is handled by our team, and you can always ask to speak to a person.
          </li>
          <li>
            Our team uses an <strong>AI assistant</strong> (Claude, made by Anthropic) to help with admin, such as summarising
            notes, organising tasks and drafting messages. It can see the details we hold about the customers it’s helping with.
            A member of our team reviews any message before it’s sent to you. The assistant doesn’t make decisions about you.
          </li>
          <li>
            We use simple automatic rules to share new enquiries fairly between our team and to remind us to reply quickly. None
            of this has legal or similarly significant effects on you.
          </li>
        </ul>
        <p>
          To stop follow-ups or review requests, just tell us in reply on WhatsApp or email {mail}. We’ll still send messages we
          need to for a job that’s in progress (such as installation details) unless you ask us to use another method.
        </p>
      </>
    ),
  },
  {
    id: 'advertising',
    title: 'Advertising and measuring our adverts',
    body: (
      <>
        <p>
          We advertise on Facebook and Instagram (Meta). To see which adverts lead to real customers, and to help Meta show our
          adverts to people more likely to be interested, we send Meta a small amount of information when an enquiry moves forward
          (for example, when a survey is booked, a quote is sent or a job is won):
        </p>
        <ul>
          <li>your email address and WhatsApp number in a scrambled (“hashed”) form, not as readable text</li>
          <li>the advert click reference or Meta lead reference, if you came from one of our adverts</li>
          <li>the type of step and, when a job is won, its value</li>
        </ul>
        <p>
          We don’t send your name, address or the content of your messages. Meta uses this under its own terms and may combine it
          with what it already knows to measure and improve adverts.{' '}
          <strong>You can object at any time</strong>. Tell us, and we’ll stop sending your information to Meta.
        </p>
        <p>
          If you fill in a lead form on Facebook or Instagram, Meta passes us the answers you give in that form.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share it with',
    body: (
      <>
        <p>
          We don’t sell your personal information. We share it only with organisations that help us run our business, under
          contracts that require them to protect it and use it only on our instructions, and with others where the law requires
          or the job needs it:
        </p>
        <table className="lg-table">
          <thead>
            <tr>
              <th>Who</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vercel (US)</td>
              <td>Hosts our website and systems (our servers run in London)</td>
            </tr>
            <tr>
              <td>Supabase (US)</td>
              <td>Our database and secure file storage</td>
            </tr>
            <tr>
              <td>Meta: WhatsApp, Facebook, Instagram (Ireland/US)</td>
              <td>
                WhatsApp messages, Facebook/Instagram lead forms, and <a href="#advertising">advert measurement</a>
              </td>
            </tr>
            <tr>
              <td>Microsoft 365 (US)</td>
              <td>Our email and calendar</td>
            </tr>
            <tr>
              <td>Resend (US)</td>
              <td>Sends automated emails, such as enquiry notifications to our team</td>
            </tr>
            <tr>
              <td>Stripe (US)</td>
              <td>Card payments for deposits (Stripe is also responsible for its own use of payment data)</td>
            </tr>
            <tr>
              <td>Anthropic (US)</td>
              <td>
                The <a href="#messages">AI assistant</a> our team uses
              </td>
            </tr>
            <tr>
              <td>Google (US)</td>
              <td>Website analytics, web fonts, and delivery of our team’s app notifications</td>
            </tr>
            <tr>
              <td>Umami (US)</td>
              <td>Privacy-friendly website statistics, without cookies</td>
            </tr>
            <tr>
              <td>postcodes.io (UK), Esri (US), OpenStreetMap (UK), Cloudflare (US)</td>
              <td>Postcode lookups, maps and satellite images in our roof designer and internal maps</td>
            </tr>
            <tr>
              <td>Our installation partners and subcontractors</td>
              <td>Your site address and the job details they need to do the work safely</td>
            </tr>
            <tr>
              <td>Your energy network operator (DNO), MCS and certification bodies</td>
              <td>Grid connection applications and system registration</td>
            </tr>
            <tr>
              <td>Our accountants, HMRC, insurers, legal advisers and, where required, the police or regulators</td>
              <td>Legal, tax and insurance obligations, and dealing with claims</td>
            </tr>
          </tbody>
        </table>
        <p>
          We also use design tools (such as OpenSolar and SimpliHeat) to design your system, which hold the project details we
          enter.
        </p>
      </>
    ),
  },
  {
    id: 'transfers',
    title: 'Data stored outside the UK',
    body: (
      <p>
        Several of our providers are based in, or use services in, the United States or the EU. When your information goes outside
        the UK we make sure it’s protected to UK standards, using UK “adequacy” regulations (including the UK–US data bridge for
        certified US companies) or the UK’s approved contract terms (the International Data Transfer Agreement or Addendum). Ask
        us if you’d like more detail.
      </p>
    ),
  },
  {
    id: 'subcontractors',
    title: 'Subcontractors and operatives',
    body: (
      <>
        <p>If you or your firm works with us as a subcontractor, we collect:</p>
        <ul>
          <li>
            business, tax and payment details: company and contact details, company and VAT numbers, UTR and CIS status, and bank
            details for payments
          </li>
          <li>
            for each operative: name, role and contact details, qualifications, competency cards, registrations, insurance, and a
            copy of photo ID
          </li>
          <li>
            your signed agreements (with name, signature, date, IP address and device details), and records of sign-ins and
            document reviews
          </li>
        </ul>
        <p>
          We use this to set up and manage our contract with you, pay you and meet our CIS tax duties (legal obligation), check
          that everyone on site is competent, insured and who they say they are (legal obligations under health and safety law,
          and our legitimate interests in site safety and security), and prepare site safety documents (RAMS). Bank details, UTR
          and photo ID are only used for these purposes and aren’t shared with customers. If you’re an operative, your employer
          shares your details with us. Please make sure they’ve given you this notice.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: (
      <ul>
        <li>
          <strong>Enquiries that don’t go ahead:</strong> up to 2 years after we last spoke, so we can pick up where we left
          off if you get back in touch.
        </li>
        <li>
          <strong>Customer records:</strong> for at least 6 years after your installation (for tax and accounting), and
          installation, certificate and warranty records for as long as your warranties and certification schemes need them.
        </li>
        <li>
          <strong>Subcontractor records:</strong> for the length of our relationship and at least 6 years afterwards (for tax,
          CIS and safety records).
        </li>
        <li>
          <strong>Website analytics:</strong> for up to 14 months.
        </li>
        <li>
          <strong>If there’s a complaint or legal claim</strong>, we keep what we need until it’s resolved.
        </li>
      </ul>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and similar technologies',
    body: (
      <>
        <p>Our public website uses:</p>
        <table className="lg-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Purpose</th>
              <th>Lasts</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>_ga</code>, <code>_ga_…</code> (Google Analytics)
              </td>
              <td>Counts visits and shows how people use the site</td>
              <td>Up to 2 years</td>
            </tr>
            <tr>
              <td>
                <code>hx_attr</code>
              </td>
              <td>Remembers which advert or campaign brought you to us, so we can tell which adverts work</td>
              <td>60 days</td>
            </tr>
          </tbody>
        </table>
        <p>
          We also use Umami for website statistics, which doesn’t use cookies, and record anonymous click positions to improve
          page layouts. Web fonts are loaded from Google, which receives your IP address when the page loads.
        </p>
        <p>
          Your customer project page sets no cookies of its own. Our team’s sign-in areas use cookies that are needed to keep
          staff and subcontractors logged in. You can block or delete cookies in your browser settings; the website will still
          work.
        </p>
      </>
    ),
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: (
      <>
        <p>Under UK data protection law you have the right to:</p>
        <ul>
          <li>
            <strong>access</strong> the personal information we hold about you and get a copy
          </li>
          <li>
            have it <strong>corrected</strong> if it’s wrong or incomplete
          </li>
          <li>
            have it <strong>deleted</strong> (see <Link href="/data-deletion">delete your data</Link>)
          </li>
          <li>
            <strong>object</strong> to us using it based on our legitimate interests, including for follow-ups, review requests
            and advert measurement. You can always stop us using it for marketing
          </li>
          <li>
            ask us to <strong>restrict</strong> how we use it, or to <strong>transfer</strong> it to you or another organisation
          </li>
        </ul>
        <p>
          Contact us at {mail} or on <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>. There’s no charge, and we’ll reply within
          one month. We may need to confirm who you are first.
        </p>
        <p>
          If you’re unhappy with how we’ve handled your information, please tell us first so we can put it right. You can also
          complain to the Information Commissioner’s Office (ICO) at{' '}
          <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer">
            ico.org.uk
          </a>{' '}
          or on 0303 123 1113.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Keeping it safe',
    body: (
      <p>
        Your information is stored in secure, access-controlled systems. Files and photos are kept privately and shared only
        through short-lived links. Only staff who need your details for their work can see them. Your project page is a private
        link. If you think someone else has it, tell us and we’ll change it.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: <p>Our services are for adults. We don’t knowingly collect information from children under 18.</p>,
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We’ll update this policy when the way we use personal information changes. The date at the top shows when it was last
        updated. For significant changes we’ll let current customers know.
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="Your privacy"
      title="Privacy policy"
      intro={
        <p>
          How we collect, use, share and protect your personal information when you visit our website, enquire, become a customer
          or work with us. Written in plain English.
        </p>
      }
      updated={UPDATED}
      sections={sections}
    />
  );
}
