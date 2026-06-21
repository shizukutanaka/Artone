/**
 * Artone v3 — Common Utilities
 *
 * アプリ全体で共有されるヘルパー群。
 * Math/String セクションは純粋関数 (副作用なし・ブラウザ非依存)。
 * Storage セクションは localStorage に依存し、失敗時はログを残しつつ安全に
 * フォールバックする (throw しない)。
 */

import { createLogger } from './logger';

const log = createLogger('Storage');

// ============================================================
// Storage
// ============================================================

/**
 * localStorage への安全アクセス。
 * React artifact / SSR / プライベートモードで throw する環境に対応。
 */
export function safeStorageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch (e) {
    log.warn(`localStorage.getItem("${key}") failed`, e);
    return null;
  }
}

export function safeStorageSet(key: string, value: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    // Usually QuotaExceededError (storage full) or a privacy-mode block.
    // Callers often ignore the return (e.g. recovery writes), so a silent
    // failure would lose data invisibly — surface it for diagnosis.
    log.warn(`localStorage.setItem("${key}") failed (quota exceeded or storage disabled?)`, e);
    return false;
  }
}

export function safeStorageRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch (e) {
    log.warn(`localStorage.removeItem("${key}") failed`, e);
  }
}

// ============================================================
// JSON
// ============================================================

/**
 * JSON.parse に型パラメータ付き安全版。パース失敗時は null。
 */
export function safeJsonParse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// ============================================================
// Math
// ============================================================

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function frameToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

export function secondsToFrame(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

// ============================================================
// String
// ============================================================

/**
 * XML 特殊文字のエスケープ。OTIO/FCPXML エクスポートで使用。
 * interchange/utils.ts と同一実装 — そちらを削除してこちらに統一。
 */
export function escapeXML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * ゼロパディング。タイムコード生成で使用。
 */
export function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/**
 * シンプルな UUID v4。暗号的強度は不要な内部 ID 用。
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback (テスト環境等)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * バイト数を人間が読みやすい形式に。
 * 例: 1536 → "1.5 KB"
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * タイムコード文字列 (mm:ss:ff)。UI 表示用。
 */
export function formatTimecode(seconds: number, fps = 30): string {
  const totalFrames = Math.floor(seconds * fps);
  const f = totalFrames % fps;
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${pad(m)}:${pad(s)}:${pad(f)}`;
}
