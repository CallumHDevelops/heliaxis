import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'Solar Panels and an EV Charger: Do They Work Together?',
  slug: 'solar-panels-and-ev-charger',
  seoTitle: 'Solar Panels and an EV Charger: How They Work Together | Heliaxis',
  seoDescription: 'How a home EV charger and solar panels work together, what a smart charger does with surplus solar power, and what to plan for if you have both.',
  tags: 'EV | Solar',
  headline: 'Solar panels and an EV charger: do they work together?',
  sub: 'They can, and the key is when the car is plugged in.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'Yes, and a smart charger can use surplus solar power',
  introText:
    'Solar panels and a home EV charger work well together, particularly if the car is at home during the day. A smart charger can be set to use only surplus solar power, or to top up from the grid when there is not enough. If the car is away all day and charges at night, the panels help less directly, and a battery or a cheap overnight tariff may do more. Plan the electrics for both together.',
  bodyHtml1: `<h2>How they fit together</h2>
<p>Panels make electricity during the day. A car that is plugged in during the day can use it directly. A car that is plugged in only at night cannot, unless the power is stored in a battery first.</p>
<table>
<thead><tr><th>Your car and routine</th><th>What tends to suit</th></tr></thead>
<tbody>
<tr><td>Home during the day (working from home, retired, a second car)</td><td>Solar with a smart charger that follows the surplus.</td></tr>
<tr><td>Away at work, charge at night</td><td>A cheap overnight tariff with the charger, with solar used by the house in the day. A battery can bridge the gap.</td></tr>
<tr><td>Mixed</td><td>A smart charger that can switch between solar surplus and cheap grid power.</td></tr>
</tbody>
</table>

<h2>What a smart solar charger does</h2>
<p>A charger designed for use with solar can measure what the house is using and what the panels are producing, and charge the car with the difference. Typically you can choose between modes, for example solar only, solar with a grid top-up to a minimum rate, or full speed. On a dull day, solar only might charge slowly or not at all, which is why a minimum charge setting is useful if you need the car ready.</p>

<h2>What it saves, and what to be realistic about</h2>
<p>Charging from your own solar power means you are not paying for that electricity. How much of your car's charging can come from the panels depends on the season, the car's battery, how far you drive and when it is plugged in. In winter there is much less surplus. Many households end up with a mix of solar, and cheap overnight grid power.</p>

<h2>What to plan for</h2>
<ul>
<li><strong>Supply capacity.</strong> A charger, solar, a battery and an electric kitchen can add up. We check the supply and the main fuse, and whether the consumer unit needs upgrading.</li>
<li><strong>The charger location.</strong> Close to the consumer unit and where the car parks, with a safe cable route. Outdoor units need the right weather rating.</li>
<li><strong>Load management.</strong> Some installations need a device that limits the charger when the house is using a lot, so the main fuse is protected.</li>
<li><strong>Installing together.</strong> Doing the work together can mean one set of electrical changes and one visit.</li>
</ul>`,
  ctaHeadline: 'Planning solar and an EV charger?',
  ctaSub: 'Tell us about the car and when you charge it and we will design around both.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', ESTIMATOR)}
${HOW_WE_APPROACH('solar and EV charging')}
<h2>Frequently asked questions</h2>
<h3>Can I charge my car directly from solar panels?</h3>
<p>Yes, through a charger set up to use surplus solar power. The car charges when the panels are producing more than the house is using.</p>
<h3>Do I need a battery as well?</h3>
<p>Not necessarily. A battery helps if you charge in the evening or overnight and want to use stored solar power. If the car is home during the day, you may not need one for that reason.</p>
<h3>Can I add a charger to an existing solar system?</h3>
<p>Usually, yes. We check the supply, the consumer unit and how the charger would work with the existing equipment.</p>
<h3>Which charger should I choose?</h3>
<p>It depends on your car, your tariff and your routine. We recommend one that suits you, rather than a single product for everybody.</p>
<h3>Are there grants for chargers?</h3>
<p>Schemes change, and many are aimed at particular groups, such as renters, flat owners or businesses. Ask us what is currently available when you enquire.</p>
${buttons('Get my free solar quote', SURVEY)}`,
  homeTitle: 'For your home',
  homeDesc: 'We design solar, battery and charger together, so the supply, the wiring and the settings suit how you drive.',
  homeBullets: ['Supply and consumer unit checked', 'Smart charger set up for surplus solar', 'One visit where possible'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'Workplace and fleet charging is designed around dwell time, vehicles and available power.',
  businessBullets: ['Charging designed around your vehicles', 'Power and load management planned', 'Funding options explained'],
  businessBtn: 'Explore business funding',
  imageQuery: 'electric car charging home driveway',
  editorNotes: [
    'Check the claim that you install chargers designed to follow surplus solar, and add the makes you actually fit if you want.',
    'The grants sentence is deliberately general. Replace it with the current position if you want to be specific.',
  ],
};
