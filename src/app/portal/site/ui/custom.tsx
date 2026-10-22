'use client';

import type { Field } from '@/lib/site/forms/types';
import type { PackRecord } from '@/lib/site/offline';
import { EicBoards } from './eic/Boards';
import { EicInstruments } from './eic/Instruments';
import { EicSign } from './eic/Sign';
import { EicSources } from './eic/Sources';
import type { JobForms } from './form-state';
import '../eic.css';

/**
 * Fields drawn by their own widget (type CUSTOM): which widget is the field's `widget`. The EIC's
 * boards and circuits, its other sources of supply, its test instruments and its signatures.
 */
export function CustomField({ f, rec, jf, locked }: { f: Field; rec: PackRecord; jf: JobForms; locked: boolean }) {
  switch (f.widget) {
    case 'eic-boards':
      return <EicBoards f={f} rec={rec} jf={jf} locked={locked} />;
    case 'eic-sources':
      return <EicSources f={f} rec={rec} jf={jf} locked={locked} />;
    case 'eic-instruments':
      return <EicInstruments f={f} rec={rec} jf={jf} locked={locked} />;
    case 'eic-sign':
      return <EicSign f={f} rec={rec} jf={jf} locked={locked} />;
    default:
      return null;
  }
}

export type CustomProps = { f: Field; rec: PackRecord; jf: JobForms; locked: boolean };
