'use client';

import { kitLine, type SystemChoice } from '@/lib/estimator/choices';

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
const round = (n: number, step: number) => gbp(Math.round(n / step) * step);
const yrs = (n: number) => (Math.round(n * 2) / 2).toString().replace(/\.0$/, '');

/**
 * The systems side by side, straight under the roof: the same panels on each, with and without a battery. Each card names the kit, gives
 * one rounded price with the range under it (the survey fixes the price), the yearly saving and the payback. The chosen card carries the one
 * main button; the others offer to switch to them. A business sees its one system.
 */
export function SystemCards({ choices, chosen, home, panelModel, panelWatts, onChoose, onQuote }: { choices: SystemChoice[]; chosen: string; home: boolean; panelModel: string; panelWatts: number; onChoose: (c: SystemChoice) => void; onQuote: () => void }) {
  const one = choices.length === 1;
  const panels = choices[0]?.e.panels ?? 0;
  return (
    <section className="est-v4-sys" aria-labelledby="est-sys-h">
      <div className="est-v4-sys__head">
        <h2 id="est-sys-h">{one ? 'Your system' : 'Choose your system'}</h2>
        <p>{one ? `${panels} panels, sized from your answers.` : `The same ${panels} panels on each, with or without a battery.`} {home ? 'Fitted prices, 0% VAT.' : 'Fitted prices, plus VAT.'}</p>
      </div>
      <div className={`est-v4-sys__grid n${Math.min(choices.length, 4)}`}>
        {choices.map((c) => {
          const on = c.key === chosen;
          return (
            <article key={c.key} className={`est-v4-sys__card${on ? ' is-on' : ''}${c.pick ? ' is-pick' : ''}`} aria-current={on ? 'true' : undefined}>
              <div className="est-v4-sys__tags">
                {c.pick && <span className="est-v4-sys__pick">Our pick · most saved over 25 years</span>}
                {on && !one && <span className="est-v4-sys__on">Showing</span>}
              </div>
              <h3>{c.title}</h3>
              <p className="est-v4-sys__kit">{kitLine(c, panelModel, panelWatts)}</p>
              <dl className="est-v4-sys__figs">
                <div className="price">
                  <dt>Fitted price</dt>
                  <dd>
                    <b>{round(c.e.cost, 50)}</b>
                    <small>
                      {round(c.e.costLow, 50)} to {round(c.e.costHigh, 50)} until surveyed
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Saves a year</dt>
                  <dd>
                    <b>about {round(c.e.saving, 10)}</b>
                  </dd>
                </div>
                <div>
                  <dt>Pays for itself</dt>
                  <dd>
                    <b>about {yrs(c.e.paybackYears)} years</b>
                  </dd>
                </div>
              </dl>
              {on ? (
                <button type="button" className="btn btn-solar est-v4-sys__btn" onClick={onQuote}>
                  Send me this quote
                </button>
              ) : (
                <button type="button" className="btn est-btn-ghost est-v4-sys__btn" onClick={() => onChoose(c)}>
                  Show me this one
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
