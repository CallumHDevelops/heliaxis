'use strict';
const store = require('./store');

/**
 * Talks to HAP. The person's Supabase session lives here in the main process only: the window never sees a token.
 * Sign-in is Supabase password auth with the public anon key (fetched from HAP), exactly as the website does it.
 */
let cfg = null; // { supabaseUrl, supabaseAnonKey }
let session = null; // { access_token, refresh_token, expires_at (s) }
let me = null; // { name, theme }
let onExpired = () => {};

const base = () => store.readSettings().hapUrl.replace(/\/+$/, '');

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function net(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('Can’t reach HAP. Check your internet connection and try again.', 0, 'network');
  }
}

async function config() {
  if (cfg) return cfg;
  const r = await net(() => fetch(`${base()}/api/desktop/config`));
  if (!r.ok) throw new ApiError(`HAP didn’t answer correctly (${r.status}). Is the server address right?`, r.status, 'config');
  const j = await r.json();
  if (!j.supabaseUrl || !j.supabaseAnonKey) throw new ApiError('HAP isn’t set up for Metis Desktop yet.', 500, 'config');
  cfg = j;
  return cfg;
}

function adopt(j) {
  session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600) };
  store.saveSecret({ refresh_token: session.refresh_token, hap: base() });
}

async function tokenGrant(grant, body) {
  const c = await config();
  const r = await net(() =>
    fetch(`${c.supabaseUrl}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error_description || j.msg || 'Sign-in failed', r.status, 'auth');
  return j;
}

async function login(email, password) {
  const j = await tokenGrant('password', { email, password });
  adopt(j);
  return getMe();
}

/** Try the saved refresh token at start-up. */
async function restore() {
  const s = store.loadSecret();
  if (!s?.refresh_token) return false;
  try {
    adopt(await tokenGrant('refresh_token', { refresh_token: s.refresh_token }));
    return true;
  } catch (e) {
    if (e.code === 'auth') store.clearSecret(); // revoked or expired: sign in again. A network error keeps it for next time.
    return false;
  }
}

async function accessToken() {
  if (!session) throw new ApiError('Sign in to Metis.', 401, 'auth');
  if (session.expires_at - 60 < Date.now() / 1000) {
    try {
      adopt(await tokenGrant('refresh_token', { refresh_token: session.refresh_token }));
    } catch (e) {
      if (e.code === 'auth') await logout(true);
      throw e;
    }
  }
  return session.access_token;
}

async function logout(expired = false) {
  session = null;
  me = null;
  store.clearSecret();
  if (expired) onExpired();
}

/** An authenticated request. A 401 gets one refresh-and-retry, then counts as an expired session. */
async function hap(pathname, init = {}) {
  const call = async () => fetch(`${base()}${pathname}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' } });
  let r = await net(call);
  if (r.status === 401 && session) {
    session.expires_at = 0;
    r = await net(call);
  }
  if (r.status === 401) {
    await logout(true);
    throw new ApiError('Your session has expired. Sign in again.', 401, 'auth');
  }
  return r;
}

async function readError(r) {
  const j = await r.json().catch(() => ({}));
  return new ApiError(j.error || `HAP returned ${r.status}`, r.status, r.status === 429 ? 'limit' : 'server');
}

async function getMe(threadId) {
  const r = await hap(`/api/desktop/chat${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ''}`);
  if (!r.ok) throw await readError(r);
  const j = await r.json();
  me = { name: j.me, theme: j.theme };
  return { me, messages: j.messages, configured: j.configured, threadId: j.threadId, title: j.title };
}

const history = (threadId) => getMe(threadId);

async function json(pathname, init) {
  const r = await hap(pathname, init);
  if (!r.ok) throw await readError(r);
  return r.json();
}

const listThreads = ({ q = '', archived = false } = {}) => json(`/api/desktop/threads?archived=${archived ? 1 : 0}&q=${encodeURIComponent(q)}`);
const newThread = () => json('/api/desktop/threads', { method: 'POST', body: '{}' });
const patchThread = (id, patch) => json(`/api/desktop/threads/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });

/** A stored document (a quote, a design pack) as bytes, with its file name. */
async function downloadDocument(id) {
  const r = await hap(`/api/desktop/documents/${encodeURIComponent(id)}`);
  if (!r.ok) throw await readError(r);
  const name = decodeURIComponent(r.headers.get('x-filename') || 'document.pdf');
  return { name, bytes: Buffer.from(await r.arrayBuffer()) };
}

/** Send a message and call back with each server-sent event: tool, done or error. */
async function send(text, threadId, emit) {
  const r = await hap('/api/desktop/chat', { method: 'POST', body: JSON.stringify({ text, threadId: threadId || undefined }) });
  if (!r.ok) throw await readError(r);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await net(() => reader.read());
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /^event: (.+)$/m.exec(raw)?.[1];
      const data = /^data: (.+)$/m.exec(raw)?.[1];
      if (ev && data) emit({ type: ev, ...JSON.parse(data) });
    }
  }
}

/** Where updates are published and the oldest version HAP still supports (both from HAP, so they can change without a new build). */
async function updateInfo() {
  const c = await config();
  return { url: c.updateUrl || null, minVersion: c.minDesktopVersion || null };
}

module.exports = { updateInfo, login, logout, restore, history, listThreads, newThread, patchThread, downloadDocument, send, hapBase: base, isSignedIn: () => !!session, setOnExpired: (f) => (onExpired = f), ApiError };
