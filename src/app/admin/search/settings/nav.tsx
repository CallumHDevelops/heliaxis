import Link from 'next/link';

export const SECTIONS: [string, string][] = [
  ['', 'Setup checklist'],
  ['connections', 'Connections'],
  ['business', 'Business facts'],
  ['author', 'Author'],
  ['areas', 'Target areas'],
  ['keywords', 'Keywords'],
  ['competitors', 'Competitors'],
  ['ai-questions', 'AI questions'],
  ['content', 'Content rules'],
  ['alerts', 'Reports and alerts'],
  ['budget', 'Budget'],
  ['access', 'Access'],
  ['data', 'Data'],
];

export function SettingsNav({ on }: { on: string }) {
  return (
    <nav className="sx-settings-nav" aria-label="Settings">
      {SECTIONS.map(([k, l]) => (
        <Link key={k} href={`/admin/search/settings${k ? `/${k}` : ''}`} className={`crm-btn crm-btn--small ${on === k ? 'crm-btn--solar' : 'crm-btn--ghost'}`} aria-current={on === k ? 'page' : undefined}>
          {l}
        </Link>
      ))}
    </nav>
  );
}
