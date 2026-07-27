'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Spark } from '@/components/Spark';
import styles from '../login/auth.module.css';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setOk('');
    if (password.length < 8) {
      setErr('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    // If email confirmation is on, there's no active session yet.
    if (data.user && !data.session) {
      setOk('Check your inbox to confirm your email, then sign in.');
    } else {
      window.location.href = '/studio';
    }
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
            Create your <span className={styles.y}>account.</span>
          </h1>
          <p>Access the Post Studio and start generating on-brand posts.</p>
        </div>
        <div className={styles.foot}>MCS-certified · South Wales · heliaxis.co.uk</div>
      </div>

      <div className={styles.formside}>
        <form className={styles.form} onSubmit={onSubmit}>
          <span className={styles.eyebrow}>
            <Spark size={12} /> Register
          </span>
          <h2>Get started.</h2>
          <p className={styles.sub}>Create an account to use the studio.</p>

          {err && <div className={`${styles.msg} ${styles.err}`}>{err}</div>}
          {ok && <div className={`${styles.msg} ${styles.ok}`}>{ok}</div>}

          <div className={styles.field}>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className={styles.field}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <button className={styles.btn} disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>

          <div className={styles.alt}>
            Already have an account? <Link href="/login">Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
