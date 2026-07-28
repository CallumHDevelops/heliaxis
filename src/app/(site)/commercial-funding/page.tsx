import type { Metadata } from 'next';
import './commercial-funding.css';
import { Eyebrow } from '@/components/home/Eyebrow';
import { SiteFooter } from '@/components/home/SiteFooter';
import { ScrollReveal } from '@/components/home/ScrollReveal';
import { FundingFaq } from './FundingFaq';

export const metadata: Metadata = {
  title: 'Commercial Solar Funding & Finance — PPA, Grants & CapEx | Heliaxis',
  description:
    'Commercial solar funding options including CapEx purchase, asset finance and Power Purchase Agreements (PPA / Solar as a Service), plus Welsh and local grant guidance.',
};

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function PageHero() {
  return (
    <section className="phero">
      <div className="glow" />
      <div className="wrap">
        <div className="crumb">
          <a href="/">Home</a> / <a href="/#business">Commercial</a> / Funding &amp; finance
        </div>
        <Eyebrow onDark>Commercial · Funding &amp; finance</Eyebrow>
        <h1>
          Fund your solar the way that <span className="y">suits your balance sheet.</span>
        </h1>
        <p className="lead">
          Buy outright, spread the cost, or pay nothing upfront with a Power Purchase Agreement — plus the Welsh &amp; local grants worth knowing about. Here&apos;s every route, in plain terms.
        </p>
        <div className="cbtns">
          <a className="btn btn-solar" href="/#quote">
            Book a free energy assessment <ArrowIcon />
          </a>
          <a className="btn btn-light" href="/solar-estimator">Try the estimator</a>
        </div>
        <div className="metrics">
          <div className="m"><div className="n">£0</div><div className="k">Upfront with a PPA</div></div>
          <div className="m"><div className="n">3–6 yr</div><div className="k">Typical CapEx payback</div></div>
          <div className="m"><div className="n">Up to £30k</div><div className="k">Newport SME grant</div></div>
          <div className="m"><div className="n">25 yr+</div><div className="k">Generation lifespan</div></div>
        </div>
      </div>
    </section>
  );
}

function FundingRoutes() {
  return (
    <section className="sec">
      <div className="wrap">
        <div className="sec-head reveal">
          <Eyebrow>Three ways to pay</Eyebrow>
          <h2>CapEx, finance or PPA</h2>
          <p>The same system, three funding routes. The right one comes down to whether you&apos;d rather own the asset or protect your cash.</p>
        </div>
        <div className="grid3 reveal" style={{ marginTop: 28 }}>
          <div className="gcell">
            <div className="tagline">Own it outright</div>
            <h3>CapEx purchase</h3>
            <p>You buy the system upfront. Every unit it generates is then effectively free power, and all the savings and export income are yours.</p>
            <ul>
              <li>Best lifetime return — no interest or third-party margin</li>
              <li>You own the asset and any capital allowances</li>
              <li>Simple, no long contract</li>
            </ul>
            <span className="chip">Best for: cash-rich sites wanting max ROI</span>
          </div>
          <div className="gcell">
            <div className="tagline">Spread the cost</div>
            <h3>Asset finance</h3>
            <p>Fund the system through a lease or loan and pay over an agreed term. You still own it, and the repayments are often offset by the energy savings.</p>
            <ul>
              <li>Keeps cash free for the core business</li>
              <li>You own the asset at the end of the term</li>
              <li>Repayments frequently below the savings generated</li>
            </ul>
            <span className="chip">Best for: preserving working capital</span>
          </div>
          <div className="gcell">
            <div className="tagline">Solar as a Service</div>
            <h3>Power Purchase Agreement</h3>
            <p>A funder installs, owns and maintains the system at no upfront cost. You simply buy the power it produces at an agreed rate, usually below the grid price.</p>
            <ul>
              <li>Zero capital outlay and no maintenance risk</li>
              <li>Immediate savings from day one</li>
              <li>Long-term hedge against rising grid prices</li>
            </ul>
            <span className="chip">Best for: energy-intensive sites, no capex</span>
          </div>
        </div>
        <div className="callout reveal" style={{ marginTop: 16 }}>
          <b>Not sure which fits?</b> A quick assessment of your energy bills, roof and cash position tells us which route pays back fastest for you — no obligation.
        </div>
      </div>
    </section>
  );
}

function PpaBand() {
  return (
    <section className="sec band">
      <div className="glow" />
      <div className="wrap">
        <div className="sec-head reveal">
          <Eyebrow onDark>In depth</Eyebrow>
          <h2 style={{ color: 'var(--paper)' }}>How a PPA actually works</h2>
          <p style={{ color: 'var(--muted-d)' }}>A Power Purchase Agreement removes the upfront cost of solar entirely. Here&apos;s the shape of it, start to finish.</p>
        </div>
        <div className="cf-steps reveal" style={{ marginTop: 24 }}>
          <div className="step" style={{ borderColor: 'var(--line-d)' }}>
            <span className="n">01</span>
            <h4 style={{ color: 'var(--paper)' }}>Assessment</h4>
            <p style={{ color: 'var(--muted-d)' }}>We model your site&apos;s usage, roof and load profile to size a system and confirm a PPA stacks up.</p>
          </div>
          <div className="step" style={{ borderColor: 'var(--line-d)' }}>
            <span className="n">02</span>
            <h4 style={{ color: 'var(--paper)' }}>Funder installs &amp; owns</h4>
            <p style={{ color: 'var(--muted-d)' }}>A third-party funder pays for, installs, owns and maintains the system on your roof or land.</p>
          </div>
          <div className="step" style={{ borderColor: 'var(--line-d)' }}>
            <span className="n">03</span>
            <h4 style={{ color: 'var(--paper)' }}>You buy the power</h4>
            <p style={{ color: 'var(--muted-d)' }}>You pay only for the electricity generated, at an agreed rate typically below the grid price, for 15–25 years.</p>
          </div>
          <div className="step" style={{ borderColor: 'var(--line-d)' }}>
            <span className="n">04</span>
            <h4 style={{ color: 'var(--paper)' }}>End of term</h4>
            <p style={{ color: 'var(--muted-d)' }}>Buy the system, extend the agreement, or have it removed — the choice is yours.</p>
          </div>
        </div>
        <div className="twocol reveal" style={{ marginTop: 24 }}>
          <div className="prosebox pro" style={{ background: 'rgba(247,242,231,.05)', borderColor: 'var(--line-d)' }}>
            <h3 style={{ color: 'var(--paper)' }}><span className="d" />Where a PPA wins</h3>
            <ul style={{ color: '#E9E3D4' }}>
              <li>No capital outlay — the project sits off your cash flow</li>
              <li>The funder carries performance and maintenance risk</li>
              <li>Predictable, often cheaper energy costs from day one</li>
              <li>Progress on net-zero and ESG without tying up funds</li>
            </ul>
          </div>
          <div className="prosebox con" style={{ background: 'rgba(247,242,231,.05)', borderColor: 'var(--line-d)' }}>
            <h3 style={{ color: 'var(--paper)' }}><span className="d" />The trade-offs to weigh</h3>
            <ul style={{ color: '#E9E3D4' }}>
              <li>Lower lifetime savings than buying — the funder takes a margin</li>
              <li>A long contract, with exit terms to read carefully</li>
              <li>You don&apos;t own the asset unless you buy it</li>
              <li>Usually needs high daytime usage and a solid credit profile</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function GrantCards() {
  return (
    <section className="sec">
      <div className="wrap">
        <div className="sec-head reveal">
          <Eyebrow>Grants &amp; incentives</Eyebrow>
          <h2>Funding worth knowing about</h2>
          <p>Grants and schemes change and run in rounds, so always check the official source before you plan around them — we&apos;ll help you time an application.</p>
        </div>
        <div className="cards reveal" style={{ marginTop: 26 }}>
          <div className="card">
            <div className="ix">G/01 · Business</div>
            <h3>Net Zero Newport decarbonisation</h3>
            <span className="status ongoing">Recurring · check round</span>
            <p>Match-funded grants plus free technical support for Newport SMEs decarbonising their buildings — covering equipment, installation and commissioning of solar, battery and efficiency measures.</p>
            <div className="kv"><b>Amount</b><span>50% of costs, up to £30,000</span></div>
            <div className="kv"><b>Who</b><span>SMEs with premises in Newport City Council area</span></div>
            <div className="kv"><b>Funded by</b><span>UK Shared Prosperity Fund (£250k pot)</span></div>
            <a className="src" href="/newport-net-zero-grant">Read the full guide →</a>
          </div>
          <div className="card">
            <div className="ix">G/02 · Business</div>
            <h3>Merthyr Tydfil Business Growth Grant</h3>
            <span className="status closed">2026 round closed</span>
            <p>Local Growth Fund support for business expansion, equipment and productivity for firms based or investing in Merthyr Tydfil. Solar, battery and EV kit can qualify as equipment investment.</p>
            <div className="kv"><b>Type</b><span>Business growth / capital grant</span></div>
            <div className="kv"><b>Who</b><span>Eligible Merthyr Tydfil businesses</span></div>
            <div className="kv"><b>Status</b><span>Closed 3 July 2026 — watch for next round</span></div>
            <a className="src" href="https://ir-energy.co.uk/merthyr-tydfil-business-growth-grant-2026/" target="_blank" rel="noopener">Scheme details →</a>
          </div>
          <div className="card">
            <div className="ix">G/03 · Home</div>
            <h3>Warm Homes / Nest scheme</h3>
            <span className="status open">Open</span>
            <p>Welsh Government energy-efficiency scheme for qualifying households. Free advice and funded insulation, heating upgrades or renewable measures depending on eligibility.</p>
            <div className="kv"><b>Who</b><span>Low-income or vulnerable Welsh households</span></div>
            <div className="kv"><b>Funded by</b><span>Welsh Government</span></div>
            <a className="src" href="https://nest.gov.wales/" target="_blank" rel="noopener">Check eligibility →</a>
          </div>
          <div className="card">
            <div className="ix">G/04 · Business</div>
            <h3>UK Business Energy Advice Service</h3>
            <span className="status open">Open</span>
            <p>Free energy audits and advice for English and Welsh SMEs. Not a direct grant, but the audit report often identifies the quickest wins and helps strengthen future funding bids.</p>
            <div className="kv"><b>Who</b><span>SMEs in England &amp; Wales</span></div>
            <div className="kv"><b>Funded by</b><span>UK Government (DESNZ)</span></div>
            <a className="src" href="https://www.gov.uk/business-energy-advice-service" target="_blank" rel="noopener">Book a free audit →</a>
          </div>
        </div>
        <div className="callout reveal" style={{ marginTop: 16 }}>
          <b>Disclaimer:</b> Grant availability and criteria change. Always verify current status via the official scheme page before making investment decisions. We can help you understand timing and eligibility but do not administer any scheme.
        </div>
      </div>
    </section>
  );
}

function SectorGrid() {
  return (
    <section className="sec" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="sec-head reveal">
          <Eyebrow>By sector</Eyebrow>
          <h2>Your industry, our specialism</h2>
          <p>We design around how your building uses energy — not a one-size-fits-all template.</p>
        </div>
        <div className="secgrid reveal" style={{ marginTop: 26 }}>
          <a className="seccard" href="/warehousing">
            <div className="ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21V12h6v9" /></svg>
            </div>
            <h3>Warehousing &amp; industrial</h3>
            <p>Large flat roofs, high daytime load — ideal for solar at scale.</p>
            <span className="go">Explore →</span>
          </a>
          <a className="seccard" href="/commercial-funding">
            <div className="ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-4h6v4" /></svg>
            </div>
            <h3>Offices &amp; retail</h3>
            <p>Reduce overheads and hit ESG targets with rooftop generation.</p>
            <span className="go">Learn more →</span>
          </a>
          <a className="seccard" href="/commercial-funding">
            <div className="ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
            </div>
            <h3>Leisure &amp; hospitality</h3>
            <p>Hotels, gyms and venues with high HVAC and hot-water demand.</p>
            <span className="go">Learn more →</span>
          </a>
          <a className="seccard" href="/commercial-funding">
            <div className="ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v18" /><path d="M5 10l7-7 7 7" /><path d="M3 21h18" /></svg>
            </div>
            <h3>Agriculture</h3>
            <p>Large footprints, ground-mount potential and EV/machinery charging.</p>
            <span className="go">Learn more →</span>
          </a>
          <a className="seccard" href="/commercial-funding">
            <div className="ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
            </div>
            <h3>Education</h3>
            <p>Schools, colleges and universities cutting energy budgets.</p>
            <span className="go">Learn more →</span>
          </a>
          <a className="seccard" href="/commercial-funding">
            <div className="ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
            </div>
            <h3>Healthcare</h3>
            <p>Surgeries, care homes and clinics with 24/7 base loads.</p>
            <span className="go">Learn more →</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function GoldCtaBand() {
  return (
    <section className="sec goldband ctaband">
      <div className="wrap">
        <h2>Ready to see what solar saves your business?</h2>
        <p>Get a free, no-obligation energy assessment — or try the quick estimator to model the numbers yourself.</p>
        <div className="b">
          <a className="btn btn-solar" href="/#quote" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
            Book a free assessment <ArrowIcon />
          </a>
          <a className="btn btn-ghost" href="/solar-estimator" style={{ borderColor: 'var(--ink)' }}>
            Try the estimator
          </a>
        </div>
      </div>
    </section>
  );
}

function CommercialFooter() {
  return (
    <footer>
      <div className="wrap">
        <div className="cols">
          <div>
            <p style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: '1.3rem', color: 'var(--paper)', marginBottom: 14 }}>Heliaxis</p>
            <p style={{ maxWidth: '34ch' }}>
              MCS-certified solar, battery, heat pump, EV and LED installation for homes and businesses across South Wales.
            </p>
          </div>
          <div>
            <h4>Areas we cover</h4>
            <a href="/">Solar Panels Cardiff</a>
            <a href="/">Solar Panels Swansea</a>
            <a href="/">Solar Panels Newport</a>
            <a href="/">Solar Panels Bridgend</a>
            <a href="/">Vale of Glamorgan</a>
          </div>
          <div>
            <h4>Business</h4>
            <a href="/commercial-funding">Funding &amp; finance</a>
            <a href="/newport-net-zero-grant">Newport Net Zero grant</a>
            <a href="/warehousing">Warehousing &amp; industrial</a>
            <a href="/solar-estimator">Solar estimator</a>
          </div>
        </div>
        <div className="base">
          <span>© 2026 Heliaxis. MCS-certified · RECC · Covering South Wales.</span>
          <span className="mono">heliaxis.co.uk</span>
        </div>
      </div>
    </footer>
  );
}

export default function CommercialFundingPage() {
  return (
    <>
      <PageHero />
      <FundingRoutes />
      <PpaBand />
      <GrantCards />
      <SectorGrid />
      <FundingFaq />
      <GoldCtaBand />
      <CommercialFooter />
      <ScrollReveal />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'LocalBusiness',
            name: 'Heliaxis',
            description: 'MCS-certified installer of solar PV, battery storage, heat pumps, EV chargers and LED lighting for homes and businesses across South Wales.',
            areaServed: ['Cardiff', 'Swansea', 'Newport', 'Bridgend', 'Vale of Glamorgan', 'South Wales'],
            url: 'https://heliaxis.co.uk',
            telephone: '01633 965205',
            address: { '@type': 'PostalAddress', addressRegion: 'South Wales', addressCountry: 'GB' },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Service',
            serviceType: 'Commercial solar funding and finance',
            provider: { '@type': 'LocalBusiness', name: 'Heliaxis' },
            areaServed: 'South Wales',
            description: 'Commercial solar funding options including CapEx purchase, asset finance and Power Purchase Agreements (PPA / Solar as a Service), plus Welsh and local grant guidance.',
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              { '@type': 'Question', name: 'Do I need to own the roof to use a PPA?', acceptedAnswer: { '@type': 'Answer', text: 'Not necessarily, but you do need the right to grant a long lease or roof licence to the funder for the term of the agreement. If you rent your premises we can work with you and your landlord on a suitable arrangement, or look at finance or CapEx instead.' } },
              { '@type': 'Question', name: 'Can I combine a grant with finance or a PPA?', acceptedAnswer: { '@type': 'Answer', text: 'Often yes. A grant typically reduces the upfront project cost, and the remaining balance can be paid via CapEx or asset finance. Funders differ on whether grant-funded systems can sit inside a PPA, so we confirm this on a case-by-case basis.' } },
              { '@type': 'Question', name: 'What payback should a business expect on solar?', acceptedAnswer: { '@type': 'Answer', text: 'For a well-matched commercial system in South Wales, payback is commonly in the region of three to six years, with the panels generating for 25 years or more. Sites with high daytime electricity use and a good roof tend to pay back fastest.' } },
              { '@type': 'Question', name: 'Is the 0% VAT rate available for businesses?', acceptedAnswer: { '@type': 'Answer', text: 'The 0% VAT rate applies to residential and domestic solar installations until 31 March 2027. Commercial installations are generally standard-rated, but VAT-registered businesses can usually reclaim the VAT — we\'ll point you to your accountant to confirm your position.' } },
              { '@type': 'Question', name: 'Which funding route is cheapest overall?', acceptedAnswer: { '@type': 'Answer', text: 'Buying outright (CapEx) delivers the best lifetime savings because there\'s no third-party margin or interest. Finance and PPAs cost a little more over time, but remove the upfront barrier — so the \'best\' route depends on your cash position and priorities.' } },
            ],
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://heliaxis.co.uk' },
              { '@type': 'ListItem', position: 2, name: 'Commercial', item: 'https://heliaxis.co.uk/commercial' },
              { '@type': 'ListItem', position: 3, name: 'Funding & finance', item: 'https://heliaxis.co.uk/commercial/funding' },
            ],
          }),
        }}
      />
    </>
  );
}
