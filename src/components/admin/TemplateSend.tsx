'use client';

import { useEffect, useState } from 'react';
import {
  blankLabel,
  categoryLabel,
  FIELDS,
  readyMade,
  type FieldKey,
  type WaTemplate,
} from '@/lib/whatsapp/templates-shared';
import './wa-template.css';

/**
 * Sending an approved template from a chat or an opportunity (ChatThread, ProjectView): the
 * picker, the WhatsApp-style preview, and a labelled box per blank, pre-filled from what the CRM
 * knows (WhatsApp templates saves which field fills which blank). Everything stays editable.
 */

export type Values = Partial<Record<FieldKey, string>>;
export type TemplatePick = { name: string; lang: string; params: string[] };

/** What each blank is for. Templates nobody has described keep the old guess: {{1}} = first name. */
export function blankLabels(t: WaTemplate): string[] {
  return Array.from({ length: t.params }, (_, i) => {
    const b = t.blanks?.[i];
    if (b) return blankLabel(b);
    return !t.blanks && i === 0 ? FIELDS.first_name.label : `Blank ${i + 1}`;
  });
}

/** A template's blanks filled from the customer's details, as far as they go (the rest left for typing). */
export function prefill(t: WaTemplate, values: Values): string[] {
  return Array.from({ length: t.params }, (_, i) => {
    if (!t.blanks) return i === 0 ? values.first_name || '' : '';
    const b = t.blanks[i];
    return b && b.field !== 'custom' ? values[b.field] || '' : '';
  });
}

export const templateTitle = (t: { name: string; category: string }) =>
  `${readyMade(t.name)?.title ?? t.name.replace(/_/g, ' ')}${t.category ? ` · ${categoryLabel(t.category)}` : ''}`;

/** Loads the approved templates once `enabled`, and picks `preferred` (else the first). */
export function useTemplateSend(enquiryId: string, enabled: boolean, preferred?: string | null) {
  const [data, setData] = useState<{ items: WaTemplate[]; values: Values } | null>(null);
  const [pick, setPick] = useState<TemplatePick | null>(null);

  useEffect(() => {
    if (!enabled || data) return;
    let live = true;
    fetch(`/api/whatsapp/templates?enquiry=${encodeURIComponent(enquiryId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        const items: WaTemplate[] = d.items || [];
        const values: Values = d.values || {};
        setData({ items, values });
        const t = items.find((x) => x.name === preferred) || items[0];
        if (t) setPick({ name: t.name, lang: t.language, params: prefill(t, values) });
      })
      .catch(() => live && setData({ items: [], values: {} }));
    return () => {
      live = false;
    };
  }, [enabled, data, enquiryId, preferred]);

  const selected = data?.items.find((t) => t.name === pick?.name && t.language === pick?.lang) ?? null;
  return {
    templates: data?.items ?? null,
    /** The customer's details the blanks are filled from. */
    values: data?.values ?? null,
    pick,
    selected,
    choose(key: string) {
      const t = data?.items.find((x) => `${x.name}|${x.language}` === key);
      if (t && data) setPick({ name: t.name, lang: t.language, params: prefill(t, data.values) });
    },
    setParam(i: number, v: string) {
      setPick((p) => p && { ...p, params: p.params.map((x, j) => (j === i ? v : x)) });
    },
    ready: !!pick && pick.params.every((x) => x.trim()),
  };
}

/** A WhatsApp message bubble with the template's blanks filled in (or saying what goes there). */
export function WaTemplatePreview({
  header,
  body,
  footer,
  buttons = [],
  values = [],
  labels = [],
  compact = false,
}: {
  header?: string | null;
  body: string;
  footer?: string | null;
  buttons?: string[];
  values?: string[];
  labels?: string[];
  /** Smaller, with the quick replies in a row: for the send boxes, which share the screen with the chat. */
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'wap wap--compact' : 'wap'}>
      <div className="wap-msg">
        <div className="wap-bubble">
          {header && <b className="wap-header">{header}</b>}
          <p className="wap-body">
            {body.split(/(\{\{\d+\}\})/).map((part, i) => {
              const n = Number(part.match(/^\{\{(\d+)\}\}$/)?.[1] || 0) - 1;
              if (n < 0) return part;
              const v = values[n]?.trim();
              return v ? (
                <span key={i}>{v}</span>
              ) : (
                <span key={i} className="wap-blank">
                  {labels[n] || `blank ${n + 1}`}
                </span>
              );
            })}
          </p>
          {footer && <span className="wap-footer">{footer}</span>}
          <span className="wap-time">now</span>
        </div>
        {buttons.length > 0 && (
          <div className="wap-buttons">
            {buttons.map((b) => (
              <span key={b} className="wap-button">
                ↩ {b}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The picker, the preview and one box per blank. `inputClass` matches the page (wa-input / crm-input). */
export function TemplateSendFields({
  send,
  inputClass,
}: {
  send: ReturnType<typeof useTemplateSend>;
  inputClass: string;
}) {
  const { templates, pick, selected } = send;
  if (!templates || !pick) return null;
  const labels = selected ? blankLabels(selected) : [];
  return (
    <>
      <select className={inputClass} value={`${pick.name}|${pick.lang}`} onChange={(e) => send.choose(e.target.value)} aria-label="Template">
        {templates.map((t) => (
          <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
            {templateTitle(t)}
          </option>
        ))}
      </select>
      {selected?.body && (
        <div className="wts-preview">
          <WaTemplatePreview
            header={selected.header}
            body={selected.body}
            footer={selected.footer}
            buttons={selected.buttons}
            values={pick.params}
            labels={labels}
            compact
          />
        </div>
      )}
      {pick.params.map((p, i) => {
        const b = selected?.blanks?.[i];
        const example = b && b.field !== 'custom' ? FIELDS[b.field].example : '';
        return (
          <label key={i} className="wts-field">
            <span className="wts-label">
              {labels[i] || `Blank ${i + 1}`}
              {b && b.field !== 'custom' && !p && <small>{FIELDS[b.field].help}</small>}
            </span>
            <input className={inputClass} value={p} placeholder={example ? `e.g. ${example}` : ''} onChange={(e) => send.setParam(i, e.target.value)} />
          </label>
        );
      })}
    </>
  );
}
