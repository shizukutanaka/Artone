/**
 * Tests for app/PreviewPane.tsx
 *
 * コアループ「見る」段の検証。従来プレビュー面はテキストラベルのみで、
 * 取り込んだ映像を一度も表示できていなかった。実際に `<video>`/`<img>` が
 * 出ること、および表示種別の切り替えを検証する。
 *
 * vitest の glob は `.test.ts` のみのため JSX は使えず `React.createElement`
 * で組み立てる (既存の React テストと同じ流儀)。描画は createRoot + act。
 *
 * # AI generated (reviewed)
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PreviewPane, selectPreviewKind, shouldSyncSeek, SEEK_SYNC_THRESHOLD_SEC } from '../app/PreviewPane';
import type { MediaItem } from '../app/MediaBrowser';
import { setupI18n } from '../i18n/i18n-manager';
import en from '../i18n/en.json';

// React 18+ の act は環境フラグを要求する (既存 React テストと同じ流儀)。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = React.createElement;

beforeAll(async () => {
  // t() は setupI18n 済みが前提。loadLocale はネットワークを叩くため fetch を
  // 一時的に差し替えて実翻訳を流し込む (既存テストと同じ手法)。
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => en })) as unknown as typeof fetch;
  const mgr = setupI18n({ defaultLocale: 'en', fallbackLocale: 'en', loadPath: '/i18n/{locale}.json' });
  await mgr.init();
  globalThis.fetch = originalFetch;
});

function makeItem(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'm1', name: 'clip.mp4', type: 'video', size: 1000,
    url: 'blob:preview-test', duration: 12, proxyStatus: 'none', ...over,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(item: MediaItem | undefined, isReady = true) {
  act(() => {
    root.render(h(PreviewPane, { item, isReady }));
  });
}

/** 再生状態つきで描画する (タイムライン追従の検証用)。 */
function renderWithPlayback(
  item: MediaItem | undefined,
  opts: { currentTime?: number; isPlaying?: boolean }
) {
  act(() => {
    root.render(h(PreviewPane, { item, isReady: true, ...opts }));
  });
}

// ============================================================
// selectPreviewKind (純関数)
// ============================================================

describe('selectPreviewKind', () => {
  it('reports loading before the engine is ready, even with an item', () => {
    // 未初期化中に blob URL を読ませても無意味なので loading を優先する。
    expect(selectPreviewKind(makeItem(), false)).toBe('loading');
  });

  it('reports empty when nothing is selected', () => {
    expect(selectPreviewKind(undefined, true)).toBe('empty');
  });

  it('maps media types to their preview kind', () => {
    expect(selectPreviewKind(makeItem({ type: 'video' }), true)).toBe('video');
    expect(selectPreviewKind(makeItem({ type: 'image' }), true)).toBe('image');
    expect(selectPreviewKind(makeItem({ type: 'audio' }), true)).toBe('audio');
  });
});

// ============================================================
// 描画
// ============================================================

describe('PreviewPane rendering', () => {
  it('REGRESSION: renders a real <video> for a selected video clip', () => {
    // 以前はプレビュー面がテキストラベルだけで、ユーザーは取り込んだ映像を
    // 一度も見られなかった (コアループ「見る」段の欠落)。
    render(makeItem({ url: 'blob:my-clip' }));
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe('blob:my-clip');
  });

  it('gives the video element controls so the user can scrub', () => {
    render(makeItem());
    expect(container.querySelector('video')!.hasAttribute('controls')).toBe(true);
  });

  it('renders an <img> for an image, not a video', () => {
    render(makeItem({ type: 'image', url: 'blob:pic', name: 'shot.png' }));
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('blob:pic');
    expect(img!.getAttribute('alt')).toBe('shot.png');
    expect(container.querySelector('video')).toBeNull();
  });

  it('renders an <audio> element for audio', () => {
    render(makeItem({ type: 'audio', url: 'blob:song' }));
    expect(container.querySelector('audio')).not.toBeNull();
    expect(container.querySelector('video')).toBeNull();
  });

  it('renders no media element when nothing is selected', () => {
    render(undefined);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-preview="empty"]')).not.toBeNull();
  });

  it('does not load media before the engine is ready', () => {
    render(makeItem(), false);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('[data-preview="loading"]')).not.toBeNull();
  });

  it('swaps the source when the selection changes', () => {
    render(makeItem({ id: 'a', url: 'blob:a' }));
    expect(container.querySelector('video')!.getAttribute('src')).toBe('blob:a');
    render(makeItem({ id: 'b', url: 'blob:b' }));
    expect(container.querySelector('video')!.getAttribute('src')).toBe('blob:b');
  });

  it('does not apply a CSS rotation (the browser already rotates the frames)', () => {
    // コンテナの回転はブラウザが <video> 描画時に適用済み。ここで transform を
    // 重ねると二重回転になる。
    render(makeItem());
    const style = container.querySelector('video')!.getAttribute('style') ?? '';
    expect(style).not.toContain('rotate');
  });
});

// ============================================================
// タイムライン追従
// ============================================================

describe('shouldSyncSeek', () => {
  it('does not seek for small drift (would stutter playback)', () => {
    // 毎フレーム currentTime を代入するとブラウザが再生を途切れさせるため、
    // 通常の再生ドリフト程度では追従シークしない。
    expect(shouldSyncSeek(1.0, 1.0)).toBe(false);
    expect(shouldSyncSeek(1.0, 1.0 + SEEK_SYNC_THRESHOLD_SEC / 2)).toBe(false);
  });

  it('seeks once the drift exceeds the threshold (user scrubbed)', () => {
    expect(shouldSyncSeek(1.0, 1.0 + SEEK_SYNC_THRESHOLD_SEC * 2)).toBe(true);
    expect(shouldSyncSeek(5.0, 0.5)).toBe(true);
  });

  it('ignores non-finite values instead of assigning NaN to currentTime', () => {
    expect(shouldSyncSeek(NaN, 1)).toBe(false);
    expect(shouldSyncSeek(1, Infinity)).toBe(false);
  });
});

describe('PreviewPane playback sync', () => {
  it('seeks the video when the timeline playhead jumps', () => {
    renderWithPlayback(makeItem(), { currentTime: 0 });
    const video = container.querySelector('video') as HTMLVideoElement;
    video.currentTime = 0;
    renderWithPlayback(makeItem(), { currentTime: 8 });
    expect(video.currentTime).toBe(8);
  });

  it('does not fight the video for sub-threshold drift', () => {
    renderWithPlayback(makeItem(), { currentTime: 0 });
    const video = container.querySelector('video') as HTMLVideoElement;
    video.currentTime = 2;
    renderWithPlayback(makeItem(), { currentTime: 2 + SEEK_SYNC_THRESHOLD_SEC / 2 });
    expect(video.currentTime).toBe(2); // 据え置き
  });

  it('does not touch the video at all when playback props are omitted', () => {
    render(makeItem());
    const video = container.querySelector('video') as HTMLVideoElement;
    video.currentTime = 3;
    render(makeItem());
    expect(video.currentTime).toBe(3);
  });
});
