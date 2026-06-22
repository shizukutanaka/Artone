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
import { safeStorageGet, safeStorageSet, safeStorageRemove } from './utils';
import { requestPersistentStorage } from './storage-persistence';
import { MagneticTimeline, serializeTimelineState, type SerializedTimelineState } from '../timeline/magnetic-timeline';
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
import { RecoveryManager } from '../recovery/recovery-manager';
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

interface RecoveryData {
  projectId: string;
  projectName: string;
  timestamp: number;
  data: { tracks: unknown[]; settings: unknown };
  version: string;
  // Serialized (JSON-safe) form — the live TimelineState holds Maps/Set that
  // JSON.stringify would silently flatten to "{}".
  timelineState?: SerializedTimelineState;
  playhead?: number;
}

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
  private autoSaveTimer: number | null = null;
  private recoveryKey = 'artone_recovery';

  // Named handler references so they can be removed in dispose() without leaking
  // closures that keep the ArtoneApp instance alive after disposal.
  private readonly _onBeforeUnload = (): void => { this.saveRecoveryData(); };
  private readonly _onVisibilityChange = (): void => {
    if (document.hidden) this.saveRecoveryData();
  };
  private readonly _onError = (e: ErrorEvent): void => {
    log.error('Artone crash:', e.error);
    this.saveRecoveryData();
  };
  private readonly _onUnhandledRejection = (e: PromiseRejectionEvent): void => {
    log.error('Artone unhandled rejection:', e.reason);
    this.saveRecoveryData();
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
    sm.registerCallback('split',        () => this.splitAtPlayhead());
    sm.registerCallback('lift',         () => { tl.lift(); });
    sm.registerCallback('extract',      () => { tl.extract(); });
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
    const frameTime = 1000 / fps;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      if (!this.isPlaying) return;

      // Performance monitoring
      this.perf.beginFrame();

      const delta = currentTime - lastTime;
      if (delta >= frameTime) {
        lastTime = currentTime - (delta % frameTime);
        
        this.perf.markPhase('timeline');
        this.renderPreviewFrame();
        
        // Auto quality adjustment
        const quality = this.autoQuality.update();
        if (quality < 1.0) {
          // Quality scale は AutoQualityAdjuster が perf 経由で制御
        }
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
    const state = this.timeline.getState();
    const clipsAtPlayhead = this.timeline.getClipsAtTime(state.playhead);

    for (const clip of clipsAtPlayhead) {
      if (!clip.locked) {
        this.timeline.splitClip(clip.id, state.playhead);
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

    this.autoSaveTimer = window.setInterval(() => {
      this.saveRecoveryData();
    }, this.config.autoSaveInterval);
  }

  private setupCrashRecovery(): void {
    window.addEventListener('beforeunload', this._onBeforeUnload);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.addEventListener('error', this._onError);
    window.addEventListener('unhandledrejection', this._onUnhandledRejection);
  }

  private saveRecoveryData(): void {
    try {
      const recoveryData = {
        timestamp: Date.now(),
        projectId: this.project.getCurrentProject()?.id,
        // Serialize so the Maps (tracks, clips) and Set (selection) survive the
        // JSON round-trip — otherwise the entire timeline is lost from the snapshot.
        timelineState: serializeTimelineState(this.timeline.getState()),
        playhead: this.playbackFrame,
        historyPosition: this.history.getPosition()
      };

      safeStorageSet(this.recoveryKey, JSON.stringify(recoveryData));
    } catch (e) {
      log.warn('Failed to save recovery data:', e);
    }
  }

  private async checkRecovery(): Promise<void> {
    try {
      const saved = safeStorageGet(this.recoveryKey);
      if (!saved) return;

      const recoveryData = JSON.parse(saved);
      const age = Date.now() - recoveryData.timestamp;

      // Only recover if less than 1 hour old
      if (age > 3600000) {
        safeStorageRemove(this.recoveryKey);
        return;
      }

      // Show recovery dialog
      const shouldRecover = await this.showRecoveryDialog(recoveryData);
      
      if (shouldRecover) {
        await this.restoreFromRecovery(recoveryData);
      }

      safeStorageRemove(this.recoveryKey);
    } catch (e) {
      log.warn('Recovery check failed:', e);
    }
  }

  private async showRecoveryDialog(data: RecoveryData): Promise<boolean> {
    const time = new Date(data.timestamp).toLocaleTimeString();
    return confirm(t('recovery.restorePrompt', { time }));
  }

  private async restoreFromRecovery(data: RecoveryData): Promise<void> {
    if (data.projectId) {
      await this.project.openProject(data.projectId);
    }

    if (data.timelineState) {
      this.timeline.setPlayhead(data.timelineState.playhead);
    }

    if (data.playhead !== undefined) {
      this.playbackFrame = data.playhead;
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
    try { this.setupAutoSave(); } catch (e) { errors.push({ module: 'autosave', error: e }); }
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
    this.timeline.setPlayhead(time);
    this.playbackFrame = Math.floor(time * this.config.defaultFps);
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

    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    // Remove crash-recovery listeners so disposed instances are not kept alive
    // by listener closures (prevents stale callbacks during HMR / test teardown).
    window.removeEventListener('beforeunload', this._onBeforeUnload);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('error', this._onError);
    window.removeEventListener('unhandledrejection', this._onUnhandledRejection);

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
