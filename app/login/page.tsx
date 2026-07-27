'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Spark } from '@/components/Spark';
import styles from './auth.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push('/studio');
    router.refresh();
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
        <form className={styles.form} onSubmit={onSubmit}>
          <span className={styles.eyebrow}>
            <Spark size={12} /> Sign in
          </span>
          <h2>Welcome back.</h2>
          <p className={styles.sub}>Sign in to create and manage posts.</p>

          {err && <div className={`${styles.msg} ${styles.err}`}>{err}</div>}

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
              autoComplete="current-password"
            />
          </div>
          <button className={styles.btn} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div className={styles.alt}>
            Need an account? <Link href="/register">Register</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
