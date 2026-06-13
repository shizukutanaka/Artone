/**
 * app/utils.ts テスト — 純粋関数なので全ケースが決定論的
 */

import { describe, it, expect, vi } from 'vitest';
import {
  safeStorageGet, safeStorageSet, safeStorageRemove,
  safeJsonParse,
  clamp, lerp, frameToSeconds, secondsToFrame,
  escapeXML, pad, uuid, formatBytes, formatTimecode,
} from '../app/utils';

describe('safeStorage', () => {
  it('get returns null for missing key', () => {
    expect(safeStorageGet('__nonexistent__')).toBeNull();
  });

  it('set and get round-trips', () => {
    safeStorageSet('__test__', 'hello');
    expect(safeStorageGet('__test__')).toBe('hello');
    safeStorageRemove('__test__');
  });

  it('remove clears the key', () => {
    safeStorageSet('__test2__', 'x');
    safeStorageRemove('__test2__');
    expect(safeStorageGet('__test2__')).toBeNull();
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse<{ x: number }>('{"x":1}')).toEqual({ x: 1 });
  });

  it('returns null on invalid JSON', () => {
    expect(safeJsonParse('not json')).toBeNull();
  });

  it('returns null on null input', () => {
    expect(safeJsonParse(null)).toBeNull();
  });
});

describe('clamp', () => {
  it('clamps below min', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('clamps above max', () => expect(clamp(15, 0, 10)).toBe(10));
  it('passes through in range', () => expect(clamp(5, 0, 10)).toBe(5));
  it('handles equal min/max', () => expect(clamp(3, 5, 5)).toBe(5));
});

describe('lerp', () => {
  it('lerp(a, b, 0) === a', () => expect(lerp(0, 100, 0)).toBe(0));
  it('lerp(a, b, 1) === b', () => expect(lerp(0, 100, 1)).toBe(100));
  it('lerp midpoint', () => expect(lerp(0, 100, 0.5)).toBe(50));
});

describe('frame / seconds conversion', () => {
  it('frameToSeconds', () => expect(frameToSeconds(60, 30)).toBe(2));
  it('secondsToFrame', () => expect(secondsToFrame(2, 30)).toBe(60));
  it('round-trip', () => {
    for (const frames of [0, 1, 30, 100, 1801]) {
      expect(secondsToFrame(frameToSeconds(frames, 30), 30)).toBe(frames);
    }
  });
});

describe('escapeXML', () => {
  it('escapes all special chars', () => {
    expect(escapeXML('<script>&"test"\'</script>')).toBe(
      '&lt;script&gt;&amp;&quot;test&quot;&apos;&lt;/script&gt;'
    );
  });

  it('passes through plain text', () => {
    expect(escapeXML('hello world 123')).toBe('hello world 123');
  });
});

describe('pad', () => {
  it('pads single digit', () => expect(pad(5)).toBe('05'));
  it('leaves 2-digit alone', () => expect(pad(42)).toBe('42'));
  it('custom width', () => expect(pad(7, 3)).toBe('007'));
});

describe('uuid', () => {
  it('produces RFC 4122 format', () => {
    const id = uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is unique each call', () => {
    const ids = new Set(Array.from({ length: 100 }, uuid));
    expect(ids.size).toBe(100);
  });
});

describe('formatBytes', () => {
  it('bytes', () => expect(formatBytes(512)).toBe('512 B'));
  it('kilobytes', () => expect(formatBytes(1536)).toBe('1.5 KB'));
  it('megabytes', () => expect(formatBytes(10 * 1024 * 1024)).toBe('10.0 MB'));
  it('gigabytes', () => expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB'));
});

describe('formatTimecode', () => {
  it('zero', () => expect(formatTimecode(0, 30)).toBe('00:00:00'));
  it('one second', () => expect(formatTimecode(1, 30)).toBe('00:01:00'));
  it('one minute', () => expect(formatTimecode(60, 30)).toBe('01:00:00'));
  it('one hour', () => expect(formatTimecode(3600, 30)).toBe('60:00:00'));
  it('with frames', () => expect(formatTimecode(1.5, 30)).toBe('00:01:15'));
});

describe('uuid — fallback path (no crypto.randomUUID)', () => {
  it('produces a valid UUID via Math.random when crypto.randomUUID is absent', () => {
    vi.stubGlobal('crypto', {});
    try {
      const id = uuid();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('safeStorageSet — throw path', () => {
  it('returns false when localStorage.setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(safeStorageSet('__throw_test__', 'x')).toBe(false);
    spy.mockRestore();
  });
});
