'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const views = { login: $('view-login'), chat: $('view-chat'), settings: $('view-settings') };
  let current = 'login';
  let busy = false;
  let hasMessages = false;
  let hotkeyProblem = null;
  let signedIn = false;
  let threadId = null;
  let sideOpen = false;
  let archivedTab = false;

  // What the tool names mean to a person, for the "working…" line.
  const TOOL_LABELS = {
    search_customers: 'Looking up customers', get_customer: 'Reading the customer’s file', my_day: 'Checking your day',
    list_team: 'Checking the team', create_task: 'Creating a task', add_note: 'Adding a note', set_next_step: 'Setting the next step',
    draft_email: 'Drafting an email', draft_whatsapp: 'Drafting a WhatsApp', create_opportunity: 'Creating the opportunity',
    find_organisation: 'Finding the organisation', find_contact: 'Finding the contact', add_contact: 'Adding the contact',
    search_help: 'Searching Help', ai_spend: 'Checking AI spend', lead_sources: 'Checking lead sources', ad_performance: 'Checking ad performance',
    list_quotes: 'Looking up quotes', list_surveys: 'Looking up surveys', list_diary: 'Checking the diary', list_subcontractors: 'Looking up subcontractors',
    list_my_mail: 'Checking your mail', whats_overdue: 'Checking what’s overdue', whats_new: 'Checking what’s new',
  };

  function show(name) {
    current = name;
    for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
    $('btn-new').hidden = name !== 'chat';
    $('btn-chats').hidden = name !== 'chat';
    layout();
    if (name === 'chat') $('input').focus();
  }

  /** Quick-ask bar until there is a conversation (or the chats list is opened); then the full window with the sidebar. */
  function layout() {
    const full = current === 'chat' && (hasMessages || sideOpen);
    $('side').hidden = !full;
    window.metis.mode(current === 'chat' && !full ? 'compact' : 'expanded');
  }

  function banner(text) {
    const b = $('banner');
    b.textContent = text || '';
    b.hidden = !text;
  }

  /** A card for something Metis made: its words, a picture if there is one, detail lines (warnings stand out) and buttons. */
  function actionCard(a) {
    const c = document.createElement('div');
    c.className = `item${a.preview || a.detail?.length ? ' big' : ''}`;
    const head = document.createElement('div');
    head.className = 'item-head';
    head.textContent = a.label;
    c.append(head);
    if (a.preview) {
      const img = document.createElement('img');
      img.className = 'preview';
      img.alt = 'Mock-up of the roof with the panels';
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.preview)}`;
      c.append(img);
    }
    for (const line of a.detail || []) {
      const p = document.createElement('div');
      p.className = /^(Warning|Problem)/.test(line) ? 'detail warn' : 'detail';
      p.textContent = line;
      c.append(p);
    }
    const row = document.createElement('div');
    row.className = 'btns';
    const buttons = a.buttons?.length ? a.buttons : [{ label: 'Open in HAP', href: a.href }];
    for (const bt of buttons) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = bt.label;
      b.addEventListener('click', async () => {
        if (bt.documentId) {
          b.disabled = true;
          const r = await window.metis.openDocument(bt.documentId);
          b.disabled = false;
          if (!r.ok) addMessage('error', r.error);
        } else if (bt.prompt) sendMessage(bt.prompt);
        else if (bt.href) window.metis.openHap(String(bt.href).split('#')[0]);
      });
      row.append(b);
    }
    c.append(row);
    return c;
  }

  function addMessage(role, text, actions) {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    if (role === 'assistant') el.innerHTML = window.metis.render(text);
    else el.textContent = text;
    if (actions?.length) {
      const wrap = document.createElement('div');
      wrap.className = 'cards';
      for (const a of actions) wrap.append(actionCard(a));
      el.append(wrap);
    }
    $('messages').append(el);
    $('messages').scrollTop = $('messages').scrollHeight;
    if (role !== 'error' && !hasMessages) {
      hasMessages = true;
      layout();
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
    threadId = s.threadId || null;
    loadMessages(s.messages);
    show('chat');
    refreshThreads();
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
  async function sendMessage(forced) {
    const text = (typeof forced === 'string' ? forced : $('input').value).trim();
    if (!text || busy) return;
    busy = true;
    if (typeof forced !== 'string') $('input').value = '';
    autosize();
    $('send').disabled = true;
    addMessage('user', text);
    $('working').hidden = false;
    $('working-text').textContent = 'Thinking…';
    const r = await window.metis.send(text, threadId);
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
    else if (ev.type === 'done') {
      if (ev.threadId) threadId = ev.threadId;
      finish(() => addMessage('assistant', ev.reply, ev.actions));
      refreshThreads();
    }
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
    const r = await window.metis.newThread();
    if (!r.ok) return addMessage('error', r.error);
    threadId = r.data.id;
    loadMessages([]);
    layout();
    show('chat');
    refreshThreads();
  }

  async function openThread(id) {
    if (busy || id === threadId) return;
    const r = await window.metis.openThread(id);
    if (!r.ok) return addMessage('error', r.error);
    threadId = r.data.threadId || id;
    loadMessages(r.data.messages);
    sideOpen = true;
    layout();
    refreshThreads();
    $('input').focus();
  }

  // --- the chats sidebar: search, rename, archive
  let searchTimer = null;
  async function refreshThreads() {
    const r = await window.metis.listThreads({ q: $('thread-search').value, archived: archivedTab });
    const ul = $('threads');
    ul.textContent = '';
    if (!r.ok) {
      ul.innerHTML = '<li class="empty"></li>';
      ul.firstChild.textContent = r.error;
      return;
    }
    if (!r.data.threads.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = archivedTab ? 'No archived chats.' : $('thread-search').value ? 'No chats match.' : 'No chats yet.';
      ul.append(li);
    }
    for (const t of r.data.threads) ul.append(threadItem(t));
  }

  function threadItem(t) {
    const li = document.createElement('li');
    li.className = `thread${t.id === threadId ? ' on' : ''}`;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'open';
    open.textContent = t.title;
    open.title = t.title;
    open.addEventListener('click', () => openThread(t.id));
    open.addEventListener('dblclick', () => rename(li, t));
    const ren = document.createElement('button');
    ren.type = 'button';
    ren.className = 'act';
    ren.textContent = 'Rename';
    ren.addEventListener('click', () => rename(li, t));
    const arch = document.createElement('button');
    arch.type = 'button';
    arch.className = 'act';
    arch.textContent = archivedTab ? 'Restore' : 'Archive';
    arch.addEventListener('click', async () => {
      const r = await window.metis.patchThread(t.id, { archived: !archivedTab });
      if (!r.ok) return addMessage('error', r.error);
      if (t.id === threadId && !archivedTab) {
        threadId = null;
        loadMessages([]);
        layout();
      }
      refreshThreads();
    });
    li.append(open, ren, arch);
    return li;
  }

  function rename(li, t) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = t.title;
    input.maxLength = 120;
    li.textContent = '';
    li.append(input);
    input.focus();
    input.select();
    let done = false;
    const finishRename = async (save) => {
      if (done) return;
      done = true;
      if (save && input.value.trim() && input.value.trim() !== t.title) {
        const r = await window.metis.patchThread(t.id, { title: input.value });
        if (!r.ok) addMessage('error', r.error);
      }
      refreshThreads();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finishRename(true);
      if (e.key === 'Escape') {
        e.stopPropagation();
        finishRename(false);
      }
    });
    input.addEventListener('blur', () => finishRename(true));
  }

  $('thread-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshThreads, 250);
  });
  for (const [id, archived] of [['tab-active', false], ['tab-archived', true]]) {
    $(id).addEventListener('click', () => {
      archivedTab = archived;
      $('tab-active').classList.toggle('on', !archived);
      $('tab-archived').classList.toggle('on', archived);
      $('tab-active').setAttribute('aria-selected', String(!archived));
      $('tab-archived').setAttribute('aria-selected', String(archived));
      refreshThreads();
    });
  }
  $('btn-chats').addEventListener('click', () => {
    sideOpen = !sideOpen;
    layout();
    if (sideOpen) refreshThreads();
  });
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
    threadId = null;
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
