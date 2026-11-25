'use strict';
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

/** Plain settings (hotkey, server, start with Windows) in userData/settings.json. Nothing secret lives here. */
const DEFAULTS = { hotkey: 'Control+Shift+H', hapUrl: 'https://heliaxis.co.uk', startWithWindows: false };
const file = (n) => path.join(app.getPath('userData'), n);

function readSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file('settings.json'), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}
function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(file('settings.json'), JSON.stringify(next, null, 2));
  return next;
}

/**
 * The refresh token is encrypted with Electron safeStorage, which on Windows is DPAPI: only this Windows user can
 * decrypt it, the same protection Credential Manager gives. If encryption is unavailable we refuse to store it
 * (the person signs in each time) rather than write a token in plain text.
 */
function saveSecret(obj) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(file('session.bin'), safeStorage.encryptString(JSON.stringify(obj)));
  return true;
}
function loadSecret() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(file('session.bin'))));
  } catch {
    return null;
  }
}
function clearSecret() {
  try {
    fs.unlinkSync(file('session.bin'));
  } catch {
    /* already gone */
  }
}

module.exports = { readSettings, writeSettings, saveSecret, loadSecret, clearSecret, DEFAULTS };
