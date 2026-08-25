/**
 * Real-browser verification for 区間書き出し (trim) — export/media-export.ts
 *
 * ## なぜ Playwright なのか
 * 単体テストは jsdom で走り、そこには **WebCodecs が無い**。トリムはキーフレーム
 * 以外から始まる区間で `VideoDecoder`/`VideoEncoder` を使うため、jsdom では
 * `undecodable_source_codec` にしかならず**正しさを一切確認できない**。
 * 実ブラウザなら確認できるので、ここで確認する。
 *
 * 素材も**実際にエンコードして**作る (偽のパケットではデコードできない)。
 * GOP の途中から始まる区間を要求し、デコード→再エンコードの経路を必ず通す。
 *
 * 実行: `npx playwright test tests/export-trim.spec.ts --project=chromium`
 *
 * # AI generated (reviewed)
 */
import { test, expect } from '@playwright/test';
import * as esbuild from 'esbuild';
import type * as Mediabunny from 'mediabunny';
import type { exportMediaFile as ExportMediaFile } from '../export/media-export';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM で走るため __dirname は無い。
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://artone-trim.test';

/**
 * 検証用のブラウザ向けバンドルを作る。
 *
 * **製品コードの `exportMediaFile` をそのまま取り込む**のが要点で、ここで
 * mediabunny を直接叩いてしまうと「ライブラリが動くこと」しか確かめられず、
 * 我々の変換設定 (trim の受け渡し・isValid 検査) は未検証のままになる。
 */
async function buildHarness(): Promise<string> {
  const result = await esbuild.build({
    stdin: {
      contents: `
        import * as mb from 'mediabunny';
        import { exportMediaFile } from './export/media-export';
        window.mb = mb;
        window.exportMediaFile = exportMediaFile;
      `,
      resolveDir: REPO_ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

test.describe('trimmed export (real WebCodecs)', () => {
  test.beforeEach(async ({ page }) => {
    const bundle = await buildHarness();
    await page.route(`${ORIGIN}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('.js')) {
        return route.fulfill({ contentType: 'text/javascript', body: bundle });
      }
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta charset="utf-8"><script type="module" src="/harness.js"></script>',
      });
    });
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => !!(window as never as { mb?: unknown }).mb);
  });

  test('exports exactly the requested range, starting mid-GOP', async ({ page }) => {
    const hasCodecs = await page.evaluate(async () => {
      if (typeof VideoEncoder === 'undefined') return false;
      const enc = await VideoEncoder.isConfigSupported({
        codec: 'vp09.00.10.08', width: 320, height: 240, bitrate: 1_000_000,
      }).catch(() => null);
      return !!enc?.supported;
    });
    // WebCodecs / VP9 が無いブラウザでは検証できない (WebKit 等)。黙って通さない。
    test.skip(!hasCodecs, 'WebCodecs VP9 encoding unavailable in this browser');

    const result = await page.evaluate(async () => {
      const M = (window as never as { mb: typeof Mediabunny }).mb;
      const exportMediaFile = (window as never as { exportMediaFile: typeof ExportMediaFile }).exportMediaFile;

      const FPS = 30;
      const TOTAL_FRAMES = 90; // 3 秒

      // --- 素材を実際にエンコードして作る (GOP = 2秒 → 1.1s はキーフレームではない) ---
      const out = new M.Output({ format: new M.WebMOutputFormat(), target: new M.BufferTarget() });
      const src = new M.VideoSampleSource({ codec: 'vp9', bitrate: 1_000_000, keyFrameInterval: 2 });
      out.addVideoTrack(src);
      await out.start();
      const canvas = new OffscreenCanvas(320, 240);
      const ctx = canvas.getContext('2d')!;
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        ctx.fillStyle = `rgb(${(i * 2) % 256}, 40, 80)`;
        ctx.fillRect(0, 0, 320, 240);
        const frame = new VideoFrame(canvas, {
          timestamp: Math.round((i / FPS) * 1e6),
          duration: Math.round(1e6 / FPS),
        });
        await src.add(new M.VideoSample(frame));
        frame.close();
      }
      await out.finalize();
      const sourceBlob = new Blob([out.target.buffer!], { type: 'video/webm' });

      // --- 製品コードで区間書き出し ---
      const exported = await exportMediaFile(sourceBlob, {
        format: 'webm',
        trim: { start: 1.1, end: 2.1 }, // ちょうど 1 秒 = 30 フレーム
      });

      // --- 読み戻して厳密に検証 ---
      const bytes = await exported.blob.arrayBuffer();
      const back = new M.Input({ source: new M.BufferSource(bytes), formats: M.ALL_FORMATS });
      const track = await back.getPrimaryVideoTrack();
      const sink = new M.EncodedPacketSink(track!);
      let frames = 0;
      let firstTimestamp: number | null = null;
      for await (const packet of sink.packets()) {
        if (firstTimestamp === null) firstTimestamp = packet.timestamp;
        frames++;
      }
      return {
        mimeType: exported.mimeType,
        discarded: exported.discardedTracks.length,
        sourceBytes: sourceBlob.size,
        outBytes: exported.blob.size,
        frames,
        firstTimestamp,
        duration: await back.computeDuration(),
      };
    });

    // 1 秒 / 30fps = ちょうど 30 フレーム。多くても少なくてもフレーム落ち or 余分。
    expect(result.frames).toBe(30);
    // 出力は 0 から始まる (要求開始位置が新しい原点になる)。
    expect(result.firstTimestamp).toBe(0);
    // 尺は 1 秒 — Matroska の尺は最終フレームの提示時刻なので 1 フレーム分の許容。
    expect(result.duration).toBeGreaterThan(1 - 1 / 30 - 0.01);
    expect(result.duration).toBeLessThanOrEqual(1 + 0.01);
    // 3 秒から 1 秒を切り出したのだから、明らかに小さくなる。
    expect(result.outBytes).toBeLessThan(result.sourceBytes / 2);
    expect(result.discarded).toBe(0);
    expect(result.mimeType).toBe('video/webm');
  });

  test('an invalid range falls back to the whole source instead of emitting an empty file', async ({ page }) => {
    const hasCodecs = await page.evaluate(async () => typeof VideoEncoder !== 'undefined');
    test.skip(!hasCodecs, 'WebCodecs unavailable in this browser');

    const frames = await page.evaluate(async () => {
      const M = (window as never as { mb: typeof Mediabunny }).mb;
      const exportMediaFile = (window as never as { exportMediaFile: typeof ExportMediaFile }).exportMediaFile;

      const out = new M.Output({ format: new M.WebMOutputFormat(), target: new M.BufferTarget() });
      const src = new M.VideoSampleSource({ codec: 'vp9', bitrate: 500_000, keyFrameInterval: 1 });
      out.addVideoTrack(src);
      await out.start();
      const canvas = new OffscreenCanvas(160, 120);
      const ctx = canvas.getContext('2d')!;
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = `rgb(${i * 20}, 0, 0)`;
        ctx.fillRect(0, 0, 160, 120);
        const frame = new VideoFrame(canvas, { timestamp: Math.round((i / 10) * 1e6), duration: 1e5 });
        await src.add(new M.VideoSample(frame));
        frame.close();
      }
      await out.finalize();
      const blob = new Blob([out.target.buffer!], { type: 'video/webm' });

      // end <= start は不正。空ファイルではなく素材全体になること。
      const exported = await exportMediaFile(blob, { format: 'webm', trim: { start: 5, end: 5 } });
      const back = new M.Input({
        source: new M.BufferSource(await exported.blob.arrayBuffer()), formats: M.ALL_FORMATS,
      });
      const sink = new M.EncodedPacketSink((await back.getPrimaryVideoTrack())!);
      let count = 0;
      for await (const packet of sink.packets()) { void packet; count++; }
      return count;
    });

    expect(frames).toBe(10); // 全フレームが残っている
  });
});
