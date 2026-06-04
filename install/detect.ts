/**
 * インストールターゲット判定ロジック (純粋関数)
 *
 * Node の platform/arch を関数で受け取り、テスト可能に。
 * 1つのインストーラで全 OS 対応するための核。
 */

export interface InstallTarget {
  os: 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'web';
  arch: 'x64' | 'arm64' | 'universal';
  format: 'exe' | 'dmg' | 'AppImage' | 'deb' | 'rpm' | 'apk' | 'ipa' | 'pwa';
  url: string;
}

export interface DetectInput {
  platform: string; // 'win32' | 'darwin' | 'linux' | 'android' | ...
  arch: string; // 'x64' | 'arm64' | 'ia32' | ...
  /** Linux パッケージマネージャ判定結果 (オプション、テスト時に注入) */
  linuxFormat?: 'deb' | 'rpm' | 'AppImage';
  /** ベース URL (バージョン込み) */
  baseUrl: string;
  version: string;
}

export function detectInstallTarget(input: DetectInput): InstallTarget {
  const { platform, arch, baseUrl, version } = input;
  const archNorm: 'x64' | 'arm64' = arch === 'arm64' ? 'arm64' : 'x64';

  if (platform === 'win32') {
    return {
      os: 'windows',
      arch: archNorm,
      format: 'exe',
      url: `${baseUrl}/v${version}/Artone-${version}-${archNorm}.exe`,
    };
  }

  if (platform === 'darwin') {
    return {
      os: 'macos',
      arch: 'universal',
      format: 'dmg',
      url: `${baseUrl}/v${version}/Artone-${version}-universal.dmg`,
    };
  }

  if (platform === 'linux') {
    const fmt = input.linuxFormat ?? 'AppImage';
    return {
      os: 'linux',
      arch: archNorm,
      format: fmt,
      url: `${baseUrl}/v${version}/Artone-${version}-${archNorm}.${fmt}`,
    };
  }

  if (platform === 'android') {
    return {
      os: 'android',
      arch: archNorm,
      format: 'apk',
      url: `${baseUrl}/v${version}/Artone-${version}-android.apk`,
    };
  }

  if (platform === 'ios' || platform === 'darwin-ios') {
    return {
      os: 'ios',
      arch: 'universal',
      format: 'ipa',
      // App Store URL は配布開始時に確定。それまでは PWA リダイレクト
      url: `${baseUrl}/v${version}/ios-redirect`,
    };
  }

  // 不明 OS → PWA フォールバック
  return {
    os: 'web',
    arch: 'universal',
    format: 'pwa',
    url: 'https://github.com/shizukutanaka/artone',
  };
}

/**
 * URL の妥当性検証。
 * 不正な URL でダウンロードを実行しないためのガード。
 */
export function validateInstallUrl(url: string): { valid: boolean; error?: string } {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') {
      return { valid: false, error: 'Insecure protocol — HTTPS required' };
    }
    if (!u.hostname) {
      return { valid: false, error: 'Missing hostname' };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: `Invalid URL: ${(err as Error).message}` };
  }
}

/**
 * ファイル名抽出 (URL から)
 */
export function extractFileName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').pop() ?? '';
    return last || 'artone-installer';
  } catch {
    return 'artone-installer';
  }
}
