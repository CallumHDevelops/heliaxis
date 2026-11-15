import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'Solar Panels for Small Businesses in South Wales',
  slug: 'solar-panels-for-small-business-south-wales',
  seoTitle: 'Solar Panels for Small Businesses in South Wales | Heliaxis',
  seoDescription: 'How solar works for a small business: daytime use, rent and lease questions, funding options and what to ask before you commit. Across South Wales.',
  tags: 'Business | Solar',
  headline: 'Solar panels for small businesses in South Wales',
  sub: 'Daytime use is what makes it work. Here is how to tell if it suits you.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'Businesses that use power in the daytime are often a good fit',
  introText:
    'Solar suits businesses that use most of their electricity while the sun is up, such as shops, workshops, offices, farms, care homes and light industry, because they use the power rather than export it. The factors that decide it are your daytime load, your roof or land, your lease, and how you want to pay for it. Funding can mean a business pays little or nothing upfront, but it changes the economics, so compare the options on the same terms.',
  bodyHtml1: `<h2>Why daytime use matters so much</h2>
<p>Electricity a business generates and uses on site saves the price it would pay to buy it. Electricity it exports is paid at a much lower rate. So the closer your demand follows the sun, the more a system saves. A workshop running from 7 to 5 uses most of what the panels make. A business that is quiet in the day and busy at night uses less of it, and may want a battery or a different approach.</p>

<h2>Is your business a good fit?</h2>
<table>
<thead><tr><th>Question</th><th>Why it matters</th></tr></thead>
<tbody>
<tr><td>When do you use power?</td><td>Daytime use is used directly, which is where the savings come from.</td></tr>
<tr><td>How much do you use?</td><td>A system is sized to your load. Your bills or half-hourly data show it.</td></tr>
<tr><td>Do you own or lease the building?</td><td>If you lease, you need your landlord's agreement, and the length of the lease affects the payback you can use.</td></tr>
<tr><td>What is the roof like?</td><td>Its size, direction, condition and structure, and any shade.</td></tr>
<tr><td>What is your supply like?</td><td>Single or three-phase, and whether the network operator needs to approve the connection.</td></tr>
<tr><td>How long will you be there?</td><td>A system pays back over years. A short horizon changes the sums.</td></tr>
</tbody>
</table>

<h2>Ways to pay</h2>
<ul>
<li><strong>Buying outright</strong> usually has the best long-term return if you have the cash.</li>
<li><strong>Asset finance or a loan</strong> spreads the cost, so savings can offset repayments from the start.</li>
<li><strong>A power purchase agreement (PPA)</strong> means a funder owns the system and you pay for the electricity it makes, often at a lower rate than the grid, with little or no upfront cost. The terms and length of contract matter, so read them closely.</li>
</ul>
<p>Each of these has different risks and obligations. We explain them plainly on our commercial funding page, and we do not push any one of them.</p>

<h2>Other things to check</h2>
<ul>
<li><strong>Tax.</strong> Business tax treatment of equipment can change over time, so ask your accountant about the current position for your business.</li>
<li><strong>Insurance and lenders.</strong> Tell your insurer, and your lender if there is a charge on the property.</li>
<li><strong>Maintenance.</strong> Panels need little, but inverters and monitoring benefit from a plan, and you should know who is responsible for what.</li>
<li><strong>Roof condition.</strong> If the roof will need replacing in a few years, do it first or at the same time.</li>
</ul>`,
  ctaHeadline: 'See whether solar suits your site',
  ctaSub: 'Tell us about your building and how you use power, and we will explain the options.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', SURVEY)}
${HOW_WE_APPROACH('commercial solar')}
<p>For businesses, we also look at your bills or half-hourly data and at the options for paying for it, so you can compare like with like.</p>
<h2>Frequently asked questions</h2>
<h3>Does solar make sense for a small shop or office?</h3>
<p>It can, if you use a good share of your electricity in the daytime and have a roof that suits it. We size the system to your use so you are not paying for generation you cannot use.</p>
<h3>What if I rent my premises?</h3>
<p>You will need your landlord's permission, and a lease long enough for the system to pay back. We can talk through how to approach it.</p>
<h3>Is there a grant for business solar?</h3>
<p>Schemes change and many are specific to a sector, location or size. Ask us for the current picture when you enquire, and we will not guess.</p>
<h3>How long does a commercial installation take?</h3>
<p>It depends on the size and complexity. Larger systems need the network operator's approval first, which can take weeks. We give you a programme with the quote.</p>
<h3>What about a battery for a business?</h3>
<p>It can help where demand peaks outside the solar day. We assess it against your load and tariff before suggesting it.</p>
${buttons('Get my free solar quote', ESTIMATOR)}`,
  homeTitle: 'For your home',
  homeDesc: 'Looking at solar for your house rather than a business? We do that too, from a free survey.',
  homeBullets: ['Free survey and fixed price', 'Designed around your usage', 'MCS-certified installation'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'We size commercial systems to your daytime load and explain the funding options side by side.',
  businessBullets: ['Sized to your working hours', 'Purchase, finance and PPA options explained', 'Lease and landlord questions covered'],
  businessBtn: 'Explore business funding',
  imageQuery: 'commercial roof solar panels warehouse',
  editorNotes: [
    'The PPA and finance descriptions are general. Check them against the funding options you offer on /commercial-funding.',
    'The tax line is deliberately cautious. Check it with your accountant or remove it.',
    'No savings or payback figures are given on purpose.',
  ],
};
