/**
 * Artone v3 — Timeline Renderer (decode → composite → encode)
 *
 * 複数クリップのタイムラインを**1本の実ファイル**へ書き出す。
 *
 * ## なぜ別モジュールなのか
 * `export/media-export.ts` は入力1本を変換する経路で、コンテナ変換の速さと
 * フレーム正確さが持ち味である。しかし**連結・前方の空白・変形**は「入力の
 * 一部を出す」操作では表現できず、フレームを組み立て直すしかない。
 * 単一クリップの書き出しは引き続き変換経路が担い、組み立てが要る時だけ
 * こちらへ来る (速い道を遅い道で潰さない)。
 *
 * ## 方式
 * 出力フレームの時刻を先に決め、その時刻ごとに「どのクリップの、素材内の
 * どの時刻か」を引いてデコードし、キャンバスへ描いて再エンコードする。
 * デコードは `samplesAtTimestamps()` を使う — 要求時刻が単調増加なら各パケットを
 * 高々1回しかデコードしないため、フレーム単位に seek するより桁違いに速い。
 *
 * **出力の各フレームは要求時刻ちょうどのソースフレーム**であり、`<video>` の
 * seek に頼る方式のような取りこぼしは原理的に起きない。
 *
 * ## 音声を持つ素材は受け付けない
 * 本モジュールは映像のみを組み立てる。音声付き素材を黙って映像だけで書き出すと
 * **ユーザーの音が消えたファイルが出る** — `export/CLAUDE.md`「データ損失は
 * 致命的」に反するため、音声トラックを持つ素材は明示的に失敗させる。
 * 音声の連結・ミックスは別途配線する。
 *
 * ## 検証
 * WebCodecs を要するため jsdom では検証できない。実ブラウザで検証している
 * (`tests/timeline-render.spec.ts`: 2本のクリップを連結し、**出力の画素を
 * サンプリングして順序と内容が編集どおりであること**を確認する)。
 *
 * # AI generated (reviewed)
 *
 * @version 3.3.0
 */
import {
  Input, Output, BufferSource, BufferTarget,
  Mp4OutputFormat, WebMOutputFormat,
  VideoSampleSource, VideoSample, VideoSampleSink,
  MP4, QTFF, MATROSKA, WEBM,
} from 'mediabunny';
import type { ExportContainer } from './export-container';

/** 読み込みを許可するコンテナ (media/media-metadata.ts と揃える)。 */
const SUPPORTED_INPUT_FORMATS = [MP4, QTFF, MATROSKA, WEBM];

/** クリップの変形 (エンジンの `ClipTransform` と同形)。 */
export interface RenderTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** 度。中心まわりの回転。 */
  rotation: number;
  /** 0..1。 */
  opacity: number;
}

/** 書き出す1クリップ。 */
export interface RenderClip {
  /** 素材の実体。 */
  source: Blob;
  /** タイムライン上の開始位置 (秒)。 */
  startTime: number;
  /** タイムライン上の尺 (秒)。 */
  duration: number;
  /** 素材内の使用開始位置 (秒)。 */
  mediaIn: number;
  /** 省略時は無変形。 */
  transform?: Readonly<RenderTransform>;
}

export interface TimelineRenderOptions {
  width: number;
  height: number;
  fps: number;
  format: ExportContainer;
  /** 既定は 'vp9' (WebM) / 'avc' (MP4)。 */
  codec?: 'vp8' | 'vp9' | 'av1' | 'avc';
  bitrate?: number;
  /** 何秒ごとにキーフレームを置くか。既定 2 秒。 */
  keyFrameIntervalSec?: number;
  onProgress?: (progress: number) => void;
}

export interface TimelineRenderResult {
  blob: Blob;
  mimeType: string;
  /** 実際に書き出したフレーム数。 */
  frames: number;
  /** 素材が無く黒で埋めたフレーム数 (前方・クリップ間の空白)。 */
  blankFrames: number;
}

/** 無変形 (等倍・不透明・無回転・無移動)。 */
const IDENTITY: RenderTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

/** 出力コンテナの MIME タイプ。 */
function mimeTypeFor(format: ExportContainer): string {
  return format === 'webm' ? 'video/webm' : 'video/mp4';
}

/** コンテナごとの既定コーデック (その容器で広く再生できるもの)。 */
function defaultCodecFor(format: ExportContainer): 'vp9' | 'avc' {
  return format === 'webm' ? 'vp9' : 'avc';
}

/**
 * クリップを開始位置で並べ、重なりが無いことを確かめる。
 *
 * 重なりは**合成** (どちらを上に、どう混ぜるか) の話であり、本モジュールが
 * 扱う「順に並べる」操作では表現できない。黙って片方を捨てるのではなく失敗させる。
 *
 * @throws 重なりがある場合。
 */
export function orderClips(clips: ReadonlyArray<RenderClip>): RenderClip[] {
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].startTime + sorted[i - 1].duration;
    if (sorted[i].startTime < prevEnd - 1e-6) {
      throw new Error(
        'Export failed — clips overlap on the timeline and compositing is not wired yet. '
        + 'Move the clips apart so they play one after another.'
      );
    }
  }
  return sorted;
}

/**
 * 出力フレーム番号 `frame` を担当するクリップを返す (無ければ null = 黒フレーム)。
 *
 * 境界は [startTime, startTime + duration) の半開区間。終端を含めると次のクリップの
 * 先頭フレームと重複して1フレーム余る。
 */
export function clipAtFrame(
  ordered: ReadonlyArray<RenderClip>, frame: number, fps: number,
): RenderClip | null {
  const t = frame / fps;
  for (const clip of ordered) {
    if (t >= clip.startTime - 1e-9 && t < clip.startTime + clip.duration - 1e-9) return clip;
  }
  return null;
}

/** タイムライン全体の尺 (秒)。 */
export function timelineDuration(clips: ReadonlyArray<RenderClip>): number {
  let end = 0;
  for (const clip of clips) end = Math.max(end, clip.startTime + clip.duration);
  return end;
}

/**
 * 変形をキャンバスへ適用してフレームを描く。
 *
 * 拡大・回転は**中心まわり**。素材はキャンバス全面へ引き伸ばして描く
 * (レターボックス処理は別途)。`opacity` は合成の透過として効く。
 */
function drawSample(
  ctx: OffscreenCanvasRenderingContext2D,
  sample: VideoSample,
  width: number,
  height: number,
  transform: Readonly<RenderTransform>,
): void {
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, transform.opacity));
  ctx.translate(width / 2 + transform.x, height / 2 + transform.y);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scaleX, transform.scaleY);
  sample.draw(ctx, -width / 2, -height / 2, width, height);
  ctx.restore();
}

/**
 * タイムラインを1本の動画ファイルへ書き出す。
 *
 * @param clips 書き出すクリップ (順序は問わない。開始位置で並べ替える)。
 * @param options 出力設定。
 * @throws クリップが空 / 重なりがある / 素材に音声がある / 映像トラックが無い場合。
 */
export async function renderTimeline(
  clips: ReadonlyArray<RenderClip>,
  options: TimelineRenderOptions,
): Promise<TimelineRenderResult> {
  if (clips.length === 0) {
    throw new Error('Export failed — the timeline is empty. Import a clip and add it to the timeline first.');
  }
  const { width, height, fps } = options;
  if (!(width > 0 && height > 0 && fps > 0)) {
    throw new Error(`Export failed — invalid output settings (${width}x${height} @ ${fps}fps).`);
  }

  const ordered = orderClips(clips);
  const totalFrames = Math.max(1, Math.round(timelineDuration(ordered) * fps));

  // 素材ごとにデコード用の sink を用意する (同じ Blob でもクリップごとに独立した
  // 読み出し位置が要るため、クリップ単位で開く)。
  const sinks = new Map<RenderClip, VideoSampleSink>();
  for (const clip of ordered) {
    const input = new Input({
      source: new BufferSource(await clip.source.arrayBuffer()),
      formats: SUPPORTED_INPUT_FORMATS,
    });
    const audioTracks = await input.getAudioTracks();
    if (audioTracks.length > 0) {
      // 黙って音を捨てない。
      throw new Error(
        'Export failed — rendering a multi-clip timeline does not carry audio yet, and exporting '
        + 'video-only would silently drop the sound. Export a single clip, or wait for audio rendering.'
      );
    }
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      throw new Error('Export failed — a clip on the timeline has no video track to render.');
    }
    sinks.set(clip, new VideoSampleSink(track));
  }

  const output = new Output({
    format: options.format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat(),
    target: new BufferTarget(),
  });
  const codec = options.codec ?? defaultCodecFor(options.format);
  const source = new VideoSampleSource({
    codec,
    bitrate: options.bitrate ?? 5_000_000,
    keyFrameInterval: options.keyFrameIntervalSec ?? 2,
  });
  output.addVideoTrack(source);
  await output.start();

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Export failed — 2D canvas context is unavailable in this environment.');

  const frameDuration = 1 / fps;
  let written = 0;
  let blankFrames = 0;

  // クリップごとに連続した出力フレーム区間を処理する。区間内では要求時刻が
  // 単調増加するため、samplesAtTimestamps() が各パケットを高々1回だけデコードする。
  let frame = 0;
  while (frame < totalFrames) {
    const clip = clipAtFrame(ordered, frame, fps);
    if (!clip) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      await source.add(new VideoSample(canvas, {
        timestamp: frame * frameDuration, duration: frameDuration,
      }));
      written++;
      blankFrames++;
      frame++;
      options.onProgress?.(written / totalFrames);
      continue;
    }

    // このクリップが担当する出力フレームを一続きに集める。
    const frames: number[] = [];
    let cursor = frame;
    while (cursor < totalFrames && clipAtFrame(ordered, cursor, fps) === clip) {
      frames.push(cursor);
      cursor++;
    }
    const transform = clip.transform ?? IDENTITY;
    const timestamps = frames.map((f) => clip.mediaIn + (f / fps - clip.startTime));
    const sink = sinks.get(clip);
    if (!sink) throw new Error('Export failed — internal: missing decoder for a clip.');

    let index = 0;
    for await (const sample of sink.samplesAtTimestamps(timestamps)) {
      const outFrame = frames[index++];
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      if (sample) {
        drawSample(ctx, sample, width, height, transform);
        sample.close();
      } else {
        blankFrames++; // 素材側にフレームが無い時刻 (末尾を越えた等)
      }
      await source.add(new VideoSample(canvas, {
        timestamp: outFrame * frameDuration, duration: frameDuration,
      }));
      written++;
      options.onProgress?.(written / totalFrames);
    }
    frame = cursor;
  }

  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) throw new Error('Export failed — the muxer produced no output buffer');

  const mimeType = mimeTypeFor(options.format);
  return { blob: new Blob([buffer], { type: mimeType }), mimeType, frames: written, blankFrames };
}
