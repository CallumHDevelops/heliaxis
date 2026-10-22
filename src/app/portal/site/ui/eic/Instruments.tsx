'use client';

import { useState } from 'react';
import { setProp } from '@/lib/site/eic-client';
import { hasElectrode, INSTRUMENTS } from '@/lib/site/forms/electrician/eic-model';
import type { CustomProps } from '../custom';
import { ScanSheet } from '../ScanSheet';

/**
 * The test instruments (serial or asset numbers): the multi-functional tester first (it covers the
 * continuity, insulation, loop and RCD tests), the single testers behind "I used separate testers",
 * and the earth electrode tester when there's an electrode. Each one scans from its barcode, and the
 * ones from their last job are offered with one tap ("Your last job").
 */
export function EicInstruments({ f, rec, jf, locked }: CustomProps) {
  const job = rec.id;
  const v = (jf.ctx.values[f.key] ?? {}) as Record<string, string>;
  const last = jf.ctx.eic?.instruments ?? {};
  const separate = ['cont', 'ir', 'efli', 'rcd'];
  const [more, setMore] = useState(separate.some((k) => v[k]) || false);
  const [scanning, setScanning] = useState<string | null>(null);
  const shown = INSTRUMENTS.filter((i) => i.k === 'mft' || (more && separate.includes(i.k)) || (i.k === 'earth' && hasElectrode(jf.ctx)));
  const set = (k: string, value: string | undefined) => void setProp(job, f.key, k, value?.trim() ? value : undefined);
  return (
    <div className="sa-eic-inst">
      {shown.map((i) => (
        <div key={i.k} className="sa-eic-instrow">
          <label className="sa-label" htmlFor={`inst-${i.k}`}>
            {i.label}
          </label>
          {!v[i.k] && last[i.k] && !locked && (
            <button type="button" className="sa-suggest" onClick={() => set(i.k, last[i.k])}>
              <span className="sa-suggest-src">Your last job</span>
              <span className="sa-suggest-val">{last[i.k]}</span>
              <span className="sa-suggest-tick" aria-hidden="true">
                ✓
              </span>
              <span className="sa-sr">Use this</span>
            </button>
          )}
          <div className="sa-typeit">
            <input
              id={`inst-${i.k}`}
              className="sa-text"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="Make, model and serial"
              value={v[i.k] ?? ''}
              disabled={locked}
              onChange={(e) => set(i.k, e.target.value)}
            />
            {!locked && (
              <button type="button" className="sa-small" onClick={() => setScanning(i.k)}>
                Scan
              </button>
            )}
          </div>
        </div>
      ))}
      {!locked && !more && (
        <button type="button" className="sa-link" onClick={() => setMore(true)}>
          I used separate testers
        </button>
      )}
      {scanning && (
        <ScanSheet
          need={1}
          have={0}
          known={new Set()}
          onClose={() => setScanning(null)}
          onDone={(serials) => {
            if (serials[0]) set(scanning, [v[scanning], serials[0]].filter(Boolean).join(' · '));
            setScanning(null);
          }}
        />
      )}
    </div>
  );
}
