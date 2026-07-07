#!/usr/bin/env node
/**
 * Artone v3 — クロスプラットフォームインストーラー
 *
 * OS 自動検出して適切なバイナリ / ラッパーをインストール:
 * - Windows: .exe (NSIS / Squirrel)
 * - macOS: .dmg (notarized)
 * - Linux: .AppImage / .deb / .rpm
 * - iOS: TestFlight / App Store (Capacitor)
 * - Android: APK / Play Store (Capacitor)
 * - Web: PWA インストール (デフォルト)
 *
 * 単一エントリポイント。OS 別ダウンロードURLを自動選択。
 *
 * 使用:
 *   curl -fsSL https://github.com/shizukutanaka/artone/releases/latest/download/install.js | node
 *   または
 *   node install.js
 */

import { platform, arch } from 'os';
import { execSync } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, unlinkSync, createReadStream, statSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';
import { get } from 'https';
import { createInterface } from 'readline';
import { detectInstallTarget, validateInstallUrl } from './install/detect';

const VERSION = '3.0.0';
const BASE_URL = 'https://github.com/shizukutanaka/artone/releases/download';

/**
 * チェックサムマニフェスト URL — 各リリースに同梱される SHA256 一覧。
 * 形式: `<sha256>  <filename>` (Linux sha256sum と互換)
 */
const CHECKSUM_URL = `${BASE_URL}/v${VERSION}/SHA256SUMS`;

interface InstallTarget {
  os: 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'web';
  arch: 'x64' | 'arm64' | 'universal';
  format: string;
  url: string;
  installer: () => Promise<void>;
}

function detectPlatform(): InstallTarget {
  const target = detectInstallTarget({
    platform: platform(),
    arch: arch(),
    linuxFormat: platform() === 'linux' ? detectLinuxFormat() : undefined,
    baseUrl: BASE_URL,
    version: VERSION,
  });

  // URL 妥当性検証 — 不正 URL でダウンロードしない
  const v = validateInstallUrl(target.url);
  if (!v.valid) {
    throw new Error(`Invalid install URL: ${v.error}`);
  }

  // installer 関数を割り当て (網羅的型チェック)
  type InstallerArgs = { url: string; format: string };
  type Installer = (args: InstallerArgs) => Promise<void>;
  const installerMap = {
    windows: installWindows,
    macos: installMacOS,
    linux: installLinux,
    android: () => installPWA(),
    ios: () => installPWA(),
    web: () => installPWA(),
  } satisfies Record<InstallTarget['os'], Installer>;
  const fn: Installer = installerMap[target.os];

  return {
    os: target.os,
    arch: target.arch,
    format: target.format,
    url: target.url,
    installer: () => fn({ url: target.url, format: target.format }),
  };
}

function detectLinuxFormat(): 'deb' | 'rpm' | 'AppImage' {
  // ディストリビューション検出
  try {
    execSync('which dpkg', { stdio: 'ignore' });
    return 'deb';
  } catch {}
  try {
    execSync('which rpm', { stdio: 'ignore' });
    return 'rpm';
  } catch {}
  return 'AppImage';
}

async function installWindows(target: { url: string; format: string }): Promise<void> {
  const downloadDir = join(homedir(), 'Downloads');
  const filename = `Artone-${VERSION}.exe`;
  const filePath = join(downloadDir, filename);

  console.log('[Artone] Windows インストーラーをダウンロード中...');
  await downloadFile(target.url, filePath);
  await verifyDownload(filePath, filename);

  console.log('[Artone] インストーラーを起動...');
  execSync(`start "" "${filePath}"`, { stdio: 'inherit' });
}

async function installMacOS(target: { url: string; format: string }): Promise<void> {
  const downloadDir = join(homedir(), 'Downloads');
  const filename = `Artone-${VERSION}.dmg`;
  const filePath = join(downloadDir, filename);

  console.log('[Artone] macOS インストーラーをダウンロード中...');
  await downloadFile(target.url, filePath);
  await verifyDownload(filePath, filename);

  console.log('[Artone] DMG をマウント...');
  execSync(`open "${filePath}"`, { stdio: 'inherit' });
}

async function installLinux(target: { url: string; format: string }): Promise<void> {
  const { format, url } = target;
  const downloadDir = join(homedir(), 'Downloads');
  const filename = `Artone-${VERSION}.${format}`;
  const filePath = join(downloadDir, filename);

  console.log(`[Artone] Linux (${format}) パッケージをダウンロード中...`);
  await downloadFile(url, filePath);
  await verifyDownload(filePath, filename);

  if (format === 'deb') {
    console.log('[Artone] dpkg でインストール...');
    execSync(`sudo dpkg -i "${filePath}"`, { stdio: 'inherit' });
  } else if (format === 'rpm') {
    console.log('[Artone] rpm でインストール...');
    execSync(`sudo rpm -i "${filePath}"`, { stdio: 'inherit' });
  } else {
    console.log('[Artone] AppImage を実行可能化...');
    execSync(`chmod +x "${filePath}"`, { stdio: 'inherit' });
    console.log(`[Artone] 起動: ${filePath}`);
  }
}

async function installPWA(): Promise<void> {
  console.log('[Artone] PWA は以下の URL で利用可能:');
  console.log('  https://github.com/shizukutanaka/artone');
  console.log('');
  console.log('対応ブラウザ (Chrome/Edge/Safari) で開き、');
  console.log('「ホーム画面に追加」または「インストール」を選択。');
}

function downloadFile(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = destination.split(/[/\\]/).slice(0, -1).join('/');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const cleanup = (): void => {
      try {
        if (existsSync(destination)) unlinkSync(destination);
      } catch {}
    };

    const file = createWriteStream(destination);
    get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // リダイレクト追従 — 部分書き込みファイル削除
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          cleanup();
          downloadFile(redirectUrl, destination).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        cleanup();
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', (err) => {
        cleanup();
        reject(err);
      });
    }).on('error', (err) => {
      file.close();
      cleanup();
      reject(err);
    });
  });
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt + ' [y/N] ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * SHA256 チェックサム計算 (ストリーミング、メモリ効率的)
 */
function computeSHA256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * チェックサムマニフェスト取得 → 該当ファイルのハッシュを返す。
 * 取得失敗時は null (検証スキップ)。
 */
async function fetchExpectedChecksum(filename: string): Promise<string | null> {
  try {
    const tmpPath = join(homedir(), '.artone-tmp-SHA256SUMS');
    await downloadFile(CHECKSUM_URL, tmpPath);
    const fs = await import('fs');
    const content = fs.readFileSync(tmpPath, 'utf-8');
    fs.unlinkSync(tmpPath);

    // 形式: `<hash>  <filename>` 行
    for (const line of content.split('\n')) {
      const m = line.match(/^([a-f0-9]{64})\s+(.+)$/);
      if (m && m[2].trim() === filename) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * ダウンロードファイルの整合性検証。
 * - 期待ハッシュが取得できる場合は SHA256 を強制検証
 * - 取得不能 (オフライン/未公開) の場合は警告のみ
 * - 不一致なら必ず失敗 + ファイル削除
 */
async function verifyDownload(filePath: string, filename: string): Promise<void> {
  const stat = statSync(filePath);
  if (stat.size === 0) {
    unlinkSync(filePath);
    throw new Error('Downloaded file is empty');
  }

  const expected = await fetchExpectedChecksum(filename);
  if (!expected) {
    console.warn('[Artone] チェックサム検証スキップ (マニフェスト取得不能)');
    return;
  }

  const actual = await computeSHA256(filePath);
  if (actual !== expected) {
    unlinkSync(filePath);
    throw new Error(
      `SHA256 mismatch — expected ${expected}, got ${actual}. File may be tampered.`
    );
  }
  console.log('[Artone] チェックサム検証 OK');
}

async function main(): Promise<void> {
  console.log('Artone v3 インストーラー');
  console.log('='.repeat(40));

  const target = detectPlatform();
  console.log(`検出: ${target.os} (${target.arch}) / ${target.format}`);
  console.log(`URL: ${target.url}`);
  console.log('');

  const ok = await confirm('インストールを続行しますか?');
  if (!ok) {
    console.log('キャンセル');
    process.exit(0);
  }

  try {
    await target.installer();
    console.log('');
    console.log('[Artone] インストール完了');
  } catch (err) {
    console.error('[Artone] エラー:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[Artone] Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
