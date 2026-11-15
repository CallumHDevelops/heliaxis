import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'Is a Solar Battery Worth It?',
  slug: 'is-a-solar-battery-worth-it',
  seoTitle: 'Is a Solar Battery Worth It? An Honest Guide | Heliaxis',
  seoDescription: 'When a home solar battery pays its way, when it does not, and the numbers to check: your daytime use, your tariff and what you want from it.',
  tags: 'Battery | Solar',
  headline: 'Is a solar battery worth it?',
  sub: 'It depends on when you use electricity, and what you want from it.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'Sometimes, and mostly for homes that are out all day',
  introText:
    'A solar battery is worth it when it lets you use a lot more of your own solar electricity than you would without it, and when the extra saving justifies the cost over the life of the battery. That tends to be homes where most of the electricity is used in the evening and overnight. If someone is home all day, the case is weaker. A battery can also be worth having for reasons other than money, such as using cheap overnight electricity or keeping some lights on in a power cut.',
  bodyHtml1: `<h2>What a battery actually does</h2>
<p>Solar panels make electricity when the sun is up. Most households use more of it in the morning and evening. Without a battery, the surplus in the middle of the day goes to the grid and you are paid the export rate for it. With a battery, that surplus charges the battery and you use it later, instead of buying electricity from the grid.</p>
<p>So the battery earns its keep by turning cheap exported electricity into electricity you do not have to buy. The bigger the gap between what you would buy it for and what you would be paid to export, the more valuable that shift is.</p>

<h2>A worked example, with its assumptions</h2>
<p>Take a 4 kWp system in South Wales that generates around 3,600 kWh a year. Assume the home uses 40% of it directly without a battery and 70% with one, that electricity costs 25p per kWh and that exports are paid 10p per kWh. These are illustrative numbers chosen to show how the sum works, not a prediction for your house.</p>
<table>
<thead><tr><th></th><th>Without a battery</th><th>With a battery</th></tr></thead>
<tbody>
<tr><td>Solar used in the home</td><td>1,440 kWh</td><td>2,520 kWh</td></tr>
<tr><td>Solar exported</td><td>2,160 kWh</td><td>1,080 kWh</td></tr>
<tr><td>Bill saving (at 25p)</td><td>£360</td><td>£630</td></tr>
<tr><td>Export income (at 10p)</td><td>£216</td><td>£108</td></tr>
<tr><td><strong>Total a year</strong></td><td><strong>£576</strong></td><td><strong>£738</strong></td></tr>
</tbody>
</table>
<p>On those assumptions the battery adds about £162 a year. Whether that is worth it depends on what the battery costs you, how long it lasts and how your own pattern of use compares. A household that is out all day and uses most of its electricity at night would see a bigger difference; one that is home all day would see less.</p>

<h2>When a battery is more likely to pay</h2>
<ul>
<li>Most of your electricity use is in the evening and overnight.</li>
<li>You have a large system relative to your daytime use, so there is plenty to export.</li>
<li>You are on, or could move to, a tariff with cheap overnight electricity, so the battery can also charge from the grid.</li>
<li>You are adding an electric car or heat pump, which raise evening and overnight use.</li>
<li>Electricity prices are high compared with export rates, which is the usual case in the UK.</li>
</ul>

<h2>When it may not</h2>
<ul>
<li>Someone is home most of the day, so you already use much of your solar power as it is made.</li>
<li>You have a small system and little surplus to store.</li>
<li>You are hoping the battery alone will pay back quickly. On the numbers above it will not, and it is better to treat it as a longer-term investment.</li>
</ul>

<h2>Reasons to buy one that are not only about money</h2>
<ul>
<li><strong>Cheap overnight electricity.</strong> With a time-of-use tariff, a battery can charge when electricity is cheap and supply the house when it is expensive.</li>
<li><strong>Backup in a power cut.</strong> Only if the system is designed for it. Many installations do not keep the house running in a power cut by default, so ask about this specifically.</li>
<li><strong>Less reliance on the grid.</strong> If that matters to you, it is a fair reason, as long as you know what it costs.</li>
</ul>

<h2>What size?</h2>
<p>Bigger is not better. The right size is the one you will fill from your surplus and empty each evening. A battery much larger than your evening use sits half full for most of the year. We size it from your usage, not from a standard package.</p>`,
  ctaHeadline: 'Find out whether a battery suits your home',
  ctaSub: 'Tell us how you use electricity and we will show you solar with and without a battery.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', ESTIMATOR)}
${HOW_WE_APPROACH('batteries')}
<p>If you are not sure, the honest answer is sometimes to fit solar now and leave space and wiring for a battery later. We will say so if that is the better choice for you.</p>
<h2>Frequently asked questions</h2>
<h3>How long does a solar battery last?</h3>
<p>Home batteries are typically warranted for around ten years and a set number of charge cycles, and they lose some capacity over time. The warranty terms differ between makes, so read them before you choose.</p>
<h3>Will a battery power my house in a power cut?</h3>
<p>Only if it is installed and wired to do so. Many systems shut down when the grid fails for safety reasons unless they have backup equipment. Ask for the backup arrangement in writing.</p>
<h3>Can I add a battery later?</h3>
<p>Often, yes. Whether it is simple or expensive depends on the inverter you have. Our guide to adding a battery to existing solar covers this.</p>
<h3>Does a battery help if I have an electric car?</h3>
<p>It can, because an electric car raises evening and overnight use. A smart charger that uses surplus solar power is the other half of that picture.</p>
<h3>Is a battery safe in the house?</h3>
<p>Home batteries sold in the UK must meet safety standards, and where it goes matters. We choose the location at the survey with ventilation, access and fire safety in mind.</p>
<p>To see the numbers for your own home, ask for a survey.</p>
${buttons('Get my free solar quote', SURVEY)}`,
  homeTitle: 'For your home',
  homeDesc: 'We size a battery from your usage, and tell you plainly if solar alone is the better value for your household.',
  homeBullets: ['Sized from your own evening use', 'Backup explained honestly', 'Solar with and without a battery compared'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'For businesses, a battery can help where demand peaks outside the solar day.',
  businessBullets: ['Daytime load assessed first', 'Peak demand and tariffs considered', 'Funding options set out plainly'],
  businessBtn: 'Explore business funding',
  imageQuery: 'home battery storage wall',
  editorNotes: [
    'The worked example uses 900 kWh per kWp, 40% self-use without a battery, 70% with one, 25p per kWh and 10p export. Update the prices to something current and defensible.',
    'The "around ten years" battery warranty is typical but varies. Check it against the brands you fit.',
    'Check the statement that many installations do not keep the house running in a power cut matches what you sell.',
  ],
};
