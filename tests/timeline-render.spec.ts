/**
 * Real-browser verification for export/timeline-render.ts
 *
 * 単体テスト (`tests/timeline-render.test.ts`) は「どのフレームをどのクリップが
 * 担当するか」までしか確かめられない。**実際に出たファイルが編集どおりか**は
 * 画素を見るしかなく、それにはデコードとエンコード = WebCodecs が要る。
 *
 * ここでは2本のクリップを連結し、出力を**デコードし直して画素をサンプリング**して
 * 「1本目の区間には1本目の色、2本目の区間には2本目の色」が出ていることを確認する。
 * フレーム数が合っていても順序が入れ替わっていれば落ちる。音声も同様に、復号して
 * **区間ごとの実効値 (RMS)** を測り、編集どおりの位置に音があることを確かめる。
 *
 * 実行: `npx playwright test tests/timeline-render.spec.ts --project=chromium`
 *
 * # AI generated (reviewed)
 */
import { test, expect } from '@playwright/test';
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as Mediabunny from 'mediabunny';
import type { renderTimeline as RenderTimeline } from '../export/timeline-render';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://artone-render.test';

/** 製品コードの `renderTimeline` を取り込んだブラウザ向けバンドルを作る。 */
async function buildHarness(): Promise<string> {
  const result = await esbuild.build({
    stdin: {
      contents: `
        import * as mb from 'mediabunny';
        import { renderTimeline } from './export/timeline-render';
        window.mb = mb;
        window.renderTimeline = renderTimeline;
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

type Harness = { mb: typeof Mediabunny; renderTimeline: typeof RenderTimeline };

test.describe('timeline rendering (real WebCodecs)', () => {
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

  test('concatenates two clips in timeline order, verified by sampling pixels', async ({ page }) => {
    const supported = await page.evaluate(async () => {
      if (typeof VideoEncoder === 'undefined') return false;
      const enc = await VideoEncoder.isConfigSupported({
        codec: 'vp09.00.10.08', width: 160, height: 120, bitrate: 1_000_000,
      }).catch(() => null);
      return !!enc?.supported;
    });
    test.skip(!supported, 'WebCodecs VP9 encoding unavailable in this browser');

    const result = await page.evaluate(async () => {
      const { mb: M, renderTimeline } = window as never as Harness;
      const W = 160, H = 120, FPS = 30;

      /** 単色 1 秒の WebM を作る (音声なし)。 */
      async function solid(rgb: [number, number, number]): Promise<Blob> {
        const out = new M.Output({ format: new M.WebMOutputFormat(), target: new M.BufferTarget() });
        const src = new M.VideoSampleSource({ codec: 'vp9', bitrate: 1_000_000, keyFrameInterval: 1 });
        out.addVideoTrack(src);
        await out.start();
        const canvas = new OffscreenCanvas(W, H);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < FPS; i++) {
          await src.add(new M.VideoSample(canvas, { timestamp: i / FPS, duration: 1 / FPS }));
        }
        await out.finalize();
        return new Blob([out.target.buffer!], { type: 'video/webm' });
      }

      const red = await solid([220, 20, 20]);
      const blue = await solid([20, 20, 220]);

      // 編集: 赤を 0〜1 秒、青を 1〜2 秒。
      const rendered = await renderTimeline(
        [
          { source: blue, startTime: 1, duration: 1, mediaIn: 0 }, // わざと逆順で渡す
          { source: red, startTime: 0, duration: 1, mediaIn: 0 },
        ],
        { width: W, height: H, fps: FPS, format: 'webm', codec: 'vp9', bitrate: 2_000_000 },
      );

      // --- 出力を読み戻し、中央画素を時刻ごとに採る ---
      const back = new M.Input({
        source: new M.BufferSource(await rendered.blob.arrayBuffer()),
        formats: M.ALL_FORMATS,
      });
      const track = await back.getPrimaryVideoTrack();
      const sink = new M.VideoSampleSink(track!);
      const probe = new OffscreenCanvas(W, H);
      const pctx = probe.getContext('2d')!;

      async function pixelAt(t: number): Promise<[number, number, number]> {
        const sample = await sink.getSample(t);
        if (!sample) throw new Error(`no frame at ${t}`);
        pctx.clearRect(0, 0, W, H);
        sample.draw(pctx, 0, 0, W, H);
        sample.close();
        const d = pctx.getImageData(W / 2, H / 2, 1, 1).data;
        return [d[0], d[1], d[2]];
      }

      return {
        frames: rendered.frames,
        blankFrames: rendered.blankFrames,
        mimeType: rendered.mimeType,
        duration: await back.computeDuration(),
        early: await pixelAt(0.5),  // 1本目の区間
        late: await pixelAt(1.5),   // 2本目の区間
      };
    });

    // 1秒 + 1秒 = 2秒 @30fps = 60 フレーム。
    expect(result.frames).toBe(60);
    expect(result.blankFrames).toBe(0);
    expect(result.mimeType).toBe('video/webm');
    expect(result.duration).toBeGreaterThan(1.9);

    // **順序と内容**: 前半は赤、後半は青。入れ替わっていればここで落ちる。
    const [r1, g1, b1] = result.early;
    expect(r1).toBeGreaterThan(150);
    expect(b1).toBeLessThan(100);
    expect(g1).toBeLessThan(100);

    const [r2, g2, b2] = result.late;
    expect(b2).toBeGreaterThan(150);
    expect(r2).toBeLessThan(100);
    expect(g2).toBeLessThan(100);
  });

  test('renders a leading gap as black rather than shifting the clip earlier', async ({ page }) => {
    const supported = await page.evaluate(async () => typeof VideoEncoder !== 'undefined');
    test.skip(!supported, 'WebCodecs unavailable in this browser');

    const result = await page.evaluate(async () => {
      const { mb: M, renderTimeline } = window as never as Harness;
      const W = 160, H = 120, FPS = 30;

      const out = new M.Output({ format: new M.WebMOutputFormat(), target: new M.BufferTarget() });
      const src = new M.VideoSampleSource({ codec: 'vp9', bitrate: 1_000_000, keyFrameInterval: 1 });
      out.addVideoTrack(src);
      await out.start();
      const canvas = new OffscreenCanvas(W, H);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgb(20, 220, 20)';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < FPS; i++) {
        await src.add(new M.VideoSample(canvas, { timestamp: i / FPS, duration: 1 / FPS }));
      }
      await out.finalize();
      const green = new Blob([out.target.buffer!], { type: 'video/webm' });

      // クリップは 1 秒地点から始まる — 前方 1 秒は素材が無い。
      const rendered = await renderTimeline(
        [{ source: green, startTime: 1, duration: 1, mediaIn: 0 }],
        { width: W, height: H, fps: FPS, format: 'webm', codec: 'vp9' },
      );

      const back = new M.Input({
        source: new M.BufferSource(await rendered.blob.arrayBuffer()), formats: M.ALL_FORMATS,
      });
      const sink = new M.VideoSampleSink((await back.getPrimaryVideoTrack())!);
      const probe = new OffscreenCanvas(W, H);
      const pctx = probe.getContext('2d')!;
      async function pixelAt(t: number) {
        const sample = await sink.getSample(t);
        pctx.clearRect(0, 0, W, H);
        sample!.draw(pctx, 0, 0, W, H);
        sample!.close();
        const d = pctx.getImageData(W / 2, H / 2, 1, 1).data;
        return [d[0], d[1], d[2]] as [number, number, number];
      }
      return { frames: rendered.frames, blankFrames: rendered.blankFrames, gap: await pixelAt(0.5), clip: await pixelAt(1.5) };
    });

    expect(result.frames).toBe(60);      // 2 秒分 — 空白が詰められていない
    expect(result.blankFrames).toBe(30); // 前半は素材が無い
    expect(result.gap[1]).toBeLessThan(60);      // 黒
    expect(result.clip[1]).toBeGreaterThan(150); // 緑
  });

  test('carries audio through, placing it at the clip\'s timeline position', async ({ page }) => {
    const supported = await page.evaluate(async () => typeof VideoEncoder !== 'undefined');
    test.skip(!supported, 'WebCodecs unavailable in this browser');

    const result = await page.evaluate(async () => {
      const { mb: M, renderTimeline } = window as never as Harness;
      const W = 160, H = 120, FPS = 10, RATE = 48000;

      // --- 1 秒の映像 + 440Hz のトーンを持つ素材を作る ---
      const out = new M.Output({ format: new M.WebMOutputFormat(), target: new M.BufferTarget() });
      const vsrc = new M.VideoSampleSource({ codec: 'vp9', bitrate: 500_000, keyFrameInterval: 1 });
      const asrc = new M.AudioSampleSource({ codec: 'opus', bitrate: 96_000 });
      out.addVideoTrack(vsrc);
      out.addAudioTrack(asrc);
      await out.start();
      const canvas = new OffscreenCanvas(W, H);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgb(200,200,0)';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < FPS; i++) {
        await vsrc.add(new M.VideoSample(canvas, { timestamp: i / FPS, duration: 1 / FPS }));
      }
      const pcm = new Float32Array(RATE);
      for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin((i / RATE) * 440 * 2 * Math.PI) * 0.5;
      await asrc.add(new M.AudioSample({
        data: pcm, format: 'f32', numberOfChannels: 1, sampleRate: RATE, timestamp: 0,
      }));
      await out.finalize();
      const withAudio = new Blob([out.target.buffer!], { type: 'video/webm' });

      // --- 1 秒地点に置く: 前半は無音、後半に音が来るはず ---
      const rendered = await renderTimeline(
        [{ source: withAudio, startTime: 1, duration: 1, mediaIn: 0 }],
        { width: W, height: H, fps: FPS, format: 'webm', codec: 'vp9' },
      );

      // --- 出力を復号して、区間ごとの実効値 (RMS) を測る ---
      const audioCtx = new OfflineAudioContext(1, RATE * 2, RATE);
      const decodedOut = await audioCtx.decodeAudioData(await rendered.blob.arrayBuffer());
      const data = decodedOut.getChannelData(0);
      const rate = decodedOut.sampleRate;
      function rms(fromSec: number, toSec: number): number {
        const from = Math.floor(fromSec * rate);
        const to = Math.min(data.length, Math.floor(toSec * rate));
        let sum = 0;
        for (let i = from; i < to; i++) sum += data[i] * data[i];
        return to > from ? Math.sqrt(sum / (to - from)) : 0;
      }
      return {
        hasAudio: rendered.hasAudio,
        frames: rendered.frames,
        durationSec: decodedOut.duration,
        silentPart: rms(0.1, 0.9),  // 前方の空白
        soundPart: rms(1.1, 1.9),   // クリップの区間
      };
    });

    expect(result.hasAudio).toBe(true);
    expect(result.frames).toBe(20);
    // 音が編集どおりの位置に置かれている: 前半はほぼ無音、後半に信号がある。
    expect(result.soundPart).toBeGreaterThan(0.1);
    expect(result.silentPart).toBeLessThan(0.01);
    expect(result.durationSec).toBeGreaterThan(1.8);
  });

  test('omits the audio track entirely when no source has audio', async ({ page }) => {
    const supported = await page.evaluate(async () => typeof VideoEncoder !== 'undefined');
    test.skip(!supported, 'WebCodecs unavailable in this browser');

    const result = await page.evaluate(async () => {
      const { mb: M, renderTimeline } = window as never as Harness;
      const W = 160, H = 120, FPS = 10;
      const out = new M.Output({ format: new M.WebMOutputFormat(), target: new M.BufferTarget() });
      const src = new M.VideoSampleSource({ codec: 'vp9', bitrate: 500_000, keyFrameInterval: 1 });
      out.addVideoTrack(src);
      await out.start();
      const canvas = new OffscreenCanvas(W, H);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgb(0,0,200)';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < FPS; i++) {
        await src.add(new M.VideoSample(canvas, { timestamp: i / FPS, duration: 1 / FPS }));
      }
      await out.finalize();
      const silent = new Blob([out.target.buffer!], { type: 'video/webm' });

      const rendered = await renderTimeline(
        [{ source: silent, startTime: 0, duration: 1, mediaIn: 0 }],
        { width: W, height: H, fps: FPS, format: 'webm', codec: 'vp9' },
      );
      const back = new M.Input({
        source: new M.BufferSource(await rendered.blob.arrayBuffer()), formats: M.ALL_FORMATS,
      });
      return { hasAudio: rendered.hasAudio, audioTracks: (await back.getAudioTracks()).length };
    });

    // 無音トラックを足さない (容器が無駄に大きくなり再生側の挙動も変わるため)。
    expect(result.hasAudio).toBe(false);
    expect(result.audioTracks).toBe(0);
  });
});
