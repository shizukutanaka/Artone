/**
 * Tests for timeline/multicam-editor.ts
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MultiCamEditor } from '../timeline/multicam-editor';

// ============================================================
// Helpers
// ============================================================

function makeEditor(): MultiCamEditor {
  return new MultiCamEditor();
}

// ============================================================
// createMultiCamClip / addAngle
// ============================================================

describe('createMultiCamClip()', () => {
  it('creates a clip with the given name', () => {
    const editor = makeEditor();
    const clip = editor.createMultiCamClip('Scene 1');
    expect(clip.name).toBe('Scene 1');
    expect(clip.id).toBeTruthy();
  });

  it('sets the new clip as current', () => {
    const editor = makeEditor();
    editor.createMultiCamClip('A');
    expect(editor.getCurrentClip()!.name).toBe('A');
  });

  it('replaces current clip when a second clip is created', () => {
    const editor = makeEditor();
    editor.createMultiCamClip('A');
    editor.createMultiCamClip('B');
    expect(editor.getCurrentClip()!.name).toBe('B');
  });
});

describe('addAngle()', () => {
  let editor: MultiCamEditor;
  let clipId: string;

  beforeEach(() => {
    editor = makeEditor();
    clipId = editor.createMultiCamClip('Test').id;
  });

  it('returns null for unknown clipId', () => {
    expect(editor.addAngle('nonexistent', 'src1')).toBeNull();
  });

  it('adds an angle with auto-name', () => {
    const angle = editor.addAngle(clipId, 'src1')!;
    expect(angle.name).toBe('Angle 1');
  });

  it('uses provided name when given', () => {
    const angle = editor.addAngle(clipId, 'src1', 'Camera A')!;
    expect(angle.name).toBe('Camera A');
  });

  it('first angle is active by default', () => {
    const a1 = editor.addAngle(clipId, 'src1')!;
    expect(a1.active).toBe(true);
  });

  it('subsequent angles are not active', () => {
    editor.addAngle(clipId, 'src1');
    const a2 = editor.addAngle(clipId, 'src2')!;
    expect(a2.active).toBe(false);
  });

  it('first angle becomes activeAngle on clip', () => {
    const a = editor.addAngle(clipId, 'src1')!;
    expect(editor.getCurrentClip()!.activeAngle).toBe(a.id);
  });

  it('cycle through color palette', () => {
    const colors = new Set<string>();
    for (let i = 0; i < 9; i++) {
      colors.add(editor.addAngle(clipId, `src${i}`)!.color);
    }
    expect(colors.size).toBeGreaterThan(1);
  });
});

// ============================================================
// removeAngle — REGRESSION: activeAngle cleared when last angle removed
// ============================================================

describe('removeAngle()', () => {
  let editor: MultiCamEditor;
  let clipId: string;

  beforeEach(() => {
    editor = makeEditor();
    clipId = editor.createMultiCamClip('MC').id;
  });

  it('removes the specified angle', () => {
    const a1 = editor.addAngle(clipId, 'src1')!;
    editor.removeAngle(clipId, a1.id);
    expect(editor.getCurrentClip()!.angles).toHaveLength(0);
  });

  it('REGRESSION: activeAngle reset to empty string when last angle removed', () => {
    const a1 = editor.addAngle(clipId, 'src1')!;
    editor.removeAngle(clipId, a1.id);
    expect(editor.getCurrentClip()!.activeAngle).toBe('');
  });

  it('activeAngle updated when active angle removed (multiple angles)', () => {
    const a1 = editor.addAngle(clipId, 'src1')!;
    const a2 = editor.addAngle(clipId, 'src2')!;
    void a2;
    editor.removeAngle(clipId, a1.id);
    const clip = editor.getCurrentClip()!;
    // a1 was active; should now point to a2
    expect(clip.activeAngle).not.toBe(a1.id);
    expect(clip.angles).toHaveLength(1);
  });

  it('non-active angle removed: activeAngle unchanged', () => {
    const a1 = editor.addAngle(clipId, 'src1')!;
    const a2 = editor.addAngle(clipId, 'src2')!;
    editor.removeAngle(clipId, a2.id); // a2 is NOT active
    expect(editor.getCurrentClip()!.activeAngle).toBe(a1.id);
  });

  it('removes associated switch points', () => {
    const a1 = editor.addAngle(clipId, 'src1')!;
    editor.addSwitchPoint(5, a1.id);
    editor.addSwitchPoint(10, a1.id);
    editor.removeAngle(clipId, a1.id);
    expect(editor.getSwitchPoints()).toHaveLength(0);
  });

  it('does nothing for unknown clipId', () => {
    expect(() => editor.removeAngle('nonexistent', 'anyId')).not.toThrow();
  });
});

// ============================================================
// Switch points
// ============================================================

describe('addSwitchPoint()', () => {
  let editor: MultiCamEditor;
  let clipId: string;
  let angleId: string;

  beforeEach(() => {
    editor = makeEditor();
    clipId = editor.createMultiCamClip('MC').id;
    angleId = editor.addAngle(clipId, 'src1')!.id;
  });

  it('adds a switch point', () => {
    editor.addSwitchPoint(5, angleId);
    expect(editor.getSwitchPoints()).toHaveLength(1);
    expect(editor.getSwitchPoints()[0].time).toBe(5);
  });

  it('replaces existing switch point at the same time', () => {
    const a2 = editor.addAngle(clipId, 'src2')!;
    editor.addSwitchPoint(5, angleId);
    editor.addSwitchPoint(5.005, a2.id); // within 0.016s threshold
    expect(editor.getSwitchPoints()).toHaveLength(1);
  });

  it('switch points are sorted by time', () => {
    const a2 = editor.addAngle(clipId, 'src2')!;
    editor.addSwitchPoint(10, a2.id);
    editor.addSwitchPoint(3, angleId);
    const times = editor.getSwitchPoints().map(s => s.time);
    expect(times).toEqual([3, 10]);
  });

  it('dissolve transition sets transitionDuration > 0', () => {
    editor.addSwitchPoint(5, angleId, 'dissolve');
    expect(editor.getSwitchPoints()[0].transitionDuration).toBeGreaterThan(0);
  });

  it('cut transition sets transitionDuration = 0', () => {
    editor.addSwitchPoint(5, angleId, 'cut');
    expect(editor.getSwitchPoints()[0].transitionDuration).toBe(0);
  });
});

describe('removeSwitchPoint()', () => {
  it('removes switch point near given time', () => {
    const editor = makeEditor();
    const clipId = editor.createMultiCamClip('MC').id;
    const aId = editor.addAngle(clipId, 'src')!.id;
    editor.addSwitchPoint(5, aId);
    editor.removeSwitchPoint(5.005);
    expect(editor.getSwitchPoints()).toHaveLength(0);
  });

  it('does not remove switch point beyond threshold', () => {
    const editor = makeEditor();
    const clipId = editor.createMultiCamClip('MC').id;
    const aId = editor.addAngle(clipId, 'src')!.id;
    editor.addSwitchPoint(5, aId);
    editor.removeSwitchPoint(5.1); // > 0.016 threshold
    expect(editor.getSwitchPoints()).toHaveLength(1);
  });
});

describe('clearSwitchPoints()', () => {
  it('removes all switch points', () => {
    const editor = makeEditor();
    const clipId = editor.createMultiCamClip('MC').id;
    const aId = editor.addAngle(clipId, 'src')!.id;
    editor.addSwitchPoint(1, aId);
    editor.addSwitchPoint(2, aId);
    editor.clearSwitchPoints();
    expect(editor.getSwitchPoints()).toHaveLength(0);
  });
});

// ============================================================
// switchToAngle
// ============================================================

describe('switchToAngle()', () => {
  let editor: MultiCamEditor;
  let clipId: string;
  let a1id: string;
  let a2id: string;

  beforeEach(() => {
    editor = makeEditor();
    clipId = editor.createMultiCamClip('MC').id;
    a1id = editor.addAngle(clipId, 'src1')!.id;
    a2id = editor.addAngle(clipId, 'src2')!.id;
  });

  it('sets the specified angle as active', () => {
    editor.switchToAngle(a2id);
    const clip = editor.getCurrentClip()!;
    expect(clip.activeAngle).toBe(a2id);
    expect(clip.angles.find(a => a.id === a2id)!.active).toBe(true);
    expect(clip.angles.find(a => a.id === a1id)!.active).toBe(false);
  });

  it('adds a switch point while recording', () => {
    editor.startRecording();
    editor.setPlayhead(5);
    editor.switchToAngle(a2id);
    const sps = editor.getSwitchPoints();
    expect(sps.some(sp => sp.angleId === a2id && sp.time === 5)).toBe(true);
  });

  it('does not add switch point when not recording', () => {
    editor.stopRecording();
    editor.setPlayhead(5);
    editor.switchToAngle(a2id);
    expect(editor.getSwitchPoints()).toHaveLength(0);
  });
});

// ============================================================
// setPlayhead — auto-switches angle based on switch points
// ============================================================

describe('setPlayhead()', () => {
  let editor: MultiCamEditor;
  let clipId: string;
  let a1id: string;
  let a2id: string;

  beforeEach(() => {
    editor = makeEditor();
    clipId = editor.createMultiCamClip('MC').id;
    a1id = editor.addAngle(clipId, 'src1')!.id;
    a2id = editor.addAngle(clipId, 'src2')!.id;
    editor.addSwitchPoint(0, a1id);
    editor.addSwitchPoint(10, a2id);
  });

  it('activates a2 when playhead is past the second switch point', () => {
    editor.setPlayhead(15);
    expect(editor.getCurrentClip()!.activeAngle).toBe(a2id);
  });

  it('keeps a1 active when playhead is before second switch point', () => {
    editor.setPlayhead(5);
    expect(editor.getCurrentClip()!.activeAngle).toBe(a1id);
  });

  it('does not auto-switch while recording', () => {
    editor.startRecording();
    editor.setPlayhead(15);
    // isRecording = true → no automatic angle switch
    // The activeAngle stays as it was (a1id, set by addAngle)
    expect(editor.getCurrentClip()!.activeAngle).toBe(a1id);
  });
});

// ============================================================
// setAngleOffset
// ============================================================

describe('setAngleOffset()', () => {
  it('updates the offset of the specified angle', () => {
    const editor = makeEditor();
    const clipId = editor.createMultiCamClip('MC').id;
    const angle = editor.addAngle(clipId, 'src')!;
    editor.setAngleOffset(clipId, angle.id, 1.5);
    expect(editor.getCurrentClip()!.angles[0].offset).toBe(1.5);
  });
});

// ============================================================
// generateFlatEdit
// ============================================================

describe('generateFlatEdit()', () => {
  it('returns empty array when no switch points', () => {
    const editor = makeEditor();
    const clipId = editor.createMultiCamClip('MC').id;
    editor.addAngle(clipId, 'src');
    expect(editor.generateFlatEdit(clipId)).toEqual([]);
  });

  it('produces edit segments matching switch points', () => {
    const editor = makeEditor();
    const clipId = editor.createMultiCamClip('MC').id;
    const a1 = editor.addAngle(clipId, 'clip1')!;
    const a2 = editor.addAngle(clipId, 'clip2')!;
    // Set duration so last segment has a valid end
    editor.getCurrentClip()!.duration = 20;
    editor.addSwitchPoint(0, a1.id);
    editor.addSwitchPoint(10, a2.id);
    const edits = editor.generateFlatEdit(clipId);
    expect(edits).toHaveLength(2);
    expect(edits[0]).toMatchObject({ clipId: 'clip1', start: 0, end: 10 });
    expect(edits[1]).toMatchObject({ clipId: 'clip2', start: 10, end: 20 });
  });
});

// ============================================================
// handleKeyDown
// ============================================================

describe('handleKeyDown()', () => {
  it('switches to angle by 1-indexed number key', () => {
    const editor = makeEditor();
    const clipId = editor.createMultiCamClip('MC').id;
    const a1 = editor.addAngle(clipId, 'src1')!;
    const a2 = editor.addAngle(clipId, 'src2')!;
    void a1;
    editor.handleKeyDown('2');
    expect(editor.getCurrentClip()!.activeAngle).toBe(a2.id);
  });

  it('non-numeric key does nothing', () => {
    const editor = makeEditor();
    editor.createMultiCamClip('MC');
    expect(() => editor.handleKeyDown('a')).not.toThrow();
  });
});

// ============================================================
// getMultiViewLayout
// ============================================================

describe('getMultiViewLayout()', () => {
  const editor = makeEditor();
  it.each([
    [0, { cols: 1, rows: 1 }],
    [1, { cols: 1, rows: 1 }],
    [2, { cols: 2, rows: 1 }],
    [3, { cols: 2, rows: 2 }],
    [4, { cols: 2, rows: 2 }],
    [5, { cols: 3, rows: 2 }],
    [6, { cols: 3, rows: 2 }],
    [9, { cols: 3, rows: 3 }],
    [12, { cols: 4, rows: 3 }],
  ])('angleCount=%i → %j', (count, expected) => {
    expect(editor.getMultiViewLayout(count)).toEqual(expected);
  });
});

// ============================================================
// Recording state
// ============================================================

describe('isRecording()', () => {
  it('starts as false', () => {
    expect(makeEditor().isRecording()).toBe(false);
  });

  it('startRecording / stopRecording toggle state', () => {
    const editor = makeEditor();
    editor.startRecording();
    expect(editor.isRecording()).toBe(true);
    editor.stopRecording();
    expect(editor.isRecording()).toBe(false);
  });
});

// ============================================================
// subscribe
// ============================================================

describe('subscribe()', () => {
  it('listener called on state changes', () => {
    const editor = makeEditor();
    const fn = vi.fn();
    editor.subscribe(fn);
    editor.createMultiCamClip('MC');
    expect(fn).toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', () => {
    const editor = makeEditor();
    const fn = vi.fn();
    const unsub = editor.subscribe(fn);
    unsub();
    editor.createMultiCamClip('MC');
    expect(fn).not.toHaveBeenCalled();
  });
});
