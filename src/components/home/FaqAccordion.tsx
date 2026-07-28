'use client';

import { useRef, useState } from 'react';
import { Eyebrow } from './Eyebrow';

const faqs = [
  { id: 'Q/01', q: 'Do solar panels work in Wales\u2019 cloudy weather?', a: 'Yes. Panels generate from daylight, not direct sun, so they still produce power on overcast days. The UK gets more than enough solar energy each year to make a well-designed system a sound investment.' },
  { id: 'Q/02', q: 'How much could I save?', a: 'It depends on your roof, usage and whether you add a battery \u2014 but many homes save four figures a year. The quickest way to find out is our 20-second estimator, or a free survey for exact figures.' },
  { id: 'Q/03', q: 'Will I need planning permission?', a: 'For most homes solar is classed as permitted development, so no permission is needed. Listed buildings, conservation areas and some commercial sites are exceptions \u2014 we\u2019ll confirm at survey.' },
  { id: 'Q/04', q: 'Is there really no hard sell?', a: 'Correct. We\u2019re engineers, not commission-driven salespeople. You\u2019ll get honest advice, a clear quote, and no pressure \u2014 book a survey and decide in your own time.' },
  { id: 'Q/05', q: 'Do you cover my area?', a: 'We install right across South Wales \u2014 Cardiff, Swansea, Newport, Bridgend, the Vale of Glamorgan, RCT and surrounding areas. If you\u2019re nearby, just ask.' },
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

export function FaqAccordion() {
  return (
    <section className="sec" id="faq">
      <div className="wrap">
        <div className="sec-head center reveal">
          <Eyebrow>Good to know</Eyebrow>
          <h2>Your questions, answered</h2>
        </div>
        <div className="faq reveal">
          {faqs.map((faq) => (
            <FaqItem key={faq.id} {...faq} />
          ))}
        </div>
      </div>
    </section>
  );
}
