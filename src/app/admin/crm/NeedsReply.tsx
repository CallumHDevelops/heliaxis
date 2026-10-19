'use client';

import Link from 'next/link';
import { StageChip, WaIcon } from './CrmUi';
import { agoShort, initials } from './crm-shared';
import { openDock, type ActiveChat } from './dock-link';

/**
 * Tablets and phones (no dock column there): the people waiting on a reply, top 5 (3 on a phone).
 * On a tablet a row opens the chat in the dock over the page; on a phone it opens the full-screen
 * chat. Hidden when WhatsApp chats aren't available to this person (or before the dock existed).
 */
export function NeedsReply({ rows, missing, now, canInbox }: { rows: ActiveChat[] | null; missing: boolean; now: number; canInbox: boolean }) {
  if (missing || !rows) return null;
  const waiting = rows.filter((r) => r.needsReply || r.unread > 0);
  const allHref = canInbox ? '/admin/enquiries/inbox' : '/admin/crm/chats';
  return (
    <section className="crmh-card crmh-needs" id="crmh-needs" aria-label="Needs reply">
      <div className="crmh-card__h">
        <span className="crmh-waic" aria-hidden="true">
          <WaIcon size={16} />
        </span>
        <h3>Needs reply</h3>
        {waiting.length > 0 && <span className="crmh-pill crmh-pill--wa">{waiting.length}</span>}
      </div>
      {waiting.length === 0 ? (
        <p className="crm-muted crmh-pad">All replied ✓</p>
      ) : (
        <ul className="crmh-chats">
          {waiting.slice(0, 5).map((r) => {
            const open = !!r.windowClosesAt && now > 0 && Date.parse(r.windowClosesAt) > now;
            const left = open ? Math.max(1, Math.round((Date.parse(r.windowClosesAt!) - now) / 3_600_000)) : 0;
            const preview = r.last ? `${r.last.direction === 'out' ? 'You: ' : ''}${r.last.body || (r.last.kind === 'image' ? 'Photo' : r.last.kind === 'document' ? 'Document' : 'Message')}` : '';
            return (
              <li key={r.threadId} className={r.unread > 0 ? 'is-unread' : ''}>
                <a
                  href={r.chatHref}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
                    if (openDock({ threadId: r.threadId, tab: 'chats' })) e.preventDefault();
                  }}
                >
                  <span className={`crmh-cav${r.unread > 0 ? ' ring' : ''}`} aria-hidden="true">
                    {initials(r.name)}
                  </span>
                  <span className="crmh-chat__b">
                    <span className="crmh-chat__h">
                      <b>{r.name}</b>
                      {r.project && <StageChip stage={r.project.stage} />}
                      <time>{r.last ? agoShort(r.last.at, now) : ''}</time>
                    </span>
                    <span className="crmh-chat__p">{preview}</span>
                    <span className="crmh-chat__f">
                      <span className={`crmh-win${open ? ' ok' : ''}`}>{open ? `Free reply · ${left}h left` : 'Template only'}</span>
                      <span className="crmh-ref">{r.project?.ref || r.customerRef || r.postcode || ''}</span>
                      {r.unread > 0 && <b className="crmh-unread">{r.unread}</b>}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href={allHref}
        className="crmh-cardlink"
        onClick={(e) => {
          if (openDock({ tab: 'chats' })) e.preventDefault();
        }}
      >
        All chats ({rows.length}) <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
