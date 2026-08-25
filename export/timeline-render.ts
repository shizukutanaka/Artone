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
 * 同時刻に複数のクリップがあれば `layer` の奥から手前へ**重ねて描く** (合成)。
 * デコードは `samplesAtTimestamps()` を使う — 要求時刻が単調増加なら各パケットを
 * 高々1回しかデコードしないため、フレーム単位に seek するより桁違いに速い。
 *
 * **出力の各フレームは要求時刻ちょうどのソースフレーム**であり、`<video>` の
 * seek に頼る方式のような取りこぼしは原理的に起きない。
 *
 * ## 音声
 * 音声も同じタイムライン構造で組み立てる。素材の復号と**サンプリングレート・
 * チャンネル数の変換**は `OfflineAudioContext` に任せる — 自前のリサンプラを
 * 書くより正確で、素材ごとにレートが違っても揃う。各クリップを開始位置へ
 * スケジュールして一度にレンダリングするため、空白は**無音**として自然に埋まる。
 *
 * 音声を持たない素材だけのタイムラインには音声トラックを作らない (無音トラックを
 * 足すと容器が無駄に大きくなり、再生側の挙動も変わるため)。
 *
 * ## 検証
 * WebCodecs を要するため jsdom では検証できない。実ブラウザで検証している
 * (`tests/timeline-render.spec.ts`: 2本のクリップを連結し、**出力の画素を
 * サンプリングして順序と内容が編集どおりであること**を確認する)。
 *
 * # AI generated (reviewed)
 *
 * @version 3.4.0
 */
import {
  Input, Output, BufferSource, BufferTarget,
  Mp4OutputFormat, WebMOutputFormat,
  VideoSampleSource, VideoSample, VideoSampleSink,
  AudioSampleSource, AudioSample,
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
  /**
   * 重ね順。大きいほど手前。省略時は 0。
   *
   * 同時刻に複数のクリップがある (重なっている) 場合の描画順を決める。
   * 呼び出し側はトラックの並びをそのまま渡せばよい。
   */
  layer?: number;
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
  /** 出力音声のサンプリングレート。既定 48000。 */
  audioSampleRate?: number;
  /** 出力音声のチャンネル数。既定 2。 */
  audioChannels?: number;
  /** 出力音声のビットレート。既定 128kbps。 */
  audioBitrate?: number;
  onProgress?: (progress: number) => void;
}

export interface TimelineRenderResult {
  blob: Blob;
  mimeType: string;
  /** 実際に書き出したフレーム数。 */
  frames: number;
  /** 素材が無く黒で埋めたフレーム数 (前方・クリップ間の空白)。 */
  blankFrames: number;
  /** 音声トラックを書き出したか (素材に音声が1つも無ければ false)。 */
  hasAudio: boolean;
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
 * クリップを**描画順**に並べる — `layer` 昇順、同レイヤーなら開始位置順。
 *
 * 重なったクリップは奥から手前へこの順で重ねて描く。並びが安定していないと、
 * 同じ編集が実行のたびに違う見た目で書き出されうる (Map の反復順に依存する等)
 * ため、比較は全項目で決定的にする。
 */
export function orderClips(clips: ReadonlyArray<RenderClip>): RenderClip[] {
  return [...clips].sort((a, b) => {
    const layerDiff = (a.layer ?? 0) - (b.layer ?? 0);
    if (layerDiff !== 0) return layerDiff;
    return a.startTime - b.startTime;
  });
}

/**
 * 出力フレーム番号 `frame` に**映るクリップを奥から手前の順**で返す
 * (空なら黒フレーム)。
 *
 * 境界は [startTime, startTime + duration) の半開区間。終端を含めると次のクリップの
 * 先頭フレームと重複して1フレーム余る。
 *
 * @param ordered `orderClips()` で描画順に並べたクリップ。
 */
export function clipsAtFrame(
  ordered: ReadonlyArray<RenderClip>, frame: number, fps: number,
): RenderClip[] {
  const t = frame / fps;
  return ordered.filter(
    (clip) => t >= clip.startTime - 1e-9 && t < clip.startTime + clip.duration - 1e-9,
  );
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
 * タイムラインの音声を1本の `AudioBuffer` へまとめる。
 *
 * 各クリップを `OfflineAudioContext` 上の開始位置へスケジュールして一度に
 * レンダリングする。これにより
 *
 * - 素材ごとに異なるサンプリングレート/チャンネル数が出力設定へ**変換**される
 *   (自前のリサンプラより正確で、実装も持たなくて済む)
 * - クリップ間や前方の**空白は無音**として自然に埋まる
 * - `mediaIn` からの再生開始と尺の切り出しがそのまま表現できる
 *
 * 復号できない素材 (音声トラックが無い、対応外コーデック) は**無音として飛ばす**。
 * ここで throw すると、映像は問題なく書き出せる編集まで落としてしまうため。
 *
 * @returns 音声を1つも含まなければ null。
 */
async function mixTimelineAudio(
  ordered: ReadonlyArray<RenderClip>,
  totalDuration: number,
  sampleRate: number,
  channels: number,
): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === 'undefined') return null;

  const decoded: Array<{ clip: RenderClip; buffer: AudioBuffer }> = [];
  // 復号は共有のコンテキストで行う (decodeAudioData 自身が出力レートへ変換する)。
  const decodeCtx = new OfflineAudioContext(channels, Math.max(1, Math.ceil(sampleRate * 0.1)), sampleRate);
  for (const clip of ordered) {
    try {
      const buffer = await decodeCtx.decodeAudioData(await clip.source.arrayBuffer());
      if (buffer.length > 0) decoded.push({ clip, buffer });
    } catch {
      // 音声を持たない/復号できない素材。無音として扱う。
    }
  }
  if (decoded.length === 0) return null;

  const frames = Math.max(1, Math.ceil(totalDuration * sampleRate));
  const ctx = new OfflineAudioContext(channels, frames, sampleRate);
  for (const { clip, buffer } of decoded) {
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    // 素材より長いクリップは素材の終端で自然に途切れる (start の duration が
    // 素材長を越えても無音が続くだけで、余分な音は出ない)。
    node.start(clip.startTime, clip.mediaIn, clip.duration);
  }
  return ctx.startRendering();
}

/**
 * `AudioBuffer` を出力トラックへ書き込む。
 *
 * エンコーダの背圧を尊重するため一定長のチャンクに切って渡す。インターリーブ
 * 形式 (`f32`) にするのは `AudioSample` が平面形式の複数プレーンを受け取らない
 * ため。
 */
async function writeAudio(
  source: AudioSampleSource,
  buffer: AudioBuffer,
  chunkFrames: number,
): Promise<void> {
  const { numberOfChannels, sampleRate, length } = buffer;
  const planes: Float32Array[] = [];
  for (let c = 0; c < numberOfChannels; c++) planes.push(buffer.getChannelData(c));

  for (let offset = 0; offset < length; offset += chunkFrames) {
    const count = Math.min(chunkFrames, length - offset);
    const interleaved = new Float32Array(count * numberOfChannels);
    for (let c = 0; c < numberOfChannels; c++) {
      const plane = planes[c];
      for (let i = 0; i < count; i++) interleaved[i * numberOfChannels + c] = plane[offset + i];
    }
    await source.add(new AudioSample({
      data: interleaved,
      format: 'f32',
      numberOfChannels,
      sampleRate,
      timestamp: offset / sampleRate,
    }));
  }
}

/**
 * タイムラインを1本の動画ファイルへ書き出す。
 *
 * @param clips 書き出すクリップ (順序は問わない。開始位置で並べ替える)。
 * @param options 出力設定。
 * @throws クリップが空 / 映像トラックが無い場合。
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

  // 音声は先にまとめてから書き込む (トラックの追加は start() 前でなければならない)。
  const sampleRate = options.audioSampleRate ?? 48_000;
  const channels = options.audioChannels ?? 2;
  const mixed = await mixTimelineAudio(ordered, timelineDuration(ordered), sampleRate, channels);
  let audioSource: AudioSampleSource | null = null;
  if (mixed) {
    audioSource = new AudioSampleSource({
      codec: options.format === 'webm' ? 'opus' : 'aac',
      bitrate: options.audioBitrate ?? 128_000,
    });
    output.addAudioTrack(audioSource);
  }

  await output.start();
  if (audioSource && mixed) {
    // 0.1 秒ずつ。細かすぎるとオーバーヘッド、大きすぎると背圧が効かない。
    await writeAudio(audioSource, mixed, Math.round(sampleRate * 0.1));
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Export failed — 2D canvas context is unavailable in this environment.');

  const frameDuration = 1 / fps;
  let written = 0;
  let blankFrames = 0;

  // クリップごとに「自分が映る出力フレーム」と、その時刻に対応する素材内時刻を
  // 先に決め、**クリップ単位の反復子**を1本ずつ用意する。要求時刻が単調増加なので
  // `samplesAtTimestamps()` は各パケットを高々1回しかデコードしない。
  // 反復子を歩調を合わせて進めることで、重なった複数クリップを同じフレームへ
  // 重ねて描いても、この性質が保たれる。
  const iterators = new Map<RenderClip, AsyncIterator<VideoSample | null>>();
  for (const clip of ordered) {
    const timestamps: number[] = [];
    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;
      if (t >= clip.startTime - 1e-9 && t < clip.startTime + clip.duration - 1e-9) {
        timestamps.push(clip.mediaIn + (t - clip.startTime));
      }
    }
    const sink = sinks.get(clip);
    if (!sink) throw new Error('Export failed — internal: missing decoder for a clip.');
    iterators.set(clip, sink.samplesAtTimestamps(timestamps)[Symbol.asyncIterator]());
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    const visible = clipsAtFrame(ordered, frame, fps);
    if (visible.length === 0) blankFrames++;

    // 奥から手前へ重ねる。透明度は変形の opacity がそのまま合成に効く。
    let drewAnything = false;
    for (const clip of visible) {
      const iterator = iterators.get(clip);
      if (!iterator) continue;
      const next = await iterator.next();
      const sample = next.done ? null : next.value;
      if (!sample) continue; // 素材側にフレームが無い時刻 (末尾を越えた等)
      drawSample(ctx, sample, width, height, clip.transform ?? IDENTITY);
      sample.close();
      drewAnything = true;
    }
    if (visible.length > 0 && !drewAnything) blankFrames++;

    await source.add(new VideoSample(canvas, {
      timestamp: frame * frameDuration, duration: frameDuration,
    }));
    written++;
    options.onProgress?.(written / totalFrames);
  }

  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) throw new Error('Export failed — the muxer produced no output buffer');

  const mimeType = mimeTypeFor(options.format);
  return {
    blob: new Blob([buffer], { type: mimeType }),
    mimeType, frames: written, blankFrames, hasAudio: mixed !== null,
  };
}
