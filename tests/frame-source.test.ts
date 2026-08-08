/**
 * Tests for media/frame-source.ts
 *
 * jsdom は実動画をデコードしないため `<video>` をスタブし、イベント駆動の
 * 制御フロー (メタデータ待ち・シーク待ち・タイムアウト・エラー・rVFC 有無・
 * close) を検証する。ピクセルの中身ではなく **配線と失敗経路** が対象。
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openFrameSource } from '../media/frame-source';

// ============================================================
// Harness
// ============================================================

interface FakeVideoOptions {
  width?: number;
  height?: number;
  duration?: number;
  /** 'loadedmetadata' を自動発火するか (false ならテスト側で制御)。 */
  autoMetadata?: boolean;
  /** currentTime 代入時に 'seeked' を自動発火するか。 */
  autoSeek?: boolean;
  /** rVFC を生やすか。生やす場合、返す mediaTime。 */
  rvfcMediaTime?: number | null;
}

let createdVideo: HTMLVideoElement | null = null;

/** `document.createElement('video')` をスタブし、制御可能な要素を返す。 */
function stubVideo(opts: FakeVideoOptions = {}): void {
  const {
    width = 1920, height = 1080, duration = 10,
    autoMetadata = true, autoSeek = true, rvfcMediaTime = null,
  } = opts;

  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = realCreateElement(tag) as HTMLVideoElement;
    if (tag !== 'video') return el;

    let currentTime = 0;
    Object.defineProperty(el, 'videoWidth', { get: () => width, configurable: true });
    Object.defineProperty(el, 'videoHeight', { get: () => height, configurable: true });
    Object.defineProperty(el, 'duration', { get: () => duration, configurable: true });
    Object.defineProperty(el, 'currentTime', {
      get: () => currentTime,
      set: (v: number) => {
        currentTime = v;
        if (autoSeek) queueMicrotask(() => el.dispatchEvent(new Event('seeked')));
      },
      configurable: true,
    });
    Object.defineProperty(el, 'src', {
      set: () => {
        if (autoMetadata) queueMicrotask(() => el.dispatchEvent(new Event('loadedmetadata')));
      },
      get: () => '',
      configurable: true,
    });
    // jsdom は load() 未実装で警告を出すため無効化。
    el.load = () => {};

    if (rvfcMediaTime !== null) {
      (el as unknown as Record<string, unknown>).requestVideoFrameCallback = (
        cb: (now: number, meta: { mediaTime: number }) => void
      ) => {
        queueMicrotask(() => cb(0, { mediaTime: rvfcMediaTime }));
        return 1;
      };
    }

    createdVideo = el;
    return el;
  }) as typeof document.createElement);
}

/** 生成された `VideoFrame` を記録するスタブ。 */
let framesCreated: Array<{ timestamp: number; closed: boolean }> = [];

beforeEach(() => {
  createdVideo = null;
  framesCreated = [];

  class FakeOffscreenCanvas {
    constructor(public width: number, public height: number) {}
    getContext() { return { drawImage: () => {} }; }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

  class FakeVideoFrame {
    timestamp: number;
    private rec: { timestamp: number; closed: boolean };
    constructor(_src: unknown, init: { timestamp: number }) {
      this.timestamp = init.timestamp;
      this.rec = { timestamp: init.timestamp, closed: false };
      framesCreated.push(this.rec);
    }
    close() { this.rec.closed = true; }
  }
  vi.stubGlobal('VideoFrame', FakeVideoFrame);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ============================================================
// openFrameSource
// ============================================================

describe('openFrameSource', () => {
  it('resolves after loadedmetadata and exposes media dimensions', async () => {
    stubVideo({ width: 1280, height: 720, duration: 42 });
    const src = await openFrameSource('blob:x');
    expect(src.width).toBe(1280);
    expect(src.height).toBe(720);
    expect(src.duration).toBe(42);
  });

  it('sets crossOrigin before src so the CORS mode applies to the actual load', async () => {
    // crossOrigin は src が発火するロードに対して決まるため、順序が逆だと
    // クロスオリジン素材でキャンバスが tainted になり VideoFrame 生成が落ちる。
    const order: string[] = [];
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = realCreateElement(tag) as HTMLVideoElement;
      if (tag !== 'video') return el;
      Object.defineProperty(el, 'crossOrigin', {
        set: () => { order.push('crossOrigin'); }, get: () => 'anonymous', configurable: true,
      });
      Object.defineProperty(el, 'src', {
        set: () => {
          order.push('src');
          queueMicrotask(() => el.dispatchEvent(new Event('loadedmetadata')));
        },
        get: () => '', configurable: true,
      });
      Object.defineProperty(el, 'videoWidth', { get: () => 10, configurable: true });
      Object.defineProperty(el, 'videoHeight', { get: () => 10, configurable: true });
      Object.defineProperty(el, 'duration', { get: () => 1, configurable: true });
      return el;
    }) as typeof document.createElement);

    await openFrameSource('blob:x');
    expect(order).toEqual(['crossOrigin', 'src']);
  });

  it('rejects when the media errors during metadata load', async () => {
    stubVideo({ autoMetadata: false });
    const p = openFrameSource('blob:bad');
    await Promise.resolve();
    createdVideo?.dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow(/Video load failed/);
  });

  it('REGRESSION: rejects instead of hanging when metadata never loads', async () => {
    vi.useFakeTimers();
    stubVideo({ autoMetadata: false });
    const p = openFrameSource('blob:stall');
    const assertion = expect(p).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});

// ============================================================
// getFrameAt
// ============================================================

describe('FrameSource.getFrameAt', () => {
  it('seeks and returns a frame whose timestamp is in microseconds', async () => {
    stubVideo({ duration: 10 });
    const src = await openFrameSource('blob:x');
    const { frame, mediaTime } = await src.getFrameAt(2.5);
    expect(mediaTime).toBe(2.5);
    expect(frame.timestamp).toBe(2_500_000);
    expect(framesCreated).toHaveLength(1);
  });

  it('uses requestVideoFrameCallback mediaTime as the ACTUAL frame time when available', async () => {
    // <video> の seek はフレーム正確でない。rVFC の mediaTime は実際に合成された
    // フレームの presentation timestamp なので、要求時刻ではなくこちらを返す
    // (呼び出し側がズレを検出できるようにするため)。
    stubVideo({ duration: 10, rvfcMediaTime: 2.4666 });
    const src = await openFrameSource('blob:x');
    const { mediaTime, frame } = await src.getFrameAt(2.5);
    expect(mediaTime).toBeCloseTo(2.4666, 4);   // 要求 2.5 とは異なる実時刻
    expect(frame.timestamp).toBe(Math.round(2.4666 * 1_000_000));
  });

  it('falls back to the requested time when requestVideoFrameCallback is unavailable', async () => {
    stubVideo({ duration: 10, rvfcMediaTime: null });
    const src = await openFrameSource('blob:x');
    const { mediaTime } = await src.getFrameAt(3.25);
    expect(mediaTime).toBe(3.25);
  });

  it('clamps the requested time into [0, duration]', async () => {
    stubVideo({ duration: 5 });
    const src = await openFrameSource('blob:x');
    expect((await src.getFrameAt(99)).mediaTime).toBe(5);
    expect((await src.getFrameAt(-3)).mediaTime).toBe(0);
  });

  it('REGRESSION: rejects instead of hanging forever when the seek never completes', async () => {
    // 抽出元 (proxy-workflow.ts) のシーク待ちは `video.onseeked = () => res()`
    // だけで、タイムアウトも onerror 経路も無かった。シークが停止すると Promise は
    // 永久に解決せず、プロキシ生成ジョブが無言でハングし active に residue が残る。
    vi.useFakeTimers();
    stubVideo({ duration: 10, autoSeek: false });
    const src = await openFrameSource('blob:x');
    const p = src.getFrameAt(4);
    const assertion = expect(p).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it('rejects when the media errors during a seek', async () => {
    stubVideo({ duration: 10, autoSeek: false });
    const src = await openFrameSource('blob:x');
    const p = src.getFrameAt(4);
    await Promise.resolve();
    createdVideo?.dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow(/Video load failed/);
  });

  it('throws for media with no video track (zero dimensions)', async () => {
    stubVideo({ width: 0, height: 0 });
    const src = await openFrameSource('blob:audio-only');
    await expect(src.getFrameAt(1)).rejects.toThrow(/no video track/);
  });
});

// ============================================================
// close
// ============================================================

describe('FrameSource.close', () => {
  it('makes subsequent getFrameAt calls fail', async () => {
    stubVideo({ duration: 10 });
    const src = await openFrameSource('blob:x');
    src.close();
    await expect(src.getFrameAt(1)).rejects.toThrow(/already closed/);
  });

  it('is idempotent', async () => {
    stubVideo({ duration: 10 });
    const src = await openFrameSource('blob:x');
    src.close();
    expect(() => src.close()).not.toThrow();
  });
});
