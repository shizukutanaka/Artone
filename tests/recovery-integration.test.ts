/**
 * Integration: ArtoneApp recovery payload ↔ RecoveryManager (IndexedDB).
 *
 * After SPEC §3.10 the dormant IndexedDB-based RecoveryManager became the active
 * recovery system, replacing the localStorage path in main.ts that silently
 * flattened the timeline's Maps/Set to `{}` on JSON.stringify.
 *
 * These tests pin the contract that the recovery payload built from live timeline
 * state (mirroring ArtoneApp.buildRecoveryData) survives the full
 * save → IndexedDB → restore round-trip with every clip / track / selection
 * intact — the precise data-loss scenario the consolidation fixes.
 *
 * Data-loss risk zone (recovery/): crash-shaped round-trip + Map/Set fidelity.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MagneticTimeline,
  serializeTimelineState,
  deserializeTimelineState,
  type SerializedTimelineState,
} from '../timeline/magnetic-timeline';
import { MarkerManager } from '../timeline/marker-manager';
import { RecoveryManager, type RecoveryData } from '../recovery/recovery-manager';

let dbCounter = 0;
function makeManager(): RecoveryManager {
  dbCounter++;
  return new RecoveryManager({ dbName: `RecoveryIntegration_${dbCounter}_${Date.now()}` });
}

/** Mirror of ArtoneApp.buildRecoveryData — kept in lockstep with main.ts. */
function buildRecoveryData(
  tl: MagneticTimeline,
  playhead: number,
  historyPosition: number,
  markers: MarkerManager = new MarkerManager(),
): RecoveryData {
  const state = tl.getState();
  return {
    timeline: serializeTimelineState(state),
    clips: [...state.clips.values()],
    tracks: [...state.tracks.values()],
    effects: [],
    markers: markers.getAllMarkers(),
    playhead,
    selection: [...state.selection],
    historyPosition,
    settings: { fps: 30 },
  };
}

function v1Of(tl: MagneticTimeline): string {
  return [...tl.getState().tracks.values()].find((t) => t.name === 'V1')!.id;
}

describe('Recovery integration — timeline survives the IndexedDB round-trip', () => {
  let mgr: RecoveryManager;
  let tl: MagneticTimeline;
  let v1: string;

  beforeEach(async () => {
    mgr = makeManager();
    await mgr.init();
    tl = new MagneticTimeline();
    v1 = v1Of(tl);
  });

  it('REGRESSION: clips/tracks/selection are preserved (not flattened to {})', async () => {
    const a = tl.addClip({
      trackId: v1, mediaId: 'm1', name: 'A', startTime: 0, duration: 5,
      mediaIn: 0, mediaOut: 5, type: 'video', locked: false,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    });
    const b = tl.addClip({
      trackId: v1, mediaId: 'm2', name: 'B', startTime: 5, duration: 3,
      mediaIn: 0, mediaOut: 3, type: 'video', locked: false,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    });

    const payload = buildRecoveryData(tl, 2.5, 7);
    const id = await mgr.saveSnapshot('auto', 'proj', 'Proj', payload);
    expect(id).toBeTruthy();

    const restored = await mgr.restoreSnapshot(id!);
    expect(restored).not.toBeNull();

    // The authoritative serialized timeline must rehydrate to identical clips.
    const state = deserializeTimelineState(restored!.timeline as SerializedTimelineState);
    expect(state.clips.size).toBe(2);
    expect(state.clips.get(a.id)?.name).toBe('A');
    expect(state.clips.get(b.id)?.startTime).toBe(5);
    expect(state.tracks.size).toBe(tl.getState().tracks.size);

    // Scalar fields round-trip too.
    expect(restored!.playhead).toBe(2.5);
    expect(restored!.historyPosition).toBe(7);
  });

  it('selection set survives as an array and rehydrates', async () => {
    const c = tl.addClip({
      trackId: v1, mediaId: 'm1', name: 'Sel', startTime: 0, duration: 4,
      mediaIn: 0, mediaOut: 4, type: 'video', locked: false,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    });
    tl.selectClip(c.id, false);

    const payload = buildRecoveryData(tl, 0, 0);
    expect(payload.selection).toContain(c.id);

    const id = await mgr.saveSnapshot('auto', 'proj', 'Proj', payload);
    const restored = await mgr.restoreSnapshot(id!);
    const state = deserializeTimelineState(restored!.timeline as SerializedTimelineState);
    expect(state.selection.has(c.id)).toBe(true);
  });

  it('crash snapshot via startAutoSave callback captures live timeline state', async () => {
    tl.addClip({
      trackId: v1, mediaId: 'm1', name: 'Live', startTime: 0, duration: 6,
      mediaIn: 0, mediaOut: 6, type: 'video', locked: false,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    });

    // startAutoSave performs an immediate (fire-and-forget) save using the
    // getData callback — the same path crash handlers reuse via currentGetData.
    mgr.startAutoSave(() => buildRecoveryData(tl, 1, 1), 'proj', 'Proj');

    // Poll until the async IndexedDB write lands (the immediate save is not awaited).
    let snap = await mgr.getLatestSnapshot('proj');
    for (let i = 0; i < 20 && !snap; i++) {
      await new Promise((r) => setTimeout(r, 10));
      snap = await mgr.getLatestSnapshot('proj');
    }
    expect(snap).not.toBeNull();
    const state = deserializeTimelineState((snap!.data as RecoveryData).timeline as SerializedTimelineState);
    expect(state.clips.size).toBe(1);
    expect([...state.clips.values()][0].name).toBe('Live');

    mgr.dispose();
  });

  it('a raw JSON.stringify of live state would have lost the clips (proves the bug)', () => {
    tl.addClip({
      trackId: v1, mediaId: 'm1', name: 'X', startTime: 0, duration: 5,
      mediaIn: 0, mediaOut: 5, type: 'video', locked: false,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    });

    // The old localStorage path did this — Map → "{}" → total loss.
    const naive = JSON.parse(JSON.stringify(tl.getState()));
    expect(Object.keys(naive.clips)).toHaveLength(0);

    // The serialized form preserves them.
    const safe = serializeTimelineState(tl.getState());
    expect(safe.clips).toHaveLength(1);
  });

  it('REGRESSION: markers survive the snapshot round-trip (previously hardcoded to [])', async () => {
    const markers = new MarkerManager();
    markers.addMarker(3, 'chapter', { name: 'Intro' });
    markers.addMarker(12, 'todo', { name: 'Fix color', notes: 'shot too warm' });

    await mgr.saveSnapshot('manual', 'proj', 'Proj', buildRecoveryData(tl, 0, 0, markers));
    const snap = await mgr.getLatestSnapshot('proj');
    expect(snap).not.toBeNull();

    // Rehydrate on a fresh MarkerManager the way restoreFromRecovery does.
    const restored = new MarkerManager();
    const data = snap!.data as RecoveryData;
    expect(Array.isArray(data.markers)).toBe(true);
    const count = restored.importJSON(JSON.stringify(data.markers));
    expect(count).toBe(2);

    const all = restored.getAllMarkers();
    expect(all.map((m) => m.time)).toEqual([3, 12]);
    expect(all.map((m) => m.name)).toEqual(['Intro', 'Fix color']);
    expect(all.map((m) => m.type)).toEqual(['chapter', 'todo']);
    expect(all[1].notes).toBe('shot too warm');
  });

  it('restore path tolerates empty or malformed marker payloads (trust boundary)', () => {
    const restored = new MarkerManager();
    // Empty array → no-op. restoreFromRecovery additionally guards with
    // Array.isArray before calling importJSON, so a corrupt non-array
    // payload never reaches it; importJSON itself also rejects non-arrays.
    expect(restored.importJSON('[]')).toBe(0);
    expect(restored.importJSON('"corrupt"')).toBe(0);
    expect(restored.getAllMarkers()).toHaveLength(0);
  });
});
