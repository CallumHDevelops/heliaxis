import type { Sector, TechnologyId } from '@/lib/types';

export type MethodStepTemplate = {
  title: string;
  detail: string;
  responsible?: string;
  holdPoint?: boolean;
};

/** Steps every job starts and ends with, regardless of technology. */
const OPENING: MethodStepTemplate[] = [
  {
    title: 'Pre-start briefing and document sign-on',
    detail:
      'On arrival the supervisor briefs the full team on this RAMS, the site-specific hazards, the emergency arrangements, the location of the nearest A&E and the welfare facilities. Every operative signs the briefing record at the back of this document before starting work. Anyone who has not been briefed does not work. Competence cards and certificates are checked as in date.',
    responsible: 'Site supervisor',
    holdPoint: true,
  },
  {
    title: 'Site inspection and dynamic risk assessment',
    detail:
      'Walk the site and confirm that conditions match the survey. Check the weather forecast for the shift, confirm access and egress, identify the position of services, and confirm the asbestos register has been seen where the building predates 2000. Any change from the survey is recorded and, if it materially alters the risk, work stops and this document is revised before continuing.',
    responsible: 'Site supervisor',
    holdPoint: true,
  },
  {
    title: 'Set up exclusion zones, signage and welfare',
    detail:
      'Establish the work area with barriers, cones and warning signage. Set the exclusion zone beneath any overhead work. Confirm the agreed parking and unloading position, protect the client floor coverings on the access route, and confirm welfare arrangements and the first-aid kit location with the team.',
    responsible: 'Install team',
  },
  {
    title: 'Erect and check access equipment',
    detail:
      'Confirm the scaffold handover certificate is in place and the tag is current, or erect towers and position the MEWP as planned. Carry out and record the pre-use inspection of all access equipment. Nobody accesses the roof or platform until the inspection is complete and signed.',
    responsible: 'Site supervisor',
    holdPoint: true,
  },
  {
    title: 'Offload and stage materials',
    detail:
      'Offload using the planned mechanical aids and two-person lifts. Stage materials close to the point of use, clear of walkways and escape routes, at least 2 m back from any roof edge, and secured against wind. Remove packaging to the waste stream as it is generated.',
    responsible: 'Install team',
  },
];

const CLOSING: MethodStepTemplate[] = [
  {
    title: 'Client demonstration and handover',
    detail:
      'Walk the client through the installed system: normal operation, the location and use of every isolator and emergency stop, what to do in a fault or emergency, and the maintenance requirements. Hand over the operation and maintenance manual, the electrical certificate, the commissioning record, warranty documents and the relevant scheme certificate. The client signs the handover record.',
    responsible: 'Lead engineer',
    holdPoint: true,
  },
  {
    title: 'Clear site, remove waste and final inspection',
    detail:
      'Remove all tools, materials, packaging and waste from site. Segregate waste and remove it under a licensed carrier with duty-of-care transfer notes retained. Strike access equipment. Carry out a final joint inspection with the client, confirm no damage, take completion photographs and record any snags with an agreed date for return.',
    responsible: 'Site supervisor',
  },
];

const SEQUENCES: Record<TechnologyId, MethodStepTemplate[]> = {
  // ==========================================================================
  solar_pv: [
    {
      title: 'Confirm roof structure and set out the array',
      detail:
        'Verify rafter positions, dimensions, spacing and condition against the structural appraisal. Confirm the roof covering is sound. Set out the array position from the design drawing, maintaining the specified edge and ridge clearances for the wind-load calculation. Mark the fixing centres. Report any discrepancy from the survey before drilling anything.',
      responsible: 'Lead installer',
      holdPoint: true,
    },
    {
      title: 'Install roof anchors and mounting rail',
      detail:
        'Lift tiles or slates as required and fit the roof hooks or anchors to the rafters — never to battens or sarking alone — using the specified fixing, pilot hole and torque. Dress tiles back and weatherproof each penetration as it is made. Fit the mounting rails, level and align them, and torque all clamps to the manufacturer figure. Photograph each penetration before it is covered.',
      responsible: 'Install team',
    },
    {
      title: 'Install DC cable containment and earthing',
      detail:
        'Run the DC cable route in UV-stable containment, secured at the specified centres and protected from abrasion at every edge. Keep DC positive and negative in the same containment to minimise loop area. Install the array earthing and equipotential bonding to the design and to BS 7671 Section 712. Seal the roof entry point.',
      responsible: 'Qualified electrician',
    },
    {
      title: 'Mount modules and make DC connections',
      detail:
        'Lift modules to roof level using the planned mechanical aid — never carried up a ladder. Two-person handling throughout. Stop immediately if wind reaches 23 mph. Place and clamp each module to the specified torque. Keep modules covered or connectors unmated until termination. Build strings one module at a time, checking polarity and measuring open-circuit voltage against the design before the string is taken to the inverter. Never mate or break a connector under load.',
      responsible: 'Install team',
    },
    {
      title: 'Install inverter, DC and AC isolators',
      detail:
        'Mount the inverter in the agreed position with the manufacturer clearances for ventilation, out of direct sun and accessible for maintenance. Install the DC isolator adjacent to the inverter and the AC isolator within reach of it. Fit all warning and dual-supply labelling required by BS 7671 Section 712 at the inverter, isolators, meter position and consumer unit.',
      responsible: 'Qualified electrician',
    },
    {
      title: 'AC connection to the consumer unit',
      detail:
        'Carry out safe isolation to GS38 at the consumer unit: identify, isolate, lock off with a personal lock, prove the tester, test dead on all conductors, re-prove the tester. Install the dedicated AC circuit with the specified protective device and RCD arrangement. Confirm the existing main protective bonding is adequate and upgrade it first if it is not. All work carried out dead.',
      responsible: 'Qualified electrician',
      holdPoint: true,
    },
    {
      title: 'Test, commission and energise',
      detail:
        'Complete the DC tests — string open-circuit voltage, short-circuit current, polarity and insulation resistance — then the AC tests to BS 7671: continuity, insulation resistance, polarity, earth fault loop impedance and RCD operation. Energise in the manufacturer sequence (DC then AC), confirm the inverter starts and produces to expectation, and verify the G98/G99 anti-islanding and protection settings. Record all results on the electrical installation certificate.',
      responsible: 'Qualified electrician',
      holdPoint: true,
    },
    {
      title: 'Notification and scheme registration',
      detail:
        'Submit the G98 notification (or confirm the approved G99 connection agreement) to the DNO within the required period. Register the installation with the MCS scheme and issue the MCS certificate to the client. Notify Building Control under Part P where applicable.',
      responsible: 'Office / lead engineer',
    },
  ],

  // ==========================================================================
  battery_storage: [
    {
      title: 'Confirm the installation location against PAS 63100 and the manufacturer instruction',
      detail:
        'Verify the agreed position meets the fire-separation, clearance and ventilation requirements of BS 7671, PAS 63100 and the manufacturer instruction: not in a protected escape route, not in a loft, and with a fire-rated barrier where it adjoins a habitable room. Confirm ambient temperature is within the operating range and that the wall or floor can carry the loaded weight. Do not proceed if the location does not comply — report back for a design review.',
      responsible: 'Lead engineer',
      holdPoint: true,
    },
    {
      title: 'Inspect batteries on delivery',
      detail:
        'Inspect every battery module for impact damage, casing deformation, swelling, heat or an electrolyte smell. Quarantine any suspect unit outside the building, away from combustibles, and return it unopened. Keep units in transit mode with breakers open. Store away from heat and out of direct sun until installation.',
      responsible: 'Install team',
      holdPoint: true,
    },
    {
      title: 'Mount the enclosure and battery modules',
      detail:
        'Fix the mounting bracket or floor stand to the manufacturer specification, verifying the substrate is adequate for the loaded weight. Offer the unit up using the lifting aid or bracket — never hand-held while fixing. Where the design allows, assemble the cabinet in situ and load modules individually. Maintain every specified clearance. Fit the fire-rated barrier where required.',
      responsible: 'Install team',
    },
    {
      title: 'DC interconnection between modules',
      detail:
        'Remove all metal jewellery and watches. Using insulated tools only, connect the module interconnects with terminals exposed one at a time and insulating caps refitted immediately. Confirm polarity with a meter at every connection. Torque every terminal to the manufacturer figure and paint-mark it. Treat the battery as permanently live throughout — it cannot be de-energised.',
      responsible: 'Qualified electrician',
      holdPoint: true,
    },
    {
      title: 'Install the hybrid or battery inverter and protection',
      detail:
        'Mount the inverter with the specified clearances. Install the battery DC isolator, the AC isolator and the emergency stop in the agreed, accessible positions. Where a CT or meter is used for self-consumption control, fit it on the correct conductor and confirm the direction. Install all labelling required by BS 7671, including dual-supply warnings at every relevant position.',
      responsible: 'Qualified electrician',
    },
    {
      title: 'AC connection and system integration',
      detail:
        'Carry out safe isolation to GS38 before any work at the consumer unit, isolating and locking off every source of supply — grid, PV, generator and the battery itself. Install the dedicated circuit and protective device. Where the system provides backup or EPS, install the changeover arrangement and the separate earth electrode where required. All work dead.',
      responsible: 'Qualified electrician',
      holdPoint: true,
    },
    {
      title: 'Commission the battery system',
      detail:
        'Complete the BS 7671 test schedule. Close the battery breakers in the manufacturer sequence and commission through the manufacturer software: verify BMS communications, cell voltages and balance, state of charge, temperature sensing and the charge and discharge limits. Test the emergency stop and confirm it isolates as intended. Verify the G98/G99 protection settings. Have a CO2 extinguisher and fire blanket to hand throughout.',
      responsible: 'Qualified electrician',
      holdPoint: true,
    },
    {
      title: 'Fire safety briefing and documentation',
      detail:
        'Brief the client specifically on lithium battery safety: never store combustibles against the unit, the meaning of any fault indication, how to shut the system down, and that in a fire they must evacuate, call 999 and state "lithium battery fire" rather than attempting to fight it. Record the battery location and chemistry on the handover pack for the fire service and submit the DNO notification.',
      responsible: 'Lead engineer',
      holdPoint: true,
    },
  ],

  // ==========================================================================
  ashp: [
    {
      title: 'Confirm siting, clearances and noise assessment',
      detail:
        'Confirm the outdoor unit position against the design: manufacturer clearances for airflow, no short-cycling against a wall, condensate fall available, and the MCS 020 noise assessment satisfied at the nearest assessment position for permitted development. Confirm the indoor plant space, cylinder position and floor loading. Check the room area against the minimum required for the refrigerant charge where an A2L gas is used.',
      responsible: 'Lead engineer',
      holdPoint: true,
    },
    {
      title: 'Install the base and set the outdoor unit',
      detail:
        'Lay the concrete base, ground stand or wall brackets, level and adequate for the unit weight and for wind loading. Move the unit on a stair climber or trolley using the manufacturer lifting points; minimum two-person lift, four for units over 100 kg. Set the unit on anti-vibration mounts. Install the condensate drain to a soakaway or gully with trace heating where the design requires it.',
      responsible: 'Install team',
    },
    {
      title: 'Install indoor plant, cylinder and buffer',
      detail:
        'Position the cylinder empty and fill in place — never move a filled cylinder. Confirm the floor can carry the filled weight. Install the buffer vessel, expansion vessel, pressure relief with a safe discharge route, and the magnetic filter. Protect the access route with floor coverings and corner guards.',
      responsible: 'Install team',
    },
    {
      title: 'Install hydronic pipework and insulation',
      detail:
        'Run the primary flow and return in the specified size, using press-fit or compression joints in preference to brazing. Where hot works are unavoidable, work under a hot works permit with a one-hour fire watch. Core drill the external wall using on-tool extraction after scanning for services, and make good and weatherproof the penetration. Insulate all external and unheated-space pipework to the required thickness with UV-resistant lagging.',
      responsible: 'Install team',
    },
    {
      title: 'Refrigerant connection (split systems only)',
      detail:
        'Refrigerant work is carried out only by an F-Gas Category I certified engineer. Flare or braze the connections to the manufacturer specification, pressure test with oxygen-free nitrogen, then evacuate to the specified vacuum and hold. Release the charge, add any additional charge for line length, and leak test. Record the charge, the test results and the engineer certificate number in the F-Gas log. Never vent refrigerant to atmosphere.',
      responsible: 'F-Gas engineer',
      holdPoint: true,
    },
    {
      title: 'Electrical supply and controls',
      detail:
        'Carry out safe isolation to GS38 at the board. Install the dedicated circuit, isolator adjacent to the outdoor unit, and any required RCD protection. Where the earthing arrangement is PME, install a separate earth electrode if the manufacturer or BS 7671 requires it for the outdoor unit. Wire the controls, sensors, immersion and any weather compensation. All work dead.',
      responsible: 'Qualified electrician',
      holdPoint: true,
    },
    {
      title: 'Fill, flush, treat and pressure test',
      detail:
        'Flush the system to BS 7593 to remove debris, dose with the specified inhibitor and, where the design requires it, glycol at the correct concentration. Handle glycol as a COSHH substance with gloves and eye protection. Pressure test the wet side and hold. Vent thoroughly and set the system pressure. Record the inhibitor concentration and the test result.',
      responsible: 'Install team',
    },
    {
      title: 'Commission, set flow temperatures and hand over',
      detail:
        'Commission to the manufacturer procedure and the MCS requirements. Set the weather compensation curve and the flow temperature to the design figure. Confirm the DHW cylinder reaches at least 60 degrees C on the weekly pasteurisation cycle for Legionella control, and that thermostatic mixing valves are set to prevent scalding. Balance the emitters. Record all commissioning data. Brief the client on operation, the pasteurisation cycle, and why the flow temperature should not be raised.',
      responsible: 'Lead engineer',
      holdPoint: true,
    },
  ],

  // ==========================================================================
  led_lighting: [
    {
      title: 'Agree working areas, hours and occupancy phasing',
      detail:
        'Confirm with the client which areas are to be worked, in what order, and during which hours. Where the premises remain occupied, phase the work so that live work is never adjacent to occupied space, or arrange out-of-hours access. Confirm emergency lighting requirements are maintained throughout the works — an area is never left without means of escape lighting.',
      responsible: 'Site supervisor',
      holdPoint: true,
    },
    {
      title: 'Survey existing fittings and identify hazards',
      detail:
        'Identify existing luminaire types, mounting method, ceiling construction and cable arrangement. In pre-2000 buildings check the asbestos register before disturbing ceiling tiles, voids or distribution board flash guards. Identify any fitting containing PCB capacitors or discharge lamps. Confirm circuit arrangements and which board serves each area.',
      responsible: 'Lead electrician',
      holdPoint: true,
    },
    {
      title: 'Isolate the lighting circuits',
      detail:
        'Carry out safe isolation to GS38 on each lighting circuit in turn: identify, isolate, lock off with a personal lock, prove the tester, test dead at the fitting, re-prove. Confirm with the client that the circuit being isolated does not serve critical or emergency equipment. Provide temporary task lighting so the area remains safely usable.',
      responsible: 'Lead electrician',
      holdPoint: true,
    },
    {
      title: 'Remove existing luminaires',
      detail:
        'Allow existing fittings to cool for at least 10 minutes before handling. Segregate the work area beneath with barriers. Remove lamps one at a time, keeping them horizontal, straight into a lamp coffin. Support each fitting with a second operative during disconnection so no one holds a load overhead alone. Make safe or terminate any redundant cable in an accessible enclosure. Segregate luminaires, lamps and control gear for WEEE disposal.',
      responsible: 'Install team',
    },
    {
      title: 'Install new LED luminaires and controls',
      detail:
        'Pre-assemble fittings at ground level so overhead time is limited to fixing and connection. Adjust platform height so the work is at chest-to-shoulder height and rotate operatives at least hourly. Fix to the ceiling structure — not to tile grid alone unless the fitting and grid are rated for it. Install presence detection, daylight dimming and emergency modules per the design. Confirm the emergency luminaires are on the correct unswitched supply.',
      responsible: 'Install team',
    },
    {
      title: 'Test, re-energise and prove emergency lighting',
      detail:
        'Complete the BS 7671 test schedule for the altered circuits: continuity, insulation resistance, polarity, earth fault loop impedance and RCD operation. Re-energise circuit by circuit and confirm correct switching, dimming and detection operation. Carry out and record the emergency lighting function test to BS 5266 and confirm the required duration. Issue a minor works or installation certificate as appropriate.',
      responsible: 'Lead electrician',
      holdPoint: true,
    },
    {
      title: 'Reinstate and record',
      detail:
        'Reinstate ceiling tiles, grid and any disturbed finishes. Update the lighting schedule and the emergency lighting log book. Record the lamp and luminaire disposal transfer notes. Confirm lux levels meet the design where the client requires verification.',
      responsible: 'Lead electrician',
    },
  ],

  // ==========================================================================
  small_wind: [
    {
      title: 'Confirm consents, wind data and exclusion zones',
      detail:
        'Confirm planning permission or permitted development is in place, that the DNO connection agreement (G98 or G99) is approved, and that the site wind assessment supports the turbine selection. Agree the exclusion zone — at least the full tower height plus 10% — with the landowner, and confirm livestock, public rights of way and overhead lines are addressed. No mobilisation without the consents on file.',
      responsible: 'Project manager',
      holdPoint: true,
    },
    {
      title: 'Excavate and cast the foundation',
      detail:
        'Scan and hand-dig trial holes to prove services before mechanical excavation. Excavate to the engineer design with battering, benching or trench support as the ground requires; no entry into an unsupported excavation over 1.2 m. Keep spoil and plant at least 1 m from the edge and fence the excavation. Fix the anchor cage to the design tolerance, cast the base and protect it. Fence and light the excavation outside working hours.',
      responsible: 'Groundworks team',
    },
    {
      title: 'Verify concrete strength before loading',
      detail:
        'Do not apply any load to the foundation until cube test results confirm the design strength has been reached. Record the results and the date. This is an absolute hold point.',
      responsible: 'Project manager',
      holdPoint: true,
    },
    {
      title: 'Assemble the tower and nacelle at ground level',
      detail:
        'Assemble tower sections, the nacelle and the fall-arrest rail system at ground level, following the manufacturer method statement. Torque all bolted connections to the specified figure and paint-mark them. Fit and lock the rotor brake. Inspect all lifting accessories and confirm they are within their LOLER thorough examination date.',
      responsible: 'Install team',
    },
    {
      title: 'Erect the tower',
      detail:
        'Work to the lift plan produced by the Appointed Person. Confirm ground bearing and set the crane or gin pole on spreader mats. Check wind speed at ground level — do not raise above 8 m/s or in rain, lightning or poor visibility. Clear the exclusion zone of everyone but the erection crew. Raise under the control of the banksman using tag lines; no hands on the load. Bolt down and torque the base connection.',
      responsible: 'Appointed Person / erection crew',
      holdPoint: true,
    },
    {
      title: 'Fit the rotor and complete mechanical works',
      detail:
        'With the rotor lock engaged and verified, and the turbine electrically isolated and proved dead, fit the blades and hub to the specified torque and balance. Tie the blades off to prevent windmilling until commissioning. Never place hands or body inside the rotor plane. Complete the tower-top mechanical checks using the fall-arrest system with two climbers and a trained ground rescue person.',
      responsible: 'Install team',
      holdPoint: true,
    },
    {
      title: 'Electrical installation and grid connection',
      detail:
        'Install the down-tower cabling, the turbine controller, the dump load or brake resistor where fitted, the isolators and the surge protection. Install the earth electrode array and bond the tower to the design. Carry out safe isolation at the point of connection and make the grid connection dead, to BS 7671 and the DNO agreement. Fit all dual-supply and warning labelling.',
      responsible: 'Qualified electrician',
      holdPoint: true,
    },
    {
      title: 'Commission and test the turbine',
      detail:
        'Complete the BS 7671 test schedule. Verify the G98/G99 protection settings, the anti-islanding function, the over-speed protection, the brake and the yaw. Release the rotor lock only when the exclusion zone is clear and everyone is accounted for. Run up in stages, monitoring vibration, noise and output against the expected curve. Test the emergency stop and confirm the turbine shuts down and brakes as designed. Record all results.',
      responsible: 'Lead engineer',
      holdPoint: true,
    },
  ],
};

export function methodStepsFor(
  technology: TechnologyId,
  _sector: Sector
): MethodStepTemplate[] {
  return [...OPENING, ...SEQUENCES[technology], ...CLOSING];
}
