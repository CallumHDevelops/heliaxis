import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'Can You Add a Battery to Existing Solar Panels?',
  slug: 'add-a-battery-to-existing-solar-panels',
  seoTitle: 'Adding a Battery to Existing Solar Panels | Heliaxis',
  seoDescription: 'Yes, you usually can. How AC and DC coupling work, what your existing inverter means for the cost, and what to check before you retrofit a battery.',
  tags: 'Battery | Retrofit',
  headline: 'Can you add a battery to existing solar panels?',
  sub: 'Usually yes. What decides the cost is the inverter you already have.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'Yes, in most cases, and how you do it depends on your inverter',
  introText:
    'Most existing solar systems can have a battery added. The method depends on your inverter: some can be replaced with a hybrid inverter, while others are left alone and a separate battery system is connected alongside (called AC coupling). There are also rules about the paperwork, and it affects any feed-in tariff you may still receive. A survey tells you which route suits your system.',
  bodyHtml1: `<h2>The two ways to add a battery</h2>
<h3>AC-coupled: a battery with its own inverter</h3>
<p>The battery has its own inverter and is connected to your household wiring. Your existing solar inverter stays as it is. This is the usual retrofit route, because it does not interfere with the existing panels or inverter. It converts power more than once on its way into and out of the battery, so it can be slightly less efficient.</p>
<h3>DC-coupled: a hybrid inverter</h3>
<p>The existing solar inverter is replaced by a hybrid inverter that handles both the panels and the battery. It can be more efficient, but it means replacing equipment that may still be working. It tends to make most sense if your inverter is old and nearing the end of its life anyway.</p>

<h2>What decides which is better for you</h2>
<ul>
<li><strong>The age and make of your inverter.</strong> An inverter close to the end of its warranty is a good candidate for replacement.</li>
<li><strong>Your panels and strings.</strong> The hybrid inverter has to suit the panels you have.</li>
<li><strong>Space and wiring.</strong> Where the battery and any new inverter will go, and how cables will reach them.</li>
<li><strong>What you want it to do.</strong> A backup supply in a power cut needs specific equipment and wiring regardless of the route.</li>
</ul>

<h2>Things worth checking before you commit</h2>
<ol>
<li><strong>The existing warranty.</strong> Check that adding equipment does not affect the warranty on your panels or inverter.</li>
<li><strong>Feed-in tariff.</strong> If you are paid under the old feed-in tariff, tell us. Adding a battery can affect how generation is metered, and the rules differ depending on how you are set up. We will check how it applies to you before anything is changed.</li>
<li><strong>The network operator.</strong> Adding storage is a change to your connection that your network operator needs to know about, and it may affect the connection limit. We handle this.</li>
<li><strong>The Smart Export Guarantee.</strong> If you are not already exporting under it, a new MCS-certified battery installation may help you qualify. Read our explanation of the scheme.</li>
</ol>

<h2>Is it worth doing?</h2>
<p>The same questions apply as for a new system. If you are out all day and use most of your power in the evening, a battery lets you use more of your solar electricity. If someone is home all day, there is less to gain. Our guide to whether a solar battery is worth it covers the sums.</p>`,
  ctaHeadline: 'Thinking of adding a battery?',
  ctaSub: 'Tell us what you have already and we will work out the best way to add storage.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', SURVEY)}
${HOW_WE_APPROACH('adding a battery')}
<p>For a retrofit we also look at the existing equipment, so it is helpful if you have the make and model of your inverter, or a photo of its label, and any installation paperwork.</p>
<h2>Frequently asked questions</h2>
<h3>Can I add a battery to any solar system?</h3>
<p>Most systems, yes. A few older ones or unusual arrangements need more thought. We assess your equipment before we recommend anything.</p>
<h3>Do I have to replace my solar inverter?</h3>
<p>Not necessarily. An AC-coupled battery has its own inverter and leaves your existing one alone. Replacement is a choice, not a requirement, and is sensible mainly when your inverter is old.</p>
<h3>Will adding a battery affect my solar panel warranty?</h3>
<p>It should not if the work is done properly, but you should check your warranty terms, and we will tell you if anything looks like a risk.</p>
<h3>How long does a battery installation take?</h3>
<p>Often a day for a straightforward installation, and longer where an inverter is also being replaced or the wiring is complicated. We give you a time at the survey.</p>
<h3>Do I need MCS certification for a battery?</h3>
<p>It is needed for many schemes, including the Smart Export Guarantee where it applies. Ask for the certificate and keep it.</p>
${buttons('Get my free solar quote', ESTIMATOR)}`,
  homeTitle: 'For your home',
  homeDesc: 'We look at the equipment you already have and recommend the simplest, best-value way to add storage.',
  homeBullets: ['Existing inverter and warranty checked', 'Backup option explained honestly', 'Network operator paperwork handled'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'Storage on commercial sites is assessed against demand, tariffs and the existing connection.',
  businessBullets: ['Demand profile reviewed', 'Connection limits checked', 'Funding options explained'],
  businessBtn: 'Explore business funding',
  imageQuery: 'battery storage unit installed home garage',
  editorNotes: [
    'Check the feed-in tariff statement with someone who knows the current rules before publishing. It is deliberately cautious.',
    'Check "often a day" for installation time against what you actually do.',
    'Confirm you install AC-coupled batteries as a standard retrofit route.',
  ],
};
