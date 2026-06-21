/**
 * Artone v3 — Structured Logger
 *
 * console.warn/error を直書きせず、全てここを通す。
 * - 開発: console に色付き出力
 * - 本番: テレメトリエンドポイントに送信 (将来拡張)
 * - テスト: vi.mock で全ログを抑制可能
 *
 * 設計: Martin — 単一責任。Pike — 呼び出し側は1行で済む。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
}

export interface LogHandler {
  handle(entry: LogEntry): void;
}

// === コンソールハンドラ ===

class ConsoleHandler implements LogHandler {
  private readonly styles: Record<LogLevel, string> = {
    debug: 'color:#7A7A7A',
    info:  'color:#00C4CC',
    warn:  'color:#F59E0B;font-weight:bold',
    error: 'color:#EF4444;font-weight:bold',
  };

  handle(entry: LogEntry): void {
    const prefix = `[Artone/${entry.module}]`;
    const style = this.styles[entry.level];

    if (typeof window !== 'undefined') {
      // ブラウザ — スタイル付き
      const method = entry.level === 'debug' ? 'log'
                   : entry.level === 'info'  ? 'log'
                   : entry.level === 'warn'  ? 'warn'
                   : 'error';
      if (entry.data !== undefined) {
        console[method](`%c${prefix} ${entry.message}`, style, entry.data);
      } else {
        console[method](`%c${prefix} ${entry.message}`, style);
      }
    } else {
      // Node/test — シンプル
      const method = entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'log';
      console[method](`${prefix} ${entry.message}`, entry.data ?? '');
    }
  }
}

// === リングバッファ (直近ログを保持、クラッシュレポートに添付用) ===

class RingBuffer {
  private buf: LogEntry[] = [];
  private readonly max: number;

  constructor(max = 200) { this.max = max; }

  push(entry: LogEntry): void {
    this.buf.push(entry);
    if (this.buf.length > this.max) this.buf.shift();
  }

  snapshot(): LogEntry[] { return [...this.buf]; }
  clear(): void { this.buf = []; }
}

// === Logger ===

class Logger {
  private handlers: LogHandler[] = [];
  private readonly ring = new RingBuffer(200);
  /** INFO 以上を開発環境でも出す。DEBUG はデフォルト抑制。 */
  private minLevel: LogLevel = 'info';

  private readonly levelOrder: Record<LogLevel, number> = {
    debug: 0, info: 1, warn: 2, error: 3,
  };

  constructor() {
    // デフォルト: コンソールハンドラ
    if (typeof console !== 'undefined') {
      this.handlers.push(new ConsoleHandler());
    }
  }

  setMinLevel(level: LogLevel): void { this.minLevel = level; }
  addHandler(h: LogHandler): void { this.handlers.push(h); }
  clearHandlers(): void { this.handlers = []; }

  private emit(level: LogLevel, module: string, message: string, data?: unknown): void {
    if (this.levelOrder[level] < this.levelOrder[this.minLevel]) return;
    const entry: LogEntry = { timestamp: Date.now(), level, module, message, data };
    this.ring.push(entry);
    for (const h of this.handlers) {
      try { h.handle(entry); } catch { /* ロガー自体でクラッシュしない */ }
    }
  }

  debug(module: string, message: string, data?: unknown): void { this.emit('debug', module, message, data); }
  info(module: string, message: string, data?: unknown): void  { this.emit('info',  module, message, data); }
  warn(module: string, message: string, data?: unknown): void  { this.emit('warn',  module, message, data); }
  error(module: string, message: string, data?: unknown): void { this.emit('error', module, message, data); }

  /** クラッシュレポート用スナップショット */
  getRecentLogs(): LogEntry[] { return this.ring.snapshot(); }
}

/** シングルトン */
export const logger = new Logger();

/** モジュール固定のロガーファクトリ */
export function createLogger(module: string) {
  return {
    debug: (msg: string, data?: unknown) => logger.debug(module, msg, data),
    info:  (msg: string, data?: unknown) => logger.info(module, msg, data),
    warn:  (msg: string, data?: unknown) => logger.warn(module, msg, data),
    error: (msg: string, data?: unknown) => logger.error(module, msg, data),
  };
}
