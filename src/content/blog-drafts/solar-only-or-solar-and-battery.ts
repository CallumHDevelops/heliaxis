import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'Solar Only or Solar and Battery?',
  slug: 'solar-only-or-solar-and-battery',
  seoTitle: 'Solar Only or Solar and Battery? How to Choose | Heliaxis',
  seoDescription: 'Solar panels on their own, or with a battery? A plain comparison of cost, savings, backup and who each suits, with the questions to ask first.',
  tags: 'Solar | Battery',
  headline: 'Solar only, or solar and battery?',
  sub: 'A plain comparison, and the three questions that decide it.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'Solar alone suits daytime households; add a battery if you use most power in the evening',
  introText:
    'If someone is home during the day, solar on its own often gives the best value for the money, because you use the power as it is made. If the house is empty until the evening, a battery lets you use more of your own solar power, at an extra cost. Three questions decide it: when do you use electricity, how big is your system, and what else do you want a battery to do?',
  bodyHtml1: `<h2>The difference in one paragraph</h2>
<p>Solar panels generate while the sun is up. Whatever the house is not using at that moment goes to the grid and earns the export rate. A battery stores some of that surplus for later, so you use it yourself instead of buying electricity. A battery costs money, so it has to save enough, or do enough else, to justify it.</p>

<h2>Side by side</h2>
<table>
<thead><tr><th></th><th>Solar only</th><th>Solar and battery</th></tr></thead>
<tbody>
<tr><td>Upfront cost</td><td>Lower</td><td>Higher: the battery is a significant extra cost</td></tr>
<tr><td>Share of solar power you use yourself</td><td>Depends on your daytime use</td><td>Higher, because the surplus is stored</td></tr>
<tr><td>Export income</td><td>More of your solar goes to the grid</td><td>Less goes to the grid</td></tr>
<tr><td>Evening and overnight use</td><td>Bought from the grid</td><td>Partly met from the battery</td></tr>
<tr><td>Power cut</td><td>The system normally switches off with the grid</td><td>Backup is possible if it is designed in, and is not automatic</td></tr>
<tr><td>Adding an electric car or heat pump</td><td>Works, with less overlap with the sun</td><td>Works well, with more stored power for charging and heating</td></tr>
<tr><td>Space and installation</td><td>Inverter only</td><td>A battery needs a suitable location</td></tr>
</tbody>
</table>

<h2>Three questions that decide it</h2>
<h3>1. When do you use electricity?</h3>
<p>This is the main one. A home with someone in during the day, working from home or retired, uses much of its solar power directly, so a battery adds less. A home where everyone is out until six uses most of its electricity when the panels are not producing, so a battery shifts a lot more. If you are not sure, a month of smart meter data or a few days of bills shows it.</p>
<h3>2. How big is your system?</h3>
<p>A larger system makes more surplus. If you have a small system and use most of it directly, a battery has little to store. If you have the roof for a larger system, solar with a battery is a way of using more of it.</p>
<h3>3. What else do you want it to do?</h3>
<ul>
<li>Charge on a cheap overnight tariff and use it through the evening peak.</li>
<li>Run part of the house in a power cut, if that is designed in.</li>
<li>Support an electric car or heat pump you plan to add.</li>
</ul>

<h2>What if I am not sure?</h2>
<p>You do not have to decide everything on the day. Many people fit solar now and add a battery later. That works best if the system is designed with it in mind, for example with an inverter that can take a battery. It is worth asking about before you buy, because it affects the choice of equipment.</p>
<p>Others decide that the better value is a slightly larger solar system and no battery. We will tell you which we think suits your home, and why.</p>`,
  ctaHeadline: 'See both options for your own home',
  ctaSub: 'Our estimator shows solar with and without a battery, using your roof and your usage.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', ESTIMATOR)}
${HOW_WE_APPROACH('this choice')}
<h2>Frequently asked questions</h2>
<h3>Is solar worth it without a battery?</h3>
<p>For many homes, yes, particularly where there is daytime use. The savings come from using solar power as it is made and from export income. A battery is an addition that may or may not pay its way.</p>
<h3>Will I get a better export rate with a battery?</h3>
<p>Not automatically. Some tariffs pay more for export at certain times, which can suit a battery. Others pay a flat rate. Check what you can get.</p>
<h3>Can I add a battery to my existing solar panels?</h3>
<p>Usually, yes. How easy and how costly it is depends on your inverter and on whether the panels are already installed. Read our guide to adding a battery to existing solar.</p>
<h3>Is it better to buy a bigger solar system or a battery?</h3>
<p>A bigger system makes more power; a battery lets you use more of what you make. If you have roof space and a high daytime use, more panels can be the better spend. If your daytime use is low, a battery can be.</p>
<h3>Should I wait for prices to fall?</h3>
<p>We cannot predict prices, and waiting means paying for electricity in the meantime. The better test is whether the system saves you more than it costs over its life on today's figures.</p>
${buttons('Get my free solar quote', SURVEY)}`,
  homeTitle: 'For your home',
  homeDesc: 'We design solar with and without a battery from your own usage, and recommend the one that makes sense.',
  homeBullets: ['Your usage drives the design', 'Battery sized to your evening demand', 'Honest if solar alone is better'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'For business sites, daytime load usually favours solar first, with storage where demand peaks later.',
  businessBullets: ['Working hours shape the design', 'Peak demand considered', 'Funding options explained'],
  businessBtn: 'Explore business funding',
  imageQuery: 'solar panels and home battery installation',
  editorNotes: ['The table is qualitative on purpose: it has no prices. If you add numbers, take them from the packages in the admin.', 'Check the statement about adding a battery later against the inverters you normally fit.'],
};
