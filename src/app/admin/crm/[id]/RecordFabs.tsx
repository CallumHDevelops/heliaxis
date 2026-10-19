'use client';

import { WaIcon } from '../CrmUi';

/**
 * The record page's floating buttons (Callum's ask): the green WhatsApp button directly above the
 * yellow +, centred on each other with a 12px gap, at every size. From 1280px they sit at the bottom
 * of the centre column; below that, fixed to the bottom right (clear of the dock's strip and, on
 * phones, the tab bar). CSS places them; the page decides what WhatsApp does.
 */
export function RecordFabs({ unread, name, onWhatsApp, onAdd }: { unread: number; name: string; onWhatsApp: () => void; onAdd: () => void }) {
  return (
    <div className="crm-fabs crmr-fabs">
      <div className="crmr-fabs__stack">
        <button
          type="button"
          className="crmr-fab crmr-fab--wa"
          onClick={onWhatsApp}
          aria-label={`WhatsApp ${name}${unread ? `, ${unread} unread` : ''}`}
          title={`WhatsApp ${name}`}
        >
          <WaIcon size={26} />
          {unread > 0 && <b className="crmr-fab__badge">{unread > 99 ? '99+' : unread}</b>}
        </button>
        <button type="button" className="crmr-fab crmr-fab--add" onClick={onAdd} aria-label={`Add to ${name}`} aria-haspopup="dialog" title="Add a task, note, call, photo…">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );
}
