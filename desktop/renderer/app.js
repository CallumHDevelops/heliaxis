'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const views = { login: $('view-login'), chat: $('view-chat'), settings: $('view-settings') };
  let current = 'login';
  let busy = false;
  let hasMessages = false;
  let hotkeyProblem = null;
  let signedIn = false;

  // What the tool names mean to a person, for the "working…" line.
  const TOOL_LABELS = {
    search_customers: 'Looking up customers', get_customer: 'Reading the customer’s file', my_day: 'Checking your day',
    list_team: 'Checking the team', create_task: 'Creating a task', add_note: 'Adding a note', set_next_step: 'Setting the next step',
    draft_email: 'Drafting an email', draft_whatsapp: 'Drafting a WhatsApp', create_opportunity: 'Creating the opportunity',
    find_organisation: 'Finding the organisation', find_contact: 'Finding the contact', add_contact: 'Adding the contact',
    search_help: 'Searching Help', ai_spend: 'Checking AI spend', lead_sources: 'Checking lead sources', ad_performance: 'Checking ad performance',
  };

  function show(name) {
    current = name;
    for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
    $('btn-new').hidden = name !== 'chat';
    window.metis.mode(name === 'chat' && hasMessages ? 'expanded' : name === 'chat' ? 'compact' : 'expanded');
    if (name === 'chat') $('input').focus();
  }

  function banner(text) {
    const b = $('banner');
    b.textContent = text || '';
    b.hidden = !text;
  }

  function addMessage(role, text, actions) {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    if (role === 'assistant') el.innerHTML = window.metis.render(text);
    else el.textContent = text;
    if (actions?.length) {
      const wrap = document.createElement('div');
      wrap.className = 'cards';
      for (const a of actions) {
        const c = document.createElement('div');
        c.className = 'item';
        const span = document.createElement('span');
        span.textContent = a.label;
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Open in HAP';
        b.addEventListener('click', () => window.metis.openHap(String(a.href).split('#')[0]));
        c.append(span, b);
        wrap.append(c);
      }
      el.append(wrap);
    }
    $('messages').append(el);
    $('messages').scrollTop = $('messages').scrollHeight;
    if (role !== 'error' && !hasMessages) {
      hasMessages = true;
      window.metis.mode('expanded');
    }
    return el;
  }

  function loadMessages(list) {
    $('messages').textContent = '';
    hasMessages = false;
    for (const m of list || []) addMessage(m.role, m.text);
  }

  function applyState(s) {
    hotkeyProblem = s.hotkeyProblem || null;
    signedIn = !!s.signedIn;
    if (!s.signedIn) return show('login');
    if (s.configured === false) banner('The assistant isn’t switched on in HAP yet (no Anthropic key).');
    else banner(hotkeyProblem);
    fillSettings(s.settings, s.me);
    loadMessages(s.messages);
    show('chat');
  }

  function fillSettings(settings, me) {
    if (settings) {
      $('set-hotkey').value = settings.hotkey.replace('Control', 'Ctrl');
      $('set-startup').checked = !!settings.startWithWindows;
      $('set-url').value = settings.hapUrl;
    }
    if (me) $('set-who').textContent = `Signed in as ${me.name}.`;
    $('hotkey-error').textContent = hotkeyProblem || '';
  }

  async function boot() {
    const r = await window.metis.state();
    if (!r.ok) {
      show('login');
      $('login-error').textContent = r.error;
      return;
    }
    applyState(r.data);
  }

  // --- sign in
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-error').textContent = '';
    $('login-btn').disabled = true;
    $('login-btn').textContent = 'Signing in…';
    const r = await window.metis.login($('email').value, $('password').value);
    $('login-btn').disabled = false;
    $('login-btn').textContent = 'Sign in';
    if (!r.ok) {
      $('login-error').textContent = r.code === 'auth' ? 'That email and password didn’t work.' : r.error;
      return;
    }
    $('password').value = '';
    applyState(r.data);
  });

  // --- chat
  async function sendMessage() {
    const text = $('input').value.trim();
    if (!text || busy) return;
    busy = true;
    $('input').value = '';
    autosize();
    $('send').disabled = true;
    addMessage('user', text);
    $('working').hidden = false;
    $('working-text').textContent = 'Thinking…';
    const r = await window.metis.send(text);
    // Success and failure inside the stream arrive as events; this only fails if the request itself did.
    if (!r.ok) finish(() => addMessage('error', r.error));
  }
  function finish(fn) {
    busy = false;
    $('working').hidden = true;
    $('send').disabled = false;
    fn?.();
    $('input').focus();
  }
  window.metis.onChat((ev) => {
    if (ev.type === 'tool') $('working-text').textContent = `${TOOL_LABELS[ev.name] || 'Working'}…`;
    else if (ev.type === 'done') finish(() => addMessage('assistant', ev.reply, ev.actions));
    else if (ev.type === 'error') finish(() => addMessage('error', ev.error));
  });
  $('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
  });
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });
  function autosize() {
    const t = $('input');
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  }
  $('input').addEventListener('input', autosize);

  // Links open in the real browser.
  $('messages').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-ext]');
    if (a) {
      e.preventDefault();
      window.metis.openUrl(a.href);
    }
  });

  async function newChat() {
    if (busy) return;
    const r = await window.metis.newChat();
    if (!r.ok) return addMessage('error', r.error);
    loadMessages([]);
    window.metis.mode('compact');
    show('chat');
  }
  $('btn-new').addEventListener('click', newChat);
  window.metis.onNewChat(newChat);

  // --- settings
  $('btn-settings').addEventListener('click', () => show('settings'));
  window.metis.onSettings(() => show('settings'));
  $('settings-back').addEventListener('click', () => show(signedIn ? 'chat' : 'login'));
  $('set-startup').addEventListener('change', (e) => window.metis.setSettings({ startWithWindows: e.target.checked }));
  $('set-url').addEventListener('change', (e) => window.metis.setSettings({ hapUrl: e.target.value }));
  $('set-hotkey').addEventListener('keydown', async (e) => {
    e.preventDefault();
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    if (!e.ctrlKey && !e.altKey && !e.metaKey) return ($('hotkey-error').textContent = 'Include Ctrl or Alt so it doesn’t clash with typing.');
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key.replace('Arrow', '');
    const combo = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super', key].filter(Boolean).join('+');
    const r = await window.metis.setSettings({ hotkey: combo });
    if (!r.ok) return ($('hotkey-error').textContent = r.error);
    hotkeyProblem = r.data.hotkeyProblem;
    fillSettings(r.data.settings);
    banner(hotkeyProblem);
  });
  $('logout').addEventListener('click', async () => {
    await window.metis.logout();
    signedIn = false;
    loadMessages([]);
    show('login');
  });

  window.metis.onExpired(() => {
    signedIn = false;
    finish();
    loadMessages([]);
    show('login');
    $('login-error').textContent = 'Your session has expired. Sign in again.';
  });
  window.metis.onHotkey((s) => {
    hotkeyProblem = s.problem;
    banner(s.problem);
    $('hotkey-error').textContent = s.problem || '';
  });
  window.metis.onFocus(() => current === 'chat' && $('input').focus());

  boot();
})();
