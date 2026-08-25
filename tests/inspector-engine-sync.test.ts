/**
 * Tests for the Inspector ↔ エンジン の同期
 * (app/timeline-bridge.ts の toClipSelection / toTransformPatch / clipEditKind と、
 *  timeline/magnetic-timeline.ts の setClipTransform / setClipTransformCommand)
 *
 * ## 背景 (このテストが固定する回帰)
 * shell はクリップを**クリックした時点の値をコピー**して React state に持ち、
 * 変形・不透明度は `opacity: 1` 等の**固定値を捏造**していた。結果:
 *
 * 1. 変形・不透明度の編集がエンジンへ一切書かれず、選び直すと初期値に戻る
 * 2. タイムラインでドラッグしても Inspector の開始位置が古いまま
 * 3. その状態で別項目を編集すると**古い開始位置が書き戻され、ドラッグが無言で
 *    取り消される**
 *
 * 実物の MagneticTimeline + HistoryManager を相手に検証する (モック不使用)。
 *
 * # AI generated (reviewed)
 */
import { describe, it, expect } from 'vitest';
import { MagneticTimeline } from '../timeline/magnetic-timeline';
import { HistoryManager } from '../undo/history-manager';
import {
  buildEngineClip, pickTrackIdForType, toClipSelection, toTransformPatch, clipEditKind,
} from '../app/timeline-bridge';
import type { ClipSelection } from '../app/Inspector';

/** 実エンジン + 実履歴 + クリップ1つの標準セットアップ。 */
function makeWorld(startTime = 10, duration = 5) {
  const tl = new MagneticTimeline();
  const history = new HistoryManager({ autoPersist: false });
  const trackId = pickTrackIdForType(tl.getState(), 'video');
  if (!trackId) throw new Error('no video track');
  const added = tl.addClip(buildEngineClip({
    trackId, mediaId: 'm1', name: 'clip.mp4', startTime, duration, type: 'video',
  }));
  return { tl, history, clipId: added.id };
}

/** 現在のエンジン状態から選択を導出する (null なら失敗させる)。 */
function selectionOf(tl: MagneticTimeline, clipId: string): ClipSelection {
  const sel = toClipSelection(tl.getState(), clipId);
  if (!sel) throw new Error('clip not found');
  return sel;
}

// ============================================================
// toClipSelection — エンジンが唯一の真実
// ============================================================

describe('toClipSelection', () => {
  it('REGRESSION: reports the real transform, not fabricated identity values', () => {
    const { tl, clipId } = makeWorld();
    tl.setClipTransform(clipId, { x: 12, y: -8, scaleX: 1.5, scaleY: 1.5, rotation: 90, opacity: 0.25 });

    const sel = selectionOf(tl, clipId);
    // 従来の shell はここを opacity:1 / scale:1 / rotation:0 と決め打ちしていた。
    expect(sel).toMatchObject({
      type: 'clip', id: clipId, name: 'clip.mp4',
      startTime: 10, duration: 5,
      position: { x: 12, y: -8 }, scale: 1.5, rotation: 90, opacity: 0.25,
    });
  });

  it('REGRESSION: follows the clip after it moves (a click-time copy would go stale)', () => {
    const { tl, clipId } = makeWorld(10, 5);
    const atClickTime = selectionOf(tl, clipId);
    tl.moveClip(clipId, 42); // タイムライン上でドラッグしたのと同じ

    expect(atClickTime.startTime).toBe(10);            // コピーは古いまま
    expect(selectionOf(tl, clipId).startTime).toBe(42); // 導出は追従する
  });

  it('returns null for a clip that no longer exists (e.g. undone import)', () => {
    const { tl, clipId } = makeWorld();
    tl.deleteClip(clipId);
    expect(toClipSelection(tl.getState(), clipId)).toBeNull();
  });
});

// ============================================================
// clipEditKind — 変わった側だけを1エントリで積むための判定
// ============================================================

describe('clipEditKind', () => {
  it('REGRESSION: a stale selection would be read as a timing edit (silent revert)', () => {
    const { tl, clipId } = makeWorld(10, 5);
    const stale = selectionOf(tl, clipId); // クリック時のコピー (startTime = 10)
    tl.moveClip(clipId, 42);               // ユーザーがドラッグで動かした
    const clip = tl.getState().clips.get(clipId)!;

    // 古いコピーのまま不透明度だけ変えて送ると「尺・位置の編集」と判定され、
    // クリップが 10 秒へ引き戻される = ドラッグが無言で取り消される。
    expect(clipEditKind(clip, { ...stale, opacity: 0.5 })).toBe('timing');
    // エンジンから導出し直した選択なら、変形の編集として正しく扱われる。
    const fresh = selectionOf(tl, clipId);
    expect(clipEditKind(clip, { ...fresh, opacity: 0.5 })).toBe('transform');
  });

  it('reports none when nothing changed (no empty history entry)', () => {
    const { tl, clipId } = makeWorld();
    const clip = tl.getState().clips.get(clipId)!;
    expect(clipEditKind(clip, selectionOf(tl, clipId))).toBe('none');
  });

  it('prefers timing when the start or the duration changed', () => {
    const { tl, clipId } = makeWorld(10, 5);
    const clip = tl.getState().clips.get(clipId)!;
    const sel = selectionOf(tl, clipId);
    expect(clipEditKind(clip, { ...sel, startTime: 3 })).toBe('timing');
    expect(clipEditKind(clip, { ...sel, duration: 9 })).toBe('timing');
  });

  it('detects every transform field', () => {
    const { tl, clipId } = makeWorld();
    const clip = tl.getState().clips.get(clipId)!;
    const sel = selectionOf(tl, clipId);
    expect(clipEditKind(clip, { ...sel, scale: 2 })).toBe('transform');
    expect(clipEditKind(clip, { ...sel, rotation: 15 })).toBe('transform');
    expect(clipEditKind(clip, { ...sel, position: { x: 1, y: 0 } })).toBe('transform');
    expect(clipEditKind(clip, { ...sel, position: { x: 0, y: 1 } })).toBe('transform');
  });
});

describe('toTransformPatch', () => {
  it('writes the single UI scale into both engine axes', () => {
    const { tl, clipId } = makeWorld();
    const patch = toTransformPatch({ ...selectionOf(tl, clipId), scale: 2.5 });
    expect(patch.scaleX).toBe(2.5);
    expect(patch.scaleY).toBe(2.5);
  });
});

// ============================================================
// setClipTransform / setClipTransformCommand
// ============================================================

describe('setClipTransform', () => {
  it('merges only the given fields', () => {
    const { tl, clipId } = makeWorld();
    tl.setClipTransform(clipId, { rotation: 45 });
    const t = tl.getState().clips.get(clipId)!.transform;
    expect(t.rotation).toBe(45);
    expect(t.opacity).toBe(1); // 触れていない項目は不変
  });

  it('ignores non-finite values instead of corrupting the clip', () => {
    // Inspector の数値入力は編集途中に NaN を出しうる。
    const { tl, clipId } = makeWorld();
    tl.setClipTransform(clipId, { x: Number.NaN, scaleX: Number.POSITIVE_INFINITY });
    const t = tl.getState().clips.get(clipId)!.transform;
    expect(t.x).toBe(0);
    expect(t.scaleX).toBe(1);
  });

  it('clamps opacity to [0, 1]', () => {
    const { tl, clipId } = makeWorld();
    tl.setClipTransform(clipId, { opacity: 5 });
    expect(tl.getState().clips.get(clipId)!.transform.opacity).toBe(1);
    tl.setClipTransform(clipId, { opacity: -3 });
    expect(tl.getState().clips.get(clipId)!.transform.opacity).toBe(0);
  });

  it('does nothing to a locked clip', () => {
    const { tl, clipId } = makeWorld();
    tl.getState().clips.get(clipId)!.locked = true;
    tl.setClipTransform(clipId, { opacity: 0.1 });
    expect(tl.getState().clips.get(clipId)!.transform.opacity).toBe(1);
  });

  it('notifies subscribers exactly once', () => {
    const { tl, clipId } = makeWorld();
    let notifications = 0;
    tl.subscribe(() => { notifications++; });
    tl.setClipTransform(clipId, { opacity: 0.5, rotation: 10 });
    expect(notifications).toBe(1);
  });
});

describe('setClipTransformCommand', () => {
  it('REGRESSION: transform edits survive in history and are undoable', () => {
    const { tl, history, clipId } = makeWorld();
    const cmd = tl.setClipTransformCommand(clipId, { opacity: 0.4, rotation: 30 });
    expect(cmd).not.toBeNull();
    history.execute(cmd!);
    expect(selectionOf(tl, clipId)).toMatchObject({ opacity: 0.4, rotation: 30 });

    expect(history.undo()).toBe(true);
    expect(selectionOf(tl, clipId)).toMatchObject({ opacity: 1, rotation: 0 });

    expect(history.redo()).toBe(true);
    expect(selectionOf(tl, clipId)).toMatchObject({ opacity: 0.4, rotation: 30 });
  });

  it('returns null when the patch changes nothing (no empty undo steps)', () => {
    const { tl, clipId } = makeWorld();
    expect(tl.setClipTransformCommand(clipId, { opacity: 1, scaleX: 1 })).toBeNull();
    // クランプ後に現在値と一致する場合も「変化なし」として扱う。
    expect(tl.setClipTransformCommand(clipId, { opacity: 9 })).toBeNull();
  });

  it('returns null for a missing or locked clip', () => {
    const { tl, clipId } = makeWorld();
    expect(tl.setClipTransformCommand('ghost', { opacity: 0.5 })).toBeNull();
    tl.getState().clips.get(clipId)!.locked = true;
    expect(tl.setClipTransformCommand(clipId, { opacity: 0.5 })).toBeNull();
  });
});
