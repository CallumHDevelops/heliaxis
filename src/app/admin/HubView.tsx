import Link from 'next/link';
import type { Portal, PortalKey } from '@/lib/portals';
import { TodayList } from './HubMyDay';
import { MetaLeadsPanel, TodoPanel } from './DashPanels';
import { MetisIcon } from '@/components/admin/MetisIcon';
import { FromClaude, type FromClaudeProps } from '@/components/admin/FromClaude';
import { HubSearch } from '@/components/admin/GlobalSearch';
import type { HubMetaLeads as MetaLeads } from './meta-leads';
import './hub.css';

export type HubTask = { id: string; title: string; due_date: string | null; priority: string };
export type HubFollowUp = { id: string; title: string; next_step: string | null; next_step_at: string | null };
/** One line of Home → Today: a survey, an install day or one of my diary entries (times already in UK time). */
export type HubTodayItem = {
  key: string;
  kind: 'survey' | 'install' | 'diary';
  /** The tag's word when it isn't the kind's (a home visit on a job that needs no survey). */
  tag?: string;
  /** Sort order (epoch ms; all-day items 0, first). */
  sort: number;
  time: string;
  title: string;
  sub: string;
  href: string | null;
  /** Start survey / Continue / Report (plain links: survey pages work offline). */
  action: { href: string; label: string } | null;
  directions: string | null;
};
export type HubToday = { items: HubTodayItem[]; canAddDiary: boolean };

const ICONS: Record<PortalKey | 'users' | 'app', string> = {
  app: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  cms: '<path d="M4 5h16v14H4z"/><path d="M4 9h16M8 13h5M8 16h8"/>',
  branding: '<path d="M12 3.2a8.8 8.8 0 1 0 .9 17.5c1-.1 1.4-1.3.7-2a1.4 1.4 0 0 1 1-2.4H17a3.8 3.8 0 0 0 3.8-3.8C20.8 6.5 16.9 3.2 12 3.2Z"/><circle cx="7.6" cy="11.4" r="1.05" fill="currentColor" stroke="none"/><circle cx="9.7" cy="7.4" r="1.05" fill="currentColor" stroke="none"/><circle cx="14.4" cy="7.4" r="1.05" fill="currentColor" stroke="none"/>',
  design: '<path d="M4.5 19.5 8 18.8 18.2 8.6a2.2 2.2 0 0 0-3.1-3.1L4.9 15.7z"/><path d="m13.5 6.5 3.1 3.1"/><path d="M4.9 15.7 8 18.8"/>',
  tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"/>',
  enquiries: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
  crm: '<path d="M3 7h18v12H3z"/><path d="M8 7V5h8v2"/><path d="M3 12h18"/><path d="M11 12v2h2v-2"/>',
  analytics: '<path d="M5 19V10M10 19V5M15 19v-6M20 19v-9"/>',
  subcontractors: '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="m15.5 10.5 2 2 3.5-4"/>',
  social: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><circle cx="16.8" cy="7.2" r=".6" fill="currentColor"/>',
  social_monitoring: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10h7M8.5 13h4"/>',
  team: '<circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><path d="M3 19c0-2.8 2.2-4.8 5-4.8s5 2 5 4.8"/><path d="M11 19c0-2.8 2.2-4.8 5-4.8s5 2 5 4.8"/>',
  rams: '<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M21 19c0-2.2-1.5-3.8-4-4.2"/>',
};

function Icon({ k }: { k: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[k] }}
    />
  );
}

export type HubPortal = Portal & { badge?: string };

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.5-4.3A8.5 8.5 0 1 1 20.5 11.6z" />
      <path d="M9 9.5c.3 1.8 1.7 3.6 3.6 4.4l1.2-1 1.7.8-.4 1.3c-2.9.3-6.4-2.8-6.6-5.8l1.3-.4.8 1.7z" />
    </svg>
  );
}

/** The /admin landing page: every portal this user can open, grouped, with "needs you" counts. */
export function HubView({
  firstName,
  portals,
  usersBadge,
  denied,
  tasks = [],
  followUps = [],
  needs = {},
  today: todayIso = '',
  todayList = null,
  setup = { todos: [] },
  assistant = false,
  metaLeads = null,
  search = false,
}: {
  firstName: string;
  portals: HubPortal[];
  /** undefined = not an admin (no Users card); null = admin with nothing pending. */
  usersBadge?: string | null;
  denied: boolean;
  tasks?: HubTask[];
  followUps?: HubFollowUp[];
  needs?: Partial<Record<string, { n: number; detail: string }>>;
  today?: string;
  /** Home → Today (CRM users, once surveys.sql has run); null hides it. */
  todayList?: HubToday | null;
  /** Setup jobs Claude has left (they tick themselves off): admins', or ones passed to this person. */
  setup?: FromClaudeProps;
  /** Show the "Talk to Metis" bar. */
  assistant?: boolean;
  /** New Meta leads (Enquiries and CRM staff); null hides it. */
  metaLeads?: MetaLeads | null;
  /** The search box under the greeting (Enquiries and CRM staff). */
  search?: boolean;
}) {
  const isAdmin = usersBadge !== undefined;
  // One even row per area that needs someone: icon, name, a big number.
  const ORDER: { key: string; label: string; href: string; icon: keyof typeof ICONS | 'whatsapp' | 'metis' }[] = [
    { key: 'whatsapp', label: 'WhatsApp', href: '/admin/enquiries/inbox', icon: 'whatsapp' },
    { key: 'crm', label: 'CRM', href: '/admin/crm', icon: 'crm' },
    { key: 'drafts', label: 'Drafts', href: '/admin/assistant', icon: 'metis' },
    { key: 'tasks', label: 'Tasks', href: '/admin/tasks', icon: 'tasks' },
    { key: 'enquiries', label: 'Enquiries', href: '/admin/enquiries', icon: 'enquiries' },
    { key: 'subcontractors', label: 'Subcontractors', href: '/admin/subcontractors', icon: 'subcontractors' },
    { key: 'users', label: 'Users', href: '/admin/users', icon: 'users' },
  ];
  const attention = ORDER.filter((o) => needs[o.key]?.n).map((o) => ({ ...o, ...needs[o.key]! }));
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/London',
  });

  return (
    <div className="hub">
      <header className="hub-head">
        <div>
          <p className="hub-kicker">{today}</p>
          <h1>{firstName ? `Hi ${firstName}` : 'Dashboard'}</h1>
          <p className="hub-sub">Everything you have access to, in one place.</p>
        </div>
        <a className="hub-live" href="/" target="_blank" rel="noopener noreferrer">View live site ↗</a>
      </header>

      {search && <HubSearch />}

      {denied && (
        <p className="hub-banner">You don&apos;t have access to that area. Ask an admin to add it to your account.</p>
      )}

      {attention.length > 0 && (
        <section className="hub-needs hub-strip hx-moment" aria-label="Needs your attention">
          <h2 className="hub-needs-h">Needs you</h2>
          <ul>
            {attention.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="hub-need">
                  <span className="hub-need-icon">
                    {a.icon === 'whatsapp' ? <WaIcon /> : a.icon === 'metis' ? <MetisIcon size={38} className="hub-need-metis" /> : <Icon k={a.icon} />}
                  </span>
                  <span className="hub-need-n">{a.n}</span>
                  <span className="hub-need-main">
                    <b>{a.label}</b>
                    <small>{a.detail}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="hub-work">
        {metaLeads && <MetaLeadsPanel leads={metaLeads} />}
        <div className="hub-work-side">
          {todayList && todayList.items.length > 0 && <TodayList today={todayList} />}
          <TodoPanel tasks={tasks} followUps={followUps} today={todayIso} />
        </div>
      </div>

      {assistant && (
        <Link href="/admin/assistant" className="hub-claude">
          <MetisIcon size={42} className="hub-claude-mark" />
          <span className="hub-claude-main">
            <b>Talk to Metis</b>
            <small>Just finished a meeting? Say what happened — notes, tasks and drafts done for you.</small>
          </span>
          <span className="hub-claude-mic" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          </span>
        </Link>
      )}

      <FromClaude {...setup} />

      {portals.length === 0 && !isAdmin && (
        <p className="hub-banner">No portals have been added to your account yet. Ask an admin to give you access.</p>
      )}
    </div>
  );
}
