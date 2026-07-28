'use client';

import { useRef, useState } from 'react';

const faqs = [
  {
    id: 'Q/01',
    q: 'Do I need to own the roof to use a PPA?',
    a: 'Not necessarily, but you do need the right to grant a long lease or roof licence to the funder for the term of the agreement. If you rent your premises we can work with you and your landlord on a suitable arrangement, or look at finance or CapEx instead.',
  },
  {
    id: 'Q/02',
    q: 'Can I combine a grant with finance or a PPA?',
    a: 'Often yes. A grant typically reduces the upfront project cost, and the remaining balance can be paid via CapEx or asset finance. Funders differ on whether grant-funded systems can sit inside a PPA, so we confirm this on a case-by-case basis.',
  },
  {
    id: 'Q/03',
    q: 'What payback should a business expect on solar?',
    a: 'For a well-matched commercial system in South Wales, payback is commonly in the region of three to six years, with the panels generating for 25 years or more. Sites with high daytime electricity use and a good roof tend to pay back fastest.',
  },
  {
    id: 'Q/04',
    q: 'Is the 0% VAT rate available for businesses?',
    a: 'The 0% VAT rate applies to residential and domestic solar installations until 31 March 2027. Commercial installations are generally standard-rated, but VAT-registered businesses can usually reclaim the VAT — we\u2019ll point you to your accountant to confirm your position.',
  },
  {
    id: 'Q/05',
    q: 'Which funding route is cheapest overall?',
    a: 'Buying outright (CapEx) delivers the best lifetime savings because there\u2019s no third-party margin or interest. Finance and PPAs cost a little more over time, but remove the upfront barrier — so the \u2018best\u2019 route depends on your cash position and priorities.',
  },
];

function FaqItem({ id, q, a }: { id: string; q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`qa2${open ? ' open' : ''}`}>
      <button
        className="q"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="ix">{id}</span>
        <span>{q}</span>
        <span className="tog" />
      </button>
      <div
        className="a"
        ref={answerRef}
        style={{ maxHeight: open ? answerRef.current?.scrollHeight : 0 }}
      >
        <p>{a}</p>
      </div>
    </div>
  );
}

export function FundingFaq() {
  return (
    <section className="sec" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="sec-head reveal">
          <h2>Frequently asked questions</h2>
        </div>
        <div className="faq reveal" style={{ marginTop: 26 }}>
          {faqs.map((faq) => (
            <FaqItem key={faq.id} {...faq} />
          ))}
        </div>
      </div>
    </section>
  );
}
