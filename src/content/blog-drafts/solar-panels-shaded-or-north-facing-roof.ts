import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'Solar Panels on a Shaded or North-Facing Roof',
  slug: 'solar-panels-shaded-or-north-facing-roof',
  seoTitle: 'Solar Panels on a Shaded or North-Facing Roof | Heliaxis',
  seoDescription: 'Can solar work on an east, west or north-facing roof, or one with shade? What changes, what the equipment can do, and when it is not worth it.',
  tags: 'Solar | Roof',
  headline: 'Solar panels on a shaded or north-facing roof',
  sub: 'East and west work well. North and heavy shade need more care.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'South is best, but it is not the only roof that works',
  introText:
    'A south-facing roof with no shade makes the most electricity per panel, but east- and west-facing roofs work well and are often a good fit for how people use power. A north-facing roof, or one with heavy shade, makes much less and is often not worth covering. The right equipment can reduce the effect of partial shade. A survey is the way to find out what your roof will really do.',
  bodyHtml1: `<h2>Direction matters, but less than people expect</h2>
<table>
<thead><tr><th>Roof direction</th><th>What to expect</th></tr></thead>
<tbody>
<tr><td>South</td><td>The most output per panel across the year.</td></tr>
<tr><td>South-east or south-west</td><td>Close to south. Often a very small difference.</td></tr>
<tr><td>East or west</td><td>Noticeably less per panel than south, but often good value. East catches the morning sun and west the afternoon and evening, which can suit a household's pattern of use.</td></tr>
<tr><td>North</td><td>Much less, particularly in winter. Often not worth installing, unless the roof pitch is shallow or there is no alternative.</td></tr>
</tbody>
</table>
<p>The pitch of the roof matters as well. In the UK, a pitch somewhere in the middle range, steep enough to shed rain and shallow enough to catch the high summer sun, tends to work best. A flat roof can have panels mounted on frames tilted towards the sun.</p>

<h2>East and west: a good option</h2>
<p>People often assume that only a south roof is worth it. For many homes, a split east and west system is a very good fit. It starts earlier and carries on later in the day, which can match when you use electricity, and it makes less of a midday surplus to export. If you have a choice between a small south array and a larger east-west one, it is worth running both through the numbers.</p>

<h2>Shade: where it comes from and what it does</h2>
<p>Shade can come from trees, a neighbour's house, a chimney, a dormer or the house itself. How much it matters depends on how long each part of the roof is shaded and when.</p>
<ul>
<li><strong>Shade in the middle of the day</strong> in the summer costs the most, because that is when the sun is strongest.</li>
<li><strong>Shade in the early morning or late evening</strong> costs less.</li>
<li><strong>Shade on a few panels</strong> can pull down the output of others wired in the same string. Panel-level optimisers or microinverters let each panel work independently, which can recover much of that loss. They cost more.</li>
<li><strong>Seasonal shade</strong> from deciduous trees varies through the year, and is worse in winter when the sun is low and the trees are bare of leaf only to a point. It is best judged on site.</li>
</ul>

<h2>When it is not worth it</h2>
<p>If the only roof face is north-facing and well shaded, or the shade is deep and all day, then solar may not pay its way. We would rather tell you that than quote for a system that will disappoint. There may be other options, such as a ground-mounted array, a garage or outbuilding roof, or looking at insulation and heat pumps first.</p>`,
  ctaHeadline: 'Find out what your roof would really make',
  ctaSub: 'We check direction, pitch and shading at the survey and put it in writing.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', ESTIMATOR)}
${HOW_WE_APPROACH('shaded and awkward roofs')}
<h2>Frequently asked questions</h2>
<h3>How much less does an east or west roof make?</h3>
<p>It depends on the pitch and the exact direction, and it is less than south. The survey gives you a figure for your roof, rather than a rule of thumb.</p>
<h3>Can I put panels on a north-facing roof?</h3>
<p>You can, but they make much less, and the economics are rarely good. We would normally look at other roof faces first.</p>
<h3>Do optimisers fix shading?</h3>
<p>They reduce the effect of partial shading by letting each panel work on its own. They do not make shade disappear, and they add cost, so we use them where they will earn it.</p>
<h3>What if a tree is the problem?</h3>
<p>Trimming or removing it can be an option, but it may not be yours to cut, and it may be protected. Raise it early.</p>
<h3>Does cloud matter?</h3>
<p>Panels still work under cloud, at lower output. The figures we give you already allow for typical UK weather in your area.</p>
${buttons('Get my free solar quote', SURVEY)}`,
  homeTitle: 'For your home',
  homeDesc: 'We check every roof face, the shading and the best layout, and say so plainly if solar is not worth it.',
  homeBullets: ['Direction, pitch and shade assessed on site', 'Optimisers used only where they earn their cost', 'Honest advice if solar is a weak fit'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'Large flat roofs and mixed layouts are modelled before we design, so the system suits the building.',
  businessBullets: ['Roof layout modelled', 'Shading on large roofs assessed', 'Funding options explained'],
  businessBtn: 'Explore business funding',
  imageQuery: 'east west solar panels roof',
  editorNotes: [
    'No percentages are given on purpose. If you want to add typical figures for east, west and north roofs, take them from your survey and design software.',
    'Check the statement about when optimisers are used matches your practice.',
  ],
};
