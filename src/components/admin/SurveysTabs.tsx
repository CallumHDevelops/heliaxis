import Link from 'next/link';
import './surveys-tabs.css';

/**
 * The Surveys area's tab bar: Diary · To do · Drafts · Done, plus ⚙ (booking settings) for admins.
 * No data and no client code, so any page can render it under AdminShell.
 */

export type SurveysTab = 'diary' | 'todo' | 'drafts' | 'done' | 'settings';

const TABS: { key: Exclude<SurveysTab, 'settings'>; label: string; href: string }[] = [
  { key: 'diary', label: 'Diary', href: '/admin/surveys' },
  { key: 'todo', label: 'To do', href: '/admin/surveys/todo' },
  { key: 'drafts', label: 'Drafts', href: '/admin/surveys/drafts' },
  { key: 'done', label: 'Done', href: '/admin/surveys/done' },
];

export function SurveysTabs({ active, admin = false }: { active: SurveysTab; /** Shows ⚙ booking settings. */ admin?: boolean }) {
  return (
    <nav className="hx-stabs" aria-label="Surveys">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={t.key === active ? 'hx-stabs__tab is-active' : 'hx-stabs__tab'}
          aria-current={t.key === active ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
      {admin && (
        <Link
          href="/admin/surveys/settings"
          className={active === 'settings' ? 'hx-stabs__tab hx-stabs__gear is-active' : 'hx-stabs__tab hx-stabs__gear'}
          aria-label="Booking settings"
          title="Booking settings"
          aria-current={active === 'settings' ? 'page' : undefined}
        >
          ⚙
        </Link>
      )}
    </nav>
  );
}
