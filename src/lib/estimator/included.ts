/** What a quote includes, in words a customer understands. Pure: the results screen and the PDF both use it. Only things Heliaxis does; no warranty term is named unless it is set. */
export type IncludedArgs = {
  panels: number;
  inverter: string | null;
  batteryName: string | null;
  scaffolding: boolean;
  workmanshipYears: number;
  /** The package's own list from the admin: when it has lines, it is used as it is. */
  packageIncludes?: string[];
  /** The panel's make and model from the admin, when it is set. */
  panelModel?: string;
};

export function includedItems(a: IncludedArgs): string[] {
  const own = (a.packageIncludes ?? []).map((x) => x.trim()).filter(Boolean);
  if (own.length) return own;
  return [
    a.inverter ? `${a.inverter}` : 'GoodWe hybrid inverter',
    `${a.panels} ${a.panelModel ? `${a.panelModel} ` : ''}solar panels`,
    'Roof mounting system',
    ...(a.scaffolding ? ['Scaffolding'] : []),
    ...(a.batteryName ? [a.batteryName] : []),
    'All the electrical work',
    'Grid (DNO) application, handled for you',
    'MCS certificate and handover pack',
    'Monitoring app set-up',
    'Help setting up your tariff and Smart Export Guarantee',
    ...(a.workmanshipYears > 0 ? [`${a.workmanshipYears}-year workmanship warranty`] : []),
    'GoodWe manufacturer warranty',
  ];
}
