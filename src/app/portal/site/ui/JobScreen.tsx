'use client';

import { useEffect, useState } from 'react';
import { OFFICE_PHONE, shortDate } from '@/lib/site/client';
import { getDraft, getFile, getPack, type PackRecord } from '@/lib/site/offline';
import type { PackFile, SitePack } from '@/lib/site/pack-shared';
import { downloadPack, seenChanges } from '@/lib/site/packs';
import { Splash, SyncLine, TopBar } from './bits';
import { JobSteps } from './JobSteps';
import { PoCard } from './PoCard';
import { ReturnBanners } from './Review';
import { useLive } from './nav';

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;

/** P4: one job, all from the phone. The steps (and a step's own screen) come from the job's form (JobSteps). */
export function JobScreen({ id, rest }: { id: string; rest: string[] }) {
  const rec = useLive(() => getPack(id), `pack:${id}`);
  const draft = useLive(() => getDraft(id), `draft:${id}`);
  const [fetching, setFetching] = useState<'idle' | 'busy' | 'offline' | 'failed'>('idle');

  // With signal: a fresh copy of the pack (at most once a minute). With none, the phone's copy.
  useEffect(() => {
    let live = true;
    void (async () => {
      const have = await getPack(id);
      if (have && Date.now() - Date.parse(have.storedAt) < 60_000) return;
      if (!have && live) setFetching('busy');
      const r = await downloadPack(id);
      if (live && !have) setFetching(r.ok ? 'idle' : r.kind === 'offline' ? 'offline' : 'failed');
    })();
    return () => {
      live = false;
    };
  }, [id]);

  if (rec === undefined) return <Splash />;
  if (!rec) {
    return (
      <>
        <TopBar title="Your job" backTo="/portal/site" />
        <main className="sa-main">
          <p className="sa-empty">
            {fetching === 'offline'
              ? 'This job isn’t on this phone yet. It downloads when you have signal.'
              : fetching === 'failed'
                ? 'This job couldn’t be opened. Open the link in your message again, or call the office.'
                : 'Getting your job ready…'}
          </p>
        </main>
      </>
    );
  }
  const { pack } = rec;
  if (rest.length) return <JobSteps rec={rec} answers={draft?.answers ?? pack.assignment.answers} rest={rest} />;
  return (
    <>
      <TopBar title={pack.job.short || pack.assignment.title} backTo="/portal/site" />
      <SyncLine />
      <main className="sa-main">
        {rec.problem && (
          <div className="sa-alert sa-alert-bad" role="alert">
            <b>{rec.problem.message}</b>
            <span>Everything you’ve done on this job is kept on this phone.</span>
          </div>
        )}
        {rec.changes.length > 0 && (
          <div className="sa-alert" role="status">
            <span>Updated by the office: {rec.changes.join(', ')}</span>
            <button type="button" className="sa-small" onClick={() => void seenChanges(id)}>
              OK
            </button>
          </div>
        )}
        <ReturnBanners rec={rec} />
        <Strip pack={pack} />
        <div className="sa-job-head">
          <p className="sa-kicker">
            {pack.assignment.title}
            {pack.job.ref ? ` · ${pack.job.ref}` : ''}
          </p>
          <h2 className="sa-address">{pack.job.address.join(', ') || pack.job.short}</h2>
          {pack.assignment.scope && <p>{pack.assignment.scope}</p>}
          {pack.job.map && (
            <a className="sa-maplink" href={pack.job.map} target="_blank" rel="noopener noreferrer">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="10" r="2.6" fill="currentColor" />
              </svg>
              Open in Maps
            </a>
          )}
        </div>

        <JobSteps rec={rec} answers={draft?.answers ?? pack.assignment.answers} rest={[]} />
        {pack.po && pack.assignment.signoffs.length > 0 && <PoCard rec={rec} stage={pack.assignment.signoffs.at(-1)!.stage} />}

        {pack.assignment.note_to_trade && (
          <section className="sa-card">
            <h3>Notes from the office</h3>
            <p className="sa-pre">{pack.assignment.note_to_trade}</p>
          </section>
        )}

        <section className="sa-card sa-rows">
          <h3>When</h3>
          {pack.assignment.starts_on && (
            <Row label="You start">
              {shortDate(pack.assignment.starts_on)}
              {pack.assignment.days ? ` · ${pack.assignment.days === 1 ? '1 day' : `${pack.assignment.days} days`}` : ''}
            </Row>
          )}
          {pack.job.install_dates.length > 0 && <Row label="Install">{pack.job.install_dates.map(shortDate).join(', ')}</Row>}
          {pack.job.scaffold_up_on && <Row label="Scaffold up">{shortDate(pack.job.scaffold_up_on)}</Row>}
          {pack.job.scaffold_down_on && <Row label="Scaffold down">{shortDate(pack.job.scaffold_down_on)}</Row>}
          {!pack.assignment.starts_on && !pack.job.install_dates.length && <p className="sa-muted">The office will confirm the dates.</p>}
        </section>

        <section className="sa-card sa-rows">
          <h3>People</h3>
          <Row label="Office">
            <a href={tel(pack.office.phone || OFFICE_PHONE)}>{pack.office.phone || OFFICE_PHONE}</a>
            {pack.office.owner ? ` · ${pack.office.owner}` : ''}
          </Row>
          <Row label="Customer">
            {pack.job.customer.name || 'The customer'}
            {pack.job.customer.phone && (
              <>
                {' · '}
                <a href={tel(pack.job.customer.phone)}>{pack.job.customer.phone}</a>
              </>
            )}
          </Row>
          {pack.team
            .filter((t) => !t.me)
            .map((t, i) => (
              <Row key={i} label={t.title}>
                {t.name}
                <span className="sa-muted">
                  {' · '}
                  {t.status_label}
                  {t.starts_on ? ` · ${shortDate(t.starts_on)}` : ''}
                </span>
              </Row>
            ))}
        </section>

        {pack.access.length > 0 && (
          <section className="sa-card sa-rows">
            <h3>Access and parking</h3>
            {pack.access.map((a, i) => (
              <Row key={i} label={a.label}>
                {a.value}
              </Row>
            ))}
          </section>
        )}

        <System pack={pack} />
        <Files rec={rec} />
      </main>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sa-row">
      <span className="sa-row-label">{label}</span>
      <span className="sa-row-value">{children}</span>
    </div>
  );
}

function Strip({ pack }: { pack: SitePack }) {
  if (!pack.strip.length) return null;
  return (
    <ol className="sa-strip" aria-label="Where the job is up to">
      {pack.strip.map((s) => (
        <li key={s.key} className={`sa-strip-${s.state}`}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function System({ pack }: { pack: SitePack }) {
  const s = pack.system;
  const rows: [string, string][] = [];
  if (s.kwp) rows.push(['System', `${s.kwp} kWp${s.panel_count ? ` · ${s.panel_count} panels` : ''}`]);
  else if (s.panel_count) rows.push(['Panels', String(s.panel_count)]);
  if (s.panel_model) rows.push(['Panel', s.panel_model]);
  if (s.inverter_model) rows.push(['Inverter', s.inverter_model]);
  if (s.battery_model) rows.push(['Battery', s.battery_model]);
  if (pack.design.strings_design?.length) rows.push(['Strings', pack.design.strings_design.map((n, i) => `${i + 1}: ${n} panels`).join(' · ')]);
  if (pack.design.mounting) rows.push(['Mounting', { on_roof: 'On roof', in_roof: 'In roof', flat: 'Flat roof', ground: 'Ground' }[pack.design.mounting]]);
  // An electrician's pack: what the roofer has given so far (it's offered on F43 with one tap).
  const r = pack.electrician?.facts.roofer;
  if (r) {
    const v = r.values;
    const strings = Array.isArray(v.RF11) ? (v.RF11 as unknown[]).join(' + ') : null;
    if (v.RF10) rows.push(['Roofer: strings', `${v.RF10}${strings ? ` (${strings})` : ''}`]);
    if (typeof v.RF13 === 'string') rows.push(['Roofer: panel', `${v.RF13}${typeof v.RF14 === 'number' ? ` · Voc ${v.RF14} V` : ''}`]);
    if (v.RF7 === 'yes' || v.RF7 === 'no') rows.push(['Roofer: optimisers', v.RF7 === 'yes' ? 'Fitted' : 'None']);
  }
  if (!rows.length) return null;
  return (
    <section className="sa-card sa-rows">
      <h3>The system</h3>
      {rows.map(([l, v]) => (
        <Row key={l} label={l}>
          {v}
        </Row>
      ))}
    </section>
  );
}

/** Drawings and design, from the phone: they open with no signal. */
function Files({ rec }: { rec: PackRecord }) {
  const [viewing, setViewing] = useState<{ url: string; name: string } | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const files = rec.pack.files;
  if (!files.length && !rec.pack.skipped.length) return null;
  const open = async (f: PackFile) => {
    const kept = await getFile(f.id);
    if (!kept) {
      setMissing(f.id);
      return;
    }
    const url = URL.createObjectURL(kept.blob);
    if (kept.mime.startsWith('image/')) {
      setViewing({ url, name: f.name });
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return (
    <section className="sa-card">
      <h3>Drawings and design</h3>
      <ul className="sa-files">
        {files.map((f) => (
          <li key={f.id}>
            <button type="button" className="sa-file" onClick={() => void open(f)}>
              <span className="sa-file-kind">{f.kind === 'design' ? 'Design' : f.kind === 'photo' ? 'Survey photo' : 'Drawing'}</span>
              <span className="sa-file-name">{f.name}</span>
            </button>
            {missing === f.id && <p className="sa-muted">Not on this phone yet. It downloads when you have signal.</p>}
          </li>
        ))}
      </ul>
      {rec.pack.skipped.map((s) => (
        <p key={s} className="sa-muted">
          {s}
        </p>
      ))}
      {viewing && (
        <div className="sa-viewer" role="dialog" aria-modal="true" aria-label={viewing.name}>
          <button
            type="button"
            className="sa-viewer-close"
            onClick={() => {
              URL.revokeObjectURL(viewing.url);
              setViewing(null);
            }}
          >
            Close
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob from the phone */}
          <img src={viewing.url} alt={viewing.name} />
        </div>
      )}
    </section>
  );
}
