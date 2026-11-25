/**
 * The systems a visitor can compare on the results: for a home, solar on its own and solar with each battery on offer, all with the same
 * panels; for a business, just its system. One is marked as our pick: the most money saved over 25 years after paying for it. Pure: the
 * results screen and the tests use it.
 */
import { estimate, type Estimate, type EstimatorSettings, type Inputs } from './calc';

export type SystemChoice = {
  key: string;
  title: string;
  /** The battery's name, or what the system is for a solar-only choice. */
  sub: string;
  battery: boolean;
  kwh: number;
  /** The battery's own name from the admin, or null with no battery. */
  batteryName: string | null;
  e: Estimate;
  /** Ours to suggest: the most saved over 25 years. Only ever set when there is more than one choice. */
  pick: boolean;
};

export function systemChoices(inputs: Inputs, settings: EstimatorSettings): SystemChoice[] {
  if (inputs.who !== 'home') {
    const e = estimate(inputs, settings);
    const batteryName = e.batteryKwh ? `${e.batteryKwh} kWh battery` : null;
    return [{ key: 'own', title: 'Your system', sub: batteryName ? 'Solar with a battery' : 'Solar panels and inverter', battery: e.batteryKwh > 0, kwh: e.batteryKwh, batteryName, e, pick: false }];
  }
  const list: SystemChoice[] = [
    { key: 'none', title: 'Solar only', sub: 'Panels and inverter', battery: false, kwh: 0, batteryName: null, e: estimate({ ...inputs, battery: false, batteryKwh: undefined }, settings), pick: false },
    ...settings.batteries
      .filter((b) => b.active)
      .map((b) => ({
        key: String(b.kwh),
        title: `Solar + ${b.kwh} kWh battery`,
        sub: b.name,
        battery: true,
        kwh: b.kwh,
        batteryName: b.name,
        e: estimate({ ...inputs, battery: true, batteryKwh: b.kwh }, settings),
        pick: false,
      })),
  ];
  if (list.length > 1) {
    // The most saved over 25 years; on a tie, the cheaper one.
    const best = list.reduce((a, c) => (c.e.net25 > a.e.net25 + 1 || (Math.abs(c.e.net25 - a.e.net25) <= 1 && c.e.cost < a.e.cost) ? c : a));
    best.pick = true;
  }
  return list;
}

/** Which choice the current answers are showing. */
export function chosenKey(inputs: Inputs, r: Estimate, choices: SystemChoice[]): string {
  if (choices.length === 1) return choices[0].key;
  if (!inputs.battery) return 'none';
  return choices.find((c) => c.battery && Math.abs(c.kwh - r.batteryKwh) < 0.01)?.key ?? 'none';
}

/** "11 × Aiko Neostar 450 W · GoodWe 5 kW hybrid · GoodWe 5 kWh battery": the kit in one line, from what the admin has named. */
export function kitLine(c: { e: Estimate; batteryName: string | null }, panelModel: string, panelWatts: number): string {
  return [`${c.e.panels} × ${panelModel || `${panelWatts} W panels`}`, c.e.inverter, c.batteryName].filter(Boolean).join(' · ');
}
