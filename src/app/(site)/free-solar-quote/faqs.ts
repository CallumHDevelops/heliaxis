import type { Faq } from '@/components/home/FaqAccordion';

/**
 * The landing page's questions. The same text feeds the accordion and the FAQPage JSON-LD, so they never drift apart.
 * No prices, savings or paybacks here: they come from the packages and the estimator. Anything with a date (VAT) is checked and dated.
 */
export const FAQS_CHECKED = 'November 2026';

export const FAQS: Faq[] = [
  {
    id: 'Q/01',
    q: 'How much do solar panels cost?',
    a: 'It depends on how many panels your roof can take, whether you add a battery and how easy the roof is to reach. The solar estimator gives a figure for your own roof in a few minutes, and the survey then sets a fixed price in writing.',
  },
  {
    id: 'Q/02',
    q: 'How long will solar take to pay for itself?',
    a: 'It depends on how much electricity you use in the day, your tariff, how much you export and the size of the system, so we do not quote one figure for everyone. The estimator shows an estimate with its assumptions beside it, and your written quote sets out the figures for your home.',
  },
  {
    id: 'Q/03',
    q: 'What happens at the survey?',
    a: 'We visit, usually for about an hour, and check the roof, any shading, your fuse board and how you use electricity. We then design a system around what we find and send you a fixed price in writing. The survey is free and there is no obligation.',
  },
  {
    id: 'Q/04',
    q: 'Do I need planning permission?',
    a: 'Most home solar installations count as permitted development, so no application is needed. Listed buildings, conservation areas and some other cases can need consent. We check this at the survey and tell you before anything is booked.',
  },
  {
    id: 'Q/05',
    q: 'How long does the installation take?',
    a: 'A typical home installation takes one to two days on site, with scaffolding put up beforehand and taken down afterwards. From first call to switch-on usually takes a few weeks, because of the survey, the design and the paperwork for the local network operator.',
  },
  {
    id: 'Q/06',
    q: 'What does a battery add?',
    a: 'A battery stores solar power you would otherwise send to the grid, so you can use it in the evening. Whether it is worth it depends on when you use electricity and on your tariff. If solar on its own suits you better, we will say so.',
  },
  {
    id: 'Q/07',
    q: 'Are there grants, and what is the Smart Export Guarantee?',
    a: 'The Smart Export Guarantee pays you for electricity you send to the grid, at a rate set by the energy supplier you choose, and it needs an MCS-certified installation. Home solar panels and batteries currently carry 0% VAT until 31 March 2027. Grant schemes change, so we check what applies to you at the survey.',
  },
  {
    id: 'Q/08',
    q: 'What if my roof is shaded?',
    a: 'Shade lowers output, but it rarely rules solar out. At the survey we look at where the shade falls through the day and design around it, for example with a different layout or panel-level optimisers. If a roof will not give a sensible return, we will tell you.',
  },
];
