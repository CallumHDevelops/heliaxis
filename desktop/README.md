# Metis Desktop

Windows desktop shell for Metis (Electron). It signs in with the person's normal HAP login and talks to HAP's
`/api/desktop/*` routes; the Anthropic key and the service role key stay on the server.

## Run in development

```powershell
cd desktop
npm install
node node_modules/electron/install.js   # only if npm skipped Electron's download script
npm start                               # --dev is the same; add --hidden to start in the tray
```

By default it talks to `https://heliaxis.co.uk`. Point it at a local HAP (`npm run dev` in the repo root) in Settings
(HAP address, e.g. `http://localhost:3000`). Settings are stored in `%APPDATA%\Metis\settings.json`; the sign-in
(refresh token) is encrypted with Windows DPAPI in `session.bin` beside it.

Default shortcut `Ctrl+Shift+H` (changeable in Settings; a warning shows if Windows won't register it).
Keys: Enter sends, Shift+Enter new line, Esc hides, Ctrl+N new chat.
