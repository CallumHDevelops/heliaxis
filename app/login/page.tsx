'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Spark } from '@/components/Spark';
import styles from './auth.module.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true, // passwordless sign-in doubles as sign-up
      },
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.brand}>
        <img src="/heliaxis-logo-light.png" alt="Heliaxis" />
        <div className={styles.pitch}>
          <div className={styles.spark}>
            <Spark size={30} />
          </div>
          <h1>
            Post Studio<span className={styles.y}>.</span>
          </h1>
          <p>On-brand social posts for Heliaxis — designed, written and ready to publish.</p>
        </div>
        <div className={styles.foot}>MCS-certified · South Wales · heliaxis.co.uk</div>
      </div>

      <div className={styles.formside}>
        {sent ? (
          <div className={styles.form}>
            <span className={styles.eyebrow}>
              <Spark size={12} /> Check your email
            </span>
            <h2>Link on its way.</h2>
            <p className={styles.sub}>
              We&rsquo;ve emailed a secure sign-in link to <b>{email}</b>. Open it on this device to
              sign in — no password needed. It can take a minute; check spam if you don&rsquo;t see
              it.
            </p>
            <button
              className={styles.btn}
              type="button"
              onClick={() => {
                setSent(false);
                setErr('');
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={onSubmit}>
            <span className={styles.eyebrow}>
              <Spark size={12} /> Sign in
            </span>
            <h2>Welcome back.</h2>
            <p className={styles.sub}>
              Enter your email and we&rsquo;ll send you a one-tap sign-in link. No password to
              remember.
            </p>

            {err && <div className={`${styles.msg} ${styles.err}`}>{err}</div>}

            <div className={styles.field}>
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                placeholder="you@heliaxis.co.uk"
              />
            </div>
            <button className={styles.btn} disabled={busy}>
              {busy ? 'Sending link…' : 'Email me a sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
