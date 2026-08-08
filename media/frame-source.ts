/**
 * Artone v3 — Frame Source
 *
 * メディア URL から「時刻 t のフレーム」を取り出す共通基盤。
 *
 * ## 背景
 * この能力自体は `proxy-workflow.ts` の内部に既に存在していたが、プロキシ生成
 * ループに閉じ込められており、それを必要とする他の利用者 (プレビュー/スコープ)
 * から到達できなかった。ここへ抽出して再利用可能にする。
 *
 * ## 精度特性 (重要 — 用途を誤らないこと)
 * 本モジュールは `<video>` の seek に依存するため **frame-accurate ではない**:
 *
 * - `video.currentTime` の設定は非同期で、Chromium では時刻源が**オーディオ
 *   クロック**である。`seeked` の発火は「目的フレームが合成された」ことを保証
 *   せず、直後に `drawImage` すると**直前のフレームを取り込みうる**。
 * - `requestVideoFrameCallback` の `mediaTime` は実際に合成されたフレームの
 *   presentation timestamp そのものであり、フレームを再現可能に同定する唯一の
 *   手段とされる。ただし main thread と compositor thread の非同期性から
 *   best-effort の域を出ない。
 * - 真にフレーム正確な取得には WebCodecs `VideoDecoder` (= デマルチプレクサ)
 *   が必要で、それは本モジュールの範囲外。
 *
 * したがって用途は **プレビュー表示・スコープ解析など best-effort で十分な
 * もの**に限る。**マスター書き出しには使用しないこと** — 誤フレームを無言で
 * 書き出すのは `export/CLAUDE.md`「データ損失は致命的」に反する。
 * 得られた実時刻は `getFrameAt()` が `mediaTime` として返すので、呼び出し側は
 * 要求時刻とのズレを検出できる。
 *
 * 参考: MDN `HTMLVideoElement.requestVideoFrameCallback()` / web.dev
 * "Perform efficient per-video-frame operations" / w3c/webcodecs#87
 *
 * # AI generated (reviewed)
 *
 * @version 3.1.0
 */
import { createLogger } from '../app/logger';
import { setHighQualityScaling } from '../app/utils';

const log = createLogger('FrameSource');

/** メタデータ読み込みの上限時間 (ms)。proxy-workflow の既存値に合わせる。 */
const METADATA_TIMEOUT_MS = 30_000;

/** シーク完了待ちの上限時間 (ms)。 */
const SEEK_TIMEOUT_MS = 10_000;

/** `getFrameAt()` の返却値。 */
export interface FrameAtResult {
  /** 取得したフレーム。呼び出し側が `close()` する責任を持つ。 */
  frame: VideoFrame;
  /**
   * 実際に取得できたフレームの時刻 (秒)。
   * `requestVideoFrameCallback` が使える環境では合成されたフレームの
   * presentation timestamp、使えない環境では要求時刻をそのまま返す。
   * 要求時刻と一致する保証はない (モジュール docstring の精度特性を参照)。
   */
  mediaTime: number;
}

/** `openFrameSource()` の出力形式オプション。 */
export interface FrameSourceOptions {
  /** 出力フレーム幅 (px)。既定は素材のネイティブ幅。 */
  width?: number;
  /** 出力フレーム高さ (px)。既定は素材のネイティブ高さ。 */
  height?: number;
  /** 生成する `VideoFrame` に設定する duration (マイクロ秒)。既定は未設定。 */
  frameDurationUs?: number;
  /** 縮小時に高品質スケーリングを使う (プロキシ生成等)。既定 false。 */
  highQualityScaling?: boolean;
}

/** メディアの一時点からフレームを取り出すハンドル。 */
export interface FrameSource {
  /** メディア長 (秒)。 */
  readonly duration: number;
  /** 映像の幅 (px)。 */
  readonly width: number;
  /** 映像の高さ (px)。 */
  readonly height: number;
  /**
   * 指定時刻のフレームを取得する。
   * @param seconds 取得したい時刻 (秒)。[0, duration] にクランプされる。
   */
  getFrameAt(seconds: number): Promise<FrameAtResult>;
  /** 保持する `<video>` 要素等を解放する。以後の `getFrameAt` は失敗する。 */
  close(): void;
}

/** `requestVideoFrameCallback` を持つ `<video>` (対応環境のみ)。 */
type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, metadata: { mediaTime: number }) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * イベント待ちを「タイムアウト + エラー + ハンドラ解除」付きで行う内部ヘルパ。
 *
 * 抽出元の `proxy-workflow.ts` はシーク待ちを `video.onseeked = () => res()`
 * とだけ書いており、**タイムアウトも `onerror` 経路も無かった**。シークが
 * 失敗・停止した場合にこの Promise は永久に解決せず、プロキシ生成ジョブが
 * 無言でハングする (ジョブは `active` に残り続け、キューが進まなくなる)。
 */
function waitForVideoEvent(
  video: HTMLVideoElement,
  event: 'loadedmetadata' | 'seeked',
  timeoutMs: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, onSuccess);
      video.removeEventListener('error', onError);
    };
    const onSuccess = () => { cleanup(); resolve(); };
    // 文言の "Video load failed" は抽出元 (proxy-workflow.ts) の契約を維持する
    // ためのもの。既存テストがこの文字列を検証している。
    const onError = () => { cleanup(); reject(new Error(`FrameSource: Video load failed while waiting for "${event}"`)); };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`FrameSource: "${event}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    video.addEventListener(event, onSuccess);
    video.addEventListener('error', onError);
  });
}

/**
 * メディア URL を開き、任意時刻のフレームを取得できるハンドルを返す。
 *
 * @param url メディアの URL (blob: URL を想定)。
 * @throws メタデータ読み込みに失敗/タイムアウトした場合。
 */
export async function openFrameSource(
  url: string,
  options: FrameSourceOptions = {}
): Promise<FrameSource> {
  const video = document.createElement('video') as VideoWithRVFC;
  // crossOrigin は src より **前** に設定する: CORS モードは src が発火する
  // ロードに対して決まるため、後から設定しても進行中のリクエストには効かない。
  // クロスオリジン素材でキャンバスが tainted になると `new VideoFrame(canvas, …)`
  // が SecurityError を投げる。(proxy-workflow.ts の修正済み順序を踏襲)
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await waitForVideoEvent(video, 'loadedmetadata', METADATA_TIMEOUT_MS);
  } catch (e) {
    // 失敗したロードを解放する。`src = ''` ではなく属性削除 + load() を使うのが
    // メディア要素の解放の定石 (close() と同じ手順に揃える)。
    video.removeAttribute('src');
    video.load();
    throw e;
  }

  const nativeWidth = video.videoWidth || 0;
  const nativeHeight = video.videoHeight || 0;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  // 出力サイズ。指定が無ければネイティブ解像度をそのまま使う。
  const width = options.width ?? nativeWidth;
  const height = options.height ?? nativeHeight;

  // フレーム描画先。1つを使い回す (`new VideoFrame(canvas, …)` はピクセル状態を
  // 同期的にスナップショットするため再利用しても安全)。
  let canvas: OffscreenCanvas | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  let closed = false;

  /** rVFC で実フレーム時刻を取る。非対応/取得不能なら null。 */
  const awaitPresentedFrame = (): Promise<number | null> => {
    const request = video.requestVideoFrameCallback;
    if (typeof request !== 'function') return Promise.resolve(null);
    return new Promise<number | null>((resolve) => {
      // rVFC が発火しない場合に備えたフォールバック。seeked 側で解決済みなので
      // ここは「実時刻が取れなかった」を意味する null で締める。
      const timer = setTimeout(() => resolve(null), 1_000);
      request.call(video, (_now, metadata) => {
        clearTimeout(timer);
        resolve(metadata.mediaTime);
      });
    });
  };

  return {
    duration,
    width,
    height,

    async getFrameAt(seconds: number): Promise<FrameAtResult> {
      if (closed) throw new Error('FrameSource: already closed');
      if (nativeWidth === 0 || nativeHeight === 0) {
        throw new Error('FrameSource: media has no video track (zero dimensions)');
      }

      const target = Math.min(Math.max(0, seconds), duration || 0);

      // 既に目的時刻にいる場合 seeked は発火しないため、シークは差がある時だけ待つ。
      let mediaTime: number;
      if (Math.abs(video.currentTime - target) > 1e-6) {
        const presented = awaitPresentedFrame();
        video.currentTime = target;
        await waitForVideoEvent(video, 'seeked', SEEK_TIMEOUT_MS);
        mediaTime = (await presented) ?? target;
      } else {
        mediaTime = video.currentTime;
      }

      if (!canvas || !ctx) {
        canvas = new OffscreenCanvas(width, height);
        const c = canvas.getContext('2d', { willReadFrequently: false });
        if (!c) throw new Error('FrameSource: failed to acquire 2D context');
        ctx = c;
        // 縮小して書き出す用途 (プロキシ生成等) では良いカーネルを使う。
        if (options.highQualityScaling) setHighQualityScaling(ctx);
      }
      ctx.drawImage(video, 0, 0, width, height);

      const init: VideoFrameInit = { timestamp: Math.round(mediaTime * 1_000_000) };
      if (options.frameDurationUs !== undefined) init.duration = options.frameDurationUs;
      const frame = new VideoFrame(canvas, init);
      return { frame, mediaTime };
    },

    close(): void {
      if (closed) return;
      closed = true;
      // src を空にしてバッファリングを止め、参照を落とす。
      video.removeAttribute('src');
      video.load();
      canvas = null;
      ctx = null;
      log.debug('FrameSource closed');
    },
  };
}
