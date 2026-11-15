import type { CmsArticleAi } from '@/lib/blog/cms-article-template';
import { buttons, ESTIMATOR, HOW_WE_APPROACH, SURVEY } from './helpers';

export const article: CmsArticleAi = {
  title: 'Solar Panels in South Wales and the South West: A Local Guide',
  slug: 'solar-panels-south-wales-and-south-west-guide',
  seoTitle: 'Solar Panels in South Wales and the South West | Heliaxis',
  seoDescription: 'How much sun South Wales and the South West get, who your network operator is, what planning rules apply and what to expect from a local installer.',
  tags: 'Solar | South Wales',
  headline: 'Solar panels in South Wales and the South West',
  sub: 'The sunshine, the network operator and the local things to know.',
  introEyebrow: 'THE SHORT ANSWER',
  introTitle: 'The West of Britain is a good place for solar',
  introText:
    'South Wales and the South West of England receive more sunshine than much of the UK, and solar works well here. Your electricity network operator is National Grid Electricity Distribution (NGED), which matters for approvals and connection limits. Planning in Wales is set by the Welsh Government and your local council. A local installer who knows the area, the network and the roofs can save time and avoid surprises.',
  bodyHtml1: `<h2>The sun in South Wales and the South West</h2>
<p>Output depends on where you are, the direction and pitch of the roof, and shading. As a general rule, the south and west of Britain are sunnier than the north and east, which is good news for this part of the country. Solar panels do not need strong sun to work: they produce on cloudy days too, at a lower rate. The figures we give you come from modelling your own roof for your own location, not from a national average.</p>
<p>The shape of the year matters more than the average. Summer output is several times winter output, so a system makes most of its electricity between spring and autumn. That is normal everywhere in the UK, and it is why the savings figures we show are annual totals.</p>

<h2>Who your network operator is</h2>
<p>In South Wales and the South West of England the distribution network operator is National Grid Electricity Distribution (NGED). Any solar system or battery connected to the network has to be notified to them, and larger systems need their approval before installation. Local knowledge helps: we know how their process works, what they look for and how to avoid delays. Check your operator on the energy networks website if you are unsure, because boundaries can be close to the edges of the region.</p>

<h2>Planning and building rules in Wales and England</h2>
<p>Most domestic rooftop solar in England and in Wales can be installed under permitted development, though the rules differ between the two countries, and listed buildings and some conservation areas need more care. If you are in Wales, planning is handled by your local council under Welsh Government rules, so use the right guidance. Our article on planning permission for solar panels sets out the usual position.</p>

<h2>Local things that affect a roof</h2>
<ul>
<li><strong>Weather and exposure.</strong> Coastal and hillside sites can be windy, which affects the mounting and how we fix the panels.</li>
<li><strong>Older housing stock.</strong> Terraced and Victorian homes are common, with slate roofs and narrow access, which affects scaffolding and fixings.</li>
<li><strong>Trees and hills.</strong> Valleys and woodland can add shade at low sun angles. We model it.</li>
<li><strong>Roof coverings.</strong> Slate, tile and sheet each need the right fixings.</li>
</ul>

<h2>What a local installer gives you</h2>
<p>Heliaxis is based in Newport and installs across South Wales and the South West. Being local means a survey you can book soon, a team that knows the roofs and the network, and someone to call afterwards if you need us.</p>`,
  ctaHeadline: 'Find out what your roof would make',
  ctaSub: 'Ask for a free quote and we will arrange a survey at a time that suits you.',
  ctaBtn: 'Get my free solar quote',
  bodyHtml2: `${buttons('Get my free solar quote', ESTIMATOR)}
${HOW_WE_APPROACH('local installations')}
<h2>Frequently asked questions</h2>
<h3>Does solar work in Wales?</h3>
<p>Yes. It does not need constant sun to produce. Output depends on your roof and shading, and we model both for your own address.</p>
<h3>Which areas do you cover?</h3>
<p>We cover South Wales and the South West of England. Tell us your postcode when you enquire and we will confirm.</p>
<h3>Who is my network operator?</h3>
<p>In this region it is normally National Grid Electricity Distribution. We confirm it for your address and handle the notification or application.</p>
<h3>Do the Welsh planning rules differ?</h3>
<p>The principles are similar, but the rules are set separately for Wales and for England. We check the position for your property and your council.</p>
<h3>Can I get a quote in Welsh?</h3>
<p>Ask us when you enquire.</p>
${buttons('Get my free solar quote', SURVEY)}`,
  homeTitle: 'For your home',
  homeDesc: 'A local, MCS-certified installer, with a free survey and a fixed price in writing.',
  homeBullets: ['Based in Newport, covering South Wales and the South West', 'Network paperwork handled for you', 'Free survey, no obligation'],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: 'Commercial installations across the region, with the network approval handled early.',
  businessBullets: ['Local project management', 'Network approval managed', 'Funding options explained'],
  businessBtn: 'Explore business funding',
  imageQuery: 'south wales houses solar panels',
  editorNotes: [
    'Check that NGED is the network operator across all the places you cover, including the parts of the South West and Wales you work in.',
    'The "Welsh" FAQ promises nothing. Replace it with a real answer, or delete it if you cannot offer one.',
    'Add the towns and counties you actually cover to this article and to the landing page once Cal confirms the list.',
    'Check "a survey you can book soon" matches your real lead times.',
  ],
};
