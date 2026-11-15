import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'How Long Does a Solar Panel Installation Take?',
  slug: 'how-long-does-solar-installation-take',
  seoTitle: 'How Long Does Solar Panel Installation Take? | Heliaxis',
  seoDescription: 'From first enquiry to switch-on: what happens, in what order, and how long each stage takes for a typical home solar installation.',
  tags: 'Solar | Installation',
  headline: 'How long does a solar panel installation take?',
  sub: 'A day or two on the roof, and a few weeks from first call to switch-on.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'The installation itself is quick; the process around it takes a few weeks',
  introText:
    'A typical home solar installation takes one to two days on site, with scaffolding going up beforehand and coming down afterwards. A battery can add a day. From first enquiry to switch-on is usually several weeks, because of the survey, the design, scaffolding and the paperwork to the network operator. Timings vary with the installer, the weather and how complicated the property is.',
  bodyHtml1: `<h2>The stages, in order</h2>
<table>
<thead><tr><th>Stage</th><th>What happens</th><th>Roughly how long</th></tr></thead>
<tbody>
<tr><td>1. Enquiry</td><td>You ask for a quote; we call to arrange a survey.</td><td>We call within one working day</td></tr>
<tr><td>2. Survey</td><td>We visit, inspect the roof and electrics and talk through your usage.</td><td>About an hour on the day</td></tr>
<tr><td>3. Design and quote</td><td>We design the system and give you a fixed price in writing.</td><td>Days, not weeks</td></tr>
<tr><td>4. Decision and booking</td><td>You decide, we book the install and order equipment.</td><td>Depends on you and on supply</td></tr>
<tr><td>5. Network paperwork</td><td>Larger systems need approval from the network operator before installation; smaller ones are notified afterwards.</td><td>Varies; approvals can take weeks</td></tr>
<tr><td>6. Scaffolding</td><td>Erected before the install, taken down after.</td><td>A day either side</td></tr>
<tr><td>7. Installation</td><td>Panels, inverter, wiring and any battery.</td><td>One to two days for most homes</td></tr>
<tr><td>8. Commissioning and handover</td><td>Testing, certificates, monitoring set up and a walk-through.</td><td>Same day as the install</td></tr>
<tr><td>9. Paperwork</td><td>Certificates, registration and notifications.</td><td>Handled by us after the install</td></tr>
</tbody>
</table>

<h2>What takes the time</h2>
<ul>
<li><strong>The network operator.</strong> If your system is larger than a certain size, the operator has to approve the connection first. We apply as early as we can, because the wait is theirs rather than ours.</li>
<li><strong>Equipment availability.</strong> Particular panels, inverters and batteries can be on back order.</li>
<li><strong>Weather.</strong> Work on a roof stops in high wind or heavy rain, which can move the date by a day or more.</li>
<li><strong>Your own diary.</strong> We need access for the scaffolding and the install, and someone present at handover.</li>
</ul>

<h2>What the install day is like</h2>
<ol>
<li>The team arrives, protects the area and checks the scaffolding.</li>
<li>Roof fixings and rails go on, then the panels.</li>
<li>Cables run from the roof to the inverter, and to the consumer unit.</li>
<li>The inverter, and the battery if you have one, are mounted and connected.</li>
<li>Your electricity is switched off for a short time while the connection to the consumer unit is made. We tell you when.</li>
<li>The system is tested, switched on and explained to you.</li>
</ol>
<p>It is usually a tidy job, and we clear up before we go.</p>

<h2>After the install</h2>
<p>You should receive your certificates, including the MCS certificate, the electrical certificate and the guarantee documents, and be shown how to read your monitoring app. Notifying the network operator and registering the installation are part of our job, not yours.</p>`,
  ctaHeadline: 'Ready to get started?',
  ctaSub: 'Ask for a free quote and we will call you within one working day.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', SURVEY)}
${HOW_WE_APPROACH('installation')}
<h2>Frequently asked questions</h2>
<h3>Will I be without electricity?</h3>
<p>For a short time while the system is connected to the consumer unit. We tell you in advance, and it is normally a matter of an hour or two.</p>
<h3>Do I need scaffolding?</h3>
<p>For most roofs, yes, for safety. It is part of the price and we arrange it.</p>
<h3>Can you install in winter?</h3>
<p>Yes, weather permitting. Panels do not need to be installed in summer to work, though they make less in winter. Installing earlier means you are ready when the days lengthen.</p>
<h3>How soon will the system start working?</h3>
<p>As soon as it is commissioned, usually on the day of installation. Payments under the Smart Export Guarantee start once you have registered with a supplier.</p>
<h3>What if the installation runs over?</h3>
<p>If the weather or something unexpected means it does, we tell you early and agree what happens next.</p>
${buttons('Get my free solar quote', ESTIMATOR)}`,
  homeTitle: 'For your home',
  homeDesc: 'A clear timeline from survey to switch-on, with the paperwork handled for you.',
  homeBullets: ['One to two days on site for most homes', 'Scaffolding arranged for you', 'Certificates and registration included'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'Commercial installations are programmed around your operations to keep disruption low.',
  businessBullets: ['Install planned around your working hours', 'Network approval managed early', 'Funding options set out plainly'],
  businessBtn: 'Explore business funding',
  imageQuery: 'solar panel installers on roof',
  editorNotes: [
    'Check every duration in the table against how long your own jobs take, in particular the install days and how soon you call.',
    'Confirm the statement that you handle the network operator notification, MCS registration and certificates.',
    'Check the "an hour or two" power-off time.',
  ],
};
