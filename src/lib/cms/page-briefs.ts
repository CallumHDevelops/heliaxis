/**
 * Heliaxis top-20 content briefs — the ready-to-run prompts behind the CMS
 * "Bulk create pages" tool. Each brief is fed (prompt + a compact requirements
 * footer + the shared brand rules) to the research-driven page generator in
 * src/lib/cms/ai-page.ts, exactly like the single AI page builder.
 *
 * Source of truth: these were authored as a content plan; keep the slug / CTA /
 * audience fields accurate because the bulk tool uses them to name the page,
 * place it at its intended URL, and flag collisions with existing routes.
 */

export interface PageBrief {
  /** Lower = build first. Mirrors the content-plan priority. */
  priority: number;
  /** Human page title (used as the CMS page name). */
  name: string;
  /** Intended published path, e.g. "/commercial-solar". */
  slug: string;
  /** Primary SEO keyword(s). */
  keywords: string;
  /** Who the page is written for. */
  audience: string;
  /** Conversion goal. */
  goal: string;
  /** Call-to-action label. */
  ctaText: string;
  /** Call-to-action link (usually "#quote"). */
  ctaLink: string;
  /** Approximate target word count. */
  words: string;
  /** The full generation brief. */
  prompt: string;
}

/** Brand writing rules shared by every brief. Appended to each generation. */
export const GLOBAL_RULES = `Write for Heliaxis, a South Wales renewable-energy installer.

The brand voice should be: plain English, technically competent, authoritative, calm, transparent, commercially aware, never pushy.

Do not: invent prices, savings, payback periods, project figures, grants, customer testimonials or product warranties; claim a technology is suitable for every property/business; use phrases such as "revolutionary", "game-changing", "skyrocket your savings", "unlock your potential" or other generic AI marketing language; repeatedly use "sustainable future", "journey", "seamless" or "cutting-edge"; keyword-stuff headings or body copy.

Where suitability, performance or return depends on the site, explain what factors determine it. Use Heliaxis's MCS, RECC, NICEIC and TrustMark credentials accurately and explain why they matter rather than simply listing logos. Prioritise useful information that demonstrates real installation knowledge. Use short paragraphs, descriptive headings and occasional bullet points. Every page should lead naturally toward a survey or assessment rather than aggressively asking for a sale. Where relevant, internally link related Heliaxis services using the URLs provided in the prompt.`;

export const PAGE_BRIEFS: PageBrief[] = [
  {
    priority: 1,
    name: 'Commercial Solar Installation South Wales',
    slug: '/commercial-solar',
    keywords: 'commercial solar installation South Wales',
    audience: 'Business owners, directors, facilities managers and estates teams',
    goal: 'Book a free commercial site survey',
    ctaText: 'Book a site survey',
    ctaLink: '#quote',
    words: '1,500–2,000',
    prompt: `Write a commercial solar page targeting **"commercial solar installation South Wales"** for business owners, directors, facilities managers and estates teams.

Primary goal: get the visitor to book a free commercial site survey.

Search intent: businesses in South Wales considering rooftop solar PV and wanting to understand suitability, savings, installation, funding and next steps.

Must cover:
- What commercial rooftop solar is and how it works
- Why businesses with significant daytime electricity consumption are often well suited to solar
- Roof types including trapezoidal metal, standing seam and flat roofs
- How we assess electricity consumption and, where available, half-hourly data
- What drives payback and ROI: energy price, consumption profile, roof space, orientation, shading, system size, self-consumption and export
- Keep all financial figures qualitative; do not invent prices, savings, payback periods or percentages
- Grid connection and DNO considerations, including G99/export limitations where relevant
- Structural and roof-condition considerations
- Commercial battery storage and peak-shaving
- Combining solar with workplace or fleet EV charging
- Monitoring and ongoing performance
- Heliaxis accreditation: MCS, RECC, NICEIC and TrustMark
- Explain what those accreditations mean in practical terms for design standards, electrical work, consumer protection, certification and applicable warranties/guarantees
- The full process: initial discussion -> electricity data review -> site survey -> design -> proposal -> DNO/permissions -> installation -> testing -> commissioning -> monitoring -> handover
- CAPEX, asset finance and solar PPA options
- Link business finance/PPA information naturally to /commercial-funding
- Include a dedicated funding section without claiming any specific grant is currently available unless supplied in the source information
- Mention that Heliaxis works across South Wales

FAQ must answer: Are grants available for commercial solar? Does commercial solar need planning permission? Will installation disrupt our business? How much maintenance does commercial solar require? Can solar be installed without a battery? Can a battery be added later? What happens to excess solar electricity? Will we need permission from the DNO?

Use the CTA naturally several times through the page without making the page feel sales-heavy. Tone: plain, authoritative, technically competent and commercially focused. No hype, no exaggerated environmental claims and no invented statistics. Use clear H1/H2/H3 structure. Write as an experienced South Wales commercial renewable-energy contractor rather than a marketing agency.`,
  },
  {
    priority: 2,
    name: 'Residential Renewable Energy South Wales',
    slug: '/residential',
    keywords: 'renewable energy installer South Wales; solar battery heat pump installer South Wales',
    audience: 'Homeowners considering solar PV, battery storage, heat pumps or EV charging',
    goal: 'Book a free home survey',
    ctaText: 'Book a home survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write the main residential renewable energy page for Heliaxis targeting **"renewable energy installer South Wales"**, **"solar battery heat pump installer South Wales"** and related homeowner searches.

Audience: homeowners considering solar PV, battery storage, heat pumps or EV charging.
Primary goal: get the homeowner to book a free home survey.

Position Heliaxis as a company that designs the whole home energy system, rather than simply selling individual products.

Core concept to communicate: Solar -> Battery -> Home -> EV -> Heat Pump -> Grid / Smart Tariff

Must cover: solar panels; home battery storage; air source heat pumps; EV charging; how the technologies can work together; the importance of designing around the home's real electricity and heating demand; existing electricity usage; roof suitability; EV ownership; heat-pump requirements; smart tariffs; exporting excess electricity; why system sizing matters; survey, design, installation, commissioning and handover; Heliaxis MCS / RECC / NICEIC / TrustMark accreditation; warranties and aftercare; funding and available support without inventing live schemes or values; link relevant funding information where appropriate.

Include sections for: Why choose renewable energy? Why combine technologies? What happens during a Heliaxis survey? Our installation process; Our accreditations; Recent projects; FAQ.

Tone: approachable, authoritative and clear. Avoid technical overload and avoid sales hype.`,
  },
  {
    priority: 3,
    name: 'Solar Panels South Wales',
    slug: '/solar-panels',
    keywords: 'solar panel installation South Wales; solar panels South Wales; solar panel installers Wales',
    audience: 'Homeowners researching whether solar PV is right for their property',
    goal: 'Book a free solar survey',
    ctaText: 'Book a solar survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a residential service page targeting **"solar panel installation South Wales"**, **"solar panels South Wales"** and **"solar panel installers Wales"**.

Audience: homeowners researching whether solar PV is right for their property.
Goal: get the visitor to book a free solar survey.

Must cover: how solar PV works; why solar can still perform well in the Welsh climate; roof orientation; south-facing versus east/west arrays; shading; roof pitch; usable roof area; slate, tile, metal and flat-roof considerations; on-roof versus in-roof solar; panel and inverter basics; how system size is determined; self-consumption versus export; Smart Export Guarantee at a high level; solar with battery storage; solar with EV charging; solar with heat pumps; DNO notification/application at an appropriate homeowner level; MCS certification; installation process; monitoring; warranties; maintenance.

Do not invent panel prices, annual savings, generation figures, payback periods or percentages. Explain that these depend on the individual property and consumption profile.

FAQ: planning permission, cloudy weather, power cuts, roof suitability, lifespan, maintenance and whether a battery is necessary.

Plain, authoritative tone. Make it technically credible but understandable to a homeowner.`,
  },
  {
    priority: 4,
    name: 'Solar Panels and Battery Storage',
    slug: '/solar-and-battery',
    keywords: 'solar panels and battery storage South Wales',
    audience: 'Homeowners considering installing solar PV and a battery together',
    goal: 'Book a free home survey',
    ctaText: 'Book a home energy survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a residential landing page targeting **"solar panels and battery storage South Wales"** and related searches.

Audience: homeowners considering installing solar PV and a battery together.
Primary goal: book a free home survey.

Explain clearly how a combined system operates: Daytime solar -> immediate household demand -> battery charging -> export of remaining excess. Later demand -> battery -> grid when required.

Must cover: why combining solar and battery storage can increase use of electricity generated at home; how batteries help shift solar generation into evenings/night-time use; battery charging from cheap-rate electricity where suitable; smart electricity tariffs; export tariffs; battery sizing; solar array sizing; household consumption; EV charging; heat pumps; AC versus DC coupling at a simple level; monitoring; backup/EPS as a separate feature that must be specifically designed; MCS and electrical standards; installation process; warranties and aftercare.

Avoid claiming every property needs a battery. Do not invent costs, savings or payback periods.

FAQ: Is solar worth having without a battery? What size battery do I need? Can the battery charge from the grid? Can it power my house in a blackout? Can I add more batteries later? What happens when the battery is full?

Tone: informative, practical and non-salesy.`,
  },
  {
    priority: 5,
    name: 'Home Battery Storage',
    slug: '/battery-storage',
    keywords: 'home battery storage South Wales; solar battery installer South Wales',
    audience: 'Homeowners with or without existing solar PV',
    goal: 'Generate battery-storage survey enquiries',
    ctaText: 'Book a battery survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a service page targeting **"home battery storage South Wales"**, **"solar battery installer South Wales"** and related searches.

Audience: homeowners with or without existing solar PV.
Goal: generate battery-storage survey enquiries.

Must cover: what a home battery does; storing excess solar; charging from the grid; time-of-use tariffs; using stored electricity during expensive periods; battery capacity versus usable capacity; power rating versus storage capacity; AC-coupled and DC-coupled systems; battery placement and safe installation; monitoring; adding batteries to an existing home; solar-compatible and battery-only systems; EVs and heat pumps; EPS/backup versus ordinary battery operation; MCS battery-storage installation standards; Heliaxis MCS / RECC / NICEIC / TrustMark credentials; warranty considerations.

Do not make blanket claims that batteries always save money. Explain that economics depend on electricity usage, solar generation, tariffs and system design.

FAQ: lifespan, location, safety, warranties, battery without solar, power cuts and battery expansion.`,
  },
  {
    priority: 6,
    name: 'Add a Battery to Existing Solar',
    slug: '/add-battery-to-existing-solar',
    keywords: 'add battery to existing solar panels; retrofit solar battery South Wales',
    audience: 'Homeowners who already have solar PV',
    goal: 'Book a technical survey to assess battery compatibility',
    ctaText: 'Book a battery survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write an SEO landing page targeting **"add battery to existing solar panels"**, **"retrofit solar battery South Wales"** and similar searches.

Audience: homeowners who already have solar PV.
Goal: get them to book a technical survey to assess battery compatibility.

Must cover: yes, batteries can often be added to existing solar installations; why the existing inverter, array, meter and electrical installation need assessment; AC-coupled battery systems; DC-coupled options where inverter replacement or system redesign is appropriate; existing MCS documentation; older solar systems; Feed-in Tariff considerations without giving legal/financial advice; smart meters; export arrangements; battery sizing from household consumption; overnight grid charging; EVs; heat pumps; backup capability; what Heliaxis checks during a retrofit survey; installation and commissioning; monitoring; warranties.

Include a section titled "Do I need to replace my existing solar inverter?" Answer: not always; it depends on the proposed battery architecture and compatibility.

Do not invent financial savings or payback.`,
  },
  {
    priority: 7,
    name: 'Battery Backup / Power Cuts',
    slug: '/battery-backup',
    keywords: 'home battery backup South Wales; solar battery power cut backup',
    audience: 'Homeowners interested in backup power and resilience',
    goal: 'Request a backup/resilience survey',
    ctaText: 'Book a backup power survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a residential page targeting **"home battery backup South Wales"**, **"solar battery power cut backup"** and similar searches.

Goal: get homeowners interested in backup/resilience to request a survey.

Clearly explain an important point: a standard grid-connected solar and battery installation does not automatically mean the house will remain powered during a grid outage. Backup functionality needs to be specifically designed into the system.

Must cover: why ordinary grid-connected inverters shut down during power cuts; anti-islanding safety; EPS / backup output; essential-load backup; whole-property backup where technically appropriate; battery power versus battery capacity; high-load appliances; inverter limitations; solar charging during prolonged outages where supported by the chosen equipment/system design; changeover equipment; electrical design; earthing/protection considerations at a high level; why a site survey is necessary; how Heliaxis designs backup requirements around what the customer actually needs powered.

Do not promise uninterrupted power under all circumstances. Include an FAQ.

Tone: technically accurate, reassuring and non-alarmist.`,
  },
  {
    priority: 8,
    name: 'Air Source Heat Pumps South Wales',
    slug: '/air-source-heat-pumps',
    keywords: 'air source heat pump installer South Wales; heat pump installation South Wales',
    audience: 'Homeowners considering replacing gas, oil, LPG or direct electric heating',
    goal: 'Book a heat-pump survey',
    ctaText: 'Book a heat pump survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a residential service page targeting **"air source heat pump installer South Wales"** and **"heat pump installation South Wales"**.

Audience: homeowners considering replacing gas, oil, LPG or direct electric heating.
Primary goal: book a heat-pump survey.

Must cover: how an air source heat pump works; why heat pumps operate differently from boilers; room-by-room heat-loss calculations; design outdoor temperature; flow temperature; radiator and emitter sizing; underfloor heating; hot-water cylinder requirements; weather compensation; controls; electrical supply considerations; noise and outdoor unit placement; insulation and building fabric; existing radiators; solar PV and heat pumps; battery storage and heat pumps; tariffs; MCS design/installation; Boiler Upgrade Scheme/funding in general terms without inventing current figures unless provided; survey -> design -> quotation -> installation -> commissioning -> handover; warranties and aftercare.

Avoid simplistic claims such as "a heat pump will cut everyone's bills". Explain that performance depends on correct design and property characteristics.

FAQ: old houses, radiators, hot water, cold weather, running costs, grants and installation duration.`,
  },
  {
    priority: 9,
    name: 'Home EV Charging',
    slug: '/ev-chargers',
    keywords: 'home EV charger installation South Wales',
    audience: 'EV owners and homeowners planning to buy an electric vehicle',
    goal: 'Request an EV charger survey or quote',
    ctaText: 'Book an EV charger survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a residential page targeting **"home EV charger installation South Wales"**.

Audience: EV owners and homeowners planning to buy an electric vehicle.
Goal: get the visitor to request an EV charger survey/quote.

Must cover: benefits of charging at home; typical home charging concept without inventing charging times; smart charging; off-peak tariffs; solar-compatible EV charging; using surplus solar to charge an EV; battery storage and EV charging; load management; CT monitoring; electrical supply assessment; existing consumer unit; earthing/protection; cable routes; charger location; app connectivity; tethered versus untethered chargers; DNO notification where relevant; installation, testing and commissioning; NICEIC electrical competence; warranty and aftercare.

FAQ: Can I charge from solar? Do I need three phase? Can a charger be installed away from the house? Will I need a consumer-unit upgrade? What size charger do I need? Can two EV chargers share one supply?

Do not invent grant availability.`,
  },
  {
    priority: 10,
    name: 'Whole Home Energy',
    slug: '/whole-home-energy',
    keywords: 'whole home energy systems; solar battery heat pump EV',
    audience: 'Homeowners interested in integrated solar, battery, heat pump and EV systems',
    goal: 'Book a whole-home energy survey',
    ctaText: 'Book a home energy survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a flagship Heliaxis page targeting homeowners interested in **whole home energy systems**, solar, battery storage, heat pumps and EV charging. This is primarily a brand and conversion page, not a narrow product page.

Core message: Heliaxis designs the home as one connected energy system.

Show conceptually: Solar PV -> Home electricity demand -> Battery storage -> EV charging -> Heat pump -> Smart tariff / grid.

Must cover: why designing technologies together is better than selecting equipment independently; electricity consumption profiling; solar generation; battery charge/discharge strategy; EV demand; heating demand; hot water; import/export tariffs; smart controls; future-proofing; electrical capacity; backup requirements; monitoring; phased installations, e.g. solar today and battery/EV/heat pump later; survey and whole-home design; MCS / RECC / NICEIC / TrustMark; warranties and aftercare.

Use examples conceptually but do not invent financial performance.

Tone: intelligent and sophisticated but still understandable to a homeowner.`,
  },
  {
    priority: 11,
    name: 'Commercial Renewable Energy South Wales',
    slug: '/commercial',
    keywords: 'commercial renewable energy South Wales',
    audience: 'Business owners, managing directors, finance directors, facilities managers, estates teams and property managers',
    goal: 'Book a free commercial site survey',
    ctaText: 'Book a site survey',
    ctaLink: '#quote',
    words: '1,500–2,000',
    prompt: `Write the main commercial landing page targeting **"commercial renewable energy South Wales"**.

Audience: business owners, managing directors, finance directors, facilities managers, estates teams and property managers.
Primary goal: generate free commercial site-survey enquiries.

Present Heliaxis as a commercial energy contractor capable of designing integrated systems rather than selling individual technologies.

Services to cover: commercial solar PV; commercial battery storage/BESS; workplace and fleet EV charging; commercial heat pumps; energy monitoring; solar O&M; finance/PPA; relevant funding support.

Must explain: reducing imported electricity; improving long-term energy-cost visibility; matching generation to site consumption; half-hourly electricity data; roof/site assessment; DNO/grid considerations; infrastructure capacity; site phasing; monitoring; asset performance; CAPEX versus financed options.

Include sector examples: warehouses, manufacturing, agriculture, care, education, hospitality, public sector and commercial property.

Include Heliaxis MCS / RECC / NICEIC / TrustMark accreditation. Also link naturally to /commercial-funding. No invented savings, prices or carbon figures.`,
  },
  {
    priority: 12,
    name: 'Commercial Battery Storage / BESS',
    slug: '/commercial-battery-storage',
    keywords: 'commercial battery storage South Wales; commercial BESS South Wales',
    audience: 'Business owners, finance directors, facilities managers and energy managers',
    goal: 'Generate commercial battery feasibility/site-survey enquiries',
    ctaText: 'Book a battery feasibility survey',
    ctaLink: '#quote',
    words: '1,500–2,000',
    prompt: `Write a commercial page targeting **"commercial battery storage South Wales"**, **"commercial BESS South Wales"** and related searches.

Audience: business owners, finance directors, facilities managers and energy managers.
Goal: generate commercial battery feasibility/site-survey enquiries.

Do not describe a commercial battery simply as somewhere to store excess solar.

Must cover: peak shaving; load shifting; time-of-use tariff optimisation; increasing solar self-consumption; charging during lower-cost periods; supporting large EV charging loads; managing maximum site demand; potential grid-capacity constraints; export management; resilience/backup where specifically designed; battery capacity versus discharge power; site load profile; half-hourly data; metering; existing solar integration; new solar + BESS; electrical infrastructure; DNO considerations; fire/safety considerations at a suitable non-specialist level; monitoring and controls; warranty and lifecycle considerations.

Explain that commercial BESS suitability must be modelled against real consumption data. Do not invent ROI or revenue claims.

Include: "Is battery storage right for my business?", survey/design process, finance options, FAQ. Link finance to /commercial-funding.`,
  },
  {
    priority: 13,
    name: 'Commercial EV Charging',
    slug: '/commercial-ev-charging',
    keywords: 'commercial EV charging installation South Wales; workplace EV charging South Wales',
    audience: 'Businesses, fleet operators, landlords, property managers and facilities managers',
    goal: 'Book a commercial EV charging survey',
    ctaText: 'Book an EV charging survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a page targeting **"commercial EV charging installation South Wales"** and **"workplace EV charging South Wales"**.

Audience: businesses, fleet operators, landlords, property managers and facilities managers.
Goal: book a commercial EV charging survey.

Must cover: workplace charging; fleet/depot charging; staff charging; visitor/customer charging; shared-car-park charging; AC versus DC charging at a high level; existing electrical capacity; three-phase supplies; load management; dynamic load balancing; phased deployment; solar PV integration; battery storage integration; charging from on-site renewable energy; back-office/payment functionality where applicable; cable routes and civils; DNO upgrades where required; future expansion; monitoring; installation and commissioning.

Explain why charger quantity and kW rating should be designed around: vehicle dwell time, fleet mileage, arrival/departure patterns, available power and future fleet plans.

Include an FAQ. Do not invent grant availability.`,
  },
  {
    priority: 14,
    name: 'Commercial Solar O&M',
    slug: '/solar-operation-maintenance',
    keywords: 'commercial solar maintenance South Wales; solar PV O&M South Wales; commercial solar repair South Wales',
    audience: 'Businesses and property owners with existing solar arrays, including systems installed by another contractor',
    goal: 'Generate O&M, fault-finding and system-takeover enquiries',
    ctaText: 'Arrange a solar system assessment',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a commercial page targeting **"commercial solar maintenance South Wales"**, **"solar PV O&M South Wales"** and **"commercial solar repair South Wales"**.

Audience: businesses and property owners with existing solar arrays, including systems installed by another contractor.
Primary goal: generate O&M, fault-finding and system-takeover enquiries.

Must cover: why commercial PV should be monitored and maintained; performance monitoring; fault investigation; inverter faults; DC and AC electrical inspections; visual array inspection; roof/mounting inspection; thermal imaging where appropriate; testing and diagnostics; monitoring communication faults; panel damage; vegetation management on applicable systems; cleaning only where inspection/performance data indicates it is justified; reporting; planned maintenance; reactive call-outs; system takeover; legacy systems; failed/orphaned installer situations; repowering; inverter replacement; adding batteries; expanding existing arrays.

Include a section: "We didn't install your system — can Heliaxis maintain it?" Answer yes, subject to assessment. Explain the benefit of establishing a performance baseline.

Mention NICEIC/MCS technical competence appropriately without implying MCS certification of historic third-party workmanship.`,
  },
  {
    priority: 15,
    name: 'Commercial Funding & Finance',
    slug: '/commercial-funding',
    keywords: 'commercial solar finance South Wales; business solar funding Wales',
    audience: 'Business owners, FDs and decision-makers comparing ways to fund the project',
    goal: 'Generate enquiries for financially viable commercial renewable-energy projects',
    ctaText: 'Discuss funding your project',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a commercial renewable-energy funding and finance page targeting **"commercial solar finance South Wales"**, **"business solar funding Wales"** and related searches.

Audience: business owners, FDs and decision-makers interested in renewable energy but comparing ways to fund the project.
Goal: generate enquiries for financially viable commercial renewable-energy projects.

Must cover the main routes: Capital purchase / CAPEX; Asset finance; Solar PPA; Grant funding where available; Potential blended approaches. Explain each in plain language.

For each route discuss: who pays upfront; who owns the equipment; cash-flow implications; maintenance responsibility; contract considerations; suitability for owner-occupiers versus tenants where relevant.

Include a strong warning: do not state that a particular grant is available unless confirmed from current source information.

Explain that Heliaxis can help businesses understand the technical information needed to support funding applications, such as: system scope, estimated generation, consumption matching, technical proposal, project cost, carbon/energy outputs where appropriate.

Link to /solar-ppa for detailed PPA information. No invented interest rates, grant amounts or savings.`,
  },
  {
    priority: 16,
    name: 'Solar PPA',
    slug: '/solar-ppa',
    keywords: 'solar PPA South Wales; commercial solar PPA Wales; solar panels with no upfront capital business',
    audience: 'Businesses with suitable premises and significant electricity use that want commercial solar without purchasing the system outright',
    goal: 'Request a PPA feasibility assessment',
    ctaText: 'Request a PPA assessment',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a commercial landing page targeting **"solar PPA South Wales"**, **"commercial solar PPA Wales"** and **"solar panels with no upfront capital business"**.

Audience: businesses with suitable premises and significant electricity use that want commercial solar without purchasing the system outright.
Goal: encourage businesses to request a PPA feasibility assessment.

Explain a Power Purchase Agreement simply: a third party funds/owns the solar system; the host business uses the electricity generated and pays for it under an agreed contract; commercial and legal structure varies by project.

Must cover: how a solar PPA works; who owns the equipment; who maintains it; PPA term; electricity-price structure; indexation; roof/site rights; landlord and tenant considerations; metering; performance; insurance; end-of-term arrangements; buyout options where available; credit assessment; site suitability; electricity consumption; why high on-site solar use matters; PPA versus outright purchase; PPA versus asset finance.

Do not invent PPA rates, savings percentages or contract terms. Link to /commercial-funding. Include FAQ.

Tone: financial and factual rather than promotional.`,
  },
  {
    priority: 17,
    name: 'Solar for Warehouses & Distribution',
    slug: '/warehousing',
    keywords: 'solar panels for warehouses South Wales; warehouse solar installation Wales',
    audience: 'Warehouse owners, logistics businesses, distribution centres, facilities managers and commercial landlords',
    goal: 'Book a commercial site survey',
    ctaText: 'Book a warehouse solar survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a sector landing page targeting **"solar panels for warehouses South Wales"**, **"warehouse solar installation Wales"** and related searches.

Audience: warehouse owners, logistics businesses, distribution centres, facilities managers and commercial landlords.
Goal: book a commercial site survey.

Explain why warehouses can be well suited to solar: large roof areas; daytime baseloads; lighting; conveyor systems; HVAC; refrigeration where applicable; automation; office loads; EV/fleet charging.

Must cover: trapezoidal metal roofs; standing seam roofs; flat roofs; roof condition; structural assessment; roof warranties; skylights; fire/access zones; system layout; half-hourly consumption analysis; DNO; export limitation; commercial battery storage; peak shaving; fleet EV charging; installation around business operations; planned shutdowns where needed; monitoring; O&M; finance/PPA.

Include a case-study placeholder structure but do not invent a customer/project. Link finance to /commercial-funding.`,
  },
  {
    priority: 18,
    name: 'Solar for Manufacturing',
    slug: '/manufacturing',
    keywords: 'solar panels for manufacturing South Wales; factory solar panels Wales',
    audience: 'Manufacturing directors, operations managers, engineering managers, facilities managers and FDs',
    goal: 'Book a commercial energy/site survey',
    ctaText: 'Book a manufacturing site survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a sector page targeting **"solar panels for manufacturing South Wales"**, **"factory solar panels Wales"** and related commercial searches.

Audience: manufacturing directors, operations managers, engineering managers, facilities managers and FDs.
Primary goal: book a commercial energy/site survey.

Core angle: manufacturing businesses often use significant electricity while solar is generating.

Discuss loads such as: CNC machinery; compressors; extraction; pumps; production lines; refrigeration; HVAC; process equipment; offices; EV/fleet charging.

Must cover: electricity load profiling; half-hourly data; maximum demand; system sizing; roof and structural surveys; electrical infrastructure; DNO applications; solar self-consumption; battery peak shaving; load shifting; EV integration; avoiding unnecessary operational disruption; RAMS and site coordination; commissioning; monitoring; O&M; CAPEX / finance / PPA.

Do not claim solar can power an entire factory unless site-specific analysis supports it. Use commercially competent language.`,
  },
  {
    priority: 19,
    name: 'Solar for Farms & Agriculture',
    slug: '/agriculture',
    keywords: 'solar panels for farms Wales; agricultural solar South Wales',
    audience: 'Farmers, agricultural businesses, estates and rural enterprises',
    goal: 'Generate site-survey enquiries',
    ctaText: 'Book a farm energy survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a commercial/agricultural renewable-energy page targeting **"solar panels for farms Wales"**, **"agricultural solar South Wales"** and related searches.

Audience: farmers, agricultural businesses, estates and rural enterprises.
Goal: generate site-survey enquiries.

Discuss agricultural electricity loads such as: dairy/milking; refrigeration; ventilation; poultry systems; pumps; irrigation; grain handling/drying where applicable; workshops; farm offices; EV/equipment charging.

Must cover: barn and agricultural building roofs; roof condition; asbestos considerations without giving specialist asbestos advice; structural assessment; ground-mounted solar where appropriate; three-phase supplies; long cable runs; site electrical infrastructure; DNO; export limits; matching solar to farm consumption; battery storage; backup/resilience where technically designed; remote monitoring; O&M; finance; PPA; grant/funding opportunities where available.

Do not state that a current agricultural grant is available unless verified information is supplied.

FAQ: planning, ground mounts, roofs, maintenance and battery storage.`,
  },
  {
    priority: 20,
    name: 'Renewable Energy for Care Homes',
    slug: '/care-homes',
    keywords: 'solar panels for care homes South Wales; renewable energy for care homes Wales',
    audience: 'Care-home owners, operators, estates managers, finance directors and facilities managers',
    goal: 'Book a commercial site survey',
    ctaText: 'Book a care home energy survey',
    ctaLink: '#quote',
    words: '1,300–1,700',
    prompt: `Write a sector landing page targeting **"solar panels for care homes South Wales"**, **"renewable energy for care homes Wales"** and related searches.

Audience: care-home owners, operators, estates managers, finance directors and facilities managers.
Goal: book a commercial site survey.

Explain why care facilities have distinctive energy demands: 24/7 occupancy; hot water; heating; kitchens; laundry; lighting; ventilation; medical/assistive equipment where applicable; EV charging.

Must cover: commercial solar PV; battery storage; peak shaving; solar self-consumption; heat pumps where appropriate; hot-water demand; EV charging; electricity load analysis; reliability and resilience; backup systems only where specifically designed; installation phasing around residents and staff; noise and disruption management; health and safety; DNO/grid requirements; monitoring; O&M; finance/PPA; funding where available.

Emphasise that occupied care environments require careful programme planning and communication. Do not make unsupported claims about savings or carbon reduction.

FAQ: Can installation happen while the home remains open? Can solar work with a heat pump? Is battery storage worthwhile? Does commercial solar require planning? What maintenance is needed? What finance options are available?

Link finance to /commercial-funding.`,
  },
];
