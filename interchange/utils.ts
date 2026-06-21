/**
 * interchange 共通ユーティリティ
 *
 * 重複削除: pad / escapeXML / UUID
 */

export function pad(n: number, width = 2): string {
  return n.toString().padStart(width, '0');
}

export function escapeXML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function uuid(): string {
  // crypto.randomUUID 利用可能な環境を優先
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 安全な JSON.parse — 例外時は null 返却 */
export function safeParseJSON<T = unknown>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
