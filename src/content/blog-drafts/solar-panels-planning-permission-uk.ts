import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'Do I Need Planning Permission for Solar Panels?',
  slug: 'solar-panels-planning-permission-uk',
  seoTitle: 'Do I Need Planning Permission for Solar Panels? | Heliaxis',
  seoDescription: 'Most home solar panels do not need planning permission, but listed buildings, conservation areas and some roofs have rules. What to check first.',
  tags: 'Solar | Planning',
  headline: 'Do I need planning permission for solar panels?',
  sub: 'Usually not, with some important exceptions.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'Most homes do not need it, but a few situations do',
  introText:
    'Most roof-mounted solar panels on a house do not need planning permission, because they fall under what is called permitted development. There are conditions, and the rules are stricter for listed buildings and some properties in conservation areas, and for flats and ground-mounted systems. Check before you order, and ask your installer to confirm the position for your property.',
  bodyHtml1: `<h2>Permitted development, in plain terms</h2>
<p>Planning permission is not needed for development that is covered by national "permitted development" rights. For most houses, solar panels on the roof can be installed under those rights, provided the installation meets a short list of conditions. The main ones, in general terms, are that:</p>
<ul>
<li>the panels do not stick out more than a modest distance from the roof surface,</li>
<li>they are not higher than the highest part of the roof (not counting the chimney),</li>
<li>the panels are sited, as far as is practicable, to minimise their effect on the building's appearance and on the area, and</li>
<li>they are removed as soon as reasonably practicable when no longer needed.</li>
</ul>
<p>The exact wording, and some of the details, differ between England and Wales and have been updated over the years, so treat the list above as a guide to the idea rather than the legal text. Your installer or your local planning authority can confirm what applies to your property.</p>

<h2>When you should check more carefully</h2>
<table>
<thead><tr><th>Situation</th><th>Why it needs a closer look</th></tr></thead>
<tbody>
<tr><td>Listed building</td><td>Listed building consent is likely to be needed for alterations that affect its character, including panels. Speak to the planning authority before anything is ordered.</td></tr>
<tr><td>Conservation area or other designated land</td><td>Permitted development rights can be restricted, for example for panels on a roof slope that faces the road. The rules depend on how the area is designated.</td></tr>
<tr><td>Flat or maisonette</td><td>Permitted development rights for flats can differ, and you will usually need the freeholder's or management company's agreement as well.</td></tr>
<tr><td>Flat roof</td><td>Often fine, but the height and the effect on the building's appearance matter.</td></tr>
<tr><td>Ground-mounted array</td><td>Ground-mounted systems have their own conditions on size and position, and may need permission.</td></tr>
<tr><td>Where an earlier permission has conditions</td><td>An older planning permission can remove permitted development rights. Check the decision notice if you have it.</td></tr>
</tbody>
</table>

<h2>Planning permission is not the only permission</h2>
<ul>
<li><strong>Building Regulations.</strong> The installation has to meet them, including the electrical work and the structural side of fixing panels to the roof. Using an installer registered with a competent person scheme means the work is self-certified and the local authority is notified for you.</li>
<li><strong>The network operator.</strong> You must tell your electricity network operator about a new generator. Small systems are normally notified after installation, and larger ones need approval first. Your installer handles this.</li>
<li><strong>Your freeholder, landlord or lender.</strong> A lease or mortgage may require consent. Worth checking if you do not own the freehold outright.</li>
</ul>

<h2>What to do before you order</h2>
<ol>
<li>Find out whether your property is listed or in a conservation area. Your local council's website will say.</li>
<li>If it is a flat or leasehold, check your lease and speak to whoever manages the building.</li>
<li>Ask the installer to confirm in writing that permitted development applies, or what permission is needed and who will apply for it.</li>
<li>If there is any doubt, ask the council. Some will give a view informally; a Lawful Development Certificate gives a formal answer.</li>
</ol>`,
  ctaHeadline: 'Not sure whether your roof is straightforward?',
  ctaSub: 'We will check this at the survey as part of the design.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', SURVEY)}
${HOW_WE_APPROACH('planning and permissions')}
<p>If your property is listed, in a conservation area or leasehold, tell us when you ask for the quote and we will look at it before we design anything.</p>
<h2>Frequently asked questions</h2>
<h3>Do I need planning permission for solar panels on a bungalow?</h3>
<p>The same rules apply as for other houses. A bungalow in an ordinary area normally falls under permitted development, subject to the conditions.</p>
<h3>Do I need permission to put solar panels on a new-build?</h3>
<p>Check the original planning permission, because it may have removed permitted development rights or set conditions. If it did, you may need to apply.</p>
<h3>Will the council need to be told even if I do not need planning permission?</h3>
<p>Building control needs to be notified of the work. An installer registered with a competent person scheme does that as part of the job.</p>
<h3>What about battery storage?</h3>
<p>A battery inside the house is not normally a planning matter. An outdoor cabinet or a battery on a listed building is worth checking first. The Building Regulations still apply.</p>
<h3>What if the council says no?</h3>
<p>You can usually change the proposal, for example by moving panels to a less visible roof slope, or appeal the decision. It is much better to find this out before you order.</p>
<p>If you would like us to look at your property, we can do that at a free survey.</p>
${buttons('Get my free solar quote', ESTIMATOR)}`,
  homeTitle: 'For your home',
  homeDesc: 'We check the permissions that apply to your property as part of the survey, before we design the system.',
  homeBullets: ['Listed and conservation area properties checked first', 'Building control notified through our NAPIT registration', 'Network operator paperwork handled for you'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'Commercial roofs and ground-mounted systems have their own rules, which we confirm before design.',
  businessBullets: ['Roof and site constraints reviewed', 'Landlord and lender consents flagged', 'Network approval handled'],
  businessBtn: 'Explore business funding',
  imageQuery: 'house solar panels roof street',
  editorNotes: [
    'Planning rules differ between England and Wales and change over time. Have someone check the permitted development conditions and the wording about Wales against current GOV.UK and Welsh Government guidance before publishing.',
    'Confirm that you are happy to say the NAPIT registration means building control notification is done for the customer.',
  ],
};
