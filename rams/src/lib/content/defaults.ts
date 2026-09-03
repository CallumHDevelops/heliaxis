import type { RamsContent, Sector, TechnologyId } from '@/lib/types';
import { coreHazardsFor } from './hazards';
import { methodStepsFor } from './methods';

// --- PPE -------------------------------------------------------------------

export const PPE_OPTIONS = [
  'Safety helmet (EN 397) — chin strap for work at height',
  'Safety footwear with midsole and toe protection (EN ISO 20345)',
  'High-visibility clothing (EN ISO 20471 Class 2)',
  'Safety eyewear (EN 166)',
  'Cut-resistant gloves (EN 388)',
  'Class 0 insulating electrical gloves (EN 60903)',
  'Arc-rated outer clothing (EN 61482)',
  'Full-body harness and twin lanyard (EN 361 / EN 355)',
  'Fall-restraint lanyard and adjustable line',
  'Hearing protection (EN 352)',
  'FFP3 respiratory protection, face-fit tested',
  'Disposable coveralls (Type 5/6)',
  'Knee pads',
  'Gauntlets for refrigerant handling',
  'Face shield for arc-flash risk',
  'Sun protection — long sleeves and SPF 30+',
] as const;

const CORE_PPE = [
  'Safety helmet (EN 397) — chin strap for work at height',
  'Safety footwear with midsole and toe protection (EN ISO 20345)',
  'High-visibility clothing (EN ISO 20471 Class 2)',
  'Safety eyewear (EN 166)',
  'Cut-resistant gloves (EN 388)',
];

const PPE_BY_TECH: Record<TechnologyId, string[]> = {
  solar_pv: [
    'Full-body harness and twin lanyard (EN 361 / EN 355)',
    'Class 0 insulating electrical gloves (EN 60903)',
    'Sun protection — long sleeves and SPF 30+',
  ],
  battery_storage: [
    'Class 0 insulating electrical gloves (EN 60903)',
    'Arc-rated outer clothing (EN 61482)',
    'Face shield for arc-flash risk',
  ],
  ashp: ['Gauntlets for refrigerant handling', 'Hearing protection (EN 352)', 'Knee pads'],
  led_lighting: [
    'FFP3 respiratory protection, face-fit tested',
    'Knee pads',
    'Hearing protection (EN 352)',
  ],
  small_wind: [
    'Full-body harness and twin lanyard (EN 361 / EN 355)',
    'Hearing protection (EN 352)',
    'Class 0 insulating electrical gloves (EN 60903)',
  ],
};

// --- Plant & equipment -----------------------------------------------------

const PLANT_COMMON = [
  { name: 'Scaffold or mobile access tower', inspection: 'Handover certificate; 7-day inspection record' },
  { name: 'Class 1 / EN 131 ladders', inspection: 'Daily pre-use check; formal inspection record' },
  { name: 'Cordless drill / driver and impact driver', inspection: 'Pre-use visual inspection' },
  { name: '110 V transformer and site leads', inspection: 'PAT test in date' },
  { name: 'Cable avoidance tool and signal generator', inspection: 'Calibration in date' },
  { name: 'Multifunction installation tester', inspection: 'Calibration within 12 months' },
  { name: 'Voltage indicator and proving unit (GS38)', inspection: 'Pre-use function check' },
  { name: 'Torque wrench', inspection: 'Calibration in date' },
  { name: 'M-class vacuum and on-tool extraction', inspection: 'Filter check; PAT in date' },
];

const PLANT_BY_TECH: Record<TechnologyId, { name: string; inspection?: string }[]> = {
  solar_pv: [
    { name: 'Panel lifting hoist or module suction handles', inspection: 'Pre-use inspection; LOLER where lifting equipment' },
    { name: 'MC4 crimp tool and disconnect tool', inspection: 'Pre-use check' },
    { name: 'Anemometer', inspection: 'Pre-use check' },
    { name: 'MEWP (where used)', inspection: 'LOLER thorough examination within 6 months' },
  ],
  battery_storage: [
    { name: 'Stair-climbing trolley / genie lift', inspection: 'Pre-use inspection' },
    { name: 'Insulated tool set (IEC 60900)', inspection: 'Pre-use inspection for insulation damage' },
    { name: 'CO2 extinguisher and fire blanket', inspection: 'Service label in date' },
  ],
  ashp: [
    { name: 'Refrigerant recovery unit and vacuum pump', inspection: 'Service record; F-Gas equipment log' },
    { name: 'Nitrogen regulator and test set', inspection: 'Pre-use inspection' },
    { name: 'Diamond core drill with extraction', inspection: 'PAT in date; guard fitted' },
    { name: 'Press-fit tool and jaws', inspection: 'Service interval record' },
  ],
  led_lighting: [
    { name: 'Podium steps / low-level access platform', inspection: 'Pre-use inspection' },
    { name: 'Scissor lift (where used)', inspection: 'LOLER thorough examination within 6 months' },
    { name: 'Lamp coffin / WEEE transport containers', inspection: 'Condition check before loading' },
    { name: 'Lux meter', inspection: 'Calibration in date' },
  ],
  small_wind: [
    { name: 'Mobile crane or gin pole and winch', inspection: 'LOLER thorough examination; lift plan by Appointed Person' },
    { name: 'Lifting accessories — slings, shackles, spreader beam', inspection: 'LOLER thorough examination within 6 months' },
    { name: 'Fall-arrest travelling arrester and rail system', inspection: 'Inspection within 6 months; pre-use check' },
    { name: 'Tower rescue kit', inspection: 'Inspection in date; two trained users on site' },
    { name: 'Anemometer', inspection: 'Pre-use check' },
    { name: 'Excavator and trench support', inspection: 'Daily pre-use record; operator card' },
  ],
};

// --- COSHH -----------------------------------------------------------------

const COSHH_COMMON = [
  {
    substance: 'Silicone sealant / MS polymer',
    hazard: 'Skin and eye irritation; vapour in enclosed spaces',
    controls: 'Nitrile gloves and eye protection; use in a ventilated area; SDS held in the site pack.',
    sdsLocation: 'Site pack and vehicle COSHH folder',
  },
  {
    substance: 'Construction dust (respirable crystalline silica)',
    hazard: 'Silicosis, COPD, lung cancer on repeated exposure',
    controls: 'On-tool M-class extraction or water suppression; FFP3 RPE, face-fit tested; area segregated; M-class vacuum for clean-up.',
    sdsLocation: 'COSHH assessment CA-01',
  },
  {
    substance: 'Isopropyl alcohol / contact cleaner',
    hazard: 'Highly flammable; eye and respiratory irritation',
    controls: 'Keep away from ignition sources and hot works; ventilate; gloves and eye protection; store upright in the designated box.',
    sdsLocation: 'Vehicle COSHH folder',
  },
];

const COSHH_BY_TECH: Record<TechnologyId, typeof COSHH_COMMON> = {
  solar_pv: [],
  battery_storage: [
    {
      substance: 'Lithium-ion battery electrolyte (in the event of cell rupture)',
      hazard: 'Corrosive; toxic and flammable off-gassing including HF; fire and explosion risk',
      controls:
        'Do not open or breach a cell. Damaged or venting units are evacuated from, not approached. Evacuate, call 999, state "lithium battery fire". Quarantine damaged units outdoors away from combustibles.',
      sdsLocation: 'Manufacturer SDS in the site pack',
    },
  ],
  ashp: [
    {
      substance: 'R32 / R290 refrigerant',
      hazard: 'Cold burns on skin contact; asphyxiant in enclosed spaces; A2L/A3 flammability',
      controls:
        'F-Gas certified engineers only. Gauntlets and eye protection. No ignition sources or hot works during charging. Room area checked against charge size. Recovery equipment used — never vented.',
      sdsLocation: 'Manufacturer SDS in the site pack',
    },
    {
      substance: 'Glycol antifreeze (MPG)',
      hazard: 'Harmful if swallowed; skin and eye irritation; environmental harm if spilled',
      controls:
        'Gloves and eye protection; never siphoned by mouth; mixed in a ventilated area; spill kit available; spills contained and removed away from drains.',
      sdsLocation: 'Vehicle COSHH folder',
    },
    {
      substance: 'System inhibitor and flushing chemicals',
      hazard: 'Skin and eye irritation; harmful if swallowed',
      controls: 'Gloves and eye protection; dose to instruction; do not discharge flushings to a watercourse.',
      sdsLocation: 'Vehicle COSHH folder',
    },
  ],
  led_lighting: [
    {
      substance: 'Mercury vapour from fluorescent / discharge lamps',
      hazard: 'Toxic vapour and glass fragments if a lamp breaks',
      controls:
        'Lamps handled horizontally, one at a time, direct into a lamp coffin. On breakage: ventilate, vacate 15 minutes, collect with stiff card and damp paper, double-bag. Never use a domestic vacuum. WEEE disposal only.',
      sdsLocation: 'COSHH assessment CA-07',
    },
    {
      substance: 'Mineral wool insulation fibres (ceiling voids)',
      hazard: 'Skin, eye and respiratory irritation',
      controls: 'Disposable coveralls, gloves and FFP3 RPE; wash before breaks; no dry sweeping.',
      sdsLocation: 'COSHH assessment CA-04',
    },
  ],
  small_wind: [
    {
      substance: 'Gear oil and hydraulic fluid',
      hazard: 'Skin irritation and dermatitis; environmental harm if spilled',
      controls: 'Gloves and eye protection; drip trays and a spill kit at the tower base; used oil removed under duty of care.',
      sdsLocation: 'Vehicle COSHH folder',
    },
    {
      substance: 'Wet concrete and cement',
      hazard: 'Alkaline burns to skin and eyes; dermatitis',
      controls: 'Waterproof gloves, eye protection and covered skin; wash off immediately; eyewash available at the pour.',
      sdsLocation: 'COSHH assessment CA-11',
    },
  ],
};

// --- Permits ---------------------------------------------------------------

export const PERMIT_OPTIONS = [
  'Permit to work (client-issued)',
  'Hot works permit',
  'Permit to dig / ground penetration',
  'Electrical isolation permit / limitation of access',
  'Roof access permit',
  'Confined space entry permit',
  'Working at height permit',
  'Lift plan sign-off (Appointed Person)',
  'Fire alarm isolation permit',
  'Vehicle / plant access permit',
];

// --- Legislation -----------------------------------------------------------

const LEGISLATION_COMMON = [
  'Health and Safety at Work etc. Act 1974',
  'Management of Health and Safety at Work Regulations 1999',
  'Construction (Design and Management) Regulations 2015',
  'Work at Height Regulations 2005',
  'Provision and Use of Work Equipment Regulations 1998 (PUWER)',
  'Manual Handling Operations Regulations 1992 (as amended)',
  'Personal Protective Equipment at Work Regulations 1992 (as amended 2022)',
  'Control of Substances Hazardous to Health Regulations 2002 (COSHH)',
  'Control of Asbestos Regulations 2012',
  'Electricity at Work Regulations 1989',
  'Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013 (RIDDOR)',
  'The Health and Safety (First-Aid) Regulations 1981',
  'Control of Noise at Work Regulations 2005',
  'Control of Vibration at Work Regulations 2005',
  'Environmental Protection Act 1990 — duty of care for waste',
  'BS 7671:2018+A2:2022 — Requirements for Electrical Installations (IET Wiring Regulations)',
  'HSE GS38 — Electrical test equipment for use by electricians',
];

const LEGISLATION_BY_TECH: Record<TechnologyId, string[]> = {
  solar_pv: [
    'BS 7671 Section 712 — Solar photovoltaic (PV) power supply systems',
    'IET Code of Practice for Grid-Connected Solar Photovoltaic Systems',
    'MCS MIS 3002 — Solar PV installation standard',
    'MCS 012 — Roof-mounted product installation and testing',
    'Engineering Recommendation G98 / G99 — connection of generation',
    'HSE HSG33 — Health and safety in roof work',
    'HSE GS6 — Avoiding danger from overhead power lines',
  ],
  battery_storage: [
    'BS 7671 Section 712 and Chapter 82 — Prosumer low-voltage installations',
    'PAS 63100:2024 — Protection against fire of battery energy storage systems in dwellings',
    'IET Code of Practice for Electrical Energy Storage Systems',
    'MCS MIS 3012 — Battery storage installation standard',
    'Engineering Recommendation G98 / G99',
    'ADR / UN3480 — carriage of lithium-ion batteries by road',
    'Regulatory Reform (Fire Safety) Order 2005',
  ],
  ashp: [
    'F-Gas Regulation (EU) 517/2014 as retained, and the Fluorinated Greenhouse Gases Regulations 2015',
    'MCS MIS 3005 — Heat pump installation standard',
    'MCS 020 — Noise assessment for permitted development',
    'BS EN 378 — Refrigerating systems and heat pumps: safety and environmental requirements',
    'BS 7593:2019 — Preparation and treatment of water in heating systems',
    'HSE HSG274 Part 2 — Legionnaires disease: the control of Legionella in hot and cold water systems',
    'Building Regulations Part L, Part G and Part P',
  ],
  led_lighting: [
    'BS 5266-1 — Emergency lighting: code of practice',
    'BS EN 12464-1 — Light and lighting: lighting of indoor work places',
    'Waste Electrical and Electronic Equipment (WEEE) Regulations 2013',
    'Workplace (Health, Safety and Welfare) Regulations 1992',
    'Regulatory Reform (Fire Safety) Order 2005',
  ],
  small_wind: [
    'Lifting Operations and Lifting Equipment Regulations 1998 (LOLER)',
    'BS 7671 Section 712 and Chapter 55 — rotating machines',
    'MCS MIS 3003 — Micro and small wind turbine installation standard',
    'IEC 61400-2 — Design requirements for small wind turbines',
    'Engineering Recommendation G98 / G99',
    'HSE HSG185 — Health and safety in excavations',
    'HSE GS6 — Avoiding danger from overhead power lines',
    'Town and Country Planning Act 1990 — consent for wind development',
  ],
};

// --- Standing narrative sections -------------------------------------------

const WELFARE_RESIDENTIAL = `Welfare is agreed with the householder before work starts. Use of a WC and hand-washing facilities is confirmed in writing at the survey stage; where this is not available, the team uses a nearby agreed facility and this is recorded in the project record. Drinking water is carried on the vehicle. Breaks are taken away from the work area, in the vehicle or an agreed space. Operatives do not use household facilities beyond what has been agreed, and always with clean footwear and floor protection in place.`;

const WELFARE_COMMERCIAL = `Welfare is provided by the principal contractor or the client under CDM 2015 Schedule 2 and is confirmed at induction: WCs, washing facilities with hot and cold water, drinking water, a place to take breaks and to change and store clothing. Where the client cannot provide these, Heliaxis provides a welfare unit or arranges an agreed nearby facility before mobilisation. The arrangements are recorded on the cover sheet and briefed to the team at the pre-start.`;

const FIRST_AID = `A stocked first-aid kit to BS 8599-1 and an eyewash station are carried on every vehicle and taken to the working position. At least one operative on site holds a current Emergency First Aid at Work certificate; on sites with a fall-arrest, confined-space or lifting risk, a First Aid at Work qualified person is present. The location of the kit, the appointed first-aider and the nearest A&E department are confirmed at the pre-start briefing and recorded on the cover sheet of this document. All injuries, however minor, are recorded in the accident book and reported to the office the same day. Incidents meeting the RIDDOR threshold are reported by the office within the statutory period.`;

const EMERGENCY = `In the event of a fire, serious injury or other emergency: raise the alarm, make the work safe only if it is safe to do so (isolate the supply at the nearest accessible isolator), and evacuate to the agreed assembly point. The supervisor takes a roll call and calls 999, giving the site address, the postcode and the what3words location recorded on the cover sheet. One operative meets the emergency services at the site entrance and directs them in. The client or the client responsible person is informed immediately. No one re-enters the work area until the emergency services or the supervisor confirms it is safe. The office is informed as soon as the immediate situation is under control, and the scene is preserved where there has been a serious incident or dangerous occurrence.`;

const RESCUE_PLAN = `Where any fall-arrest system is in use, this rescue plan applies and work does not start until it has been briefed. Rescue must be achievable within 10 minutes of a fall being arrested — the emergency services are not the primary means of rescue. A rescue kit (descent/recovery device or rescue pole) appropriate to the working position is held on site and at least two operatives are trained in its use. Lone working is prohibited wherever fall arrest is in use. On an arrest: the ground person raises the alarm and calls 999 immediately, keeps voice contact with the casualty and instructs them to keep their legs moving to maintain circulation. The trained rescuer recovers the casualty to a safe position using the rescue kit or, where available, by lowering the MEWP platform. Once recovered, the casualty is kept in a seated position, never laid flat, and is assessed by a medical professional even if they appear unharmed — suspension trauma can present after recovery. Where a MEWP is in use, the ground rescue person is trained in the emergency lowering controls and demonstrates them at the pre-start.`;

const ENVIRONMENTAL = `Waste is segregated on site and removed by a licensed carrier under a duty-of-care transfer note, which is retained by the office. WEEE, lamps, batteries and refrigerant follow their designated licensed routes and are never placed in general waste. Spill kits are carried on every vehicle and at the plant position; any spill is contained immediately, cleaned up and reported. Chemicals are stored on a drip tray away from drains and watercourses. Noise-generating work is restricted to the hours agreed with the client and neighbours, and dust is suppressed at source. Before any roof, loft or mast work, the area is checked for nesting birds and evidence of bats — both are legally protected and work stops for specialist advice if they are found. Nothing is burned on site. Packaging is returned to the supplier for recycling where a take-back scheme exists.`;

const MONITORING = `The site supervisor is responsible for implementing and monitoring this document. A dynamic risk assessment is carried out at the start of each shift and whenever conditions change — weather, access, a change in the structure or the discovery of anything not identified at survey. Any change that materially alters the risk stops work until this document has been reviewed and reissued. Spot checks on PPE use, access equipment, isolation practice and housekeeping are made throughout the shift. Documented site inspections are carried out by the contracts manager at a frequency proportionate to the job, and the findings are recorded and actioned. Near misses and unsafe conditions are reported to the office the same day, without blame, and are reviewed to see whether this document needs to change. Every operative has the authority to stop work if they believe it is unsafe, and will be supported in doing so.`;

const COMPETENCE = `All operatives carrying out these works are trained, assessed as competent and hold current cards and certificates for the tasks assigned to them. Electrical work is carried out by qualified electricians holding the 18th Edition (BS 7671), the relevant inspection and testing qualification, and a current ECS or equivalent card. Refrigerant work is carried out only by F-Gas Category I certified engineers. Work at height is carried out by operatives holding current working-at-height and, where applicable, PASMA or IPAF certification. All operatives hold current asbestos awareness training. Copies of the certificates for the individuals named in this document are attached as an appendix, together with the company accreditations. Trainees and apprentices work only under the direct supervision of a competent person and are never left to work unsupervised on a safety-critical task.`;

// --- Assembly --------------------------------------------------------------

function id(prefix: string, n: number): string {
  return `${prefix}-${n}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Build the starting content for a new RAMS document. */
export function defaultContent(technology: TechnologyId, sector: Sector): RamsContent {
  const hazards = coreHazardsFor(technology, sector).map((h, i) => ({
    id: id('hz', i),
    libraryId: h.id,
    hazard: h.hazard,
    whoIsAtRisk: [...h.whoIsAtRisk],
    initialLikelihood: h.initialLikelihood,
    initialSeverity: h.initialSeverity,
    controls: [...h.controls],
    residualLikelihood: h.residualLikelihood,
    residualSeverity: h.residualSeverity,
  }));

  const sequence = methodStepsFor(technology, sector).map((s, i) => ({
    id: id('st', i),
    title: s.title,
    detail: s.detail,
    responsible: s.responsible,
    holdPoint: s.holdPoint,
  }));

  const plant = [...PLANT_COMMON, ...PLANT_BY_TECH[technology]].map((p, i) => ({
    id: id('pl', i),
    name: p.name,
    inspection: p.inspection,
  }));

  const coshh = [...COSHH_COMMON, ...COSHH_BY_TECH[technology]].map((c, i) => ({
    id: id('co', i),
    ...c,
  }));

  return {
    scopeOfWorks: '',
    workAreas: '',
    duration: '',
    personnel: '',
    competence: COMPETENCE,
    hazards,
    sequence,
    plant,
    ppe: [...CORE_PPE, ...PPE_BY_TECH[technology]],
    coshh,
    permits: sector === 'commercial' ? ['Permit to work (client-issued)'] : [],
    welfare: sector === 'commercial' ? WELFARE_COMMERCIAL : WELFARE_RESIDENTIAL,
    firstAid: FIRST_AID,
    emergencyProcedure: EMERGENCY,
    rescuePlan: RESCUE_PLAN,
    environmental: ENVIRONMENTAL,
    monitoring: MONITORING,
    legislation: [...LEGISLATION_COMMON, ...LEGISLATION_BY_TECH[technology]],
    siteSpecificNotes: '',
    attachedCertificationIds: [],
    operativeIds: [],
    externalOperatives: [],
  };
}

/** Fill in any keys missing from a stored document (forward compatibility). */
export function normaliseContent(
  raw: Partial<RamsContent> | null | undefined,
  technology: TechnologyId,
  sector: Sector
): RamsContent {
  const base = defaultContent(technology, sector);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    hazards: raw.hazards ?? base.hazards,
    sequence: raw.sequence ?? base.sequence,
    plant: raw.plant ?? base.plant,
    ppe: raw.ppe ?? base.ppe,
    coshh: raw.coshh ?? base.coshh,
    permits: raw.permits ?? base.permits,
    legislation: raw.legislation ?? base.legislation,
    attachedCertificationIds: raw.attachedCertificationIds ?? [],
    operativeIds: raw.operativeIds ?? [],
    externalOperatives: raw.externalOperatives ?? [],
  };
}

export { LEGISLATION_COMMON, LEGISLATION_BY_TECH };
