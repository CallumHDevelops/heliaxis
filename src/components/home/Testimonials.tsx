import Link from 'next/link';
import { Eyebrow } from './Eyebrow';

/**
 * Proof-of-work band. Shows real projects (the /case-studies collection) rather than placeholder
 * testimonials: reviews only go on the site once they are verified and approved by the customer.
 */
export function Testimonials() {
  return (
    <section className="sec" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="sec-head center reveal">
          <Eyebrow>Real projects</Eyebrow>
          <h2>See our work across South Wales</h2>
          <p>
            Case studies with the system specification, how the installation went, and results clearly labelled as
            measured or estimated.
          </p>
        </div>
        <div className="reveal" style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link className="btn btn-dark" href="/case-studies">View case studies</Link>
          <Link className="btn btn-ghost" href="/book-a-survey">Book a free survey</Link>
        </div>
      </div>
    </section>
  );
}
