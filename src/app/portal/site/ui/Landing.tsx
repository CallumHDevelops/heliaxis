'use client';

import Image from 'next/image';
import { useEffect, useEffectEvent, useState } from 'react';
import { siteFetch } from '@/lib/site/client';
import { getDevice, getPack, linkKey, otherPerson, saveDevice, updateDevice } from '@/lib/site/offline';
import { downloadPack, type ReadyStep } from '@/lib/site/packs';
import { drain } from '@/lib/site/sync';
import { ProblemScreen, Splash, Tick } from './bits';
import { chromeIntent, installEnv, installLater, promptInstall, safariLink, setInstallLater, useInstallPrompt, type InstallEnv } from './install';
import { go } from './nav';

type OpenReply = { deviceToken?: string; contact: { id?: string; name: string; first: string }; assignment: { id: string; trade: string; title: string; site: string } };
type Phase =
  | { kind: 'opening' }
  | { kind: 'install' }
  | { kind: 'ready' }
  | { kind: 'waiting' }
  | { kind: 'problem'; title: string; message: string };

const jobPath = (id: string) => `/portal/site/job/${id}`;

/**
 * A link from a trade's message (P1, then P2). The script swaps the link for a session on this
 * phone, offers the install step (skipped once installed, or after "Not now"), downloads the job
 * pack and its files, then takes the link out of the address bar and opens the job. On an iPhone
 * the link stays in the address bar while the install step shows, so the Home Screen app starts
 * there and signs itself in (it has its own storage).
 */
export function Landing({ token }: { token: string }) {
  const [env] = useState<InstallEnv>(() => installEnv());
  const [phase, setPhase] = useState<Phase>({ kind: 'opening' });
  const [who, setWho] = useState<{ first: string; site: string; id: string; title: string } | null>(null);
  const [steps, setSteps] = useState<ReadyStep | null>(null);
  const [softFail, setSoftFail] = useState(false);

  const ready = async (id: string) => {
    setPhase({ kind: 'ready' });
    let last: ReadyStep | null = null;
    const r = await downloadPack(id, (s) => {
      last = s;
      setSteps(s);
    });
    if (r.ok) {
      // Everything's on the phone: on to the job. Anything missing stays on screen until they tap.
      if (!(last as ReadyStep | null)?.missing) setTimeout(() => go(jobPath(id), { replace: true }), 900);
      return;
    }
    if (r.kind === 'problem') {
      setPhase({ kind: 'problem', title: r.problem === 'cancelled' ? 'This job was cancelled' : 'This job isn’t available', message: r.message });
      return;
    }
    // Fails softly: what's there opens, the rest comes when there's signal.
    setSoftFail(true);
  };

  const open = useEffectEvent(async () => {
    const dev = await getDevice();
    const key = await linkKey(token).catch(() => '');
    const r = await siteFetch<OpenReply>('/api/site/open', { body: { token, device: dev?.token ?? null, standalone: env === 'standalone' }, token: null });
    if (r.ok) {
      const a = r.data.assignment;
      // Someone else's link on this phone: the last person's waiting work gets one try with their own
      // session first, then nothing of theirs stays (saveDevice).
      if (dev && !dev.revoked && otherPerson(dev, r.data.contact)) await drain().catch(() => false);
      await saveDevice({ token: r.data.deviceToken ?? dev?.token ?? '', contact: r.data.contact, job: a.id });
      if (key) {
        const d = await getDevice();
        await updateDevice({ links: { ...(d?.links ?? {}), [key]: a.id } });
      }
      setWho({ first: r.data.contact.first, site: a.site, id: a.id, title: a.title });
      void drain();
      if (env === 'standalone' || env === 'desktop' || installLater()) void ready(a.id);
      else {
        setPhase({ kind: 'install' });
        // Android shares this phone's copy with the installed app: get the job meanwhile.
        void downloadPack(a.id, setSteps);
      }
      return;
    }
    // A phone that knows this link (or has a session) carries on without the server.
    const known = key ? dev?.links?.[key] : undefined;
    if (dev && !dev.revoked && (r.kind === 'offline' || (r.kind === 'problem' && r.problem === 'link'))) {
      if (known && (await getPack(known))) return go(jobPath(known), { replace: true });
      if (r.kind === 'problem') return go('/portal/site', { replace: true });
    }
    if (r.kind === 'offline' || (r.kind === 'error' && r.retry)) {
      setPhase({ kind: 'waiting' });
      return;
    }
    if (r.kind === 'problem') {
      const title =
        r.problem === 'cancelled' ? 'This job was cancelled' : r.problem === 'slow_down' ? 'Too many tries' : r.problem === 'not_ready' ? 'Not ready yet' : 'This link doesn’t work any more';
      setPhase({ kind: 'problem', title, message: r.message });
      return;
    }
    setPhase({ kind: 'problem', title: 'That didn’t work', message: r.message });
  });

  useEffect(() => {
    void open();
  }, [token]);

  // No signal when the link was opened: try again as soon as it's back, and every 15 seconds.
  useEffect(() => {
    if (phase.kind !== 'waiting') return;
    const again = () => void open();
    window.addEventListener('online', again);
    const t = setInterval(again, 15_000);
    return () => {
      window.removeEventListener('online', again);
      clearInterval(t);
    };
  }, [phase.kind]);

  if (phase.kind === 'opening') return <Splash text="Opening your job…" />;
  if (phase.kind === 'waiting') return <Splash text="No signal. We’ll open your job as soon as you have signal. Keep this page open." />;
  if (phase.kind === 'problem') return <ProblemScreen title={phase.title} message={phase.message} />;

  if (phase.kind === 'ready' && who) {
    return (
      <div className="sa-landing">
        <Image src="/assets/heliaxis-logo.png" alt="Heliaxis" width={150} height={35} unoptimized priority />
        <h1>Getting your job ready</h1>
        <p className="sa-muted">{who.site}</p>
        <ul className="sa-ticks">
          <Tick done={!!steps?.details}>Job details</Tick>
          <Tick done={steps?.design == null ? null : true}>{steps?.design === 0 ? 'Design (none yet)' : 'Design'}</Tick>
          <Tick done={steps?.drawings == null ? null : true}>
            {steps?.drawings == null ? 'Drawings' : steps.drawings === 1 ? '1 drawing' : `${steps.drawings} drawings`}
          </Tick>
          <Tick done={steps?.offline ?? null}>{steps?.offline === false ? 'Ready offline once the app has finished loading' : 'Ready offline'}</Tick>
        </ul>
        {(softFail || (steps?.missing ?? 0) > 0) && <p className="sa-warn">We’ll finish when you have signal.</p>}
        {(softFail || steps?.offline != null) && (
          <button type="button" className="sa-btn sa-btn-1" onClick={() => go(jobPath(who.id), { replace: true })}>
            Open the job
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="sa-landing">
      <Image src="/assets/heliaxis-logo.png" alt="Heliaxis" width={150} height={35} unoptimized priority />
      {who && (
        <h1>
          {who.first ? `${who.first}, this` : 'This'} is your job pack for {who.site || 'your Heliaxis job'}
        </h1>
      )}
      <InstallCard env={env} />
      <button
        type="button"
        className="sa-link sa-later"
        onClick={() => {
          setInstallLater();
          if (who) void ready(who.id);
        }}
      >
        Not now, use it in the browser
      </button>
    </div>
  );
}

function InstallCard({ env }: { env: InstallEnv }) {
  const prompt = useInstallPrompt();
  if (prompt === 'installed') {
    return (
      <div className="sa-install">
        <h2>Installed ✓</h2>
        <p>Open Heliaxis Site from your Home Screen. It has to be opened from the icon to work with no signal.</p>
      </div>
    );
  }
  if (env === 'android-inapp') {
    return (
      <div className="sa-install">
        <h2>Open this in Chrome first</h2>
        <p>This browser can’t keep the app on your phone. Open the link in Chrome, then install it there.</p>
        <a className="sa-btn sa-btn-1" href={chromeIntent()}>
          Open in Chrome
        </a>
      </div>
    );
  }
  if (env === 'ios-other') {
    return (
      <div className="sa-install">
        <h2>Open this in Safari first</h2>
        <p>Only Safari can put the app on your Home Screen.</p>
        <a className="sa-btn sa-btn-1" href={safariLink()}>
          Open in Safari
        </a>
        <p className="sa-muted">If nothing happens, tap ⋯ or the share button and choose Open in Safari.</p>
        <button type="button" className="sa-btn sa-btn-2" onClick={() => void navigator.clipboard?.writeText(window.location.href)}>
          Copy the link
        </button>
      </div>
    );
  }
  if (env === 'ios-safari') {
    return (
      <div className="sa-install">
        <h2>Put the app on your Home Screen</h2>
        <ol className="sa-steps">
          <li>
            <ShareIcon />
            <span>
              Tap <b>Share</b> at the bottom of Safari
            </span>
          </li>
          <li>
            <AddIcon />
            <span>
              Choose <b>Add to Home Screen</b> (scroll down if you can’t see it)
            </span>
          </li>
          <li>
            <span className="sa-step-add" aria-hidden="true">
              Add
            </span>
            <span>
              Tap <b>Add</b>
            </span>
          </li>
        </ol>
        <p>Open Heliaxis Site from your Home Screen. It has to be opened from the icon to work with no signal.</p>
      </div>
    );
  }
  return (
    <div className="sa-install">
      <h2>Install the app</h2>
      <p>Your job pack, questions and photos then work with no signal.</p>
      {prompt === 'ready' ? (
        <button type="button" className="sa-btn sa-btn-1" onClick={() => void promptInstall()}>
          Install the Heliaxis Site app
        </button>
      ) : (
        <p className="sa-muted">
          Tap <b>⋮</b> at the top right of Chrome, then <b>Install app</b> or <b>Add to Home screen</b>.
        </p>
      )}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg className="sa-step-icon" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 4v15M10.5 9.5L16 4l5.5 5.5" fill="none" stroke="#0A84FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 13H8v15h16V13h-3" fill="none" stroke="#0A84FF" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg className="sa-step-icon" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="5" y="5" width="22" height="22" rx="5" fill="none" stroke="#211F18" strokeWidth="2.2" />
      <path d="M16 10.5v11M10.5 16h11" stroke="#211F18" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
