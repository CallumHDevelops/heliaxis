'use client';

import { useRef, useState } from 'react';

const faqs = [
  {
    id: 'Q/01',
    q: 'How big a system can my warehouse roof take?',
    a: 'Large industrial roofs often suit systems from tens of kWp up to several hundred kWp. The limit is usually roof area, structure and your grid connection rather than demand \u2014 we assess all three at survey.',
  },
  {
    id: 'Q/02',
    q: 'Will installation disrupt operations?',
    a: 'Rarely. The bulk of the work happens on the roof, so day-to-day operations usually continue underneath. We plan around your shifts and any access or safety requirements.',
  },
  {
    id: 'Q/03',
    q: 'What about the power we don\u2019t use on site?',
    a: 'Surplus can be stored in a battery for later, or exported to the grid for income under the Smart Export Guarantee. For most warehouses, high daytime demand means you self-consume a large share directly.',
  },
  {
    id: 'Q/04',
    q: 'Can we fund it without capital outlay?',
    a: 'Yes \u2014 warehousing and industrial sites are a strong fit for a Power Purchase Agreement, as well as asset finance or outright purchase. See our funding guide for the trade-offs.',
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

export function WarehousingFaq() {
  return (
    <div className="faq reveal" style={{ marginTop: 22, maxWidth: 900 }}>
      {faqs.map((faq) => (
        <FaqItem key={faq.id} {...faq} />
      ))}
    </div>
  );
}
