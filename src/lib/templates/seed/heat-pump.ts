/**
 * The heat pump paperwork, as templates in Heliaxis's own words: the commissioning record, the hot water
 * cylinder record and the handover certificate. Written for the heating engineer to complete on site, by
 * hand or on screen. The checks cover what the heat pump and its hot water cylinder need looking at; the
 * wording is ours.
 *
 * Provisional until the owner approves the codes (HX-HP-02 to HX-HP-04) and signs off the field lists in
 * the quality system. Nothing here claims that completing a form meets any standard: that is for the
 * people who sign the documents off.
 */
import type { DocTemplate, TemplateField } from '../types';

const text = (key: string, label: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'text', ...o });
const num = (key: string, label: string, unit: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'number', unit, ...o });
const yn = (key: string, label: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'yesno', ...o });
/** A yes/no with no N/A, as the SimpliHeat checklist asks it. */
const yb = (key: string, label: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'yesno', noNa: true, ...o });
const pick = (key: string, label: string, options: string[], o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'choice', options, ...o });
const day = (key: string, label: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'date', ...o });
const long = (key: string, label: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'long', ...o });

/** HX-HP-02: the heat pump's own commissioning record (the electrical supply record, HX-HP-01, is the electrician's). */
export const HEAT_PUMP_COMMISSIONING: DocTemplate = {
  schema: 1,
  code: 'HX-HP-02',
  title: 'Heat pump commissioning record',
  purpose: 'Completed on site by the heating engineer when the heat pump is commissioned.',
  intro: 'Complete this on site alongside the heat pump manufacturer’s own commissioning checklist. Write n/a where a check doesn’t apply to this system.',
  tech: ['heatpump'],
  sections: [
    {
      type: 'fields',
      title: 'The equipment',
      columns: 2,
      fields: [
        pick('hpType', 'Type of heat pump', ['Air source (ASHP)', 'Ground source (GSHP)', 'Water source', 'Exhaust air']),
        text('manufacturer', 'Manufacturer'),
        text('hpModel', 'Heat pump model'),
        text('hpSerial', 'Heat pump serial number'),
        text('indoorModel', 'Indoor unit model'),
        text('indoorSerial', 'Indoor unit serial number'),
        text('interfaceModel', 'Controller or interface model'),
        text('interfaceSerial', 'Controller or interface serial number'),
        yb('perInstructions', 'Installed as the manufacturer’s instructions require'),
      ],
    },
    {
      type: 'fields',
      title: 'Electrical checks before commissioning',
      columns: 2,
      fields: [
        pick('supplyPhase', 'Electrical supply', ['Single phase', 'Three phase']),
        text('visualCondition', 'Condition of the installation, by eye'),
        num('earthResistance', 'Insulation resistance, line to earth', 'MΩ'),
        num('shortCircuit', 'Insulation resistance, line to neutral', 'MΩ'),
        yb('sensorsChecked', 'Every sensor checked and reading correctly'),
        text('elecCertRef', 'Electrical certificate reference'),
        text('elecTestedBy', 'Electrical work tested by'),
        pick('elecNotify', 'How the electrical work was notified', ['Self-certified under a competent person scheme', 'Notified to building control', 'Not notifiable']),
        text('elecNotifyRef', 'Scheme or building control reference', { showWhen: { key: 'elecNotify', is: ['Self-certified under a competent person scheme', 'Notified to building control'] } }),
      ],
    },
    {
      type: 'fields',
      title: 'Supply voltage at the unit',
      intro: 'The last seven readings are for a three phase supply.',
      columns: 3,
      fields: [
        num('v_l1n', 'Line 1 to neutral', 'V'),
        num('v_l1e', 'Line 1 to earth', 'V'),
        num('v_ne', 'Neutral to earth', 'V'),
        num('v_l2n', 'Line 2 to neutral', 'V', { showWhen: { key: 'supplyPhase', is: 'Three phase' } }),
        num('v_l2e', 'Line 2 to earth', 'V', { showWhen: { key: 'supplyPhase', is: 'Three phase' } }),
        num('v_l1l2', 'Line 1 to line 2', 'V', { showWhen: { key: 'supplyPhase', is: 'Three phase' } }),
        num('v_l3n', 'Line 3 to neutral', 'V', { showWhen: { key: 'supplyPhase', is: 'Three phase' } }),
        num('v_l3e', 'Line 3 to earth', 'V', { showWhen: { key: 'supplyPhase', is: 'Three phase' } }),
        num('v_l1l3', 'Line 1 to line 3', 'V', { showWhen: { key: 'supplyPhase', is: 'Three phase' } }),
        num('v_l2l3', 'Line 2 to line 3', 'V', { showWhen: { key: 'supplyPhase', is: 'Three phase' } }),
      ],
    },
    {
      type: 'fields',
      title: 'Controller settings',
      columns: 2,
      fields: [
        pick('runningMode', 'Running mode', ['Auto', 'Manual', 'Eco']),
        num('compStart', 'Compressor start delay', 'min'),
        text('heatCurve', 'Heating curve setting'),
        text('collectorPump', 'Source or collector pump setting'),
        num('maxFlowTemp', 'Highest flow temperature', '°C'),
        num('maxAtOutdoor', 'Outdoor temperature at the highest flow', '°C'),
        num('minFlowTemp', 'Lowest flow temperature', '°C'),
        num('minAtOutdoor', 'Outdoor temperature at the lowest flow', '°C'),
        text('chPump', 'Heating pump setting'),
        num('heatStopTemp', 'Heating stops above an outdoor temperature of', '°C'),
        num('dhwStart', 'Hot water heating starts at', '°C'),
        num('dhwStop', 'Hot water heating stops at', '°C'),
        num('legionellaTemp', 'Legionella cycle temperature', '°C'),
        num('legionellaDays', 'Legionella cycle repeats every', 'days'),
        text('legionellaSource', 'Heat source used for the legionella cycle'),
      ],
    },
    {
      type: 'fields',
      title: 'Back-up and auxiliary heating',
      intro: 'If there is more than one back-up or auxiliary source, list each in the comments and say whether it runs bivalent or co-valent.',
      columns: 2,
      fields: [text('auxType', 'Type of auxiliary heating'), num('auxMaxPower', 'Highest auxiliary power', 'kW'), num('auxBivalentPoint', 'Auxiliary bivalent point', '°C'), num('auxHeatMeter', 'Auxiliary heat meter reading', 'kWh')],
    },
    {
      type: 'fields',
      title: 'Readings with the heat pump running',
      columns: 3,
      fields: [
        num('tOutdoor', 'Outdoor temperature', '°C'),
        num('tSourceIn', 'Source in', '°C'),
        num('tSourceOut', 'Source out', '°C'),
        num('tIndoor', 'Indoor temperature', '°C'),
        num('tFlow', 'Flow temperature', '°C'),
        num('tReturn', 'Return temperature', '°C'),
        num('tDischarge', 'Discharge temperature', '°C'),
        num('tSuction', 'Suction temperature', '°C'),
        num('dhwTemp', 'Hot water temperature', '°C'),
        num('hpHours', 'Heat pump running hours', 'h'),
        num('dhwHours', 'Hot water running hours', 'h'),
        num('auxHours', 'Auxiliary heater running hours', 'h'),
        num('kwhMeter1', 'Electricity meter 1', 'kWh'),
        num('kwhMeter2', 'Electricity meter 2', 'kWh'),
        num('heatMeter', 'Heat meter', 'MWh'),
        num('superheat', 'Superheat', 'K'),
        num('subcooling', 'Subcooling', 'K'),
        num('tevInlet', 'Expansion valve inlet', '°C'),
      ],
    },
    {
      type: 'fields',
      title: 'Outdoor unit and refrigerant (air source only)',
      // Until the type is chosen both show, as in SimpliHeat; then the one that applies (water source and exhaust air keep both).
      showWhen: { key: 'hpType', is: ['', 'Air source (ASHP)', 'Water source', 'Exhaust air'] },
      columns: 2,
      fields: [
        text('antifreezeType', 'Antifreeze make and type'),
        num('freezeProtection', 'Protected against freezing down to', '°C'),
        yb('antiVibration', 'Anti-vibration feet fitted where needed'),
        yb('condensateDrain', 'Condensate drains away properly'),
        yb('evaporatorClear', 'Evaporator is clear of debris'),
        yb('suitableBase', 'Unit stands on a suitable base or bracket'),
        yb('vapourSealed', 'Pipework insulated and vapour sealed'),
        yb('fgasCharged', 'Split system: evacuated and charged by an F-Gas registered operative'),
        text('refrigerantType', 'Refrigerant'),
        num('refrigerantCharge', 'Refrigerant charge', 'kg'),
      ],
    },
    {
      type: 'fields',
      title: 'Clear space round the outdoor unit (air source only)',
      // Until the type is chosen both show, as in SimpliHeat; then the one that applies (water source and exhaust air keep both).
      showWhen: { key: 'hpType', is: ['', 'Air source (ASHP)', 'Water source', 'Exhaust air'] },
      columns: 3,
      fields: [num('clearBack', 'Behind', 'mm'), num('clearFront', 'In front', 'mm'), num('clearLeft', 'Left', 'mm'), num('clearRight', 'Right', 'mm'), num('clearBelow', 'Below', 'mm')],
    },
    {
      type: 'fields',
      title: 'Ground collector (ground source only)',
      showWhen: { key: 'hpType', is: ['', 'Ground source (GSHP)', 'Water source', 'Exhaust air'] },
      columns: 2,
      fields: [
        text('collectorType', 'Type of ground collector'),
        num('headerDia', 'Header pipe diameter', 'mm'),
        num('loopCount', 'Number of loops or boreholes', ''),
        yb('pressureTested', 'Collector pressure tested'),
        num('collectorLength', 'Total collector length', 'm'),
        yb('collectorFlushed', 'Collector flushed and purged'),
        num('collectorDia', 'Collector pipe diameter', 'mm'),
        text('biocide', 'Biocide used'),
        num('headerLength', 'Total header length', 'm'),
        text('transferFluid', 'Heat transfer fluid make and type'),
        num('collectorFreeze', 'Fluid protects against freezing down to', '°C'),
        num('collectorEvCharge', 'Expansion vessel pre-charge', 'bar'),
        num('collectorPressure', 'Collector system pressure', 'bar'),
        yb('collectorSealed', 'Collector insulation is vapour sealed'),
        yb('collectorToDesign', 'Collector installed to the design'),
      ],
    },
    {
      type: 'fields',
      title: 'Heating circuit',
      columns: 2,
      fields: [
        text('emitterTypes', 'Types of emitter'),
        num('htgDeltaT', 'Temperature difference, flow to return', 'K'),
        num('systemPressure', 'System pressure', 'bar'),
        yb('strainersClear', 'Strainers and filters are clear'),
        num('evPreCharge', 'Expansion vessel pre-charge', 'bar'),
        yb('htgFlushed', 'Heating system flushed and cleaned'),
        num('srvSetting', 'Safety relief valve setting', 'bar'),
        text('htgCleaner', 'Cleaner used'),
        num('bufferVolume', 'Buffer vessel volume', 'L'),
        yb('htgTreated', 'Heating water treated'),
        text('circPumpSetting', 'Circulation pump setting'),
        text('inhibitor', 'Inhibitor or antifreeze used'),
        yb('htgPurged', 'System purged of air'),
        num('cylinderVolume', 'Hot water cylinder volume', 'L'),
        yb('g3Certificate', 'Unvented hot water (G3) commissioning certificate completed'),
        yb('installedToDesign', 'System installed as designed'),
        yb('emittersEven', 'Every emitter heats up evenly, with a similar temperature difference across flow and return'),
      ],
    },
    {
      type: 'fields',
      title: 'Controls',
      columns: 2,
      fields: [
        text('controlsType', 'Type of heating controls fitted'),
        pick('hpControl', 'Heat pump controls on', ['Demand', 'Degree minutes']),
        yb('controlsToDesign', 'Controls set up as designed'),
        pick('htgControlBy', 'Heating controlled by', ['Heat pump', 'Third party']),
        yb('controlsDemonstrated', 'Controls demonstrated and explained to the customer'),
        pick('dhwControlBy', 'Hot water controlled by', ['Heat pump', 'Third party']),
        yb('docsProvided', 'Customer given every handover document we have to provide'),
      ],
    },
    { type: 'fields', title: 'Comments', fields: [long('technicianComments', 'Anything else worth recording')] },
    {
      type: 'sign',
      title: 'Signed off',
      signers: [
        { key: 'technician', label: 'Commissioning engineer' },
        { key: 'customer', label: 'Customer' },
      ],
    },
  ],
};

/** HX-HP-03: the hot water cylinder that serves the heat pump. */
export const CYLINDER_COMMISSIONING: DocTemplate = {
  schema: 1,
  code: 'HX-HP-03',
  title: 'Hot water cylinder commissioning record',
  purpose: 'Completed on site for the hot water cylinder that serves the heat pump.',
  intro: 'Complete every part that applies to this cylinder. Leave the parts for other kinds of system blank.',
  tech: ['heatpump'],
  sections: [
    {
      type: 'fields',
      title: 'The cylinder',
      columns: 2,
      fields: [
        text('engineer', 'Commissioned by', { required: true }),
        day('commissioned_on', 'Date', { required: true }),
        text('cylinder_model', 'Cylinder make and model'),
        text('cylinder_serial', 'Cylinder serial number'),
        pick('cylinder_type', 'Type of cylinder', ['Unvented', 'Vented', 'Thermal store'], { required: true }),
      ],
    },
    {
      type: 'fields',
      title: 'Primary circuit (indirect heating only)',
      columns: 2,
      fields: [pick('primary_type', 'Primary circuit is', ['Sealed', 'Open vented']), num('primary_flow_max', 'Highest primary flow temperature', '°C')],
    },
    {
      type: 'fields',
      title: 'All systems',
      columns: 2,
      fields: [
        num('cold_pressure', 'Cold water pressure at the inlet, with no water running', 'bar'),
        yn('strainer_cleaned', 'Strainer cleaned of installation debris (if fitted)'),
        yn('hard_water', 'Hard water area (above 200 ppm)'),
        yn('scale_reducer', 'Water scale reducer fitted'),
        text('scale_reducer_type', 'If fitted, the type of scale reducer', { showWhen: { key: 'scale_reducer', is: 'yes' } }),
        num('hotwater_thermostat', 'Hot water thermostat set to', '°C'),
        num('hotwater_flow', 'Hot water flow rate at that setting, measured at the outlet with the highest flow', 'l/min'),
        yn('part_l_controls', 'Time and temperature controls fitted as Part L of the Building Regulations asks'),
        pick('control_system', 'Type of control system', ['Y plan', 'S plan', 'Other']),
        yn('renewable_compatible', 'Cylinder is compatible with solar or other renewable heat'),
        num('nearest_outlet', 'Hot water temperature at the nearest outlet', '°C'),
        yn('pipes_insulated', 'Pipes insulated for the first metre, or up to where they are concealed'),
      ],
    },
    {
      type: 'fields',
      title: 'Unvented cylinders only',
      showWhen: { key: 'cylinder_type', is: 'Unvented' },
      columns: 2,
      fields: [
        text('prv_location', 'Where the pressure reducing valve is, if there is one'),
        num('prv_setting', 'Pressure reducing valve setting', 'bar'),
        yn('relief_tested', 'Temperature and pressure relief valve and expansion valve fitted, and the discharge tested'),
        yn('tundish_ok', 'Tundish and discharge pipework connected and ended as Part G of the Building Regulations asks'),
        yn('cutout_fitted', 'Every energy source has a cut-out device'),
        yn('expansion_checked', 'Expansion vessel or internal air space checked'),
      ],
    },
    {
      type: 'fields',
      title: 'Thermal stores only',
      showWhen: { key: 'cylinder_type', is: 'Thermal store' },
      columns: 2,
      fields: [num('store_temp', 'Temperature the store can reach', '°C'), num('store_hotwater_max', 'Highest hot water temperature', '°C')],
    },
    {
      type: 'fields',
      title: 'All installations',
      fields: [
        yn('building_regs', 'The hot water system meets the Building Regulations that apply'),
        yn('per_instructions', 'Installed and commissioned as the manufacturer’s instructions require'),
        yn('controls_explained', 'Controls shown to the customer, who understood them'),
        yn('literature_left', 'Manufacturer’s literature explained and left with the customer'),
      ],
    },
    {
      type: 'sign',
      title: 'Signed off',
      signers: [
        { key: 'technician', label: 'Commissioning engineer' },
        { key: 'customer', label: 'Customer' },
      ],
    },
  ],
};

/** HX-HP-04: what the customer is handed when the heat pump is commissioned. */
export const HEAT_PUMP_HANDOVER: DocTemplate = {
  schema: 1,
  code: 'HX-HP-04',
  title: 'Heat pump handover certificate',
  purpose: 'Given to the customer when the heat pump is handed over: what was installed and who is responsible for it.',
  tech: ['heatpump'],
  sections: [
    { type: 'fields', title: 'Type of certificate', fields: [pick('verification', 'This certificate records', ['Initial verification', 'Periodic verification'], { required: true })] },
    {
      type: 'fields',
      title: 'The installation',
      columns: 2,
      fields: [
        text('installed_at', 'Installation address', { prefill: '{{address}}' }),
        text('client', 'Client', { prefill: '{{customer}}' }),
        day('tested_on', 'Date of test', { required: true }),
        num('design_flow_temp', 'Design flow temperature', '°C'),
        num('rated_capacity', 'System rated capacity', 'kW'),
        text('scop', 'Heat pump SCoP at that flow temperature'),
        num('space_heating_demand', 'Annual space heating demand', 'kWh'),
        num('hot_water_demand', 'Annual hot water demand', 'kWh'),
      ],
    },
    { type: 'fields', title: 'What was installed', fields: [long('description', 'The key components fitted')] },
    {
      type: 'text',
      title: 'Installer',
      body: '{{company}}\n{{company_address}}\n{{company_phone}} · {{company_email}}\nMCS certification number {{mcs_number}}\n\nMCS contact: {{mcs_contact}}',
    },
    {
      type: 'text',
      title: 'Declaration',
      body: 'I am, or we are, responsible for the design, construction, inspection and testing of the heat pump installation described in this certificate. I/we confirm that the work was designed, installed, inspected and tested as described here.\n\nOur responsibility is limited to the work described in this certificate.',
    },
    { type: 'fields', title: 'Next inspection', columns: 2, fields: [num('next_inspection', 'Next inspection recommended within', 'years'), text('responsible_names', 'Name of the person or people signing')] },
    {
      type: 'sign',
      title: 'Signed',
      signers: [
        { key: 'sign_1', label: 'Signature' },
        { key: 'sign_2', label: 'Second signature, if needed' },
      ],
    },
    { type: 'fields', title: 'Comments', fields: [long('comments', 'Anything the customer should know')] },
    {
      type: 'text',
      title: 'Looking after your heat pump',
      body: 'If you notice anything unusual, please contact us first. Looking after the system yourself is simple, and keeps it running efficiently.\n- Keep the area round and behind the outdoor unit clear, especially in autumn when leaves fall.\n- Trim back any plants growing close to the unit.\n- Listen for changes, such as more vibration or unusual noises.\n- Have the system serviced at least once a year by a suitably qualified person. This certificate records when its next inspection is due.',
    },
  ],
};

export const HEAT_PUMP_TEMPLATES: DocTemplate[] = [HEAT_PUMP_COMMISSIONING, CYLINDER_COMMISSIONING, HEAT_PUMP_HANDOVER];
