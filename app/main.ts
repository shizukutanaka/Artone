/**
 * Artone v3 — Main Application
 * 
 * 統合アプリケーションシェル
 * - モジュール統合
 * - レイアウト管理
 * - ショートカット
 * - テーマ
 * 
 * @version 3.0.0
 */

import { color } from './design-system';
import { createLogger } from './logger';
import { t } from '../i18n/i18n-manager';
import { requestPersistentStorage } from './storage-persistence';
import { MagneticTimeline, serializeTimelineState, deserializeTimelineState, type SerializedTimelineState } from '../timeline/magnetic-timeline';
import { TextBasedEditor } from '../timeline/text-based-editing';
import { MultiCamEditor } from '../timeline/multicam-editor';
import { ColorGradingEngine } from '../color/grading-engine';
import { AudioEngine } from '../audio/audio-engine';
import { RenderBackend } from '../render/render-backend';
import { VideoPipeline } from '../core/webcodecs-pipeline';
import { planFileProcessing } from '../core/codec-router';
import { ExportEngine } from '../export/export-engine';
import { AIEffectsEngine } from '../ai/ai-effects-engine';
import { PluginManager } from '../plugins/plugin-manager';
import { ProjectManager } from '../project/project-manager';
import { MediaBrowser } from '../media/media-browser';
import { CollaborationEngine } from '../collab/collaboration-engine';
// Session 56: 30%改善モジュール
import { HistoryManager } from '../undo/history-manager';
import { ScopesManager } from '../scopes/video-scopes';
import { PerformanceMonitor, AutoQualityAdjuster } from '../perf/performance-monitor';
import { RecoveryManager, type RecoveryData } from '../recovery/recovery-manager';
import { ProxyWorkflow } from '../media/proxy-workflow';
import { KeyframeAnimator } from '../animation/keyframe-animator';
import { MotionGraphicsEngine } from '../animation/motion-graphics';
import { CaptionManager } from '../captions/caption-manager';
import { ShortcutManager } from './shortcut-manager';

// ============================================================
// Types
// ============================================================

const log = createLogger('Main');

export interface AppConfig {
  theme: 'dark' | 'light';
  accentColor: string;
  autoSave: boolean;
  autoSaveInterval: number;
  hardwareAcceleration: boolean;
  proxyEditing: boolean;
  defaultFps: number;
  defaultResolution: { width: number; height: number };
}

export type PanelId = 
  | 'media' | 'timeline' | 'preview' | 'inspector'
  | 'effects' | 'color' | 'audio' | 'text' | 'ai';

export interface LayoutConfig {
  panels: Array<{
    id: PanelId;
    visible: boolean;
    position: 'left' | 'center' | 'right' | 'bottom';
    size: number;
  }>;
}

// ============================================================
// Default Config
// ============================================================

const DEFAULT_CONFIG: AppConfig = {
  theme: 'dark',
  accentColor: color.brand,
  autoSave: true,
  autoSaveInterval: 30000,
  hardwareAcceleration: true,
  proxyEditing: false,
  defaultFps: 30,
  defaultResolution: { width: 1920, height: 1080 }
};


// ============================================================
// Artone Application
// ============================================================


// ============================================================
// Types
// ============================================================

export class ArtoneApp {
  // Core engines
  public timeline: MagneticTimeline;
  public textEditor: TextBasedEditor;
  public multiCam: MultiCamEditor;
  public colorGrading: ColorGradingEngine;
  public audio: AudioEngine;
  public render: RenderBackend;
  public video: VideoPipeline;
  public export: ExportEngine;
  public ai: AIEffectsEngine;
  public plugins: PluginManager;
  public project: ProjectManager;
  public media: MediaBrowser;
  public collab: CollaborationEngine;
  // Session 56: 30%改善モジュール
  public history: HistoryManager;
  public scopes: ScopesManager;
  public perf: PerformanceMonitor;
  public autoQuality: AutoQualityAdjuster;
  public recovery: RecoveryManager;
  public proxy: ProxyWorkflow;
  public keyframes: KeyframeAnimator;
  public motionGfx: MotionGraphicsEngine;
  public captions: CaptionManager;
  public shortcuts: ShortcutManager;

  // State
  public readonly config: AppConfig;
  /** Optional event emitter hook wired up by the host (React layer). When unset, emits are no-ops. */
  public emit?: (event: string, payload?: unknown) => void;
  private isPlaying = false;
  private playbackFrame = 0;
  private animationId: number | null = null;
  /** Wall-clock time (performance.now()) when play() was last called, for drift-free frame advance. */
  private playbackStartWallTime = 0;
  /** Timeline frame at the moment play() was called, so elapsed wall-time maps to the right frame. */
  private playbackStartFrame = 0;

  // Crash snapshots (error / unhandledrejection / beforeunload) and the periodic
  // auto-save timer are owned by RecoveryManager (transactional IndexedDB). The
  // only event RecoveryManager does not cover is tab-hide, so we keep a single
  // named handler here that snapshots when the page becomes hidden. Named so it
  // can be removed in dispose() without leaking a closure that pins the instance.
  private readonly _onVisibilityChange = (): void => {
    if (!document.hidden) return;
    const proj = this.project.getCurrentProject();
    void this.recovery.saveSnapshot('auto', proj?.id, proj?.name, this.buildRecoveryData());
  };

  constructor(config: Partial<AppConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize engines
    this.timeline = new MagneticTimeline();
    this.textEditor = new TextBasedEditor();
    this.multiCam = new MultiCamEditor();
    this.colorGrading = new ColorGradingEngine();
    this.audio = new AudioEngine();
    this.render = new RenderBackend({
      maxHotFrames: 300,
      maxWarmFrames: 900,
      sinkFrames: [0],
    });
    this.video = new VideoPipeline();
    this.export = new ExportEngine();
    this.ai = new AIEffectsEngine();
    this.plugins = new PluginManager();
    this.project = new ProjectManager();
    this.media = new MediaBrowser();
    this.collab = new CollaborationEngine();
    // Session 56: 30%改善モジュール
    this.history = new HistoryManager({ autoPersist: true });
    this.scopes = new ScopesManager();
    this.perf = new PerformanceMonitor({ fpsTarget: this.config.defaultFps });
    this.autoQuality = new AutoQualityAdjuster(this.perf);
    this.recovery = new RecoveryManager({ autoSaveInterval: this.config.autoSaveInterval });
    this.proxy = new ProxyWorkflow();
    this.keyframes = new KeyframeAnimator();
    this.motionGfx = new MotionGraphicsEngine();
    this.captions = new CaptionManager();
    this.shortcuts = new ShortcutManager();
  }

  // ============================================================
  // Initialization
  // ============================================================

  async init(_container: HTMLElement): Promise<void> {
    const errors: Array<{ module: string; error: unknown }> = [];

    // Request persistent storage FIRST so the upcoming IndexedDB writes
    // (project / recovery / proxies) land in a bucket protected from
    // eviction. Best-effort only — never blocks editor startup.
    try {
      const persist = await requestPersistentStorage();
      if (persist.supported && !persist.persisted) {
        log.warn('Persistent storage not granted — project data may be evicted under disk pressure');
      }
    } catch (e) {
      errors.push({ module: 'storage-persistence', error: e });
    }

    // Open the recovery IndexedDB (sets up crash detection) BEFORE checking for
    // a previous session's snapshot — checkRecovery() reads from it.
    try {
      await this.recovery.init();
    } catch (e) {
      errors.push({ module: 'recovery-init', error: e });
    }

    // Check for crash recovery
    try {
      await this.checkRecovery();
    } catch (e) {
      errors.push({ module: 'recovery', error: e });
    }

    // Initialize engines (部分失敗でも続行 — エディタは開ける)
    try { await this.project.init(); } catch (e) { errors.push({ module: 'project', error: e }); }
    try { await this.audio.init(); } catch (e) { errors.push({ module: 'audio', error: e }); }

    // Initialize GPU profiling (オプショナル — WebGPU バックエンド時のみ)
    try {
      // RenderBackend が WebGPU を選択している場合のみ GPU プロファイリング有効
      if (this.render.getActiveBackend?.() === 'webgpu') {
        // GPU profiling は将来の RenderBackend.getDevice() で対応
      }
    } catch (e) {
      errors.push({ module: 'gpu', error: e });
    }

    // Enable default scopes
    try {
      this.scopes.enable('waveform');
      this.scopes.enable('histogram');
    } catch (e) {
      errors.push({ module: 'scopes', error: e });
    }

    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Setup auto-save & recovery
    try {
      this.setupAutoSave();
      this.setupCrashRecovery();
    } catch (e) {
      errors.push({ module: 'autosave', error: e });
    }

    // UI rendering is now handled by React (entry.tsx → shell.tsx)
    // Emit ready event for the React layer

    // 初期化結果をイベントで通知 (UI が表示可能)
    if (errors.length > 0) {
      log.warn(`init completed with ${errors.length} error(s):`,
        errors.map((e) => `${e.module}: ${e.error}`));
      this.emit?.('init:partial', { errors });
    }
  }

  private setupKeyboardShortcuts(): void {
    const sm = this.shortcuts;
    const tl = this.timeline;

    sm.registerCallback('play',         () => this.togglePlayback());
    sm.registerCallback('stop',         () => this.pause());
    sm.registerCallback('frameForward', () => tl.stepFrame(true));
    sm.registerCallback('frameBack',    () => tl.stepFrame(false));
    // step 10 frames: call stepFrame 10 times (no bulk API)
    sm.registerCallback('forward10', () => { for (let i = 0; i < 10; i++) tl.stepFrame(true); });
    sm.registerCallback('back10',    () => { for (let i = 0; i < 10; i++) tl.stepFrame(false); });
    sm.registerCallback('jklJ',         () => tl.jklControl('j'));
    sm.registerCallback('jklK',         () => tl.jklControl('k'));
    sm.registerCallback('jklL',         () => tl.jklControl('l'));
    sm.registerCallback('goToStart',    () => tl.setPlayhead(0));
    sm.registerCallback('goToEnd',      () => {
      const allClips = Array.from(tl.getState().clips.values());
      const end = allClips.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0);
      tl.setPlayhead(end);
    });
    sm.registerCallback('undo',         () => this.history.undo());
    sm.registerCallback('redo',         () => this.history.redo());
    // All structural edits go through history (CLAUDE.md: クリップ操作は全て Command Pattern 経由).
    sm.registerCallback('split',        () => this.splitAtPlayhead());
    sm.registerCallback('delete',       () => { const c = tl.deleteSelectedCommand(); if (c) this.history.execute(c); });
    sm.registerCallback('rippleDelete', () => { const c = tl.deleteSelectedCommand(); if (c) this.history.execute(c); });
    sm.registerCallback('lift',         () => { const c = tl.liftCommand();    if (c) this.history.execute(c); });
    sm.registerCallback('extract',      () => { const c = tl.extractCommand(); if (c) this.history.execute(c); });
    sm.registerCallback('selectAll',    () => tl.selectRange(0, Infinity));
    sm.registerCallback('deselect',     () => tl.deselectAll());
    sm.registerCallback('setInPoint',   () => tl.setInPoint());
    sm.registerCallback('setOutPoint',  () => tl.setOutPoint());
    sm.registerCallback('save',         () => this.project.saveProject());
    sm.registerCallback('saveAs',       () => this.emit?.('saveAs'));
    sm.registerCallback('export',       () => this.emit?.('showExport'));
    sm.registerCallback('import',       () => this.emit?.('showImport'));
    sm.registerCallback('newProject',   () => this.emit?.('newProject'));
    sm.registerCallback('open',         () => this.emit?.('openProject'));
    sm.registerCallback('fullscreen',   () => this.emit?.('toggleFullscreen'));
    sm.registerCallback('toggleTimeline',  () => this.emit?.('togglePanel', 'timeline'));
    sm.registerCallback('toggleMedia',     () => this.emit?.('togglePanel', 'media'));
    sm.registerCallback('toggleInspector', () => this.emit?.('togglePanel', 'inspector'));
    sm.registerCallback('toggleEffects',   () => this.emit?.('togglePanel', 'effects'));
    sm.registerCallback('zoomIn',  () => this.emit?.('zoomTimeline', 1.25));
    sm.registerCallback('zoomOut', () => this.emit?.('zoomTimeline', 0.8));
    sm.registerCallback('zoomFit', () => this.emit?.('zoomTimelineFit'));
    sm.registerCallback('addMarker',  () => this.emit?.('addMarker'));
    sm.registerCallback('nextMarker', () => this.emit?.('nextMarker'));
    sm.registerCallback('prevMarker', () => this.emit?.('prevMarker'));
    sm.registerCallback('snapToggle', () => this.emit?.('toggleSnap'));
    // Multi-cam camera switches: delegate to React layer with angle index
    for (let i = 1; i <= 9; i++) {
      sm.registerCallback(`cam${i}`, () => this.emit?.('switchCamera', i - 1));
    }
  }

  // ============================================================
  // Playback
  // ============================================================

  togglePlayback(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play(): void {
    this.isPlaying = true;
    // Record the wall-clock origin and the frame we're starting from so the RAF
    // loop can derive the correct frame index without accumulating delta-error.
    this.playbackStartWallTime = performance.now();
    this.playbackStartFrame = this.playbackFrame;
    this.timeline.play();
    this.startPlaybackLoop();
  }

  pause(): void {
    this.isPlaying = false;
    this.timeline.pause();
    this.stopPlaybackLoop();
  }

  private startPlaybackLoop(): void {
    const fps = this.config.defaultFps;

    const loop = (currentTime: number) => {
      if (!this.isPlaying) return;

      this.perf.beginFrame();

      // Derive the current frame from wall-clock elapsed time so we don't
      // accumulate per-RAF rounding error (the old delta-based approach drifted).
      const elapsedSec = (currentTime - this.playbackStartWallTime) / 1000;
      const newFrame = this.playbackStartFrame + Math.floor(elapsedSec * fps);

      if (newFrame !== this.playbackFrame) {
        this.playbackFrame = newFrame;
        const timeSec = newFrame / fps;
        this.timeline.setPlayhead(timeSec);
        this.emit?.('playhead', { frame: newFrame, time: timeSec });

        this.perf.markPhase('timeline');
        this.renderPreviewFrame();

        this.autoQuality.update();
      }

      this.perf.endFrame();
      this.animationId = requestAnimationFrame(loop);
    };

    this.animationId = requestAnimationFrame(loop);
  }

  private stopPlaybackLoop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private async renderPreviewFrame(): Promise<void> {
    this.perf.markPhase('render');
    // Would render the current frame based on timeline state
    
    // Update video scopes
    const currentFrame = await this.getCurrentVideoFrame();
    if (currentFrame) {
      this.perf.markPhase('scopes');
      this.scopes.analyze(currentFrame);
    }
  }

  private async getCurrentVideoFrame(): Promise<VideoFrame | null> {
    // Get current frame from timeline for scope analysis
    return null; // Implemented in actual video pipeline
  }

  // ============================================================
  // Edit Operations
  // ============================================================

  splitAtPlayhead(): void {
    const { playhead } = this.timeline.getState();
    for (const clip of this.timeline.getClipsAtTime(playhead)) {
      if (!clip.locked) {
        const cmd = this.timeline.splitClipCommand(clip.id, playhead);
        if (cmd) this.history.execute(cmd);
      }
    }
  }


  // Stats
  // ============================================================

  getStats(): {
    version: string;
    modules: number;
    mediaItems: number;
    projectName: string;
    performance: ReturnType<PerformanceMonitor['getMetrics']>;
    historyStats: ReturnType<HistoryManager['getStats']>;
  } {
    return {
      version: '3.0.0',
      modules: 17, // Updated count
      mediaItems: this.media.getStats().totalItems,
      projectName: this.project.getCurrentProject()?.name || 'None',
      performance: this.perf.getMetrics(),
      historyStats: this.history.getStats()
    };
  }

  // ============================================================
  // Auto-Save & Recovery
  // ============================================================

  private setupAutoSave(): void {
    if (!this.config.autoSave) return;

    // Delegate the periodic auto-save AND crash snapshots to RecoveryManager,
    // which persists to a transactional IndexedDB store (checksum-verified,
    // multi-snapshot, capacity-bounded) — far more robust than localStorage.
    const proj = this.project.getCurrentProject();
    this.recovery.startAutoSave(
      () => this.buildRecoveryData(),
      proj?.id ?? 'untitled',
      proj?.name ?? 'Untitled',
    );
  }

  private setupCrashRecovery(): void {
    // error / unhandledrejection / beforeunload crash snapshots are installed by
    // RecoveryManager.init() → setupCrashDetection(). Tab-hide is the only case
    // it does not cover, so we attach just that here (named handler for cleanup).
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  /**
   * Build the recovery payload from live engine state.
   *
   * The authoritative timeline lives in `timeline` as a serialized form (Maps →
   * entries, Set → array) so the IndexedDB JSON round-trip cannot silently
   * flatten it to `{}`. The typed clip/track/selection arrays mirror that data
   * in a self-describing shape for inspection and forward compatibility.
   */
  private buildRecoveryData(): RecoveryData {
    const state = this.timeline.getState();
    return {
      timeline: serializeTimelineState(state),
      clips: [...state.clips.values()],
      tracks: [...state.tracks.values()],
      effects: [],
      markers: [],
      playhead: this.playbackFrame,
      selection: [...state.selection],
      historyPosition: this.history.getPosition(),
      settings: { fps: this.config.defaultFps },
    };
  }

  private async checkRecovery(): Promise<void> {
    try {
      const snapshot = await this.recovery.getLatestSnapshot();
      if (!snapshot) return;

      // Only offer recovery for snapshots less than 1 hour old; older ones are
      // pruned by RecoveryManager.cleanup() on its own schedule.
      if (Date.now() - snapshot.timestamp > 3600000) return;

      const shouldRecover = await this.showRecoveryDialog(snapshot.timestamp);
      if (!shouldRecover) return;

      const data = await this.recovery.restoreSnapshot(snapshot.id);
      if (data) await this.restoreFromRecovery(data, snapshot.projectId);
    } catch (e) {
      log.warn('Recovery check failed:', e);
    }
  }

  private async showRecoveryDialog(timestamp: number): Promise<boolean> {
    const time = new Date(timestamp).toLocaleTimeString();
    return confirm(t('recovery.restorePrompt', { time }));
  }

  private async restoreFromRecovery(data: RecoveryData, projectId?: string): Promise<void> {
    if (projectId && projectId !== 'unknown') {
      try {
        await this.project.openProject(projectId);
      } catch (e) {
        // The project may have been deleted since the snapshot — keep the
        // recovered playhead/timeline rather than aborting the whole restore.
        log.warn('Recovery: failed to reopen project', e);
      }
    }

    // data.timeline is `unknown` (RecoveryData crosses an IndexedDB/JSON trust
    // boundary) — deserializeTimelineState() is defensive against missing or
    // malformed fields, so an untyped cast here is safe. Previously only
    // data.playhead was restored and this call was missing entirely, silently
    // discarding every recovered track/clip/selection.
    this.timeline.loadState(
      deserializeTimelineState(data.timeline as Partial<SerializedTimelineState> | null | undefined)
    );

    if (typeof data.playhead === 'number') {
      this.playbackFrame = data.playhead;
      this.timeline.setPlayhead(data.playhead);
    }

    // Recovery restore complete — emit event for UI notification
  }

  // ============================================================
  // Context API (engine-context.tsx が呼ぶ薄いファサード)
  // ============================================================

  /** DOM 不要の初期化。React Context 用。 */
  async initialize(): Promise<void> {
    const errors: Array<{ module: string; error: unknown }> = [];
    try { await this.project.init?.(); } catch (e) { errors.push({ module: 'project', error: e }); }
    try { await this.audio.init?.(); } catch (e) { errors.push({ module: 'audio', error: e }); }
    // Open the recovery DB before checking for a prior snapshot or starting
    // auto-save — both depend on the IndexedDB connection being live.
    try { await this.recovery.init(); } catch (e) { errors.push({ module: 'recovery-init', error: e }); }
    try { await this.checkRecovery(); } catch (e) { errors.push({ module: 'recovery', error: e }); }
    try { this.setupAutoSave(); this.setupCrashRecovery(); } catch (e) { errors.push({ module: 'autosave', error: e }); }
    if (errors.length > 0) {
      log.warn(`headless init: ${errors.length} error(s)`);
      this.emit?.('init:partial', { errors });
    }
  }

  getCurrentTime(): number {
    return this.timeline.getState().playhead;
  }

  getDuration(): number {
    return this.timeline.getTimelineDuration();
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  seek(time: number): void {
    const fps = this.config.defaultFps;
    this.playbackFrame = Math.floor(time * fps);
    this.timeline.setPlayhead(time);
    // Re-anchor the RAF scheduler so playback continues from the new position
    // without a jump when play() was active during the seek.
    if (this.isPlaying) {
      this.playbackStartWallTime = performance.now();
      this.playbackStartFrame = this.playbackFrame;
    }
    this.emit?.('playhead', { frame: this.playbackFrame, time });
  }

  async save(): Promise<void> {
    await this.project.saveProject?.();
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  async importMedia(file: File): Promise<void> {
    if (!this.media.importFiles) {
      throw new Error(`Media import not available — MediaBrowser.importFiles is undefined`);
    }

    // コーデック処理経路を判定 (WebCodecs ネイティブ or FFmpeg WASM transcode)
    const probableCodec = this.guessCodecFromFile(file);
    const plan = await planFileProcessing(file.name, probableCodec);
    if (plan.route === 'ffmpeg-transcode') {
      log.info(`Import: ${file.name} → FFmpeg WASM transcode`, { reason: plan.reason });
    }

    // importFiles は未対応/失敗ファイルを握りつぶして空配列を返すため、
    // 1件も取り込めなければ呼び出し側にエラーを伝播する (silent failure 防止)。
    const imported = await this.media.importFiles([file]);
    if (imported.length === 0) {
      throw new Error(`Import failed — "${file.name}" is unsupported or could not be processed`);
    }
  }

  /** ファイル名/MIME からコーデックを推定 (codec-router 入力用) */
  private guessCodecFromFile(file: File): string {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const byExt: Record<string, string> = {
      mov: 'prores',   // MOV は ProRes の可能性が高い
      mxf: 'dnxhr',    // MXF は DNxHR/放送系
      mp4: 'avc1.640028',
      webm: 'vp09.00.10.08',
      mkv: 'avc1.640028',
    };
    return byExt[ext] ?? 'avc1.640028';
  }

  async exportProject(preset?: string): Promise<void> {
    // 'youtube-1080p' は EXPORT_PRESETS に存在する有効な既定値。
    const presetId = preset ?? 'youtube-1080p';
    const exportPreset = this.export.getPresetById(presetId);
    if (!exportPreset) {
      throw new Error(`Export failed — unknown preset "${presetId}"`);
    }
    // タイムラインをフレーム列にレンダリングするパイプラインは未接続。
    // ここで空フレーム (quickExport([])) を渡すと無音・無映像の空ファイルが
    // 静かに生成されてしまうため、明示的に失敗させる (silent data loss 防止)。
    throw new Error(
      'Export is not yet wired to the render pipeline — timeline frame rendering is required before quickExport can run.'
    );
  }

  // ============================================================
  // Cleanup
  // ============================================================

  dispose(): void {
    this.stopPlaybackLoop();

    // RecoveryManager owns the auto-save timer + crash listeners; dispose() stops
    // the timer and closes the IndexedDB connection.
    this.recovery.dispose();

    // Remove our tab-hide listener so disposed instances are not kept alive by a
    // listener closure (prevents stale callbacks during HMR / test teardown).
    document.removeEventListener('visibilitychange', this._onVisibilityChange);

    this.shortcuts.dispose();
    this.history.clear();
    this.scopes.dispose();
    this.perf.dispose();
    this.audio.destroy?.();
    this.render.destroy();
  }
}

// ============================================================
// Export
// ============================================================

export default ArtoneApp;

// Quick start
export function createArtone(container: HTMLElement, config?: Partial<AppConfig>): Promise<ArtoneApp> {
  const app = new ArtoneApp(config);
  return app.init(container).then(() => app);
}
