import type { Metadata } from 'next';
import { PortalLogin } from './PortalLogin';
import './[token]/portal.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Your project',
  description: 'Open your Heliaxis project with your surname and postcode.',
  robots: { index: false, follow: false },
};

/** heliaxis.co.uk/my: the customer opens their portal with their surname and postcode (or the link we sent). */
export default function PortalSignIn() {
  return (
    <div className="pt">
      <header className="pt-head">
        <span className="pt-head-tag">Heliaxis · Your project</span>
      </header>
      <main className="pt-main">
        <section className="pt-hello">
          <h1>Your project</h1>
          <p>Your quote, your progress and your documents, all in one place.</p>
        </section>
        <PortalLogin />
      </main>
    </div>
  );
}
