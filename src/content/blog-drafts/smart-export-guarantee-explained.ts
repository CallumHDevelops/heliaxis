import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'The Smart Export Guarantee Explained',
  slug: 'smart-export-guarantee-explained',
  seoTitle: 'Smart Export Guarantee Explained for UK Homes | Heliaxis',
  seoDescription: 'What the Smart Export Guarantee pays you for solar electricity you send to the grid, who can claim it and what to check before choosing a tariff.',
  tags: 'Solar | Export',
  headline: 'The Smart Export Guarantee, explained',
  sub: 'What you are paid for the solar power you do not use, and how to get it.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'You are paid for the electricity you send to the grid',
  introText:
    'The Smart Export Guarantee (SEG) is a scheme that requires larger electricity suppliers to pay you for the solar electricity you export to the grid. The rate is set by each supplier, so it varies and can change. To claim it you need an MCS-certified installation and a meter that records what you export. It is worth choosing the tariff rather than accepting the first one offered.',
  bodyHtml1: `<h2>What the Smart Export Guarantee is</h2>
<p>When your panels make more electricity than the house is using, the surplus goes to the grid. The SEG is the arrangement that makes sure you are paid for it. Since January 2020 the larger electricity suppliers have had to offer at least one SEG tariff, and smaller ones can choose to. You pick a supplier and a tariff, and you are paid for each kWh you export.</p>
<p>It replaced the earlier feed-in tariff for new installations. The old scheme paid for what you generated and for what you exported; the SEG pays only for what you export, so the value of solar now comes mostly from using your own power.</p>

<h2>Who can claim it</h2>
<ul>
<li>The installation must be certified under the Microgeneration Certification Scheme (MCS), and your installer should give you the certificate.</li>
<li>You need an export-capable meter. In practice that usually means a smart meter that records what you send out as well as what you take in. Suppliers set their own rules about meters, so check before you sign up.</li>
<li>Many SEG tariffs are open to people who buy their electricity from a different supplier. Some are not, so check the conditions of the tariff you want.</li>
</ul>

<h2>How much does it pay?</h2>
<p>There is no fixed rate. Each supplier sets its own, and there are two broad kinds:</p>
<ul>
<li><strong>Fixed rate</strong> tariffs pay the same per kWh for a set period.</li>
<li><strong>Variable or smart</strong> tariffs follow wholesale prices and may pay more at some times than others.</li>
</ul>
<p>Rates vary widely between suppliers, and some tariffs are tied to having a battery, an electric car or another product from that supplier. Because they change, look at the current rate when you choose, and again from time to time.</p>

<h3>A worked example, with its assumptions</h3>
<p>Assume a 4 kWp system in South Wales that generates around 3,600 kWh a year, a household that uses about 40% of that itself, and an export rate of 10p per kWh. These are illustrative figures to show the arithmetic, not a forecast for your home.</p>
<table>
<thead><tr><th>Item</th><th>Working</th><th>Result</th></tr></thead>
<tbody>
<tr><td>Generated</td><td>4 kWp × 900 kWh per kWp</td><td>3,600 kWh</td></tr>
<tr><td>Used in the house</td><td>40% of 3,600 kWh</td><td>1,440 kWh</td></tr>
<tr><td>Exported</td><td>3,600 − 1,440</td><td>2,160 kWh</td></tr>
<tr><td>SEG income</td><td>2,160 kWh × 10p</td><td>£216 a year</td></tr>
</tbody>
</table>
<p>The electricity you use yourself saves you the price you would otherwise pay to buy it, which is normally much more than the export rate. That is why the biggest lever on what solar saves is how much of it you use at home, not the SEG rate.</p>

<h2>Choosing a tariff</h2>
<ol>
<li><strong>Compare the current rates</strong>, and note whether they are fixed or variable.</li>
<li><strong>Read the conditions.</strong> Some require you to be on the supplier's import tariff, to have a battery or to have a specific meter.</li>
<li><strong>Check how and when you are paid</strong>, and whether the tariff can be changed or ended.</li>
<li><strong>Apply with your MCS certificate</strong> and your meter details.</li>
</ol>
<p>Your installer should register the installation and give you the paperwork. The decision about the tariff is yours.</p>`,
  ctaHeadline: 'See how much of your solar power you would use yourself',
  ctaSub: 'Our estimator shows generation, use and export for your roof in a couple of minutes.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', ESTIMATOR)}
${HOW_WE_APPROACH('export and savings')}
<h2>Frequently asked questions</h2>
<h3>Do I have to claim the Smart Export Guarantee?</h3>
<p>No. It is optional, but if you export electricity and do not claim it, you are giving it away. Setting it up is usually a short application.</p>
<h3>Can I get the SEG without a smart meter?</h3>
<p>Generally you need a meter that records export. Some suppliers accept other arrangements, so ask the supplier you are interested in.</p>
<h3>Is the SEG rate guaranteed?</h3>
<p>The name is misleading: the scheme guarantees that you will be offered a tariff and paid for what you export, not what the rate will be. Rates are set by suppliers and can change, apart from fixed-term tariffs.</p>
<h3>Does a battery change the SEG?</h3>
<p>A battery stores solar power for the evening, so you export less and use more yourself. Because using your own power usually saves more than exporting it earns, a battery tends to reduce SEG income and increase bill savings. Some tariffs pay more for exports at set times, which suits a battery that can choose when to export.</p>
<h3>Is SEG income taxable?</h3>
<p>For most households with a domestic system the income is small, and tax treatment depends on your circumstances. If you are unsure, check with HMRC or an accountant.</p>
<p>If you want to see what your own roof could export, a survey gives the real figures.</p>
${buttons('Get my free solar quote', SURVEY)}`,
  homeTitle: 'For your home',
  homeDesc: 'An MCS-certified installation is what makes your export eligible for the Smart Export Guarantee.',
  homeBullets: ['MCS certificate provided with the install', 'Export paperwork explained', 'A design that favours using your own power'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'Larger systems are sized to your daytime load first, so less is exported at low rates.',
  businessBullets: ['System sized to your working hours', 'Export arrangements explained', 'Funding options set out plainly'],
  businessBtn: 'Explore business funding',
  imageQuery: 'solar panels house roof electricity meter',
  editorNotes: [
    'Check the SEG facts against Ofgem guidance before publishing: suppliers with 150,000 or more customers must offer a tariff; start date January 2020; MCS and export metering requirements.',
    'The worked example assumes 900 kWh per kWp, 40% self-use and a 10p export rate. Update the export rate to a current typical figure.',
    'The tax point is deliberately general. Check it, or remove it.',
  ],
};
