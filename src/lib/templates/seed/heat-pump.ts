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
      title: 'Who commissioned it',
      columns: 2,
      fields: [text('engineer', 'Commissioning engineer', { required: true }), day('commissioned_on', 'Date commissioned', { required: true }), text('engineer_phone', 'Engineer’s phone'), text('engineer_email', 'Engineer’s email')],
    },
    {
      type: 'fields',
      title: 'The equipment',
      columns: 2,
      fields: [
        pick('system_type', 'Type of heat pump', ['Air source', 'Ground source', 'Other'], { required: true }),
        text('manufacturer', 'Manufacturer'),
        text('hp_model', 'Heat pump model'),
        text('hp_serial', 'Heat pump serial number'),
        text('indoor_model', 'Indoor unit model'),
        text('indoor_serial', 'Indoor unit serial number'),
        text('controller_model', 'Controller or interface model'),
        text('controller_serial', 'Controller or interface serial number'),
        yn('to_instructions', 'Installed as the manufacturer’s instructions require'),
      ],
    },
    {
      type: 'fields',
      title: 'Electrical checks before commissioning',
      columns: 2,
      fields: [
        pick('supply_phase', 'Electrical supply', ['Single phase', 'Three phase']),
        text('visual_condition', 'Condition of the installation, by eye'),
        num('res_earth', 'Resistance, line to earth', 'Ω'),
        num('res_line_neutral', 'Resistance, line to neutral', 'Ω'),
        yn('sensors_ok', 'Every sensor checked and reading correctly'),
      ],
    },
    {
      type: 'fields',
      title: 'Supply voltage at the unit',
      intro: 'A single phase supply needs the first three readings. A three phase supply needs all of them.',
      columns: 3,
      fields: [
        num('v_l1_n', 'Line 1 to neutral', 'V'),
        num('v_l1_e', 'Line 1 to earth', 'V'),
        num('v_n_e', 'Neutral to earth', 'V'),
        num('v_l2_n', 'Line 2 to neutral', 'V'),
        num('v_l2_e', 'Line 2 to earth', 'V'),
        num('v_l1_l2', 'Line 1 to line 2', 'V'),
        num('v_l3_n', 'Line 3 to neutral', 'V'),
        num('v_l3_e', 'Line 3 to earth', 'V'),
        num('v_l1_l3', 'Line 1 to line 3', 'V'),
        num('v_l2_l3', 'Line 2 to line 3', 'V'),
      ],
    },
    {
      type: 'fields',
      title: 'Controller settings',
      columns: 2,
      fields: [
        pick('run_mode', 'Running mode', ['Auto', 'Manual', 'Eco']),
        num('compressor_start', 'Compressor start delay', 'min'),
        text('heat_curve', 'Heating curve setting'),
        text('source_pump', 'Source or collector pump setting'),
        num('flow_max', 'Highest flow temperature', '°C'),
        num('flow_max_outdoor', 'Outdoor temperature at the highest flow', '°C'),
        num('flow_min', 'Lowest flow temperature', '°C'),
        num('flow_min_outdoor', 'Outdoor temperature at the lowest flow', '°C'),
        text('heating_pump', 'Heating pump setting'),
        num('heating_stop', 'Heating stops above an outdoor temperature of', '°C'),
        num('hotwater_start', 'Hot water heating starts at', '°C'),
        num('hotwater_stop', 'Hot water heating stops at', '°C'),
        num('legionella_temp', 'Legionella cycle temperature', '°C'),
        num('legionella_days', 'Legionella cycle repeats every', 'days'),
        text('legionella_source', 'Heat source used for the legionella cycle'),
      ],
    },
    {
      type: 'fields',
      title: 'Back-up and auxiliary heating',
      intro: 'If there is more than one back-up or auxiliary source, list each in the comments and say whether it runs bivalent or co-valent.',
      columns: 2,
      fields: [text('aux_type', 'Type of auxiliary heating'), num('aux_power', 'Highest auxiliary power', 'kW'), num('aux_bivalent', 'Auxiliary bivalent point', '°C'), num('aux_meter', 'Auxiliary heat meter reading', 'kWh')],
    },
    {
      type: 'fields',
      title: 'Readings with the heat pump running',
      columns: 3,
      fields: [
        num('t_outdoor', 'Outdoor temperature', '°C'),
        num('t_source_in', 'Source in', '°C'),
        num('t_source_out', 'Source out', '°C'),
        num('t_indoor', 'Indoor temperature', '°C'),
        num('t_flow', 'Flow temperature', '°C'),
        num('t_return', 'Return temperature', '°C'),
        num('t_discharge', 'Discharge temperature', '°C'),
        num('t_suction', 'Suction temperature', '°C'),
        num('t_hotwater', 'Hot water temperature', '°C'),
        num('hours_hp', 'Heat pump running hours', 'h'),
        num('hours_hotwater', 'Hot water running hours', 'h'),
        num('hours_aux', 'Auxiliary heater running hours', 'h'),
        num('meter_1', 'Electricity meter 1', 'kWh'),
        num('meter_2', 'Electricity meter 2', 'kWh'),
        num('meter_heat', 'Heat meter', 'MWh'),
        num('superheat', 'Superheat', 'K'),
        num('subcooling', 'Subcooling', 'K'),
        num('tev_inlet', 'Expansion valve inlet', '°C'),
      ],
    },
    {
      type: 'fields',
      title: 'Outdoor unit and refrigerant',
      columns: 2,
      fields: [
        text('antifreeze', 'Antifreeze make and type'),
        num('freeze_protection', 'Protected against freezing down to', '°C'),
        yn('feet_fitted', 'Anti-vibration feet fitted where needed'),
        yn('condensate_ok', 'Condensate drains away properly'),
        yn('clearance_ok', 'Clear space round the unit is as it should be'),
        yn('evaporator_clear', 'Evaporator is clear of debris'),
        yn('base_ok', 'Unit stands on a suitable base or bracket'),
        yn('insulated_sealed', 'Pipework insulated and vapour sealed'),
        yn('fgas_charged', 'Split system: evacuated and charged by an F-Gas registered operative'),
        text('refrigerant', 'Refrigerant'),
        num('refrigerant_kg', 'Refrigerant charge', 'kg'),
      ],
    },
    {
      type: 'fields',
      title: 'Clear space round the outdoor unit',
      columns: 3,
      fields: [num('clear_back', 'Behind', 'mm'), num('clear_front', 'In front', 'mm'), num('clear_left', 'Left', 'mm'), num('clear_right', 'Right', 'mm'), num('clear_below', 'Below', 'mm')],
    },
    {
      type: 'fields',
      title: 'Ground collector (ground source only)',
      columns: 2,
      fields: [
        text('collector_type', 'Type of ground collector'),
        num('header_pipe_dia', 'Header pipe diameter', 'mm'),
        num('loops', 'Number of loops or boreholes', ''),
        yn('collector_pressure_tested', 'Collector pressure tested'),
        num('collector_length', 'Total collector length', 'm'),
        yn('collector_flushed', 'Collector flushed and purged'),
        num('collector_pipe_dia', 'Collector pipe diameter', 'mm'),
        text('biocide', 'Biocide used'),
        num('header_length', 'Total header length', 'm'),
        text('transfer_fluid', 'Heat transfer fluid make and type'),
        num('fluid_freeze', 'Fluid protects against freezing down to', '°C'),
        num('collector_ev_precharge', 'Expansion vessel pre-charge', 'bar'),
        num('collector_pressure', 'Collector system pressure', 'bar'),
        yn('collector_insulated', 'Collector insulation is vapour sealed'),
        yn('collector_to_design', 'Collector installed to the design'),
      ],
    },
    {
      type: 'fields',
      title: 'Heating circuit',
      columns: 2,
      fields: [
        text('emitters', 'Types of emitter'),
        num('heating_dt', 'Temperature difference, flow to return', 'K'),
        num('system_pressure', 'System pressure', 'bar'),
        yn('strainers_clear', 'Strainers and filters are clear'),
        num('ev_precharge', 'Expansion vessel pre-charge', 'bar'),
        yn('flushed', 'Heating system flushed and cleaned'),
        num('relief_setting', 'Safety relief valve setting', 'bar'),
        text('cleaner', 'Cleaner used'),
        num('buffer_litres', 'Buffer vessel volume', 'litres'),
        yn('water_treated', 'Heating water treated'),
        text('pump_setting', 'Circulation pump setting'),
        text('inhibitor', 'Inhibitor or antifreeze used'),
        yn('purged', 'System purged of air'),
        num('cylinder_litres', 'Hot water cylinder volume', 'litres'),
        yn('g3_certificate', 'Unvented hot water (G3) commissioning certificate completed'),
        yn('as_designed', 'System installed as designed'),
        yn('emitters_even', 'Every emitter heats up evenly, with a similar temperature difference across flow and return'),
      ],
    },
    {
      type: 'fields',
      title: 'Controls',
      columns: 2,
      fields: [
        text('control_type', 'Type of heating controls fitted'),
        pick('hp_control', 'Heat pump controls on', ['Demand', 'Degree minutes']),
        yn('controls_as_designed', 'Controls set up as designed'),
        pick('heating_control', 'Heating controlled by', ['Heat pump', 'Third party']),
        yn('controls_explained', 'Controls demonstrated and explained to the customer'),
        pick('hotwater_control', 'Hot water controlled by', ['Heat pump', 'Third party']),
        yn('documents_given', 'Customer given every handover document we have to provide'),
      ],
    },
    { type: 'fields', title: 'Comments', fields: [long('comments', 'Anything else worth recording')] },
    {
      type: 'sign',
      title: 'Signed off',
      signers: [
        { key: 'sign_engineer', label: 'Commissioning engineer' },
        { key: 'sign_customer', label: 'Customer' },
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
      fields: [text('engineer', 'Commissioned by', { required: true }), day('commissioned_on', 'Date', { required: true }), text('cylinder_model', 'Cylinder make and model'), text('cylinder_serial', 'Cylinder serial number')],
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
        { key: 'sign_engineer', label: 'Commissioning engineer' },
        { key: 'sign_customer', label: 'Customer' },
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
