/**
 * The job strip (MARKET idea 12): who has done what on site, in order, so everyone can see it:
 * Scaffold up ✓ (tagged) → Roof ✓ → Electrics in progress → Handover. Shown on the Site tab and at
 * the top of every trade's job pack. Pure, so both sides draw it the same.
 */

export type StripState = 'done' | 'now' | 'todo' | 'warn';
export type StripStep = { key: 'scaffold' | 'roof' | 'electrics' | 'handover'; label: string; state: StripState };

/** A trade's progress as the strip needs it: its status, and for the scaffold whether it was tagged and is down. */
export type StripTrade = { status: string; tagged?: boolean | null; struck?: boolean };

const progressed = (s: string) => s === 'started' || s === 'opened';
const finished = (s: string) => s === 'signed' || s === 'done';
const live = (list: StripTrade[]) => list.filter((t) => t.status !== 'cancelled');

/** Every live one finished: done; any of them under way: in progress; else still to do. */
function stateOf(list: StripTrade[]): StripState {
  if (list.every((t) => finished(t.status))) return 'done';
  return list.some((t) => progressed(t.status) || finished(t.status)) ? 'now' : 'todo';
}

export function jobStrip(j: {
  scaffold: StripTrade[];
  roof: StripTrade[];
  electrics: StripTrade[];
  scaffold_up_on?: string | null;
  handover_at?: string | null;
}): StripStep[] {
  const steps: StripStep[] = [];
  const scaffolds = live(j.scaffold);
  const up = scaffolds.find((t) => finished(t.status));
  if (up?.struck) steps.push({ key: 'scaffold', label: 'Scaffold down ✓', state: 'done' });
  else if (up) {
    steps.push(up.tagged === false ? { key: 'scaffold', label: 'Scaffold up · needs tagging', state: 'warn' } : { key: 'scaffold', label: 'Scaffold up ✓ (tagged)', state: 'done' });
  } else if (scaffolds.length) {
    const going = scaffolds.some((t) => progressed(t.status));
    steps.push({ key: 'scaffold', label: going ? 'Scaffold going up' : 'Scaffold', state: going ? 'now' : 'todo' });
  } else if (j.scaffold_up_on) steps.push({ key: 'scaffold', label: 'Scaffold booked', state: 'todo' });

  const trade = (key: 'roof' | 'electrics', word: string, list: StripTrade[]) => {
    const l = live(list);
    if (!l.length) return;
    const state = stateOf(l);
    steps.push({ key, label: state === 'done' ? `${word} ✓` : state === 'now' ? `${word} in progress` : word, state });
  };
  trade('roof', 'Roof', j.roof);
  trade('electrics', 'Electrics', j.electrics);
  steps.push(j.handover_at ? { key: 'handover', label: 'Handover ✓', state: 'done' } : { key: 'handover', label: 'Handover', state: 'todo' });
  return steps;
}
