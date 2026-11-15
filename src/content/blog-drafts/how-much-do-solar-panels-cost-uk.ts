import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'What Decides the Cost of Solar Panels in the UK?',
  slug: 'how-much-do-solar-panels-cost-uk',
  seoTitle: 'What Decides the Cost of Solar Panels in the UK? | Heliaxis',
  seoDescription: 'What makes up the price of a home solar installation, why quotes differ, and how to compare them fairly. Then get a fixed price from a free survey.',
  tags: 'Solar | Cost',
  headline: 'What decides the cost of solar panels?',
  sub: 'What is in the price, why quotes differ and how to compare them.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'The price follows the size of the system and what else is included',
  introText:
    'The cost of home solar depends mainly on how many panels you have (the size in kW), the equipment you choose, whether you add a battery, and what the roof and electrics need. A fixed price in writing, from a survey, is the only price that means anything. When you compare quotes, compare what is included before you compare the totals.',
  bodyHtml1: `<h2>What the price is made of</h2>
<table>
<thead><tr><th>Part</th><th>What it covers</th><th>What changes it</th></tr></thead>
<tbody>
<tr><td>Panels</td><td>The solar panels themselves</td><td>The number and the model: output, warranty and quality</td></tr>
<tr><td>Inverter</td><td>Converts the panels' output into household electricity</td><td>Size, make and whether it is a hybrid that can take a battery</td></tr>
<tr><td>Mounting</td><td>Roof fixings and rails</td><td>Roof covering, and the type of roof</td></tr>
<tr><td>Scaffolding</td><td>Safe access to the roof</td><td>Height and the access to the house</td></tr>
<tr><td>Labour and electrics</td><td>Fitting, cabling and connecting to the consumer unit</td><td>Distance, wiring, and whether the consumer unit needs upgrading</td></tr>
<tr><td>Battery (optional)</td><td>Storage, and its inverter if separate</td><td>Capacity in kWh and the make</td></tr>
<tr><td>Certification and paperwork</td><td>MCS, electrical certificate, network operator notification</td><td>Usually fixed, and should be included</td></tr>
<tr><td>Optimisers (optional)</td><td>Panel-level electronics for shaded roofs</td><td>Number of panels affected</td></tr>
</tbody>
</table>

<h2>Why two quotes can differ by thousands</h2>
<ul>
<li><strong>Different sizes.</strong> More panels cost more, and make more.</li>
<li><strong>Different equipment.</strong> Panel and inverter brands, and their warranties.</li>
<li><strong>Different inclusions.</strong> Scaffolding, a new consumer unit, a battery or the monitoring app may be in one quote and not in another.</li>
<li><strong>Different standards.</strong> MCS certification, the consumer code and the electrical certification all carry a cost to the installer, and they are what protect you.</li>
<li><strong>Different assumptions.</strong> The savings figures depend on assumed usage, tariff and roof direction. Look at them.</li>
</ul>

<h2>How to compare quotes fairly</h2>
<ol>
<li>Compare the system size in kWp, the number of panels and their make and model.</li>
<li>Compare the inverter, its make, size and warranty.</li>
<li>Check what is included: scaffolding, certification, electrical upgrades, monitoring and the paperwork.</li>
<li>Check the warranties, for the panels, the inverter, the battery and the workmanship, and whether they are insurance-backed.</li>
<li>Check the installer's credentials: MCS certification, a consumer code and a competent person scheme.</li>
<li>Look at the stated generation figure and its assumptions, not only the total saving.</li>
</ol>

<h2>Cost per kW is a rough guide, not a price</h2>
<p>Dividing the total by the size can help you compare like with like, but larger systems usually cost less per kW because the fixed costs (scaffolding, the inverter and the visit) are spread over more panels. It should not be used to guess the price of your own system.</p>

<h2>VAT and other things that change</h2>
<p>The VAT treatment of solar and battery installations, and schemes that help with the cost, have changed in recent years and may change again. Ask for the current position when you get a quote, and check that the price states what VAT is included.</p>`,
  ctaHeadline: 'Get a fixed price for your home',
  ctaSub: 'A free survey, then a written price based on your roof, your electrics and your usage.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', ESTIMATOR)}
${HOW_WE_APPROACH('price')}
<p>You will see our packages and what they include on the solar quote page. The survey sets the exact price.</p>
<h2>Frequently asked questions</h2>
<h3>Can you give me a price without a survey?</h3>
<p>We can give an indication from our estimator, which uses your roof and usage and shows the assumptions. A fixed price needs a survey.</p>
<h3>Is the cheapest quote the best?</h3>
<p>Not by itself. A low price may leave out scaffolding, certification or electrical work. Compare what is included first.</p>
<h3>Do I pay everything up front?</h3>
<p>It depends on the installer and the payment plan. We set out the payment terms in the quote. Ask any installer how deposits are protected.</p>
<h3>Are there grants for home solar?</h3>
<p>Support schemes change, and many are targeted at particular households or areas. Ask us what applies to you when you enquire.</p>
<h3>Why do prices differ between installers?</h3>
<p>Because of the size, the equipment, what is included, the installer's standards and the assumptions behind the savings figures.</p>
${buttons('Get my free solar quote', SURVEY)}`,
  homeTitle: 'For your home',
  homeDesc: 'A fixed price in writing, with every inclusion listed, from a free survey.',
  homeBullets: ['Everything included is listed', 'Warranties and certificates explained', 'No obligation'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'Commercial quotes are sized to your load, with finance options set out beside the cash price.',
  businessBullets: ['Sized from your demand', 'Cash, finance and PPA compared', 'Programme and approvals included'],
  businessBtn: 'Explore business funding',
  imageQuery: 'solar quote paperwork home owner',
  editorNotes: [
    'This article gives no prices on purpose. When you have set your packages in the admin, consider adding a "from" price using the packages band rather than typing numbers into the article.',
    'The VAT paragraph is general. Check the current VAT position on solar and battery installations before publishing and say it plainly if you want to be specific.',
    'Check the statement about how deposits and payment terms are set out in your quotes.',
  ],
};
