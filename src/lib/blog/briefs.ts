/**
 * The topic briefs for blog articles: fifteen starting points (prepared with OpenAI, adapted here), each with the
 * title, the main search phrase, who it is for, and what the article must cover. Picking one in the AI Blog screen
 * fills the form; the writer then follows it together with the Heliaxis house rules in prompt.ts.
 */

export type BlogBrief = { id: string; title: string; keyword: string; audience: string; brief: string };

export const BLOG_BRIEFS: BlogBrief[] = [
  {
    id: 'solar-worth-it-wales',
    title: 'Are Solar Panels Worth It in Wales in 2026? Costs, Savings & Payback Explained',
    keyword: 'solar panels Wales',
    audience: 'homeowners in Wales, particularly South Wales',
    brief:
      'Cover whether solar panels are financially worthwhile in 2026; installation cost factors; likely Welsh generation; cloudy weather; self-consumption versus export; electricity prices; Smart Export Guarantee income; battery storage; roof orientation and shading; east/west versus south-facing roofs; system size; payback considerations; lifespan; degradation; maintenance; and when solar may not be suitable. Include a worked example for a realistic Welsh household and clearly label all assumptions. Avoid guaranteed savings claims. Explain kW, kWp and kWh correctly. Include a section titled "How Heliaxis assesses whether solar is worth it" covering roof space, orientation, shading, annual demand, daytime use, tariff, export rate, battery options and future loads such as EV charging or heat pumps.',
  },
  {
    id: 'solar-cost-wales',
    title: 'How Much Do Solar Panels Cost in Wales in 2026?',
    keyword: 'solar panel cost Wales',
    audience: 'South Wales homeowners actively considering solar PV',
    brief:
      'Answer the price question quickly. Provide realistic indicative UK pricing ranges for small residential systems, typical 4–5 kWp systems, 6–8 kWp systems, solar plus battery and larger residential systems, clearly stating that pricing must be verified before publication. Explain what changes the price: panel count and specification, inverter, battery size, scaffolding, roof type, access, electrical upgrades, optimisers, bird protection, monitoring, backup/EPS capability and DNO requirements. Cover VAT treatment where applicable, expected lifespan, payback, savings, export payments, battery economics, MCS installation and warranties. Include sections titled "What should actually be included in a solar quotation?" and "Why two solar quotations can differ by thousands of pounds".',
  },
  {
    id: 'solar-system-size',
    title: 'What Size Solar Panel System Do I Need? UK Homeowner Guide',
    keyword: 'what size solar system do I need',
    audience: 'UK homeowners',
    brief:
      'Explain why solar should not simply be sized by annual electricity consumption. Cover kWp versus kWh, annual consumption, daytime consumption, roof area, orientation, pitch, shading, east/west and south-facing arrays, inverter sizing, export limitations, DNO constraints, battery storage, EV charging, heat pumps and future electricity use. Give worked examples for homes using approximately 2,500, 4,000, 6,000 and 10,000 kWh a year, without implying a universal system size for each. Explain DC oversizing and why PV array capacity may exceed inverter AC output. Include a table showing indicative roof area and panel quantities for common system sizes.',
  },
  {
    id: 'battery-without-solar',
    title: 'Is Battery Storage Worth It Without Solar Panels?',
    keyword: 'battery storage without solar panels',
    audience: 'UK homeowners considering a standalone battery',
    brief:
      'Explain clearly that a battery does not require solar to operate. Cover grid charging overnight, time-of-use tariffs, arbitrage, peak-rate avoidance, backup power, EPS versus whole-home backup, battery capacity, usable capacity, charge/discharge power, round-trip efficiency, degradation, cycle life, inverter losses, tariff spreads and future solar addition. Give a worked example using an illustrative cheap overnight tariff and an expensive daytime tariff. Explain when standalone storage is likely to make sense and when it probably does not. Include a section titled "Battery size matters more than simply buying the biggest battery".',
  },
  {
    id: 'solar-and-battery-together',
    title: 'Solar Panels and Battery Storage: Is It Better to Install Both Together?',
    keyword: 'solar panels with battery storage',
    audience: 'UK homeowners considering solar PV',
    brief:
      'Compare solar only, solar plus battery installed together and adding a battery later. Discuss upfront cost, installation complexity, VAT where relevant, self-consumption, export, time-of-use tariffs, hybrid inverter versus AC-coupled battery, future expansion, backup capability, battery sizing, inverter sizing and DNO considerations. Explain circumstances where solar-only is sensible and where installing a battery at the same time may be more cost-effective. Include a realistic household example showing solar generation, daytime usage, export and the effect of adding storage. Add a section titled "How Heliaxis decides whether a battery is worthwhile".',
  },
  {
    id: 'battery-grid-charge-night',
    title: 'Can You Charge a Home Battery From the Grid at Night and Use It During the Day?',
    keyword: 'charge battery from grid at night UK',
    audience: 'UK homeowners',
    brief:
      'Answer immediately: yes, many modern batteries can be scheduled to charge using cheap-rate electricity and discharge later. Explain time-of-use tariffs, scheduled charging, reserve settings, state of charge, charge rate, discharge rate, round-trip losses, import limits, degradation, solar integration and winter versus summer strategies. Provide a simplified worked calculation showing gross tariff saving and approximate efficiency losses. Explain why tariff spread matters more than the cheap rate alone. Include a section titled "Can you completely avoid peak-rate electricity?".',
  },
  {
    id: 'seg-export',
    title: 'How Much Can You Earn Exporting Solar Electricity in the UK? Smart Export Guarantee Explained',
    keyword: 'solar export tariff UK',
    audience: 'UK homeowners and businesses',
    brief:
      'Explain what the SEG is, who qualifies, export meters, smart meters, MCS documentation, fixed versus variable tariffs and why the highest export tariff may not always produce the lowest total bill. Include a worked example using annual generation, self-consumption, exported kWh and export payment with hypothetical rates. Discuss whether batteries reduce export income but may improve overall savings. Include a section titled "Should I maximise export or maximise self-consumption?".',
  },
  {
    id: 'plug-in-solar',
    title: 'Plug-In Solar Panels Are Now Legal in the UK, But Are They Actually Worth Buying?',
    keyword: 'plug in solar panels UK',
    audience: 'UK homeowners and renters where relevant',
    brief:
      'Research the latest UK rules before writing. Explain what plug-in solar is, when the rules changed, permitted system size, connection method, safety requirements, whether specialist sockets or protection are needed, metering, export, DNO considerations, installation location, balcony solar and garden-mounted systems. Compare plug-in solar with professionally installed rooftop PV across cost, generation, payback, portability, orientation, shading, inverter limits and reliability. Include a section titled "Plug-in solar versus a 4–6 kWp rooftop system". Do not encourage unsafe DIY electrical work.',
  },
  {
    id: 'solar-winter-cloudy',
    title: 'Do Solar Panels Work in Winter and Cloudy Weather in Wales?',
    keyword: 'do solar panels work in winter UK',
    audience: 'Welsh homeowners',
    brief:
      'Explain that PV uses light rather than heat; diffuse irradiance; cloudy-day generation; winter versus summer generation; temperature effects; cold sunny-day performance; seasonal variation; roof orientation; shading; snow; rain; and the Welsh climate. Use illustrative monthly generation percentages only if accurate data is available and verified. Include a realistic example of annual production from a South Wales system. Add a section titled "How much of your annual solar generation happens in winter?".',
  },
  {
    id: 'east-west-solar',
    title: 'Solar Panels on East-West Roofs: Are South-Facing Panels Really Better?',
    keyword: 'east west solar panels UK',
    audience: 'UK homeowners and small commercial customers',
    brief:
      'Compare south-facing, east-facing, west-facing and split east/west arrays. Discuss annual generation, morning and afternoon output, household load matching, self-consumption, export, battery charging, inverter sizing, MPPTs, string design, roof pitch and shading. Explain why a south-facing system may generate more annual energy but east/west can produce a more useful profile. Include a worked example comparing 5 kWp south-facing with 5 kWp split east/west. Add a section titled "Is an east-west roof still worth installing solar on?".',
  },
  {
    id: 'commercial-solar-payback',
    title: 'Commercial Solar Panels: How Long Does It Take a Business to Get Its Money Back?',
    keyword: 'commercial solar payback UK',
    audience: 'business owners, finance directors, property owners, operations managers and sustainability managers',
    brief:
      'Explain payback using CapEx, generation, self-consumption, avoided electricity cost, export revenue, O&M, panel degradation, inverter replacement, electricity inflation assumptions and financing costs. Explain the difference between simple payback, ROI, IRR and NPV. Provide a realistic worked UK commercial example with assumptions. Discuss 100 kWp, 250 kWp and 500 kWp+ systems conceptually. Explain why half-hourly data matters and cover weekend demand, shutdowns, export constraints, DNO, roof lease, structural assessment and PPA alternatives. Include "Why two identical 250 kWp systems can have completely different returns".',
  },
  {
    id: 'commercial-solar-sizing',
    title: 'How Do You Size Commercial Solar? Why Your Electricity Half-Hourly Data Matters',
    keyword: 'commercial solar system sizing',
    audience: 'commercial property owners and energy decision-makers',
    brief:
      'Explain why matching annual solar generation to annual electricity consumption is insufficient. Cover half-hourly data, load profiles, baseload, weekend demand, seasonal consumption, shift patterns, solar generation profile, self-consumption, export, export limitation, DNO connection, roof space, structural constraints, inverter capacity, string design, MPPT design, future EV charging, heat pumps and battery storage. Give a simplified example comparing a daytime-heavy business with one that uses most electricity overnight. Include a checklist section titled "What data should you give a commercial solar installer?".',
  },
  {
    id: 'commercial-battery',
    title: 'Commercial Battery Storage: When Does It Actually Make Financial Sense?',
    keyword: 'commercial battery storage UK',
    audience: 'technically informed commercial decision-makers',
    brief:
      'Focus on economics and engineering rather than generic benefits. Cover solar self-consumption, peak shaving, time-of-use arbitrage, import capacity constraints, demand management, backup and resilience, export optimisation, degradation, C-rate, charge/discharge power, usable capacity, round-trip efficiency, cycle life, warranty throughput, AC versus DC coupling and commercial tariffs. Explain why a 100 kWh battery is not automatically suitable just because a site consumes more than 100 kWh a day. Include worked examples and explain why half-hourly data is essential. Add a section titled "The battery payback mistakes businesses make".',
  },
  {
    id: 'solar-ppa-vs-buy',
    title: 'Solar PPA vs Buying Solar Panels: Which Is Better for Your Business?',
    keyword: 'solar PPA UK',
    audience: 'UK businesses considering commercial solar funding',
    brief:
      'Explain what a solar PPA is. Compare buying outright, PPA, asset finance and lease structures where relevant across upfront CapEx, ownership, savings, maintenance, contract length, risk, financing, accounting considerations, asset ownership at contract end and property or roof issues. Explain how a PPA provider makes money. Give a simplified example comparing buying, using a PPA and continuing to buy all electricity from the grid. Include a checklist of contract points: starting electricity rate, indexation, duration, break clauses, roof access, maintenance, insurance, asset transfer, minimum consumption and export arrangements. Add "When does a PPA make more sense than buying solar?".',
  },
  {
    id: 'ashp-running-costs',
    title: 'Air Source Heat Pump Running Costs: What Will a Heat Pump Actually Cost to Run?',
    keyword: 'air source heat pump running cost UK',
    audience: 'UK homeowners',
    brief:
      'Explain that running cost cannot be accurately predicted from property size alone. Cover heat loss, annual space-heating demand, hot water, COP, SCOP, outdoor temperature, flow temperature, radiator sizing, underfloor heating, weather compensation, electricity tariff, controls, cycling, immersion heater use and poor commissioning. Explain COP with an easy numerical example. Explain why a 35°C flow temperature can perform differently from 55°C. Compare conceptually with gas, direct electric, oil and LPG without claiming heat pumps are always cheaper. Include sections titled "Why some heat pumps cost far more to run than expected" and "How Heliaxis calculates expected heat pump running costs".',
  },
];

export const briefById = (id: string | undefined | null) => BLOG_BRIEFS.find((b) => b.id === id) ?? null;
