'use client';

import { useState } from 'react';
import './brand-gate.css';

export function BrandGate({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/brand/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Incorrect password.');
        return;
      }
      window.location.reload();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="brand-page brand-gate">
      <div className="brand-gate-panel fill-dark xhatch">
        <div className="wrap">
          <span className="brand-gate-k">Heliaxis · Brand guidelines</span>
          <h1>Partner access</h1>
          <p>
            This page is for Heliaxis marketing partners. Enter the password you were given to view
            the brand kit, logos, social templates and usage rules.
          </p>
          {!configured ? (
            <p className="brand-gate-note">
              Access is not configured on this environment yet. Ask Heliaxis to set{' '}
              <code>BRAND_PAGE_PASSWORD</code> before sharing with agencies.
            </p>
          ) : (
            <form className="brand-gate-form" onSubmit={onSubmit}>
              <label htmlFor="brand-password">Password</label>
              <input
                id="brand-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              {error ? <p className="brand-gate-error">{error}</p> : null}
              <button type="submit" disabled={loading}>
                {loading ? 'Checking…' : 'View brand guidelines'}
              </button>
            </form>
          )}
          <p className="brand-gate-foot">
            Need access? Email{' '}
            <a href="mailto:hello@heliaxis.co.uk">hello@heliaxis.co.uk</a> or call 01633 965205.
          </p>
        </div>
      </div>
    </div>
  );
}
