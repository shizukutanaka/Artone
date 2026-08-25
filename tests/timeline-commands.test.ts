/**
 * Tests for the UI-edit → Command Pattern wiring
 * (timeline/magnetic-timeline.ts の resizeClipCommand / moveResizeClipCommand と、
 *  shell が積む Command が実際に undo/redo できること)
 *
 * ## 背景 (このテストが固定する回帰)
 * タイムライン統合 (PR #47) 直後の shell は直接ミューテータ (`tl.moveClip` 等) を
 * 呼んでおり、**Command が履歴に積まれず Cmd+Z が一切効かなかった**。
 * `timeline/CLAUDE.md`「クリップ操作は全て Command Pattern 経由」への違反でもある。
 *
 * 実物の MagneticTimeline + HistoryManager を組み合わせて検証する (モック不使用)。
 *
 * # AI generated (reviewed)
 */
import { describe, it, expect } from 'vitest';
import { MagneticTimeline } from '../timeline/magnetic-timeline';
import { HistoryManager } from '../undo/history-manager';
import { buildEngineClip, pickTrackIdForType } from '../app/timeline-bridge';

/** 実エンジン + 実履歴 + クリップ1つの標準セットアップ。 */
function makeWorld(clip: { startTime?: number; duration?: number } = {}) {
  const tl = new MagneticTimeline();
  const history = new HistoryManager({ autoPersist: false });
  const trackId = pickTrackIdForType(tl.getState(), 'video');
  if (!trackId) throw new Error('no video track');
  const added = tl.addClip(buildEngineClip({
    trackId, mediaId: 'm1', name: 'clip.mp4',
    startTime: clip.startTime ?? 10,
    duration: clip.duration ?? 5,
    type: 'video',
  }));
  return { tl, history, trackId, clipId: added.id };
}

/** 現在のクリップ状態 (存在しなければ null)。 */
function clipState(tl: MagneticTimeline, id: string) {
  const c = tl.getState().clips.get(id);
  return c ? { startTime: c.startTime, duration: c.duration } : null;
}

// ============================================================
// 回帰の核心: 直接ミューテータでは undo できない / Command なら戻る
// ============================================================

describe('UI edits must go through the Command pattern', () => {
  it('REGRESSION: direct mutators leave history empty — Cmd+Z would do nothing', () => {
    // タイムライン統合直後の shell 実装そのもの。編集はされるが履歴が空のまま。
    const { tl, history, clipId } = makeWorld();
    tl.moveClip(clipId, 42);
    expect(clipState(tl, clipId)?.startTime).toBe(42); // 編集自体は起きる
    expect(history.canUndo()).toBe(false);             // …が、戻せない
  });

  it('move via moveClipCommand + history.execute is undoable and redoable', () => {
    const { tl, history, clipId } = makeWorld({ startTime: 10 });
    const cmd = tl.moveClipCommand(clipId, 42);
    expect(cmd).not.toBeNull();
    history.execute(cmd!);
    expect(clipState(tl, clipId)?.startTime).toBe(42);

    expect(history.undo()).toBe(true);
    expect(clipState(tl, clipId)?.startTime).toBe(10);

    expect(history.redo()).toBe(true);
    expect(clipState(tl, clipId)?.startTime).toBe(42);
  });

  it('import (addClipCommand) is undoable — undo removes the clip entirely', () => {
    const tl = new MagneticTimeline();
    const history = new HistoryManager({ autoPersist: false });
    const trackId = pickTrackIdForType(tl.getState(), 'video')!;

    // shell の取り込み経路と同じ: Command を作って履歴経由で実行する。
    const cmd = tl.addClipCommand(buildEngineClip({
      trackId, mediaId: 'm1', name: 'clip.mp4', startTime: 0, duration: 5, type: 'video',
    }));
    history.execute(cmd);
    expect(tl.getState().clips.size).toBe(1);

    expect(history.undo()).toBe(true);
    expect(tl.getState().clips.size).toBe(0); // 取り込みごと戻る

    expect(history.redo()).toBe(true);
    expect(tl.getState().clips.size).toBe(1);
  });
});

// ============================================================
// resizeClipCommand — 1ジェスチャ = 1履歴エントリ
// ============================================================

describe('resizeClipCommand', () => {
  it('resizes both edges as ONE history entry (one undo restores everything)', () => {
    const { tl, history, clipId } = makeWorld({ startTime: 10, duration: 5 });
    const cmd = tl.resizeClipCommand(clipId, 12, 2);
    expect(cmd).not.toBeNull();
    history.execute(cmd!);
    expect(clipState(tl, clipId)).toEqual({ startTime: 12, duration: 2 });

    // 1回の undo で開始・尺の両方が戻り、それ以上戻すものは無い。
    expect(history.undo()).toBe(true);
    expect(clipState(tl, clipId)).toEqual({ startTime: 10, duration: 5 });
    expect(history.canUndo()).toBe(false);
  });

  it('notifies subscribers exactly once per execute (atomic command contract)', () => {
    const { tl, history, clipId } = makeWorld({ startTime: 10, duration: 5 });
    let notifications = 0;
    tl.subscribe(() => { notifications++; });
    history.execute(tl.resizeClipCommand(clipId, 11, 3)!);
    // trimStart + trimEnd の2ミューテーションだが、batch により通知は1回。
    expect(notifications).toBe(1);
  });

  it('returns null for a non-positive duration or a missing clip', () => {
    const { tl, clipId } = makeWorld();
    expect(tl.resizeClipCommand(clipId, 10, 0)).toBeNull();
    expect(tl.resizeClipCommand(clipId, 10, -1)).toBeNull();
    expect(tl.resizeClipCommand('ghost', 0, 1)).toBeNull();
  });
});

// ============================================================
// moveResizeClipCommand — 構築時検証の罠の回帰テスト
// ============================================================

describe('moveResizeClipCommand', () => {
  it('REGRESSION: a large left move + resize succeeds (upfront-built trim would refuse)', () => {
    // Inspector で start 10 → 0, duration 2 に編集するケース。
    // move と trimEnd を**前もって**2コマンド構築する方式では、trimClipEndCommand が
    // 移動前の位置 (start=10) に対して newEnd=2 <= 10 を検証して null になる。
    // 原子コマンドは move 実行後に trim するため成立する。
    const { tl, history, clipId } = makeWorld({ startTime: 10, duration: 5 });

    // まず罠が実在することを示す: 前もって構築すると null。
    expect(tl.trimClipEndCommand(clipId, 0 + 2)).toBeNull();

    const cmd = tl.moveResizeClipCommand(clipId, 0, 2);
    expect(cmd).not.toBeNull();
    history.execute(cmd!);
    expect(clipState(tl, clipId)).toEqual({ startTime: 0, duration: 2 });

    expect(history.undo()).toBe(true);
    expect(clipState(tl, clipId)).toEqual({ startTime: 10, duration: 5 });
  });

  it('is one history entry and redoable', () => {
    const { tl, history, clipId } = makeWorld({ startTime: 10, duration: 5 });
    history.execute(tl.moveResizeClipCommand(clipId, 3, 4)!);
    expect(history.undo()).toBe(true);
    expect(history.canUndo()).toBe(false);
    expect(history.redo()).toBe(true);
    expect(clipState(tl, clipId)).toEqual({ startTime: 3, duration: 4 });
  });

  it('returns null for invalid input', () => {
    const { tl, clipId } = makeWorld();
    expect(tl.moveResizeClipCommand(clipId, 0, 0)).toBeNull();
    expect(tl.moveResizeClipCommand('ghost', 0, 1)).toBeNull();
  });
});
