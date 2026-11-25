'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const { Marked } = require('marked');

/**
 * Markdown is rendered here so the page itself gets only finished, safe HTML: raw HTML in a message is shown as
 * text, and only http(s) links survive (they open in the real browser).
 */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: (token) => esc(token.text ?? token.raw ?? ''),
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      return /^https?:\/\//i.test(href) ? `<a href="${esc(href)}" ${title ? `title="${esc(title)}"` : ''} data-ext="1">${text}</a>` : text;
    },
    image: ({ text }) => esc(text || ''),
  },
});

const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch, fn) => ipcRenderer.on(ch, (_e, p) => fn(p));

contextBridge.exposeInMainWorld('metis', {
  render: (text) => md.parse(String(text ?? '')),
  state: () => invoke('auth:state'),
  login: (email, password) => invoke('auth:login', email, password),
  logout: () => invoke('auth:logout'),
  listThreads: (opts) => invoke('threads:list', opts),
  openThread: (id) => invoke('threads:open', id),
  newThread: () => invoke('threads:new'),
  patchThread: (id, patch) => invoke('threads:patch', id, patch),
  send: (text, threadId) => invoke('chat:send', text, threadId),
  setSettings: (patch) => invoke('settings:set', patch),
  openHap: (href) => invoke('shell:open-hap', href),
  openUrl: (url) => invoke('shell:open-url', url),
  mode: (m) => ipcRenderer.send('window:mode', m),
  onChat: (fn) => on('chat:event', fn),
  onExpired: (fn) => on('auth:expired', fn),
  onNewChat: (fn) => on('app:new-chat', fn),
  onSettings: (fn) => on('app:open-settings', fn),
  onFocus: (fn) => on('app:focus-input', fn),
  onHotkey: (fn) => on('hotkey:status', fn),
});
