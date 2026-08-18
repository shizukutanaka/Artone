/**
 * Artone v3 — Timeline Bridge
 *
 * エンジンのタイムライン (`timeline/magnetic-timeline.ts` の `MagneticTimeline`) と
 * UI のタイムライン表示 (`app/TimelineView.tsx`) を繋ぐ変換層。
 *
 * ## なぜ必要か (First Principles 監査が「最も高くついている重複」と指摘した箇所)
 * 従来 UI は `useState<TimelineClip[]>` で**独自のクリップ配列**を持ち、エンジンの
 * `MagneticTimeline` とは完全に別世界だった。`timeline.addClip()` は `app/` から
 * 一度も呼ばれておらず、エンジンのタイムラインは**常に空**。その結果:
 *
 * - リップル/ロール/スリップ・スナップ・分割などエンジン側の編集ロジックが全て死蔵
 * - Command Pattern の undo/redo が、画面に見えているタイムラインに一切効かない
 * - **クラッシュ復旧が空のタイムラインを保存・復元していた** (実質的なデータ損失)
 *
 * エンジンを唯一の真実 (single source of truth) にすることで、これらが一斉に生きる。
 *
 * ## 責務
 * 本モジュールは**変換のみ**を持つ純関数の集まりで、React にも DOM にも依存しない
 * (そのため jsdom で決定論的に検証できる)。状態の購読は shell 側が行う。
 *
 * # AI generated (reviewed)
 *
 * @version 3.1.0
 */
import type { TimelineState, Clip, Track } from '../timeline/magnetic-timeline';
import type { TimelineClip, TimelineTrack } from './TimelineView';
import { color } from './design-system';

/**
 * トラック種別ごとの既定色。クリップ自体は色を持たないため、所属トラックから引く。
 * 色は design-system からのみ取得する (app/CLAUDE.md の規約)。
 */
export function clipColorForTrackType(type: 'video' | 'audio' | undefined): string {
  return type === 'audio' ? color.interactive : color.positive;
}

/**
 * エンジンのクリップを UI 表示用クリップへ変換する。
 *
 * 対応で注意する点:
 * - エンジンは `startTime`、UI は `start` (同じ「トラック上の開始秒」)
 * - 選択状態はエンジンでは `state.selection` (Set) に分離されている
 *
 * @param clip     エンジンのクリップ
 * @param selected 選択中か (`state.selection.has(clip.id)`)
 * @param trackType 所属トラックの種別 (色の決定に使う)
 */
export function toTimelineClip(
  clip: Clip,
  selected: boolean,
  trackType: 'video' | 'audio' | undefined
): TimelineClip {
  return {
    id: clip.id,
    trackId: clip.trackId,
    start: clip.startTime,
    duration: clip.duration,
    name: clip.name,
    color: clipColorForTrackType(trackType),
    selected,
  };
}

/**
 * エンジンのタイムライン状態から UI 表示用クリップ配列を作る。
 *
 * 開始時刻→トラック順に安定ソートする。Map の反復順は挿入順であり、移動しても
 * 変わらないため、そのまま渡すと画面上の重なり順が編集履歴に依存してしまう。
 */
export function toTimelineClips(state: TimelineState): TimelineClip[] {
  const clips: TimelineClip[] = [];
  for (const clip of state.clips.values()) {
    const track = state.tracks.get(clip.trackId);
    clips.push(toTimelineClip(clip, state.selection.has(clip.id), track?.type));
  }
  clips.sort((a, b) => (a.start - b.start) || a.trackId.localeCompare(b.trackId));
  return clips;
}

/** エンジンのトラックを UI 表示用トラックへ変換する。 */
export function toTimelineTrack(track: Track): TimelineTrack {
  return {
    id: track.id,
    type: track.type,
    name: track.name,
    height: track.height,
    muted: track.muted,
    locked: track.locked,
  };
}

/**
 * エンジンのタイムライン状態から UI 表示用トラック配列を作る。
 * 映像トラックを先に、次に音声トラックを並べる (編集ソフトの慣例)。
 */
export function toTimelineTracks(state: TimelineState): TimelineTrack[] {
  const tracks = [...state.tracks.values()].map(toTimelineTrack);
  tracks.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'video' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  return tracks;
}

/** 変形の既定値 (等倍・不透明・無回転)。 */
export const IDENTITY_TRANSFORM = {
  x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
} as const;

/**
 * 取り込んだメディアからエンジンへ追加するクリップを組み立てる。
 *
 * `MagneticTimeline.addClip()` は `id`/`selected` 以外を要求するため、UI 側が
 * 部分的なオブジェクトを渡して型エラーになったり既定値を取り違えたりしないよう
 * ここに集約する。
 *
 * @param input 追加するクリップの最小情報
 */
export function buildEngineClip(input: {
  trackId: string;
  mediaId: string;
  name: string;
  startTime: number;
  duration: number;
  type: 'video' | 'audio' | 'image';
}): Omit<Clip, 'id' | 'selected'> {
  return {
    trackId: input.trackId,
    mediaId: input.mediaId,
    name: input.name,
    startTime: input.startTime,
    duration: input.duration,
    // 取り込み直後は素材全体を使う。
    mediaIn: 0,
    mediaOut: input.duration,
    transform: { ...IDENTITY_TRANSFORM },
    type: input.type,
    locked: false,
  };
}

/**
 * クリップを載せるトラックをエンジンの状態から選ぶ。
 *
 * UI がトラック ID を決め打ちできないのは、エンジンのトラック ID が
 * `crypto.randomUUID()` で動的に決まるため。種別で引く。
 *
 * @returns 見つかったトラック ID。該当が無ければ undefined。
 */
export function pickTrackIdForType(
  state: TimelineState,
  mediaType: 'video' | 'audio' | 'image'
): string | undefined {
  const wanted: 'video' | 'audio' = mediaType === 'audio' ? 'audio' : 'video';
  for (const track of state.tracks.values()) {
    if (track.type === wanted) return track.id;
  }
  return undefined;
}

/** クリップ列の末尾 (同一トラック上で次に置ける開始秒)。 */
export function nextStartOnTrack(state: TimelineState, trackId: string): number {
  let end = 0;
  for (const clip of state.clips.values()) {
    if (clip.trackId !== trackId) continue;
    end = Math.max(end, clip.startTime + clip.duration);
  }
  return end;
}
