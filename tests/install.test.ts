/**
 * インストール検出ロジックのテスト
 */

import { describe, it, expect } from 'vitest';
import { detectInstallTarget, validateInstallUrl, extractFileName } from '../install/detect';

const BASE_URL = 'https://github.com/shizukutanaka/artone/releases/download';
const VERSION = '3.0.0';
const baseInput = { baseUrl: BASE_URL, version: VERSION };

describe('detectInstallTarget', () => {
  it('detects Windows x64', () => {
    const target = detectInstallTarget({ ...baseInput, platform: 'win32', arch: 'x64' });
    expect(target.os).toBe('windows');
    expect(target.arch).toBe('x64');
    expect(target.format).toBe('exe');
    expect(target.url).toContain('Artone-3.0.0-x64.exe');
  });

  it('detects Windows arm64', () => {
    const target = detectInstallTarget({ ...baseInput, platform: 'win32', arch: 'arm64' });
    expect(target.arch).toBe('arm64');
    expect(target.url).toContain('Artone-3.0.0-arm64.exe');
  });

  it('detects macOS as universal', () => {
    const target = detectInstallTarget({ ...baseInput, platform: 'darwin', arch: 'x64' });
    expect(target.os).toBe('macos');
    expect(target.arch).toBe('universal');
    expect(target.format).toBe('dmg');
  });

  it('detects Linux deb', () => {
    const target = detectInstallTarget({
      ...baseInput,
      platform: 'linux',
      arch: 'x64',
      linuxFormat: 'deb',
    });
    expect(target.os).toBe('linux');
    expect(target.format).toBe('deb');
  });

  it('detects Linux rpm', () => {
    const target = detectInstallTarget({
      ...baseInput,
      platform: 'linux',
      arch: 'x64',
      linuxFormat: 'rpm',
    });
    expect(target.format).toBe('rpm');
  });

  it('falls back to AppImage on unknown Linux', () => {
    const target = detectInstallTarget({ ...baseInput, platform: 'linux', arch: 'x64' });
    expect(target.format).toBe('AppImage');
  });

  it('detects Android', () => {
    const target = detectInstallTarget({ ...baseInput, platform: 'android', arch: 'arm64' });
    expect(target.os).toBe('android');
    expect(target.format).toBe('apk');
  });

  it('detects iOS', () => {
    const target = detectInstallTarget({ ...baseInput, platform: 'ios', arch: 'arm64' });
    expect(target.os).toBe('ios');
    expect(target.format).toBe('ipa');
  });

  it('falls back to PWA for unknown platform', () => {
    const target = detectInstallTarget({ ...baseInput, platform: 'sunos', arch: 'x64' });
    expect(target.os).toBe('web');
    expect(target.format).toBe('pwa');
  });

  it('handles non-arm64 archs as x64', () => {
    const target = detectInstallTarget({ ...baseInput, platform: 'linux', arch: 'ia32' });
    expect(target.arch).toBe('x64');
  });
});

describe('validateInstallUrl', () => {
  it('passes valid HTTPS URL', () => {
    const r = validateInstallUrl('https://github.com/foo/bar.exe');
    expect(r.valid).toBe(true);
  });

  it('rejects HTTP URL', () => {
    const r = validateInstallUrl('http://example.com/file.exe');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('HTTPS');
  });

  it('rejects malformed URL', () => {
    const r = validateInstallUrl('not-a-url');
    expect(r.valid).toBe(false);
  });

  it('rejects URL without hostname', () => {
    // 'https://' は authority が空 = ホスト名なし。special scheme で
    // ホストが空の URL は不正として拒否されなければならない。
    const r = validateInstallUrl('https://');
    expect(r.valid).toBe(false);
  });
});

describe('extractFileName', () => {
  it('extracts filename from URL', () => {
    expect(extractFileName('https://example.com/path/file.exe')).toBe('file.exe');
  });

  it('handles URL without filename', () => {
    expect(extractFileName('https://example.com/')).toBe('artone-installer');
  });

  it('handles malformed URL', () => {
    expect(extractFileName('not-a-url')).toBe('artone-installer');
  });
});

describe('Cross-platform consistency', () => {
  it('every platform produces a valid URL', () => {
    const platforms = ['win32', 'darwin', 'linux', 'android', 'ios'];
    for (const p of platforms) {
      const target = detectInstallTarget({ ...baseInput, platform: p, arch: 'x64' });
      const v = validateInstallUrl(target.url);
      expect(v.valid).toBe(true);
    }
  });

  it('PWA fallback always valid', () => {
    const target = detectInstallTarget({ ...baseInput, platform: 'unknown', arch: 'x64' });
    const v = validateInstallUrl(target.url);
    expect(v.valid).toBe(true);
  });
});
