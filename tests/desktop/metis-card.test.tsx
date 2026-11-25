import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppDownload } from '@/app/admin/app/AppDownload';
import { detectDevice } from '@/app/admin/app/device';
import { MetisDesktop } from '@/app/admin/app/MetisDesktop';
import type { MetisRelease } from '@/lib/metis-release';

const rel = (o: Partial<MetisRelease> = {}): MetisRelease => ({
  version: '0.1.0',
  releasedAt: '2026-11-25T20:54:25.010Z',
  windows: { file: 'Metis-Setup-0.1.0.exe', url: 'https://f.example.com/m/Metis-Setup-0.1.0.exe', sizeBytes: 102676555, sha512: null },
  mac: null,
  ...o,
});
const MAC = { file: 'Metis-0.1.0-mac.dmg', url: 'https://f.example.com/m/Metis-0.1.0-mac.dmg', sizeBytes: 210000000, sha512: null };
const apk = { versionCode: 7, versionName: '1.0.6', minVersionCode: 1, releasedAt: '2026-11-20', notes: ['A fix'], apk: '/app/heliaxis.apk', sizeBytes: 5242880, sha256: 'abc' };

describe('Metis for Windows and Mac', () => {
  it('says the download is not ready when nothing is published, with no link', () => {
    for (const os of ['windows', 'mac'] as const) {
      const html = renderToStaticMarkup(<MetisDesktop os={os} release={null} signed={false} />);
      expect(html).toContain('ready to download yet');
      expect(html).not.toContain('<a ');
    }
  });
  it('offers the right file for each device', () => {
    const r = rel({ mac: MAC });
    const win = renderToStaticMarkup(<MetisDesktop os="windows" release={r} signed={false} />);
    expect(win).toContain('href="https://f.example.com/m/Metis-Setup-0.1.0.exe"');
    expect(win).toContain('Download for Windows (98 MB)');
    expect(win).not.toContain('.dmg');
    const mac = renderToStaticMarkup(<MetisDesktop os="mac" release={r} signed={false} />);
    expect(mac).toContain('href="https://f.example.com/m/Metis-0.1.0-mac.dmg"');
    expect(mac).toContain('Download for Mac (200 MB)');
    expect(mac).not.toContain('.exe');
  });
  it('says the Mac version is not ready when only Windows is published', () => {
    expect(renderToStaticMarkup(<MetisDesktop os="mac" release={rel()} signed={false} />)).toContain('Mac version');
    expect(renderToStaticMarkup(<MetisDesktop os="mac" release={rel()} signed={false} />)).toContain('ready to download yet');
  });
  it('explains the warning for each system until it is signed, then stops', () => {
    const r = rel({ mac: MAC });
    expect(renderToStaticMarkup(<MetisDesktop os="windows" release={r} signed={false} />)).toContain('Windows protected your PC');
    expect(renderToStaticMarkup(<MetisDesktop os="mac" release={r} signed={false} />)).toContain('cannot verify the developer');
    expect(renderToStaticMarkup(<MetisDesktop os="windows" release={r} signed />)).not.toContain('not code-signed');
  });
});

describe('which device the person is on', () => {
  const UA = {
    win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/120.0',
  };
  it('recognises each', () => {
    expect(detectDevice(UA.win)).toBe('windows');
    expect(detectDevice(UA.mac)).toBe('mac');
    expect(detectDevice(UA.iphone)).toBe('ios');
    expect(detectDevice(UA.android)).toBe('android');
  });
  it('treats a Mac with a touch screen as an iPad, and guesses nothing for anything else', () => {
    expect(detectDevice(UA.mac, 5)).toBe('ios');
    expect(detectDevice(UA.mac, 0)).toBe('mac');
    expect(detectDevice(UA.linux)).toBeNull();
    expect(detectDevice('')).toBeNull();
  });
});

describe('the App page chooser', () => {
  const html = (device?: 'mac' | 'windows' | 'ios' | 'android') =>
    renderToStaticMarkup(
      <AppDownload
        release={apk}
        initialDevice={device ?? null}
        windows={<MetisDesktop os="windows" release={rel()} signed={false} />}
        mac={<MetisDesktop os="mac" release={rel({ mac: MAC })} signed={false} />}
        sendToPhone={<section>SEND-TO-PHONE</section>}
        appearance={<section>APPEARANCE</section>}
      />,
    );
  it('asks which device, and offers macOS, Windows, iOS and Android with their logos', () => {
    const h = html();
    expect(h).toContain('Which device are you looking to install on?');
    for (const name of ['macOS', 'Windows', 'iOS', 'Android']) expect(h).toContain(`>${name}<`);
    expect((h.match(/role="radio"/g) ?? []).length).toBe(4);
    expect((h.match(/<svg/g) ?? []).length).toBe(4); // one logo each
    expect(h).toContain('#3DDC84'); // Android green
    expect(h).toContain('#0078D4'); // Windows blue
    expect(h).toContain('Pick your device above');
  });
  it('shows only the chosen device’s steps', () => {
    expect(html('windows')).toContain('Metis for Windows');
    expect(html('windows')).not.toContain('Metis for Mac');
    expect(html('mac')).toContain('Metis for Mac');
    expect(html('ios')).toContain('Add Heliaxis to your iPhone or iPad');
    expect(html('ios')).not.toContain('SEND-TO-PHONE');
    const a = html('android');
    expect(a).toContain('The Heliaxis app for Android');
    expect(a).toContain('SEND-TO-PHONE');
    expect(a).toContain('href="/app/heliaxis.apk?v=7"');
  });
  it('marks the chosen one, and always shows Appearance', () => {
    const h = html('mac');
    expect((h.match(/aria-checked="true"/g) ?? []).length).toBe(1);
    expect(h).toContain('APPEARANCE');
  });
});
