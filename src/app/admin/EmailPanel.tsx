'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { HomeMail } from '@/lib/mail/server';

const PRIORITY: Record<string, string> = { urgent: 'Urgent', high: 'High' };

function ago(iso: string | null, now: number) {
  if (!iso || !now) return '';
  const h = Math.round((now - Date.parse(iso)) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/**
 * Dashboard → Email to reply (people with their mailbox connected, src/lib/mail): the most important few first, with
 * what each wants and whether a draft is ready. A row opens it on Email with the draft. Under it, who has gone
 * quiet and who's new.
 */
export function EmailPanel({ mail }: { mail: HomeMail }) {
  const [now] = useState(() => Date.now());
  const { counts, top } = mail;
  return (
    <section className="nu hub-mail" aria-labelledby="nu-mail-h">
      <div className="nu-head">
        <h2 id="nu-mail-h">Metis: email that needs you</h2>
        {counts.reply > 0 && <span className="nu-count">{counts.reply}</span>}
        {counts.urgent > 0 && <span className="nu-today">{counts.urgent} important</span>}
      </div>
      {top.length === 0 ? (
        <p className="nu-empty">{mail.reading ? 'Metis is going through your inbox for the first time. Emails that need you appear here as she goes.' : 'Nothing waiting on you.'}</p>
      ) : (
        <ul className="nu-list">
          {top.map((t) => {
            const who = t.who_name || t.rule?.label || t.who_address || 'Unknown';
            const draft = !!t.draft && !!t.draft_for && t.draft_for >= String(t.last_in_at ?? '');
            return (
              <li key={t.id} className="nu-item">
                <span className="nu-avatar" aria-hidden="true">
                  {(who.trim()[0] ?? '?').toUpperCase()}
                </span>
                <Link href={`/admin/mail?t=${t.id}`} className="nu-main">
                  <b>{who}</b>
                  <small>
                    {t.summary || t.subject || '(no subject)'} · {ago(t.last_in_at, now)}
                  </small>
                </Link>
                {t.priority && PRIORITY[t.priority] ? <span className={`nu-chip ${t.priority === 'urgent' ? 'is-late' : 'is-today'}`}>{PRIORITY[t.priority]}</span> : null}
                {t.prospect && !t.enquiry_id && <span className="nu-chip">New customer?</span>}
                {t.opportunity && !t.prospect && <span className="nu-chip">Opportunity</span>}
                <span className="nu-actions">
                  <Link className={`nu-btn${draft ? ' is-primary' : ''}`} href={`/admin/mail?t=${t.id}`}>
                    {t.action_only ? 'Open' : draft ? 'Check draft' : 'Reply'}
                  </Link>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="nu-foot">
        <Link href="/admin/mail" className="hub-more">
          {counts.reply > top.length ? `All ${counts.reply} that need you →` : 'Open email →'}
        </Link>
        {counts.waiting > 0 && (
          <Link href="/admin/mail?tab=waiting" className="hub-more">
            {counts.waiting} waiting on them →
          </Link>
        )}
        {counts.opps > 0 && (
          <Link href="/admin/mail?tab=opps" className="hub-more">
            {counts.opps} {counts.opps === 1 ? 'opportunity' : 'opportunities'} →
          </Link>
        )}
        {counts.people > 0 && (
          <Link href="/admin/mail?tab=people" className="hub-more">
            {counts.people} new {counts.people === 1 ? 'person' : 'people'} to add to the CRM →
          </Link>
        )}
      </div>
    </section>
  );
}

/** Dashboard, before the mailbox is connected (admins): one line to set it up. */
export function EmailConnect() {
  return (
    <section className="nu hub-mail" aria-labelledby="nu-mailc-h">
      <div className="nu-head">
        <h2 id="nu-mailc-h">Email</h2>
      </div>
      <p className="nu-empty">Connect your mailbox and the emails that need a reply appear here, most important first, each with a draft to check.</p>
      <div className="nu-foot">
        <Link href="/admin/mail" className="hub-more">
          Connect your email →
        </Link>
      </div>
    </section>
  );
}
