'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { addSignature } from '@/lib/site/eic-client';
import { DECLARATION, editionWords } from '@/lib/site/fixed/iet-eic';
import { editionOf, routeOf } from '@/lib/site/forms/electrician/eic-model';
import { getFile } from '@/lib/site/offline';
import { removePhoto, removeServerPhoto } from '@/lib/site/photo-queue';
import { shortDate } from '@/lib/site/client';
import type { CustomProps } from '../custom';
import type { SlotPhoto } from '../form-state';
import { useBlobUrl, useLive } from '../nav';

/** The declaration this signature is under, from the model form's wording (fixed/iet-eic.ts). */
function declarationFor(slot: string, route: string, amended: string): string[] {
  if (slot === 'eic_sig_con') return [DECLARATION.construction(amended)];
  if (slot === 'eic_sig_ins') return [DECLARATION.inspection(amended)];
  if (route === 'meiwc') return ['This signature goes on the Minor Works data sheet for each circuit you worked on.'];
  return DECLARATION.single ? [DECLARATION.single(amended)] : [DECLARATION.design(amended), DECLARATION.construction(amended), DECLARATION.inspection(amended)];
}

/**
 * A signature on the certificate (construction, inspection and testing, or the single one): the
 * declaration it goes under, the name it prints with, the pad, and Save. Kept with the photos, so it
 * waits for signal like they do; once saved it shows with its time, and Sign again replaces it.
 */
export function EicSign({ f, rec, jf, locked }: CustomProps) {
  const job = rec.id;
  const slot = f.key;
  const have = jf.photos[slot] ?? [];
  const [drawn, setDrawn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = typeof jf.ctx.values.eic_sig_name === 'string' ? (jf.ctx.values.eic_sig_name as string) : '';
  const words = declarationFor(slot, routeOf(jf.ctx), editionWords(editionOf(jf.ctx)));
  const current = have.at(-1);

  return (
    <div className="sa-eic-sign">
      {words.map((w) => (
        <p key={w.slice(0, 40)} className="sa-declaration sa-eic-decl">
          {w}
        </p>
      ))}
      {current ? (
        <div className="sa-eic-signed">
          <Signature p={current} />
          <p className="sa-hint-ok">
            Signed{name ? ` by ${name}` : ''} ✓ {current.local?.takenAt || current.server?.taken_at ? shortDate((current.local?.takenAt ?? current.server?.taken_at)!) : ''}
            {current.local?.full ? ' · waiting to send' : ''}
          </p>
          {!locked && (
            <button
              type="button"
              className="sa-link"
              onClick={async () => {
                for (const p of have) {
                  if (p.local) await removePhoto(p.local.client_id);
                  else await removeServerPhoto(job, p.id);
                }
              }}
            >
              Sign again
            </button>
          )}
        </div>
      ) : locked ? (
        <p className="sa-muted">Not signed.</p>
      ) : (
        <>
          <p className="sa-label">{name ? `Signing as ${name}` : 'Put your name above first, then sign here'}</p>
          <div className="sa-pad">
            <SignaturePad onChange={setDrawn} height={170} />
          </div>
          <button
            type="button"
            className="sa-btn sa-btn-1"
            disabled={!drawn || !name || busy}
            onClick={async () => {
              if (!drawn) return;
              setBusy(true);
              await addSignature(job, slot, drawn);
              setDrawn(null);
              setBusy(false);
            }}
          >
            {busy ? 'Saving…' : 'Save my signature'}
          </button>
        </>
      )}
    </div>
  );
}

function Signature({ p }: { p: SlotPhoto }) {
  const server = useLive(() => (p.server ? getFile(`thumb:${p.server.id}`) : Promise.resolve(undefined)), `thumb:${p.id}`);
  const url = useBlobUrl(p.local?.thumb ?? server?.blob ?? null) ?? p.server?.thumb ?? null;
  return (
    <div className="sa-eic-sigimg">
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob from the phone */}
      {url ? <img src={url} alt="Your signature" /> : <span className="sa-muted">Signature saved</span>}
    </div>
  );
}
