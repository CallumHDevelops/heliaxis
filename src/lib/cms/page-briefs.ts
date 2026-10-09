/**
 * Heliaxis top-20 content briefs — the ready-to-run prompts behind the CMS
 * "Bulk create pages" tool. Each brief's prompt is fed (plus a compact
 * requirements footer) to the research-driven page generator in
 * src/lib/cms/ai-page.ts, exactly like the single AI page builder.
 *
 * The prompts are optimised FOR that generator: they name the page's angle,
 * keywords and audience, map the "Must cover" substance onto the generator's
 * real block types (hero/grid/steps/funding/split/media/faq/cta), list the
 * exact FAQ questions, and restate the page-specific guardrails.
 *
 * Keep the slug / CTA / audience fields accurate — the bulk tool uses them to
 * name the page, place it at its intended URL, and flag route collisions.
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
  /** The full generation brief, optimised for the AI page builder. */
  prompt: string;
}

/** Brand writing rules shared by every brief (the generator's SYSTEM prompt
 *  also enforces these; kept here for reference and the briefs API). */
export const GLOBAL_RULES = `Write for Heliaxis, a South Wales renewable-energy installer.

The brand voice should be: plain English, technically competent, authoritative, calm, transparent, commercially aware, never pushy.

Do not: invent prices, savings, payback periods, project figures, grants, customer testimonials or product warranties; claim a technology is suitable for every property/business; use phrases such as "revolutionary", "game-changing", "skyrocket your savings", "unlock your potential" or other generic AI marketing language; repeatedly use "sustainable future", "journey", "seamless" or "cutting-edge"; keyword-stuff headings or body copy.

Where suitability, performance or return depends on the site, explain what factors determine it. Use Heliaxis's MCS, RECC, NICEIC and TrustMark credentials accurately and explain why they matter rather than simply listing logos. Prioritise useful information that demonstrates real installation knowledge. Use short paragraphs, descriptive headings and occasional bullet points. Every page should lead naturally toward a survey or assessment rather than aggressively asking for a sale. Where relevant, internally link related Heliaxis services using the URLs provided in the prompt.`;

export const PAGE_BRIEFS: PageBrief[] = [
  {
    priority: 1,
    name: "Commercial Solar Installation South Wales",
    slug: "/commercial-solar",
    keywords: "commercial solar installation South Wales",
    audience: "Business owners, directors, facilities managers and estates teams",
    goal: "Book a free commercial site survey",
    ctaText: "Book a site survey",
    ctaLink: "#quote",
    words: "1,500–2,000",
    prompt: `POSITIONING: The South Wales commercial PV contractor that turns a business's daytime electricity use into on-site generation, survey-led and MCS-certified.

KEYWORDS & INTENT: Primary: commercial solar installation South Wales. Secondary: commercial solar PV, business solar panels, commercial battery storage. Intent: a business weighing rooftop solar - suitability, savings, install, funding, next step. Audience: owners, directors, facilities and estates teams prioritising cost control, minimal disruption, reliability and warranties.

SECTION PLAN:
1. hero - H1 (keyword) + direct answer: what commercial rooftop solar is, how it works, why it suits South Wales businesses; CTA.
2. grid(4) - how PV works on your roof; why high daytime consumption suits solar; self-consumption vs export; premises that suit.
3. explorer - roof types: trapezoidal metal, standing seam, flat/membrane; plus structural and roof-condition checks.
4. grid(4) - payback/ROI drivers, qualitative only: energy price & consumption profile; roof space, orientation & shading; system size; self-consumption vs export.
5. media - assessing consumption: bills and, where available, half-hourly data to size the system.
6. funding(3) -> /commercial-funding: CAPEX; asset finance; solar PPA; no grant claimed unless supplied.
7. grid(4) - battery storage & peak-shaving; workplace/fleet EV charging; monitoring & performance; grid connection & DNO (G99).
8. steps(8) - initial discussion & data review -> site survey -> design -> proposal -> DNO/permissions -> installation -> testing & commissioning -> monitoring & handover.
9. grid(4) - accreditations in practice: MCS (design/install standards & certification), RECC (consumer protection), NICEIC (electrical safety), TrustMark (govt-endorsed quality & warranties).
10. faq - questions below.
11. cta - closing "Book a site survey"; note Heliaxis works across South Wales.

FAQ (keep all, verbatim): Are grants available for commercial solar? Does commercial solar need planning permission? Will installation disrupt our business? How much maintenance does commercial solar require? Can solar be installed without a battery? Can a battery be added later? What happens to excess solar electricity? Will we need permission from the DNO?

CTA & LINKS: label "Book a site survey" -> #quote, used in hero, mid-page and closing. Internal link: /commercial-funding.

GUARDRAILS: Qualitative only - never invent prices, savings, payback, percentages or grants. Accreditations as a grid explaining each; no testimonials/pricing/case-study blocks. Don't claim solar powers an entire site; frame as offsetting daytime demand. Backup/resilience must be specifically designed, not assumed from a battery. Flag roof condition and asbestos as needing specialist advice. Export may be subject to DNO G99 limits.`,
  },
  {
    priority: 2,
    name: "Residential Renewable Energy South Wales",
    slug: "/residential",
    keywords: "renewable energy installer South Wales; solar battery heat pump installer South Wales",
    audience: "Homeowners considering solar PV, battery storage, heat pumps or EV charging",
    goal: "Book a free home survey",
    ctaText: "Book a home survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `POSITIONING: Heliaxis designs one joined-up home energy system for South Wales homeowners - solar, battery, heat pump and EV charging sized to how your home uses power, not a list of separate products.

KEYWORDS & INTENT: Primary "renewable energy installer South Wales" in H1/intro. Secondary: "solar battery heat pump installer South Wales", "solar panel installer South Wales", "air source heat pump installer South Wales". Intent: homeowners shortlisting a trusted local installer. Priorities: bill impact, suitability, low disruption, reliable kit, warranties/aftercare, clear next step.

SECTION PLAN (ordered; no two dark adjacent):
1. hero (dark): H1 with primary keyword; one-line positioning; "Book a home survey" to #quote.
2. grid (4): solar PV, home battery, air source heat pump, EV charging - homeowner outcomes, not definitions.
3. explorer (dark): "Why combine technologies" - Solar -> Battery -> Home -> EV -> Heat Pump -> Grid/Smart Tariff; power flow, self-use, smart-tariff charging, exporting excess.
4. split (2, balanced): electricity picture (usage, roof suitability, EV ownership, export) vs heating picture (heat-pump requirements, heat demand) - why sizing to real demand matters.
5. steps (6): survey, design, install, commission, handover, aftercare; survey checks usage, roof, EV, heat-pump suitability.
6. grid (4): accreditations MCS, RECC, NICEIC, TrustMark - what each means: quality, consumer protection, electrical safety, standards.
7. media (blank): "Recent projects" placeholder - qualitative local installs only, no figures.
8. faq: all questions below.
9. cta (dark): "Book a home survey" to #quote.

FAQ (answer all, keep order):
- Which renewable technologies can Heliaxis install?
- Is my roof suitable for solar panels?
- Do I need a home battery, and what does it do?
- Is an air source heat pump right for my home?
- How do smart tariffs and exporting excess electricity work?
- Why does system sizing matter?
- What happens during a free home survey?
- What warranties, aftercare and funding or support are available?

CTA & LINKS: "Book a home survey" to #quote; reuse in hero, mid-page, closing cta. Only #quote is a confirmed internal link - do not invent URLs; link funding only to a genuine Heliaxis page, else describe support on-page.

GUARDRAILS: Qualitative only - no invented savings, prices, percentages, grants, payback or project counts. Accreditations as a 4-card grid explaining each, never a stat row. No testimonials. "Recent projects" is a placeholder: blank image, non-numeric. Describe funding generally; never name live schemes. Never claim solar alone powers the whole home - value is the designed, sized system; back-up/off-grid must be specifically designed. Stay on South Wales homeowners; no commercial drift.`,
  },
  {
    priority: 3,
    name: "Solar Panels South Wales",
    slug: "/solar-panels",
    keywords: "solar panel installation South Wales; solar panels South Wales; solar panel installers Wales",
    audience: "Homeowners researching whether solar PV is right for their property",
    goal: "Book a free solar survey",
    ctaText: "Book a solar survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `Build the residential page "Solar panel installation South Wales" for homeowners deciding whether solar PV suits their home.

POSITIONING: A plain, authoritative guide that turns "will solar work on my roof in our weather?" into a booked, no-obligation survey with a local MCS-certified installer.

KEYWORDS & INTENT: Primary: solar panel installation South Wales. Secondary: solar panels South Wales; solar panel installers Wales; home solar PV. Intent: homeowner researching suitability before committing; keyword in H1 and intro. Priorities: real performance (not hype), roof suitability, disruption/process, kit quality, warranties/aftercare, a low-risk next step.

SECTION PLAN (in order; no two dark sections adjacent):
1. hero (dark): H1 with keyword; GEO direct-answer lead — what home solar does, that it suits many Welsh roofs, and that it starts with a free survey. CTA.
2. grid: How solar PV works + Welsh-climate performance — generates from daylight not heat; works under UK cloud; quiet, low-maintenance. Outcome-led, no figures.
3. explorer (dark): Is your roof suitable? — clickable roof types slate, tile, metal, flat; plus on-roof vs in-roof mounting.
4. media: Orientation, pitch, shading & usable area — south-facing vs east/west arrays, shading, pitch, available roof area; image blank.
5. split: Self-consumption vs export — using power as generated vs sending surplus to the grid under the Smart Export Guarantee (high level, no rates).
6. grid: Kit & sizing — panels, inverter basics, matching system size to property and consumption, monitoring.
7. steps: Survey to switch-on — survey, design, DNO notification/application (homeowner level), MCS install, commissioning, handover, monitoring.
8. grid: Accreditations — 4 cards on what MCS, RECC, NICEIC and TrustMark each mean in practice.
9. grid: Complete home energy system — add battery storage, EV charging, heat pump (3 cards).
10. faq.
11. cta (dark).

FAQ (keep all): Do I need planning permission? Do solar panels work in cloudy weather? Will solar keep my power on in a power cut? Is my roof suitable for solar? How long do solar panels last? What maintenance do panels need? Do I need a battery with solar?

CTA & LINKS: Button "Book a solar survey" -> #quote; reuse in hero, mid-page and closing cta. Use only real Heliaxis internal links; link battery/EV/heat-pump mentions to their pages only if those exist.

GUARDRAILS: Qualitative only — never invent prices, savings, generation, payback or percentages; say these depend on the property and consumption. Accreditations stay a grid explaining each, not a stats brag. No testimonials block. Power cuts: grid-tied solar shuts off; backup needs a specifically designed battery/islanding setup. Don't claim solar covers all a home's electricity. Keep warranty/lifespan claims qualitative.`,
  },
  {
    priority: 4,
    name: "Solar Panels and Battery Storage",
    slug: "/solar-and-battery",
    keywords: "solar panels and battery storage South Wales",
    audience: "Homeowners considering installing solar PV and a battery together",
    goal: "Book a free home survey",
    ctaText: "Book a home energy survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `POSITIONING: For South Wales homeowners, pairing solar with a battery means using far more of the power your roof makes - running evenings and nights on stored sunshine, not the grid. Goal: a free home survey.

KEYWORDS & INTENT: Primary "solar panels and battery storage South Wales". Secondary: home solar and battery South Wales; solar battery storage for homes; solar self-consumption; smart export tariff. Intent: research/commercial - weighing solar + battery together. Priorities: more self-use of own generation, less grid reliance, right sizing, warranties/aftercare, next step. Lead with outcomes, not definitions.

SECTION PLAN (no two dark sections adjacent):
1. hero (dark) - positioning line + CTA.
2. rich - how it works across a day (GEO direct answer): daytime solar meets demand first, surplus charges the battery, excess is exported; evening/night the battery powers the home, drawing grid only when needed; overnight cheap-rate charging where suitable.
3. grid (4) - why pair them: use more of your own generation; shift solar into evening/night use; charge from cheap-rate/smart tariffs where it pays; ready for EV charging and heat pumps.
4. split - AC vs DC coupling, simply: define both, which suits new vs existing solar.
5. grid (3) - sized around your home: array sizing to the roof; battery sizing to real consumption and habits; usage shapes the design - not every home needs one.
6. media (blank image) - control: smart import and export tariffs; app monitoring of generation, use, battery level.
7. explorer (dark) - add later: EV charger, heat pump, backup/EPS, extra battery. Backup/EPS is separate and must be specifically designed in.
8. grid (4) - accreditations: MCS (certified install, unlocks export tariffs), RECC (consumer protection), NICEIC (electrical standards, BS 7671), TrustMark (endorsed quality).
9. steps - survey, design, install, commission, handover, warranties & aftercare.
10. faq - questions below.
11. cta (dark) - book a free home energy survey.

FAQ (keep all, verbatim):
- Is solar worth having without a battery?
- What size battery do I need?
- Can the battery charge from the grid?
- Can it power my house in a blackout?
- Can I add more batteries later?
- What happens when the battery is full?

CTA & LINKS: label "Book a home survey" -> #quote, reused in hero and cta. Links: only #quote; link EV charging and heat pump mentions to Heliaxis service pages if they exist.

GUARDRAILS: Qualitative only - invent no costs, savings, payback, percentages, grants or tariff rates. Never claim every property needs a battery, or that solar powers the whole home round the clock. Backup/EPS is optional and must be specifically designed; a standard battery does not keep lights on in a blackout. No testimonials, no invented project figures.`,
  },
  {
    priority: 5,
    name: "Home Battery Storage",
    slug: "/battery-storage",
    keywords: "home battery storage South Wales; solar battery installer South Wales",
    audience: "Homeowners with or without existing solar PV",
    goal: "Generate battery-storage survey enquiries",
    ctaText: "Book a battery survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `Build the Heliaxis Home Battery Storage page for South Wales homeowners.

POSITIONING: Store your solar or cheap off-peak power and run the house on it when grid electricity is dearest — a home battery sized around your real usage, by a four-way-accredited South Wales installer.

KEYWORDS & INTENT: Primary "home battery storage South Wales". Secondary "solar battery installer South Wales", "battery storage without solar", "AC vs DC coupled battery". Intent: commercial research, comparing systems and installers pre-survey. Audience: homeowners with OR without existing solar PV; priorities = real payback for THEIR usage, install disruption, safe placement, backup in cuts, warranty, future EV/heat-pump expansion.

SECTION PLAN (keep order; no two dark sections adjacent):
1. hero — H1 with primary keyword; positioning line; "Book a battery survey".
2. grid (4) — how it works: store excess solar; charge from grid on cheap off-peak/time-of-use tariffs; discharge at expensive peak times; live app monitoring.
3. split — AC vs DC coupled: define BOTH (retrofit onto existing solar or standalone vs most efficient with new solar) and when each suits.
4. rich — sizing honestly: total vs usable capacity; power rating (kW) vs storage (kWh); savings depend on usage, solar, tariff and design, never a blanket "batteries save money"; readiness for EV charging and heat pumps later.
5. steps (5-7) — survey → design & sizing → safe placement + install to MCS battery-storage standards → commissioning → monitoring → handover.
6. explorer (dark, 5) — options: add battery to existing solar; solar + battery together; battery-only (no solar); pair with EV/heat pump; EPS backup for power cuts.
7. grid (4) — accreditations MCS, RECC, NICEIC, TrustMark; each explains what it means for a battery install.
8. faq — questions below.
9. cta (dark) — "Book a battery survey" → #quote.

FAQ (keep all):
- How long does a home battery last?
- Where is the battery installed in my home?
- Are home batteries safe?
- What warranties come with a home battery?
- Can I have a battery without solar panels?
- Will my battery keep the lights on in a power cut?
- Can I add more battery capacity later?

CTA & LINKS: "Book a battery survey" → #quote, in hero and closing cta. Real internal links only: #quote, #faq, /add-battery-to-existing-solar, /solar-and-battery, /battery-backup.

GUARDRAILS: Qualitative only — no invented capacities, kWh, prices, %, payback or warranty terms. Never claim batteries always save money; economics depend on usage, solar, tariffs and design. EPS/backup is NOT automatic — must be specifically designed and sized, and won't run the house indefinitely. Accreditations in an explainer grid. No testimonials or pricing.`,
  },
  {
    priority: 6,
    name: "Add a Battery to Existing Solar",
    slug: "/add-battery-to-existing-solar",
    keywords: "add battery to existing solar panels; retrofit solar battery South Wales",
    audience: "Homeowners who already have solar PV",
    goal: "Book a technical survey to assess battery compatibility",
    ctaText: "Book a battery survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `Build "Add a Battery to Existing Solar" at /add-battery-to-existing-solar for Heliaxis (South Wales).

POSITIONING: Already have solar? In most cases we can add a battery so the daytime power you now export is stored for evenings, EV charging and heat-pump use - after a survey of your array, inverter, meter and consumer unit.

KEYWORDS & INTENT: Primary "add battery to existing solar panels". Secondary "retrofit solar battery South Wales", "AC-coupled battery retrofit", "battery for existing solar system". Intent: a PV owner judging if a retrofit is feasible and worth a survey. Audience: homeowners with working solar wanting more self-use and resilience; they care about kit compatibility, whether the inverter must change, disruption, warranties, monitoring and the next step.

SECTION PLAN (ordered; no two dark blocks adjacent; balance cards):
1 hero - H1 keyword; yes, batteries can usually be retrofitted; book a survey.
2 grid (4) - how retrofit works: AC-coupled battery beside the existing inverter; DC-coupled where inverter replacement/redesign suits; what gets reused; what the survey confirms.
3 split - AC-coupled retrofit (keep inverter, add battery inverter) vs DC-coupled/hybrid (replace/redesign around a hybrid inverter) - when each suits.
4 rich - "Do I need to replace my existing solar inverter?" Not always; depends on battery architecture and compatibility with the current inverter and array; older systems and existing MCS docs are reviewed.
5 steps (5-7) - survey to handover: assess array/inverter/meter/consumer unit and electrics, check smart meter and export arrangement, size battery from consumption, design, install, commission, monitor.
6 grid (4) - more from stored power: overnight off-peak charging, EV charging, heat-pump running, backup (specifically designed in).
7 faq - below.
8 cta - closing band.
Fold in: Feed-in Tariff (factual only, no advice), warranties.

FAQ (keep all):
- Can I add a battery to my existing solar panels?
- Why do my existing inverter, array, meter and electrical installation need assessing first?
- What is an AC-coupled battery system?
- When is a DC-coupled option or inverter replacement the right choice?
- Does adding a battery affect my Feed-in Tariff or export arrangement?
- Can the battery charge overnight and power an EV or heat pump?
- Will I have backup power in a cut?
- What does Heliaxis check during a retrofit survey?

CTA & LINKS: "Book a battery survey" -> #quote, in hero and closing cta. Real internal links only: #quote, /battery-storage, /solar-and-battery, /battery-backup.

GUARDRAILS: Qualitative only - no savings, payback, prices or percentages. Don't claim every system can take a battery; feasibility follows the survey. Backup must be specifically designed in. Feed-in Tariff/export points factual, not advice. No testimonials block.`,
  },
  {
    priority: 7,
    name: "Battery Backup / Power Cuts",
    slug: "/battery-backup",
    keywords: "home battery backup South Wales; solar battery power cut backup",
    audience: "Homeowners interested in backup power and resilience",
    goal: "Request a backup/resilience survey",
    ctaText: "Book a backup power survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `POSITIONING: For South Wales homeowners who want the fridge, heating and lights to stay on when the grid fails — and the truth that backup only works if designed in.

KEYWORDS & INTENT: Primary: home battery backup South Wales. Secondary: solar battery power cut backup; EPS backup power; essential-load backup. Intent: resilience research, weighing a survey. Priorities: will it work in an outage, what stays on, reliability, safety, next step.

SECTION PLAN (no two dark adjacent):
1. hero (dark) — H1 with primary keyword; lead: a standard grid-tied solar+battery system shuts down in a power cut — backup is designed in, not automatic.
2. grid (4) — Why systems go dark: inverters shut off in outages; anti-islanding protects network engineers; EPS/backup output; inverter output capped whatever the capacity.
3. explorer (dark) — "What do you need to keep running?": fridge/freezer, heating & hot-water controls, lights & sockets, broadband, medical equipment, whole home.
4. split (2) — Essential-load backup (chosen circuits, smaller, longer runtime) vs Whole-property backup (all circuits where technically appropriate; needs more power, capacity, design).
5. rich — Sizing: battery power (kW, runs at once) vs capacity (kWh, how long); high-load appliances (ovens, showers, heat pumps) can exceed backup output; solar can recharge in long outages where equipment/design supports it; changeover gear, electrical design, earthing/protection to standards.
6. steps (5–7) — survey & load assessment (why it is essential), design around priority circuits, equipment choice, install, commission/test backup, handover.
7. faq.
8. cta (dark band).

FAQ (keep all):
- Does a standard solar and battery system keep my home powered in a power cut?
- Why does my solar inverter switch off during a grid outage?
- Can I back up my whole house or only essential circuits?
- What is the difference between battery power and battery capacity?
- Will my solar panels recharge the battery during a long power cut?
- Can backup run high-load appliances like an oven or heat pump?
- Why do I need a site survey before you can design backup?
- Can you guarantee the power never goes off?

CTA & LINKS: Label "Book a backup survey" -> #quote; reuse in hero, after split, closing band. Page at /battery-backup; real Heliaxis paths only.

GUARDRAILS: Never promise uninterrupted or guaranteed power — backup keeps selected loads running for a period, subject to design/conditions. A normal grid-tied install does NOT auto-backup; it must be specifically designed in. Qualitative only — no invented kWh/kW, runtimes, prices, % or grants. Earthing/protection and electrical design at a high level only, confirmed by survey. Tone: accurate, reassuring, non-alarmist. Accreditations only as a grid; no testimonials.`,
  },
  {
    priority: 8,
    name: "Air Source Heat Pumps South Wales",
    slug: "/air-source-heat-pumps",
    keywords: "air source heat pump installer South Wales; heat pump installation South Wales",
    audience: "Homeowners considering replacing gas, oil, LPG or direct electric heating",
    goal: "Book a heat-pump survey",
    ctaText: "Book a heat pump survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `POSITIONING: An MCS-certified South Wales installer who makes heat pumps work by getting the design right for YOUR home - heat-loss, flow temperature, emitters - not a blanket promise to slash everyone's bills.

KEYWORDS & INTENT: Primary "air source heat pump installer South Wales". Secondary: "heat pump installation South Wales", "MCS heat pump survey", "replace gas/oil/LPG boiler". Intent: homeowners choosing an installer, ready to book a survey. Audience: replacing gas, oil, LPG or direct-electric heating; priorities = warmth, cost vs current fuel, disruption, noise, warranties, grants.

SECTION PLAN (keep order; no two dark sections adjacent):
1. hero (dark) - H1 with primary keyword; lead with a warm, well-designed home, less reliance on gas/oil.
2. grid (4) - how an ASHP works vs a boiler: heat from outside air even in winter; low steady flow temps, running longer not hotter; performance follows design and property, not a guaranteed bill cut.
3. rich - getting the design right: room-by-room heat-loss, design outdoor temperature, flow temperature, radiator/emitter sizing, weather compensation, controls.
4. steps (6) - survey -> design -> quotation -> installation -> commissioning -> handover; heat-loss/property checks in survey, MCS design in design; handover covers MCS cert, warranties/aftercare, Boiler Upgrade Scheme eligibility via MCS (general, no figures).
5. grid (4) - will it suit your home: existing radiators and upsizing emitters; underfloor heating; hot-water cylinder; insulation and fabric.
6. explorer (dark) - siting the outdoor unit: 3-5 options affecting noise, clearances, pipe runs, electrical supply.
7. split - go further: "Pair with solar PV" vs "Add battery storage and a smart tariff"; define both (daytime self-use vs cheap-rate charging).
8. grid (4) - accreditations: MCS, RECC, NICEIC, TrustMark - what each means in practice.
9. faq - questions below.
10. cta (dark) - book a survey.

FAQ (keep all, near-verbatim):
- Can a heat pump work in an old house?
- Will I need to change my radiators?
- Can a heat pump heat my hot water?
- Do heat pumps work in cold weather?
- What will it cost to run compared with my current heating?
- What grants are available?
- How long does installation take?

CTA & LINKS: Label "Book a heat pump survey" -> #quote (hero and closing cta). Real internal links only: /solar-panels (pair with solar PV), /battery-storage (add battery + smart tariff), /whole-home-energy (heating, solar, battery, EV together), jump to #faq. No invented paths.

GUARDRAILS: Qualitative only - no invented COP, prices, savings %, grant amounts or run costs; savings depend on design, property and tariff, never "cuts everyone's bills". No testimonials/pricing block. Hot water via a cylinder, not combi. Don't claim it suits any home unchanged; fabric/emitters may need work. Boiler Upgrade Scheme general, no amounts unless given.`,
  },
  {
    priority: 9,
    name: "Home EV Charging",
    slug: "/ev-chargers",
    keywords: "home EV charger installation South Wales",
    audience: "EV owners and homeowners planning to buy an electric vehicle",
    goal: "Request an EV charger survey or quote",
    ctaText: "Book an EV charger survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `Build the page "Home EV Charging" at /ev-chargers for Heliaxis, a South Wales installer.

POSITIONING: Wake to a full battery on your drive — a surveyed, smart home charger fitted by NICEIC-certified electricians, running on cheap off-peak power or your own surplus solar.

KEYWORDS & INTENT: Primary "home EV charger installation South Wales"; secondary "smart EV charger", "solar EV charging", "tethered vs untethered charger", "EV charger survey". Intent: a homeowner who owns or is about to buy an EV, ready to book a survey. Priorities: overnight charging, off-peak cost, safe install on the existing supply, low disruption, accountability, clear next step.

SECTION PLAN (keep order; no two dark sections adjacent):
1 hero (dark): H1 keyword; direct-answer intro on charging at home overnight. Explain the concept without inventing charge times or speeds.
2 grid (3-4): benefits of home charging — convenience vs public, overnight off-peak cost, control, adds to the property. Figures qualitative.
3 split: Tethered vs Untethered. Define BOTH — tethered = captive cable, grab-and-go; untethered = socketed, bring your own cable, tidier. Give the trade-off, not a winner.
4 steps (6-8): survey → supply assessment (consumer unit, earthing & protection, load check) → design (charger location, cable routes) → DNO notification where relevant → installation → testing, commissioning & app setup → handover with warranty & aftercare.
5 grid (4): smart features — smart charging, off-peak tariff scheduling, app connectivity, load management with CT-clamp monitoring to protect the main fuse.
6 explorer (dark): "Power your charge" — grid off-peak, surplus solar diversion, home battery, all balanced by load management. Frame solar/battery as supplementing, not fully powering, charging.
7 grid (4): accreditations — MCS, RECC, NICEIC, TrustMark; each card explains what it means here (NICEIC = proven electrical competence).
8 faq
9 cta (dark): book the survey.

FAQ (use all, verbatim): Can I charge from solar? Do I need three phase? Can a charger be installed away from the house? Will I need a consumer-unit upgrade? What size charger do I need? Can two EV chargers share one supply?

CTA & LINKS: Button "Book EV survey" → #quote at hero, after steps and closing cta. Internal links only to real paths: /solar-panels, /battery-storage.

GUARDRAILS: Figures qualitative — never invent charge times, kW speeds, tariff rates, prices or warranty lengths. Do NOT claim any grant is available. No testimonials block. Accreditations as the grid above. Present solar/battery as reducing grid charging, not powering the car outright. Describe load management/CT monitoring and consumer-unit/earthing work functionally; the survey confirms what each home needs. Images left blank.`,
  },
  {
    priority: 10,
    name: "Whole Home Energy",
    slug: "/whole-home-energy",
    keywords: "whole home energy systems; solar battery heat pump EV",
    audience: "Homeowners interested in integrated solar, battery, heat pump and EV systems",
    goal: "Book a whole-home energy survey",
    ctaText: "Book a home energy survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `POSITIONING: Show South Wales homeowners one designed energy system - solar, battery, EV charging and a heat pump working as one - not four separate products.

KEYWORDS & INTENT: Primary: whole home energy systems. Secondary: integrated solar battery heat pump EV; whole-home energy design; home energy survey. Intent: research/consideration. Audience: homeowners planning integrated/phased upgrades; priorities are how the parts work together, disruption, electrical capacity, reliability, cheaper/greener running, upgrade path, warranties.

SECTION PLAN (hero/explorer/cta dark, rest light; no two dark adjacent):
1. hero: H1 with keyword; the home as one connected system, solar through to smart tariff; outcome-led.
2. grid: why designing together beats buying kit independently - consumption profiling matched to solar generation; battery charge/discharge strategy; capacity headroom with backup designed in; future-proofing. Icons chart, battery, bolt.
3. explorer: system layers - Solar PV (generation), Battery (charge/discharge), EV charging (demand), Heat pump (heating demand), Hot water, Smart tariff/grid (import/export, smart controls).
4. split: "Designed as one system" vs "Technologies chosen separately" - define both (shared sizing, spare capacity, one app, upgrade path vs clashing kit, wasted export).
5. steps: home energy survey & consumption profiling; whole-home design; phased or full install (solar now, battery/EV/heat pump later); commissioning; monitoring & aftercare.
6. grid: accreditations - MCS, RECC, NICEIC, TrustMark - what each means in practice. Icons shield, award, check.
7. media (once): monitoring - live visibility of generation, storage and use; image blank.
8. rich (one only): phasing and future-proofing - solar first, add battery/EV/heat pump later; warranties and aftercare.
9. faq.
10. cta: book the survey.

FAQ (ask all):
- Why design solar, battery, heat pump and EV charging together instead of buying them separately?
- Can I start with solar now and add battery, EV charging or a heat pump later?
- How do you decide the right size for each part of my system?
- Will my home's electrical capacity cope with a heat pump and EV charging?
- Do I get backup power during a power cut?
- How do smart tariffs and controls use import and export?
- What accreditations and warranties does Heliaxis provide?
- How do I monitor how the system is performing?

CTA & LINKS: Button "Book a Home Survey" -> #quote; reuse in hero, mid-page, cta. Real Heliaxis links only; invent none.

GUARDRAILS: Qualitative only - no invented savings, percentages, kWh, payback or figures. Accreditations as an explaining grid; no testimonials, pricing, case-study, gallery. Never claim solar powers the whole home - generation offsets demand. Backup specifically designed, not assumed.`,
  },
  {
    priority: 11,
    name: "Commercial Renewable Energy South Wales",
    slug: "/commercial",
    keywords: "commercial renewable energy South Wales",
    audience: "Business owners, managing directors, finance directors, facilities managers, estates teams and property managers",
    goal: "Book a free commercial site survey",
    ctaText: "Book a site survey",
    ctaLink: "#quote",
    words: "1,500–2,000",
    prompt: `POSITIONING: One South Wales contractor engineering integrated solar, storage, EV and heat-pump systems around your site's real demand — to cut imported electricity and keep costs predictable, not to sell separate kit.

KEYWORDS & INTENT: Primary: commercial renewable energy South Wales. Secondary: commercial solar PV, battery/BESS, workplace & fleet EV charging, heat pumps. Intent: vetting a contractor, booking a survey. Audience: owners, MDs, finance/facilities/estates/property managers. Priorities: lower imported electricity, cost visibility, minimal disruption, warranties, clear next step.

SECTION PLAN (order; no two dark adjacent):
1. hero (dark) — H1 with keyword; GEO answer: Heliaxis designs & installs integrated commercial renewable systems across South Wales to cut imported electricity and improve cost visibility.
2. grid — Integrated systems (4): solar PV; battery/BESS; EV charging (workplace & fleet); heat pumps. Icons solar,battery,ev,heatpump.
3. split — CAPEX vs financed/PPA: buy outright (own asset, upfront capital) vs finance/PPA (spread cost, pay from savings). Detail → /commercial-funding.
4. steps (5-7) — survey → analyse half-hourly data & demand → roof/site assessment + DNO/grid & capacity check → design matching generation to consumption, phased to limit disruption → install & commission → monitoring, solar O&M & asset performance.
5. explorer (dark) — Sectors (6): warehousing & logistics; manufacturing; agriculture; care & education; hospitality & retail; public sector & commercial property.
6. grid — Accreditations (4, explain each in practice): MCS, RECC, NICEIC, TrustMark. Icons shield,award,check,star.
7. funding — 3 cards (CAPEX, asset finance/PPA, funding support) → /commercial-funding.
8. faq.
9. cta (dark) — Book a site survey → #quote.

FAQ (keep all):
- How do you size a system to match our actual consumption?
- How do you use our half-hourly electricity data?
- Will grid connection, DNO capacity or infrastructure limit what we install?
- Can work be phased to avoid disrupting operations?
- How do you assess our roof or site before design?
- CAPEX vs financed/PPA — what's the difference?
- What ongoing monitoring and O&M do you provide?
- Which accreditations do you hold and what do they mean?

CTA & LINKS: "Book a site survey" → #quote (hero, funding, cta). Real internal link: /commercial-funding. This page: /commercial.

GUARDRAILS: Qualitative only — no invented savings, prices, payback or carbon figures. Accreditations as a grid explaining each, not logos. No testimonials block. Frame solar as cutting imported electricity and matching on-site demand — never claim it powers a whole site or eliminates bills. Battery backup only as specifically designed. Balance split cards.`,
  },
  {
    priority: 12,
    name: "Commercial Battery Storage / BESS",
    slug: "/commercial-battery-storage",
    keywords: "commercial battery storage South Wales; commercial BESS South Wales",
    audience: "Business owners, finance directors, facilities managers and energy managers",
    goal: "Generate commercial battery feasibility/site-survey enquiries",
    ctaText: "Book a battery feasibility survey",
    ctaLink: "#quote",
    words: "1,500–2,000",
    prompt: `POSITIONING: Show South Wales businesses how a commercial battery cuts peak demand charges and shifts load against their own half-hourly consumption — not a box for spare solar.

KEYWORDS & INTENT: Primary: commercial battery storage South Wales. Secondary: commercial BESS South Wales; peak shaving; load shifting; time-of-use tariff optimisation. Intent: commercial feasibility research — does BESS stack up here. Audience: business owners, finance directors, facilities and energy managers. Priorities: demand/energy cost drivers, reliability, site disruption, warranties, DNO/grid risk, a clear route to a survey.

SECTION PLAN:
- hero (dark): H1 with primary keyword; direct-answer intro — what a commercial battery does for a South Wales site, modelled on real data.
- grid: four value drivers — peak shaving, load shifting, time-of-use tariff optimisation, managing maximum site demand.
- explorer (dark): "Which applies to your site?" clickable uses — solar self-consumption, charging in lower-cost periods, supporting large EV charging loads, export management, resilience/backup where specifically designed.
- split: battery capacity (kWh, how much energy) vs discharge power (kW, how fast); define both and why each is sized to the load profile.
- steps: feasibility & design — gather half-hourly data + metering, model the load profile, assess electrical infrastructure, DNO and grid-capacity constraints, design (integrate existing solar or add new solar + BESS), install & commission, monitoring handover.
- grid: fire/safety at a non-specialist level, monitoring and controls, warranty and lifecycle.
- funding: three finance routes (CAPEX, asset finance, grants) to /commercial-funding.
- grid: accreditations — MCS, RECC, NICEIC, TrustMark, each explained in practice.
- faq
- cta (dark): book the survey.

FAQ:
- Is battery storage right for my business?
- How do you size the battery for our site?
- Do you need our half-hourly data to assess feasibility?
- Can a battery work with our existing solar, or should we add solar too?
- Will it keep us running during a power cut?
- What are the fire and safety considerations?
- Are there DNO or grid-capacity issues?
- What warranty and lifespan should we expect?

CTA & LINKS: Label "Book a feasibility survey" to #quote (use in hero, after steps, and closing cta). Internal link: finance to /commercial-funding.

GUARDRAILS: Qualitative only — no invented ROI, payback, revenue, prices, percentages or grant figures; state suitability must be modelled against real half-hourly data. Don't frame the battery as just storing excess solar. Resilience/backup only where specifically designed. Fire/safety at a non-specialist level. Accreditations as a grid explaining each; no testimonials, pricing or case-study blocks.`,
  },
  {
    priority: 13,
    name: "Commercial EV Charging",
    slug: "/commercial-ev-charging",
    keywords: "commercial EV charging installation South Wales; workplace EV charging South Wales",
    audience: "Businesses, fleet operators, landlords, property managers and facilities managers",
    goal: "Book a commercial EV charging survey",
    ctaText: "Book an EV charging survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `Build the Heliaxis "Commercial EV Charging" page.

POSITIONING: Charge points sized around how your vehicles use the site - dwell time, mileage and available power - designed, DNO-managed and installed for South Wales businesses by one MCS/NICEIC team.

KEYWORDS & INTENT: Primary "commercial EV charging installation South Wales"; secondary "workplace EV charging South Wales", "fleet depot charging", "dynamic load balancing". Intent: scoping a project and choosing an installer. Audience: businesses, fleet operators, landlords, property and facilities managers. Priorities: will our supply cope, cost/disruption of civils and DNO works, uptime, billing drivers back, future expansion.

SECTION PLAN:
1. hero (dark): H1 with primary keyword; GEO direct-answer intro naming workplace, fleet/depot, staff, visitor/customer and shared-car-park charging in South Wales.
2. grid (4): scenarios - workplace & staff; fleet/depot; visitor/customer; shared/landlord car parks.
3. split: AC vs DC at a HIGH LEVEL - define both for commercial sites (AC for long dwell/overnight; DC rapid for quick turnaround).
4. explorer (dark) "How we size your installation": clickable factors driving charger count and kW - dwell time, fleet mileage, arrival/departure patterns, available power, future fleet plans.
5. grid (4): power & capacity - existing electrical capacity; three-phase supplies; load management; dynamic load balancing.
6. media (image blank): on-site renewables - solar PV, battery storage and charging from on-site renewable energy to offset grid draw.
7. rich (brief): back-office, payment and monitoring where applicable - billing staff/visitors/public, usage reporting, uptime alerts.
8. steps (6-8): survey, design, DNO upgrades/civils & cable routes, install, commission, handover, monitoring; cover phased rollout and future expansion.
9. faq.
10. cta (dark).

FAQ (answer all):
- How many charge points does my business need?
- What is the difference between AC and DC charging for a commercial site?
- Will our existing supply cope, or do we need a DNO upgrade?
- What is dynamic load balancing and why does it matter?
- Can we charge vehicles from our own solar or battery storage?
- Can we start small and expand later?
- Can we bill staff, visitors or the public for charging?
- How long does installation and commissioning take?

CTA & LINKS: "Book an EV charging survey" -> #quote; use in hero, after steps and the closing cta.

GUARDRAILS: Qualitative only - never invent kW ratings, prices, uptime %, project counts or grants (do not claim grants exist). Keep AC vs DC high-level. Frame on-site renewables as offsetting grid draw, not powering all charging. Back-office/payment "where applicable"; DNO upgrade "where required". Accreditations as a grid explaining MCS/RECC/NICEIC/TrustMark; no testimonials, pricing or project-number blocks.`,
  },
  {
    priority: 14,
    name: "Commercial Solar O&M",
    slug: "/solar-operation-maintenance",
    keywords: "commercial solar maintenance South Wales; solar PV O&M South Wales; commercial solar repair South Wales",
    audience: "Businesses and property owners with existing solar arrays, including systems installed by another contractor",
    goal: "Generate O&M, fault-finding and system-takeover enquiries",
    ctaText: "Arrange a solar system assessment",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `POSITIONING: Keep your commercial solar array safe, compliant and generating well - whoever installed it - with assessment-led O&M, repair and full system takeover across South Wales.

KEYWORDS & INTENT: Primary "commercial solar maintenance South Wales"; secondary "solar PV O&M South Wales", "commercial solar repair South Wales", "system takeover". Intent: owners of an existing, underperforming or orphaned array wanting a maintainer or fault fix. Priorities: lost yield from hidden faults, safety, warranties, minimal disruption.

SECTION PLAN (no two dark adjacent):
1. hero (dark): H1 with primary keyword; we monitor, maintain and repair commercial PV, any installer.
2. grid (4): why monitor & maintain - hidden faults lose yield; electrical safety & compliance; protect warranties; catch problems early.
3. steps (6): baseline assessment > inspection & testing > fault diagnosis > written report > planned schedule or remedial works > ongoing monitoring.
4. explorer (dark, 5): scope - performance monitoring & comms faults; fault investigation, diagnostics & inverter faults; DC & AC inspection & testing; visual array/roof/mounting & thermal checks, panel damage; vegetation & cleaning where data justifies.
5. split: Planned maintenance (inspections, monitoring, reporting) vs Reactive call-outs (outages, inverter/system faults).
6. rich: "We didn't install your system - can Heliaxis maintain it?" Yes, subject to assessment; covers legacy and failed/orphaned-installer systems; set a baseline so output is measurable.
7. grid (4): upgrades & repowering - inverter replacement; repower ageing arrays; add batteries; expand arrays.
8. grid (4): accreditations - MCS, RECC, NICEIC, TrustMark - what each proves.
9. faq.
10. cta (dark): assessment invite.

FAQ (keep all):
- Can you maintain a system another company installed?
- What does commercial solar O&M include?
- How often should a commercial array be inspected?
- Do you offer reactive call-outs and planned maintenance?
- When is panel cleaning worth paying for?
- Can you replace an old inverter, add batteries or expand our array?
- What if our original installer has gone out of business?
- Do you use thermal imaging to find faults?

CTA & LINKS: "Arrange an assessment" > #quote (hero, mid-page, cta). Links: #quote only; no other paths.

GUARDRAILS: Qualitative only - no invented yields, savings, prices, grants, warranties or figures. Accreditations grid explains each; cite NICEIC/MCS competence of our own work but DO NOT imply MCS certification of third-party workmanship or that we retro-certify a third-party install. No testimonials/pricing. Takeover always "subject to assessment"; never promise results on others' work. Clean only where data justifies it. Flag asbestos/structural concerns for specialist advice.`,
  },
  {
    priority: 15,
    name: "Commercial Funding & Finance",
    slug: "/commercial-funding",
    keywords: "commercial solar finance South Wales; business solar funding Wales",
    audience: "Business owners, FDs and decision-makers comparing ways to fund the project",
    goal: "Generate enquiries for financially viable commercial renewable-energy projects",
    ctaText: "Discuss funding your project",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `Build the Heliaxis commercial renewable-energy funding & finance page.

ANGLE: For South Wales business owners and FDs weighing a solar, battery or heat-pump project, lay the funding routes side by side so a viable scheme is built around cash flow, ownership and risk, not just capital.

KEYWORDS & INTENT: Primary "commercial solar finance South Wales". Secondary "business solar funding Wales", "commercial solar PPA", "asset finance for solar". Intent: commercial, comparison-stage, evaluating how to pay. Audience: owners, FDs, directors. Priorities: capital vs preserving cash, asset ownership, cash-flow impact, maintenance liability, contract term and exit, owner-occupier vs tenant.

SECTION PLAN (keep order; no two dark blocks adjacent):
1. hero (dark): H1 with primary keyword; one-line direct answer naming the routes (CAPEX, asset finance, PPA, grants, blended).
2. split: CAPEX vs Solar PPA. Left CAPEX = pay upfront, you own it, keep all generation value, you hold warranties/maintenance. Right PPA = no capital, third party owns and maintains, you buy units at an agreed rate, contract term matters; link to /solar-ppa.
3. explorer (dark): "Explore the funding routes", 5 options - CAPEX, Asset finance, Solar PPA, Grant funding, Blended. For EACH: who pays upfront, who owns the kit, cash-flow, maintenance responsibility, contract considerations, owner-occupier vs tenant suitability.
4. grid (4 cards): technical evidence Heliaxis prepares for a funding application - system scope; estimated generation & consumption matching; technical proposal & project cost; carbon/energy outputs where appropriate.
5. steps (5-7): getting funding-ready - survey, design, technical proposal, funding support, install, commission, handover.
6. grid (4 cards): accreditations - MCS, RECC, NICEIC, TrustMark, each explaining what it means in practice for a funded project.
7. faq.
8. cta (dark): closing band.

FAQ (answer all):
- What are the main ways to fund a commercial solar project?
- What's the difference between buying outright (CAPEX) and a solar PPA?
- With asset finance, who owns and maintains the system?
- Are grants available for commercial renewables in Wales?
- Can tenants fund solar, or does it suit owner-occupiers better?
- Can funding routes be blended?
- What technical information do you provide for a funding application?

CTA & LINKS: Button "Discuss funding your project" -> #quote (in hero and closing cta). Real internal link: /solar-ppa.

GUARDRAILS: Qualitative only - no invented interest rates, grant amounts, savings or percentages. Do NOT state any specific grant is available unless confirmed from current source; describe grants in general, conditional terms. Accreditations as a grid explaining each; no testimonials, prices or project figures.`,
  },
  {
    priority: 16,
    name: "Solar PPA",
    slug: "/solar-ppa",
    keywords: "solar PPA South Wales; commercial solar PPA Wales; solar panels with no upfront capital business",
    audience: "Businesses with suitable premises and significant electricity use that want commercial solar without purchasing the system outright",
    goal: "Request a PPA feasibility assessment",
    ctaText: "Request a PPA assessment",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `POSITIONING: Commercial solar on your South Wales premises with no upfront capital - a funder owns and maintains the system; you buy only the power it generates, under contract.

KEYWORDS & INTENT: Primary: solar PPA South Wales. Secondary: commercial solar PPA Wales; solar panels with no upfront capital business; power purchase agreement solar. Intent: comparison of funding routes for rooftop/ground solar. Audience: businesses with suitable premises and high electricity use wanting solar without ownership. Priorities: capital preservation, price certainty, contract length and exit, maintenance/performance/insurance risk, landlord/tenant rights, next step.

SECTION PLAN (no two dark adjacent):
1. hero (dark): H1 with primary keyword; no-upfront-capital angle; PPA-assessment button.
2. grid (4 cards): how a PPA works - a third party funds and owns the system; your business uses the power generated; you pay per unit under an agreed contract; the funder maintains and monitors it.
3. steps (6-7): site suitability and roof/ground survey; consumption review and credit assessment; design and feasibility; contract; metering and install; commissioning and performance monitoring; end-of-term options.
4. rich: what a PPA contract typically covers - term; electricity-price structure and indexation; roof/site rights; landlord/tenant considerations; metering; performance; insurance; end-of-term arrangements; buyout options where available.
5. grid (4 cards): is your site suitable? - high on-site daytime consumption (why on-site use matters); suitable roof or land with secured rights; long-term occupancy/lease; creditworthy business.
6. funding (3 cards -> /commercial-funding): PPA vs outright purchase vs asset finance - define each by ownership, capital, balance-sheet and risk.
7. faq.
8. cta (dark): Request a PPA assessment -> #quote.

FAQ (ask all):
- How does a solar PPA work?
- Who owns and who maintains the system?
- How long is a PPA term and what happens at the end?
- How is the electricity price set and how does indexation work?
- Can we buy the system during or at the end?
- What makes a site suitable, and why does high on-site use matter?
- How does a PPA compare with outright purchase or asset finance?
- What do landlords and tenants need to consider?

CTA & LINKS: Button "Request a PPA assessment" -> #quote; used in hero and cta. Internal link: /commercial-funding.

GUARDRAILS: Financial, factual, not promotional. Do not invent PPA rates, savings or contract terms - describe qualitatively; say structure varies by project. Present buyout as "where available," not guaranteed. Do not claim solar powers the whole site; value depends on on-site use. No testimonials or pricing blocks. Accreditations, if shown, as a grid explaining MCS/RECC/NICEIC/TrustMark.`,
  },
  {
    priority: 17,
    name: "Solar for Warehouses & Distribution",
    slug: "/warehousing",
    keywords: "solar panels for warehouses South Wales; warehouse solar installation Wales",
    audience: "Warehouse owners, logistics businesses, distribution centres, facilities managers and commercial landlords",
    goal: "Book a commercial site survey",
    ctaText: "Book a warehouse solar survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `POSITIONING: Turn a warehouse's biggest unused asset - acres of roof - into on-site generation that covers the daytime baseload of South Wales logistics sites.

KEYWORDS & INTENT: Primary: solar panels for warehouses South Wales. Secondary: warehouse solar installation Wales; commercial solar for distribution centres; warehouse rooftop PV. Intent: commercial, toward a site survey. Audience: warehouse owners, logistics firms, distribution centres, facilities managers, commercial landlords. Priorities: cutting daytime costs, roof/structural risk, zero disruption, warranties, DNO/export limits, a clear next step.

SECTION PLAN (ordered; no two dark adjacent):
- hero (dark): H1 with primary keyword; angle on large roofs + daytime loads; primary CTA.
- grid (4): why warehouses suit solar - large roof areas; daytime baseload from lighting, conveyors, automation, HVAC, refrigeration where applicable, office loads; matching generation to demand; headroom for EV/fleet charging.
- explorer (dark, 3-4): roof types - trapezoidal metal, standing seam, flat; fold in roof condition, structural assessment, warranties, skylights, fire/access zones.
- steps (6-8): half-hourly consumption analysis > survey > structural assessment > layout and design > DNO and export limitation > install around operations, shutdowns only where needed > commissioning and handover > monitoring + O&M.
- split: TWO cards - "Battery storage and peak shaving" vs "Fleet and EV charging" - both for a warehouse load profile.
- grid (4): accreditations - MCS, RECC, NICEIC, TrustMark, each with what it means in practice.
- funding (3): CAPEX purchase / asset finance / PPA, linking to /commercial-funding.
- casestudy: PLACEHOLDER only - no invented customer, site or numbers.
- faq
- cta (dark): closing band driving survey booking.

FAQ (keep all):
- Is my warehouse roof suitable for solar?
- Can you install on trapezoidal, standing seam and flat roofs?
- Will you assess the roof structure and protect our roof warranties?
- How much of our daytime energy could solar realistically cover?
- Do we need a DNO application, and what is export limitation?
- Will installation disrupt day-to-day warehouse operations?
- Should we add battery storage, peak shaving or EV charging?
- How is a commercial warehouse system funded?

CTA & LINKS: label "Book a warehouse solar survey" > #quote (use 2-3x). Internal link: /commercial-funding.

GUARDRAILS: Qualitative only - never invent kWp, savings %, payback, grants or prices. Accreditations as a grid explaining each; no testimonials. Case study stays a placeholder. Do not claim solar powers the whole site; frame as offsetting daytime load, sized to measured consumption. Battery backup must be specifically designed. Flag asbestos or ageing roofs for specialist survey.`,
  },
  {
    priority: 18,
    name: "Solar for Manufacturing",
    slug: "/manufacturing",
    keywords: "solar panels for manufacturing South Wales; factory solar panels Wales",
    audience: "Manufacturing directors, operations managers, engineering managers, facilities managers and FDs",
    goal: "Book a commercial energy/site survey",
    ctaText: "Book a manufacturing site survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `Build the sector page "Solar panels for manufacturing in South Wales".

POSITIONING: South Wales manufacturers draw heavy loads in daytime, when a factory-roof array generates most — show directors, ops/facilities managers and FDs how rooftop solar plus storage offsets CNC, compressors and process plant, then book a site survey.

KEYWORDS & INTENT: Primary "solar panels for manufacturing South Wales". Secondary "factory solar panels Wales", commercial solar South Wales, industrial battery storage. Intent: B2B feasibility/ROI research by a decision-maker. Priorities: electricity cost, self-consumption vs export, production uptime and disruption, roof and electrical condition, warranties, reliability, next step.

SECTION PLAN (ordered; no two dark adjacent):
1 hero (dark) — H1 with primary keyword; daytime load-match angle; CTA.
2 stats — true facts only: MCS, RECC, NICEIC, TrustMark accreditations. No invented figures.
3 grid 4 — what manufacturers gain: solar self-consumption, battery peak shaving, load shifting, EV/fleet charging.
4 explorer (dark) — loads solar offsets: CNC machinery, compressors, extraction, pumps, production lines, refrigeration, HVAC, process equipment, offices.
5 steps 6-8 — load profiling from half-hourly data and maximum demand; system sizing; roof + structural survey and electrical infrastructure review; DNO application; install with RAMS, site coordination, minimal disruption; commissioning; monitoring, O&M, handover.
6 split — two-way: "Solar self-consumption" vs "Battery storage: peak shaving and load shifting"; define both against a factory load.
7 grid 4 — accreditations MCS, RECC, NICEIC, TrustMark, each explained for a commercial buyer.
8 funding 3 — CAPEX, asset finance, PPA.
9 faq.
10 cta (dark) — book the survey.

FAQ (answer all, keep wording):
- Can solar power our entire factory?
- How do you size a solar system for a manufacturing site?
- Will the installation disrupt our production?
- Do we need a DNO application?
- How do battery storage, peak shaving and load shifting help manufacturers?
- Can we charge EV or fleet vehicles from solar?
- What funding options are there — CAPEX, finance or PPA?
- What happens after commissioning — monitoring and O&M?

CTA & LINKS: button "Book a site survey" -> #quote, reused in hero, mid-page and cta. Funding cards -> /commercial-funding. Real Heliaxis paths only.

GUARDRAILS: Never claim solar powers the whole factory — frame generation as a share of demand, confirmed by site-specific load profiling. Qualitative only; invent no outputs, savings, prices, percentages or payback. Accreditations live in the grid; no testimonials/reviews block; no pricing block. Battery backup and peak shaving must be designed per site. Commercially competent tone.`,
  },
  {
    priority: 19,
    name: "Solar for Farms & Agriculture",
    slug: "/agriculture",
    keywords: "solar panels for farms Wales; agricultural solar South Wales",
    audience: "Farmers, agricultural businesses, estates and rural enterprises",
    goal: "Generate site-survey enquiries",
    ctaText: "Book a farm energy survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `POSITIONING: Cut a farm's biggest overhead — all-day grid power for milking, refrigeration, ventilation, pumps and drying — with solar sized to how a South Wales farm runs, roof or spare field.

KEYWORDS & INTENT: Primary: solar panels for farms Wales. Secondary: agricultural solar South Wales; farm solar PV; ground-mounted solar for farms; three-phase farm solar. Intent: commercial research → booked site survey. Audience: farmers, agricultural businesses, estates, rural enterprises. Priorities: cost on high all-day loads, no disruption to operations, farm-grade kit, long warranties, export/DNO limits, a clear next step.

SECTION PLAN (in order; no two dark sections adjacent):
1 hero (dark) — H1 with primary keyword + one-line direct answer.
2 grid (4) — loads solar offsets: dairy/milking & refrigeration; ventilation & poultry; pumps & irrigation; grain drying, workshops, offices, EV/equipment charging.
3 explorer (dark) — where panels go: portal-frame barn roof; multi-pitch/older roofs; ground-mount in a field; mixed roof+ground.
4 grid (4) — what the survey checks: roof condition; asbestos (flag, refer to specialist); structural assessment; site electrics — three-phase, long cable runs, existing infrastructure.
5 steps (6–7) — survey → structural & electrical assessment → design + DNO / export limits → install → commission → handover + O&M.
6 split — roof-mounted vs ground-mounted here: roof = existing buildings, no land lost; ground = scale/orientation when roofs are unsuitable or demand large.
7 grid (3–4) — match generation to on-farm consumption; battery storage; backup/resilience ONLY where specifically designed; remote monitoring.
8 funding (3) — asset finance, PPA, grant routes where available → /commercial-funding.
9 grid (4) — accreditations: MCS, RECC, NICEIC, TrustMark, each explained.
10 faq.
11 cta (dark) — Book a farm energy survey → #quote.

FAQ (keep all five):
- Do I need planning permission for solar on my farm?
- Can I have ground-mounted solar instead of roof panels?
- Will solar work on my barn and agricultural building roofs?
- What maintenance does a farm solar system need?
- Should I add battery storage?

CTA & LINKS: "Book a farm energy survey" → #quote (use ~3x). Internal link: /commercial-funding only.

GUARDRAILS: Qualitative only — no invented prices, percentages, payback, grant amounts or project figures. Do NOT claim a specific agricultural grant is currently available unless verified info supplied; keep funding routes generic. Asbestos: flag as a survey item, refer to a licensed specialist, no handling advice. Backup/resilience only where specifically designed, never implied as standard. Never claim solar powers the whole farm — frame as reducing grid demand. No testimonials/pricing/case-study/gallery blocks.`,
  },
  {
    priority: 20,
    name: "Renewable Energy for Care Homes",
    slug: "/care-homes",
    keywords: "solar panels for care homes South Wales; renewable energy for care homes Wales",
    audience: "Care-home owners, operators, estates managers, finance directors and facilities managers",
    goal: "Book a commercial site survey",
    ctaText: "Book a care home energy survey",
    ctaLink: "#quote",
    words: "1,300–1,700",
    prompt: `POSITIONING: Heliaxis plans solar, battery, heat-pump and EV work around a live 24/7 South Wales care home, so residents stay safe and warm while running costs and risk fall.

KEYWORDS & INTENT: Primary: solar panels for care homes South Wales. Secondary: renewable energy for care homes Wales; commercial solar for care homes; care home battery storage. Intent: a decision-maker comparing installers and booking a survey. Audience: owners, operators, estates/facilities managers, finance directors. Priorities: predictable running costs, zero risk to residents, minimal disruption, reliability/resilience, warranties/accreditation, clear next step.

SECTION PLAN:
1. hero - H1 with primary keyword; direct-answer opening on what renewable energy delivers for a South Wales care home and how a survey starts it; sub-CTA to #quote.
2. grid (4) - why care homes are energy-intensive: 24/7 occupancy & lighting; hot water & laundry; heating & ventilation; kitchens & medical/assistive equipment.
3. grid (4) - the renewable mix: commercial solar PV with high self-consumption; battery storage; heat pumps where appropriate for heating & hot water; EV charging.
4. split - two-way: LEFT "Everyday savings: peak shaving & self-consumption"; RIGHT "Resilience: backup designed for critical loads" (backup ONLY where specifically designed around named essential circuits).
5. steps (6) - load analysis; site survey; design incl. DNO/grid application; phased install around residents & staff with noise/disruption & health-and-safety controls; commissioning; monitoring, O&M, handover.
6. grid (4) - accreditations, what each means for a care operator: MCS (certified installs), RECC (consumer code), NICEIC (electrical safety), TrustMark (government-endorsed).
7. funding - 3 cards (CAPEX/asset finance; PPA; grants where available) to /commercial-funding.
8. faq - questions below.
9. cta (dark) - Book a care home energy survey to #quote.

FAQ (keep all):
- Can installation happen while the home remains open?
- Can solar work with a heat pump?
- Is battery storage worthwhile?
- Does commercial solar require planning permission?
- What maintenance is needed?
- What finance options are available?

CTA & LINKS: label "Book a care home energy survey" to #quote (hero, funding, closing band). Internal link: /commercial-funding. No other paths.

GUARDRAILS: Qualitative only - no invented savings %, payback, kWh, carbon or prices; benefits depend on the survey. Do NOT claim solar powers the whole home; frame as cutting import and cost. Backup/resilience must be specifically designed around defined critical loads, never assumed. Heat pumps only where appropriate. Accreditations as a grid explaining each; no testimonials, case-study or performance-stats blocks. DNO/grid approval is a required step.`,
  },
];
