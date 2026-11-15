import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'What Happens at a Solar Panel Survey?',
  slug: 'what-happens-at-a-solar-survey',
  seoTitle: 'What Happens at a Solar Panel Survey? | Heliaxis',
  seoDescription: 'What a solar survey checks, how long it takes and what you get afterwards: a fixed written price based on your roof, your electrics and your usage.',
  tags: 'Solar | Survey',
  headline: 'What happens at a solar panel survey?',
  sub: 'A free visit, about an hour, and a fixed price in writing afterwards.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'A survey is how a quote becomes a price you can rely on',
  introText:
    'A solar survey is a visit to your property, usually around an hour, where the installer checks the roof, any shading, your electrics and how you use power, then designs a system around what they find. You should get a fixed price in writing afterwards. A quote given without any of that is an estimate, however it is presented.',
  bodyHtml1: `<h2>Why a survey comes before a price</h2>
<p>Two houses on the same street can need very different systems. One roof faces south with no trees nearby; the next has a chimney stack that shades half of it for the afternoon. One home has a modern consumer unit with space for new protection; the next needs it replaced. A price quoted without seeing those things is a guess, and a guess tends to move once someone is on site.</p>
<p>The survey is where the guess becomes a design. It is free with us, and it does not commit you to anything.</p>

<h2>What we check, and why it matters</h2>
<h3>The roof</h3>
<ul>
<li><strong>Direction and pitch.</strong> South-facing roofs make the most per panel, but east and west roofs work well too, especially if you use power in the morning or evening.</li>
<li><strong>Size and layout.</strong> How many panels fit once chimneys, windows, vents and the edges of the roof are allowed for.</li>
<li><strong>Condition and covering.</strong> Tiles, slate or sheet, the state of the battens and the rafters, and whether anything needs doing before panels go on. Fixing panels to a tired roof is a false economy.</li>
</ul>
<h3>Shading</h3>
<p>Trees, neighbouring buildings and the house itself can shade a roof at certain times of day or year. We look at where the sun will be, not only where it is during the visit. Some shading can be managed with the right equipment; some is a reason to move panels to a different roof face or to be honest that solar is a weaker fit.</p>
<h3>The electrics</h3>
<ul>
<li>The consumer unit (fuse board) and whether it can take the new circuit and its protection.</li>
<li>The meter, the main fuse and the supply, including whether the property is single-phase or three-phase.</li>
<li>Where the inverter, and a battery if you want one, can go: somewhere accessible, ventilated and sensible for the cable runs.</li>
</ul>
<h3>How you use electricity</h3>
<p>We ask when people are home, whether you work from home, and whether an electric car or heat pump is on the way. Use during the day is what decides how much of the solar power you use yourself rather than export, and that is what drives whether a battery makes sense.</p>

<h2>What the visit looks like</h2>
<table>
<thead><tr><th>Stage</th><th>What happens</th></tr></thead>
<tbody>
<tr><td>Before</td><td>We look at the property from above, and you tell us roughly what you use. Having a recent bill to hand helps.</td></tr>
<tr><td>Outside</td><td>The surveyor measures the roof, notes the covering and checks for shade and access for scaffolding.</td></tr>
<tr><td>Loft and inside</td><td>They look at the roof structure from below where they can, find the consumer unit and meter, and choose where the equipment would go.</td></tr>
<tr><td>Chat</td><td>You talk through your usage, your plans and your priorities, and ask whatever you like.</td></tr>
</tbody>
</table>
<p>Allow about an hour. You do not need to be on the roof, and you do not need to have decided anything.</p>

<h2>What you get afterwards</h2>
<p>A design and a price in writing. That should show the number of panels and their output in kWp, the inverter, the battery if one is included, what the price covers (scaffolding, fitting, wiring, certification and the paperwork to the network operator), and an estimate of what the system will generate. A good quote also states its assumptions, such as the roof direction and shading it has allowed for, so you can see how the figures were reached.</p>`,
  ctaHeadline: 'Find out what solar could do for your roof',
  ctaSub: 'Ask for a free quote and we will call you within one working day to arrange a survey.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', SURVEY)}
${HOW_WE_APPROACH('the survey')}
<h2>Frequently asked questions</h2>
<h3>Is the survey really free?</h3>
<p>Yes. The survey is free and there is no obligation to go ahead afterwards. The price you receive is the price for your home.</p>
<h3>How long does a solar survey take?</h3>
<p>Usually around an hour. It can take longer for a large or complicated roof, or if you also want a battery, an electric car charger or a heat pump looked at.</p>
<h3>Do I need to be at home?</h3>
<p>Someone needs to be there to let us in and to answer questions about how you use electricity. The roof inspection itself does not need you outside.</p>
<h3>Will you go on the roof?</h3>
<p>Where it is safe to, yes. Otherwise we measure from the ground and from above using imagery. We do not take risks to save a few minutes.</p>
<h3>What if my roof is not suitable?</h3>
<p>Then we say so. A shaded or awkward roof may suit fewer panels, a different roof face, or a different product. If solar is not worth doing on your property, you should hear that from us at the survey.</p>
<h3>Can I compare your quote with others?</h3>
<p>Please do. Compare what is included, the panel and inverter brands, the warranties, and whether the installer is MCS-certified. The lowest number is not always the same job.</p>
<p>If you would like to see rough figures first, the solar estimator takes a couple of minutes. The survey is what turns those figures into a fixed price.</p>
${buttons('Get my free solar quote', ESTIMATOR)}`,
  homeTitle: 'For your home',
  homeDesc: 'A free survey of your roof and electrics, then a fixed price in writing for a system designed around you.',
  homeBullets: ['No obligation, and no pushy sales', 'Designed from your roof, shading and usage', 'A fixed price in writing'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'Commercial sites are surveyed the same way, with the building, the supply and your working hours in mind.',
  businessBullets: ['Roof, supply and load assessed on site', 'Your daytime demand drives the design', 'Funding options explained plainly'],
  businessBtn: 'Explore business funding',
  imageQuery: 'solar installer surveying roof',
  editorNotes: ['Check the "about an hour" figure matches how long your surveys really take.', 'Confirm you survey from the ground or from imagery where the roof is not safe to access, as written.'],
};
