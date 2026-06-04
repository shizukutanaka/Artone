/**
 * app/logger.ts テスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { logger, createLogger, type LogEntry, type LogHandler } from '../app/logger';

class CapturingHandler implements LogHandler {
  entries: LogEntry[] = [];
  handle(entry: LogEntry): void { this.entries.push({ ...entry }); }
}

describe('Logger', () => {
  let handler: CapturingHandler;

  beforeEach(() => {
    handler = new CapturingHandler();
    logger.clearHandlers();
    logger.addHandler(handler);
    logger.setMinLevel('debug');
  });

  it('info writes to handler', () => {
    logger.info('Test', 'hello world');
    expect(handler.entries).toHaveLength(1);
    expect(handler.entries[0].level).toBe('info');
    expect(handler.entries[0].message).toBe('hello world');
    expect(handler.entries[0].module).toBe('Test');
  });

  it('debug suppressed when minLevel=info', () => {
    logger.setMinLevel('info');
    logger.debug('Test', 'debug msg');
    expect(handler.entries).toHaveLength(0);
  });

  it('warn passes when minLevel=info', () => {
    logger.setMinLevel('info');
    logger.warn('Test', 'warn msg');
    expect(handler.entries).toHaveLength(1);
    expect(handler.entries[0].level).toBe('warn');
  });

  it('error always passes', () => {
    logger.setMinLevel('error');
    logger.debug('T', 'debug');
    logger.info('T', 'info');
    logger.warn('T', 'warn');
    logger.error('T', 'error');
    expect(handler.entries).toHaveLength(1);
    expect(handler.entries[0].level).toBe('error');
  });

  it('data is forwarded to handler', () => {
    logger.warn('Test', 'with data', { key: 'value' });
    expect(handler.entries[0].data).toEqual({ key: 'value' });
  });

  it('timestamp is a valid ms epoch', () => {
    const before = Date.now();
    logger.info('T', 'x');
    const after = Date.now();
    expect(handler.entries[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(handler.entries[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('getRecentLogs returns up to 200 entries', () => {
    for (let i = 0; i < 205; i++) logger.info('T', `msg${i}`);
    const logs = logger.getRecentLogs();
    expect(logs.length).toBeLessThanOrEqual(200);
    // 最新が含まれる
    expect(logs[logs.length - 1].message).toBe('msg204');
  });

  it('multiple handlers all receive entries', () => {
    const h2 = new CapturingHandler();
    logger.addHandler(h2);
    logger.info('T', 'broadcast');
    expect(handler.entries).toHaveLength(1);
    expect(h2.entries).toHaveLength(1);
  });

  it('handler that throws does not crash logger', () => {
    const badHandler: LogHandler = { handle() { throw new Error('boom'); } };
    logger.addHandler(badHandler);
    expect(() => logger.info('T', 'test')).not.toThrow();
  });
});

describe('createLogger', () => {
  let handler: CapturingHandler;

  beforeEach(() => {
    handler = new CapturingHandler();
    logger.clearHandlers();
    logger.addHandler(handler);
    logger.setMinLevel('debug');
  });

  it('fixes module name', () => {
    const log = createLogger('MyModule');
    log.warn('something wrong');
    expect(handler.entries[0].module).toBe('MyModule');
  });

  it('all levels work', () => {
    const log = createLogger('X');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(handler.entries.map((e) => e.level)).toEqual(['debug', 'info', 'warn', 'error']);
  });
});
