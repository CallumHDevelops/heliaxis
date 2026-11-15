import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'What Is MCS Certification and Why Does It Matter?',
  slug: 'what-is-mcs-certification-solar',
  seoTitle: 'What Is MCS Certification for Solar Panels? | Heliaxis',
  seoDescription: 'What the Microgeneration Certification Scheme is, why it matters for the Smart Export Guarantee and grants, and how to check an installer and your certificate.',
  tags: 'Solar | MCS',
  headline: 'What is MCS certification, and why does it matter?',
  sub: 'The standard that unlocks export payments, and what to ask your installer.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'MCS is the quality standard for small renewable installations',
  introText:
    'The Microgeneration Certification Scheme (MCS) sets standards for small-scale renewable energy installations and the companies that fit them. In practice it matters because an MCS-certified installation is normally required to be paid under the Smart Export Guarantee and for most grants and schemes. It also means the installer is assessed against recognised standards. You should receive an MCS certificate when the work is done.',
  bodyHtml1: `<h2>What MCS is</h2>
<p>MCS is a standards scheme for small renewable technologies such as solar panels, batteries, heat pumps and small wind. It covers two things: the <strong>installer</strong>, who has to be assessed and certified to work to the scheme's standards, and the <strong>installation</strong>, which is registered and given a certificate once it is complete.</p>

<h2>Why it matters to you</h2>
<ul>
<li><strong>Export payments.</strong> To be paid under the Smart Export Guarantee, your installation normally has to be MCS-certified. Without the certificate, you may be giving away the electricity you export.</li>
<li><strong>Grants and schemes.</strong> Many government and local schemes require an MCS installation by an MCS-certified installer.</li>
<li><strong>Quality and consumer protection.</strong> Certified installers are assessed on how they design, install and commission systems, and on how they deal with customers. MCS-certified installers also have to belong to a consumer code, such as the Renewable Energy Consumer Code (RECC), which gives you a route to redress if something goes wrong.</li>
<li><strong>Resale.</strong> A certified system with its paperwork is easier to explain to a buyer or a lender.</li>
</ul>

<h2>What you should receive</h2>
<ol>
<li>An <strong>MCS certificate</strong> for your installation, with a registration number.</li>
<li>The <strong>design and performance estimate</strong> for your system, which is part of the MCS process.</li>
<li>An <strong>electrical installation certificate</strong> showing the electrical work was inspected and tested.</li>
<li>Your <strong>warranties</strong> for the panels, inverter, battery and the installation.</li>
<li>Confirmation of the <strong>notification to the network operator</strong>.</li>
</ol>

<h2>How to check an installer</h2>
<ul>
<li>Ask for their MCS certification number and look them up on the MCS website.</li>
<li>Ask which consumer code they belong to and check it with the code body.</li>
<li>Ask for the competent person scheme they use for the electrical work and Building Regulations notification.</li>
<li>Ask what happens to the warranties and guarantees if the company stops trading, and whether they are insurance-backed.</li>
</ul>
<p>A reputable installer will be happy to answer all of these.</p>`,
  ctaHeadline: 'Choose an installer you can check',
  ctaSub: 'Heliaxis is MCS-certified, a member of RECC and registered with NAPIT. Ask us for any of the details.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', SURVEY)}
${HOW_WE_APPROACH('certification')}
<h2>Frequently asked questions</h2>
<h3>Do I need MCS for solar panels?</h3>
<p>It is not a legal requirement to install panels, but you normally need it to be paid under the Smart Export Guarantee and to qualify for most schemes. We install to the MCS standard on every system.</p>
<h3>Can I get MCS certification afterwards?</h3>
<p>No. The certificate is issued by an MCS-certified installer for work they carried out. You cannot add it later to an uncertified installation.</p>
<h3>Is MCS the same as RECC?</h3>
<p>No. MCS covers the installer and the installation standards. RECC is a consumer code that sets how installers sell to and deal with customers.</p>
<h3>Does MCS apply to batteries?</h3>
<p>Standards apply to some battery installations, particularly where they are installed together with solar. Ask your installer how the battery is covered.</p>
<h3>What does the NAPIT registration mean?</h3>
<p>NAPIT is a competent person scheme for electrical work. It means our electrical work is certified and notified under the Building Regulations.</p>
${buttons('Get my free solar quote', ESTIMATOR)}`,
  homeTitle: 'For your home',
  homeDesc: 'Every Heliaxis installation is MCS-certified, so you can claim export payments and keep the paperwork.',
  homeBullets: ['MCS certificate with every install', 'Member of RECC', 'Electrical work certified through NAPIT'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'MCS and the right paperwork matter for funding, lenders and insurers on commercial projects.',
  businessBullets: ['Documentation your lender and insurer expect', 'Design and performance estimates', 'Funding options explained'],
  businessBtn: 'Explore business funding',
  imageQuery: 'certificate installer inspecting solar inverter',
  editorNotes: [
    'Check the MCS facts against mcscertified.com before publishing: that installers and installations are both covered, and the requirement for MCS under the Smart Export Guarantee.',
    'Confirm Heliaxis is a member of RECC and registered with NAPIT as stated, and that you are happy to say the NAPIT registration means electrical work is certified and notified.',
    'The point about insurance-backed guarantees is a question to ask, not a claim about Heliaxis. Add your own answer if you want one.',
  ],
};
