// Reading serials out of barcode and QR payloads (src/lib/site/serials.ts, REGS 5.2 in order), the
// brand hints (never blocking), and duplicates.
// Usage: node --experimental-strip-types scripts/test-site-serials.mjs
const S = await import('../src/lib/site/serials.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const p = (raw) => {
  const r = S.parsePayload(raw);
  return [r.how, r.serial, r.model];
};
const RS = '\x1e';
const GS = '\x1d';
const EOT = '\x04';

/* ── 1. ISO/IEC 15434 ──────────────────────────────────────────────────────── */
eq('ISO 15434: S is the serial, 1P the model', p(`[)>${RS}06${GS}1PSE5000H${GS}SSJ1234-07F123AD7-A7${RS}${EOT}`), ['iso15434', 'SJ1234-07F123AD7-A7', 'SE5000H']);
eq('ISO 15434: 1S is not the serial', p(`[)>${RS}06${GS}1S999${GS}SABC12345${RS}${EOT}`), ['iso15434', 'ABC12345', null]);

/* ── 2. GS1 element strings ────────────────────────────────────────────────── */
eq('GS1 with ]d2 and FNC1: AI 21 after a fixed 01', p(`]d201095012345678901721123110${GS}21SN0012345`), ['gs1', 'SN0012345', null]);
eq('GS1 raw with GS separators', p(`0109501234567890${GS}21ABC123456${GS}10LOT1`), ['gs1', 'ABC123456', null]);
eq('GS1 human-readable (01)…(21)…', p('(01)09501234567890(21)XYZ987654'), ['gs1', 'XYZ987654', null]);

/* ── 3 and 4. URLs ─────────────────────────────────────────────────────────── */
eq('GS1 Digital Link', p('https://id.example.com/01/09501234567890/21/SER0001234'), ['digital_link', 'SER0001234', null]);
eq('URL with an sn query', p('https://monitor.example.com/register?sn=YA0450P335&x=1'), ['url', 'YA0450P335', null]);
eq('URL ending in the serial', p('https://example.com/device/WJ9443Q685'), ['url', 'WJ9443Q685', null]);

/* ── 5. Wi-Fi QR: the SSID only, never the password ────────────────────────── */
const wifi = S.parsePayload('WIFI:S:SUN2000-HV2150012345;T:WPA;P:Changeme123;;');
eq('Wi-Fi: Huawei Device-SN in the SSID', [wifi.how, wifi.serial], ['wifi', 'HV2150012345']);
eq('Wi-Fi: the password is not kept anywhere', JSON.stringify(wifi).includes('Changeme123'), false);

/* ── 6. JSON, 7. labelled text, 8. a bare token ────────────────────────────── */
eq('JSON: SerialNumber (any case)', p('{"SerialNumber":"EA2214G123","Model":"AIO"}'), ['json', 'EA2214G123', 'AIO']);
eq('labelled: S/N: …', p('PN: GIV-HY-5.0; S/N: SA2236G045; MAC 00:11:22'), ['labelled', 'SA2236G045', null]);
eq('labelled: Serial No. …', p('Model X\nSerial No. 2105123456789012'), ['labelled', '2105123456789012', null]);
eq('bare token', p('ZP1234567890'), ['bare', 'ZP1234567890', null]);
eq('too short to be a serial', p('AB12'), [null, null, null]);
eq('a sentence is not a serial', p('hello there, scan me'), [null, null, null]);

/* ── Several codes on one label: the surest serial is picked ───────────────── */
const multi = S.pickSerial(['https://example.com/app', `(01)09501234567890(21)PANEL0001`, 'ZP1234567890']);
eq('several codes: the GS1 serial is picked', [multi.chips.length, multi.pick, multi.chips[multi.pick].serial], [3, 1, 'PANEL0001']);
eq('no serial anywhere: nothing picked', S.pickSerial(['hi']).pick, -1);

/* ── Brand hints (REGS 5.1): hints only ────────────────────────────────────── */
eq('GivEnergy pattern', S.brandHint('YA0450P335'), 'Looks like a GivEnergy serial');
eq('SolarEdge 6-9-2', S.brandHint('SJ1234-07F123AD7-A7'), 'Looks like a SolarEdge serial');
eq('16 digits', S.brandHint('2105123456789012'), 'Looks like a 16-digit panel serial (JA Solar uses these)');
eq('no hint is not a problem', S.brandHint('ZP1234567890'), null);

/* ── Duplicates ────────────────────────────────────────────────────────────── */
eq('the same panel scanned twice (case and spaces ignored)', S.duplicates(['abc123456', 'ABC123456 ', 'XYZ999999']), ['ABC123456']);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
