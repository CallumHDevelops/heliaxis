/** The main call to action every article points to. One place to change when the landing page replaces it. */
export const QUOTE_HREF = '/get-a-quote';

/** A button row as the article template wants it: a paragraph holding only links with data-button. */
export const buttons = (main: string, second?: { label: string; href: string }) =>
  `<p><a href="${QUOTE_HREF}" data-button="solar">${main}</a>${second ? ` <a href="${second.href}" data-button="ghost">${second.label}</a>` : ''}</p>`;

export const ESTIMATOR = { label: 'Try the solar estimator', href: '/solar-estimator' };
export const SURVEY = { label: 'Book a free survey', href: '/book-a-survey' };

/** The same closing section on every article: what a Heliaxis survey checks. Kept short and true. */
export const HOW_WE_APPROACH = (topic: string) =>
  `<h2>How Heliaxis approaches ${topic}</h2>
<p>We quote after a survey, not by guesswork. At the survey we look at the roof (its direction, pitch, condition and what it is made of), shading from trees and neighbouring buildings, the electrics (the consumer unit, the meter and the supply), and how you use electricity through the day. We also check what the local network operator needs to be told about the connection. The price you get in writing is based on your home.</p>
<p>Heliaxis is an MCS-certified installer, a member of RECC and registered with NAPIT, and we cover South Wales and the South West. The survey is free and there is no obligation.</p>`;
