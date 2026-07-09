'use client';

import { useRef, useState } from 'react';

const faqs = [
  {
    id: 'Q/01',
    q: 'Who can apply for the Net Zero Newport grant?',
    a: 'It\u2019s aimed at small and medium-sized enterprises that own or occupy a building within the Newport City Council area and want to reduce its carbon emissions. Eligibility criteria apply, so the first step is a conversation with the programme team.',
  },
  {
    id: 'Q/02',
    q: 'What can the grant be spent on?',
    a: 'Eligible decarbonisation measures \u2014 which can include solar PV, battery storage and energy-efficiency works \u2014 covering the equipment, its installation and commissioning. We\u2019ll scope a compliant project with you.',
  },
  {
    id: 'Q/03',
    q: 'How much is the grant worth?',
    a: 'It\u2019s match-funded: the grant covers up to 50% of eligible project costs, to a maximum of \u00a330,000, drawn from a total programme fund of \u00a3250,000 backed by the UK Shared Prosperity Fund.',
  },
  {
    id: 'Q/04',
    q: 'Is the grant open right now?',
    a: 'Applications were shown as closed for the 2025/26 year at the time of writing. It\u2019s a recurring programme, so we recommend registering interest early and lining up a scoped project so you\u2019re ready for the next round.',
  },
  {
    id: 'Q/05',
    q: 'Can Heliaxis handle the application?',
    a: 'We can\u2019t guarantee an award, but we help by scoping an eligible system, preparing the technical documentation and quotes the application needs, and timing it around the funding round.',
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

export function NewportFaq() {
  return (
    <div className="faq reveal" style={{ marginTop: 22 }}>
      {faqs.map((faq) => (
        <FaqItem key={faq.id} {...faq} />
      ))}
    </div>
  );
}
