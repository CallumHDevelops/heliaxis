'use strict';
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, nativeTheme, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const store = require('./store');
const api = require('./api');

const MICA = process.platform === 'win32' && Number(process.getSystemVersion().split('.')[2]) >= 22621;
/** Set only by automated tests, so they never launch a browser or a PDF reader on someone's computer. */
const NO_OPEN = process.env.METIS_TEST_NO_OPEN === '1';
const COMPACT = { width: 640, height: 150 };
const EXPANDED = { width: 980, height: 700 };

let win = null;
let tray = null;
let quitting = false;
let hotkeyProblem = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

const IS_MAC = process.platform === 'darwin';
// The menu-bar icon on a Mac is small; Windows scales a larger one.
const icon = () => nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png')).resize(IS_MAC ? { width: 18, height: 18 } : { width: 32, height: 32 });
const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);

function createWindow() {
  win = new BrowserWindow({
    ...COMPACT,
    minWidth: 480,
    minHeight: 120,
    show: false,
    title: 'Metis',
    icon: icon(),
    // Windows 11 (build 22621+) gets the Mica material; anything older gets a solid window, so text is never on a see-through background.
    ...(IS_MAC ? { vibrancy: 'under-window', visualEffectState: 'active', backgroundColor: '#00000000' } : MICA ? { backgroundMaterial: 'mica', backgroundColor: '#00000000' } : { backgroundColor: nativeTheme.shouldUseDarkColors ? '#211f18' : '#f7f2e7' }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.setMenuBarVisibility(false);
  // The page paints its own solid background unless Mica is behind it.
  win.webContents.on('did-finish-load', () => (MICA || IS_MAC) && win.webContents.executeJavaScript("document.documentElement.classList.add('mica')").catch(() => {}));
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Esc hides, Ctrl+N starts a new chat (also handled in the page for focus cases).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'Escape') {
      e.preventDefault();
      win.hide();
    } else if ((input.control || input.meta) && input.key.toLowerCase() === 'n') {
      e.preventDefault();
      send('app:new-chat');
    }
  });
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  // Links in chat open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function openExternal(url) {
  if (NO_OPEN) return;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(u.toString());
  } catch {
    /* ignore */
  }
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  send('app:focus-input');
}

function toggleWindow() {
  if (win.isVisible() && win.isFocused()) win.hide();
  else showWindow();
}

/** Register the global hotkey. If Windows won't give it to us another app has it: say so, don't fail silently. */
function registerHotkey() {
  globalShortcut.unregisterAll();
  const { hotkey } = store.readSettings();
  let ok = false;
  try {
    ok = globalShortcut.register(hotkey, toggleWindow);
  } catch {
    ok = false;
  }
  hotkeyProblem = ok ? null : `${IS_MAC ? 'macOS' : 'Windows'} wouldn’t register ${hotkey.replace('Control', 'Ctrl')}: another app is probably using it. Pick a different shortcut in Settings.`;
  send('hotkey:status', { hotkey, problem: hotkeyProblem });
  return ok;
}

function applyStartup(on) {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] });
}

function buildTray() {
  tray = new Tray(icon());
  tray.setToolTip('Metis');
  const menu = Menu.buildFromTemplate([
    { label: 'Open Metis', click: showWindow },
    { label: 'New chat', click: () => { showWindow(); send('app:new-chat'); } },
    { label: 'Settings', click: () => { showWindow(); send('app:open-settings'); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleWindow);
}

function applyTheme(theme) {
  nativeTheme.themeSource = theme === 'light' || theme === 'dark' ? theme : 'system';
}

const guard = (fn) => async (_e, ...args) => {
  try {
    return { ok: true, data: await fn(...args) };
  } catch (e) {
    return { ok: false, error: e.message || 'Something went wrong', code: e.code || 'error', status: e.status || 0 };
  }
};

function ipc() {
  ipcMain.handle('auth:state', guard(async () => {
    const s = store.readSettings();
    if (!api.isSignedIn()) {
      if (!(await api.restore())) return { signedIn: false, settings: s, hotkeyProblem };
    }
    const h = await api.history();
    applyTheme(h.me.theme);
    return { signedIn: true, me: h.me, messages: h.messages, threadId: h.threadId, configured: h.configured, settings: s, hotkeyProblem };
  }));
  ipcMain.handle('auth:login', guard(async (email, password) => {
    const h = await api.login(String(email || '').trim(), String(password || ''));
    applyTheme(h.me.theme);
    return { signedIn: true, me: h.me, messages: h.messages, threadId: h.threadId, configured: h.configured, settings: store.readSettings(), hotkeyProblem };
  }));
  ipcMain.handle('auth:logout', guard(async () => api.logout()));
  ipcMain.handle('threads:list', guard((opts) => api.listThreads({ q: String(opts?.q || ''), archived: !!opts?.archived })));
  ipcMain.handle('threads:open', guard((id) => api.history(String(id || ''))));
  ipcMain.handle('threads:new', guard(() => api.newThread()));
  ipcMain.handle('threads:patch', guard((id, patch) => api.patchThread(String(id), { ...(typeof patch?.title === 'string' ? { title: patch.title } : {}), ...(typeof patch?.archived === 'boolean' ? { archived: patch.archived } : {}) })));
  ipcMain.handle('chat:send', guard(async (text, threadId) => {
    await api.send(String(text || ''), threadId ? String(threadId) : '', (ev) => send('chat:event', ev));
  }));
  ipcMain.handle('settings:set', guard(async (patch) => {
    const allowed = {};
    if (typeof patch.hotkey === 'string' && patch.hotkey.trim()) allowed.hotkey = patch.hotkey.trim();
    if (typeof patch.hapUrl === 'string' && /^https?:\/\//.test(patch.hapUrl)) allowed.hapUrl = patch.hapUrl.trim();
    if (typeof patch.startWithWindows === 'boolean') allowed.startWithWindows = patch.startWithWindows;
    const next = store.writeSettings(allowed);
    if ('hotkey' in allowed) registerHotkey();
    if ('startWithWindows' in allowed) applyStartup(next.startWithWindows);
    return { settings: next, hotkeyProblem };
  }));
  // "Open file": fetch the document with the person's own sign-in, save it in a temp folder, open it in the default app.
  ipcMain.handle('doc:open', guard(async (id) => {
    const { name, bytes } = await api.downloadDocument(String(id || ''));
    const dir = path.join(app.getPath('temp'), 'metis-docs');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, path.basename(name).replace(/[\\/:*?"<>|]+/g, '-') || 'document.pdf');
    fs.writeFileSync(file, bytes);
    if (NO_OPEN) return { file };
    const err = await shell.openPath(file);
    if (err) throw new Error(`Saved ${file} but Windows could not open it: ${err}`);
    return { file };
  }));
  ipcMain.handle('shell:open-hap', guard(async (href) => {
    if (typeof href !== 'string' || !href.startsWith('/admin')) throw new Error('Not a HAP page');
    openExternal(`${api.hapBase()}${href}`);
  }));
  ipcMain.handle('shell:open-url', guard(async (url) => openExternal(url)));
  ipcMain.on('window:mode', (_e, mode) => {
    if (!win) return;
    const t = mode === 'expanded' ? EXPANDED : COMPACT;
    const [w] = win.getSize();
    win.setSize(Math.max(w, t.width), t.height, false);
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('uk.co.heliaxis.metis');
  // A Mac only gives Cmd+C, Cmd+V and friends to a window through an Edit menu.
  if (IS_MAC) Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  createWindow();
  buildTray();
  ipc();
  api.setOnExpired(() => send('auth:expired'));
  registerHotkey();
  applyStartup(store.readSettings().startWithWindows);
  if (!process.argv.includes('--hidden')) win.once('ready-to-show', showWindow);
  win.webContents.once('did-finish-load', () => {
    if (hotkeyProblem) dialog.showErrorBox('Metis shortcut', hotkeyProblem);
  });
});

/**
 * Auto-update (installed copies only). The update address and the oldest supported version come from HAP's config, so a
 * new feed or a forced upgrade needs no new build. Updates download quietly and install when Metis is next quit, or when
 * the person presses "Restart to update". Signed installers verify the publisher; an unsigned build still updates from the
 * address you control.
 */
const semverLess = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0);
  return false;
};
let updater = null;
async function setupUpdater() {
  if (!app.isPackaged) return;
  let info;
  try {
    info = await api.updateInfo();
  } catch {
    return; // offline: try again at the next check
  }
  if (info.minVersion && semverLess(app.getVersion(), info.minVersion)) send('update:status', { state: 'required', version: info.minVersion });
  if (!info.url) return;
  try {
    if (!updater) {
      ({ autoUpdater: updater } = require('electron-updater'));
      updater.autoDownload = true;
      updater.autoInstallOnAppQuit = true;
      updater.on('update-available', (i) => send('update:status', { state: 'downloading', version: i.version }));
      updater.on('update-downloaded', (i) => send('update:status', { state: 'ready', version: i.version }));
      updater.on('error', () => {}); // a failed check is quiet: the next one tries again
    }
    updater.setFeedURL({ provider: 'generic', url: info.url });
    await updater.checkForUpdates();
  } catch {
    /* quiet */
  }
}
ipcMain.handle('update:install', () => {
  quitting = true;
  if (updater) updater.quitAndInstall();
});

app.whenReady().then(() => {
  setTimeout(setupUpdater, 30_000);
  setInterval(setupUpdater, 4 * 3600_000);
});

app.on('before-quit', () => (quitting = true));
app.on('will-quit', () => globalShortcut.unregisterAll());
// Clicking the Dock icon brings Metis back (a Mac app stays running with no window open).
app.on('activate', () => showWindow());
app.on('window-all-closed', () => {
  /* stay in the tray */
});
