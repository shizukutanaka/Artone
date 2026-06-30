/**
 * Artone v3 — App Shell (Apple 式)
 *
 * v3.2: エンジン接続完了。shell は見た目だけの空箱ではない。
 *
 * 構造:
 * ArtoneShell (First-Run 判定)
 *   └─ EngineProvider (ArtoneApp をコンテキスト注入)
 *       └─ EditorUI (useEngine() で再生/編集/エクスポート)
 *
 * @version 3.2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ds, color, space, radius, motion, z, type FeatureTier, CSS_VARIABLES, typography } from './design-system';
import { FirstRunExperience, type FirstRunResult, type ExperienceLevel } from './first-run';
import { CommandPalette, createDefaultCommands, type PaletteItem } from './command-palette';
import { safeStorageGet, safeStorageSet, formatTimecode } from './utils';
import { DropZone } from './drop-zone';
import { EngineProvider, useEngine, configFromFirstRun } from './engine-context';
import { t } from '../i18n/i18n-manager';
import { Inspector, type Selection } from './Inspector';
import { ScopesPanel, type ScopeType } from './DiagnosticPanels';
import { EXPORT_PRESETS } from '../export/export-engine';
import { MediaBrowser, type MediaItem } from './MediaBrowser';
import { TimelineView, type TimelineTrack, type TimelineClip } from './TimelineView';
import type { AppConfig } from './main';

// ============================================================
// Helpers
// ============================================================

function tierFromLevel(level: ExperienceLevel): FeatureTier {
  return level === 'beginner' ? 'essential' : level === 'intermediate' ? 'standard' : 'pro';
}

type EngineActions = ReturnType<typeof useEngine>['actions'];

/** Global keyboard shortcut dispatcher. Extracted to keep EditorUI complexity low. */
function buildKeydownHandler(
  actions: EngineActions,
  setCmdOpen: React.Dispatch<React.SetStateAction<boolean>>,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    const tag = (e.target as Element).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'k') {
      e.preventDefault();
      setCmdOpen((v) => !v);
    } else if (e.key === ' ') {
      e.preventDefault();
      actions.togglePlayPause();
    } else if (mod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      actions.undo();
    } else if (mod && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      actions.redo();
    } else if (mod && e.key === 's') {
      e.preventDefault();
      actions.save();
    }
  };
}

/** Routes app.emit commands to UI state. Extracted to keep EditorUI complexity low. */
function dispatchAppCommand(
  name: string,
  payload: unknown,
  setActivePanel: React.Dispatch<React.SetStateAction<string | null>>,
  importFiles: (files: File[]) => void,
): void {
  switch (name) {
    case 'togglePanel':
      setActivePanel((p) => (p === payload ? null : (payload as string)));
      break;
    case 'showExport':
      setActivePanel('export');
      break;
    case 'showImport': {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'video/*,audio/*,image/*';
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        if (files.length > 0) importFiles(files);
      };
      input.click();
      break;
    }
    case 'toggleFullscreen':
      if (document.fullscreenEnabled) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => undefined);
        } else {
          document.documentElement.requestFullscreen().catch(() => undefined);
        }
      }
      break;
    default:
      // Future extensibility: addMarker, nextMarker, prevMarker, toggleSnap, etc.
      break;
  }
}

/** Draws a static placeholder on a scope canvas (no video frame available yet). */
function renderScopePlaceholder(canvas: HTMLCanvasElement, scope: ScopeType): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.fillStyle = color.surface1;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = scope === 'vectorscope' ? color.positive : color.interactive;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (scope === 'vectorscope') {
    ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.35, 0, Math.PI * 2);
  } else {
    ctx.moveTo(0, height * 0.5);
    ctx.lineTo(width, height * 0.5);
  }
  ctx.stroke();
}

interface ExportPanelProps { onExport: (preset?: string) => Promise<void>; }

/** Minimal export preset picker wired to the engine's export action. */
const ExportPanel: React.FC<ExportPanelProps> = ({ onExport }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
    {EXPORT_PRESETS.map((preset) => (
      <button
        key={preset.id}
        onClick={() => { onExport(preset.id).catch(() => undefined); }}
        style={{
          ...ds.button('secondary'), textAlign: 'left', display: 'block',
          padding: `${space[2]}px ${space[3]}px`,
        }}
      >
        <div style={ds.text('body')}>{preset.name}</div>
        <div style={{ ...ds.text('caption'), color: color.textTertiary }}>{preset.description}</div>
      </button>
    ))}
  </div>
);

/** Generic placeholder for panels not yet implemented. */
const PlaceholderPanel: React.FC<{ name: string }> = ({ name }) => (
  <div style={{
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    height: 200, color: color.textTertiary, gap: space[2],
  }}>
    <div style={{ fontSize: 32 }}>🚧</div>
    <div style={ds.text('body')}>{name}</div>
    <div style={{ ...ds.text('caption'), textAlign: 'center' }}>
      {t('common.comingSoon')}
    </div>
  </div>
);

// ============================================================
// ArtoneShell — 最外層 (First-Run 判定 + EngineProvider)
// ============================================================

export const ArtoneShell: React.FC = () => {
  const [firstRunDone, setFirstRunDone] = useState(!!safeStorageGet('artone-first-run-done'));
  const [engineConfig, setEngineConfig] = useState<Partial<AppConfig>>({});
  const [tier, setTier] = useState<FeatureTier>(
    tierFromLevel((safeStorageGet('artone-level') as ExperienceLevel) || 'intermediate')
  );
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const handleFirstRun = useCallback((result: FirstRunResult) => {
    setFirstRunDone(true);
    setTier(tierFromLevel(result.level));
    setEngineConfig(configFromFirstRun(result.level, result.template));
    setPendingFiles(result.mediaFiles);
    safeStorageSet('artone-first-run-done', '1');
    safeStorageSet('artone-level', result.level);
  }, []);

  if (!firstRunDone) {
    return <FirstRunExperience onComplete={handleFirstRun} />;
  }

  return (
    <EngineProvider config={engineConfig}>
      <EditorUI activeTier={tier} pendingFiles={pendingFiles} />
    </EngineProvider>
  );
};

// ============================================================
// EditorUI — エンジン接続済みの本体
// ============================================================

interface EditorUIProps {
  activeTier: FeatureTier;
  pendingFiles: File[];
}

const EditorUI: React.FC<EditorUIProps> = ({ activeTier, pendingFiles }) => {
  const { state: engine, actions } = useEngine();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ type: 'none' });
  const [enabledScopes, setEnabledScopes] = useState<ScopeType[]>(['waveform', 'histogram']);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState<string | undefined>();
  const [timelineTracks] = useState<TimelineTrack[]>([
    { id: 'v1', name: 'V1', type: 'video', height: 48, muted: false, locked: false },
    { id: 'v2', name: 'V2', type: 'video', height: 48, muted: false, locked: false },
    { id: 'a1', name: 'A1', type: 'audio', height: 40, muted: false, locked: false },
    { id: 'a2', name: 'A2', type: 'audio', height: 40, muted: false, locked: false },
  ]);
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);  // start = seconds from track start
  const [pxPerSecond, setPxPerSecond] = useState(100);

  const handleClipMove = useCallback((clipId: string, newStart: number, newTrackId?: string) => {
    setTimelineClips((prev) => prev.map((c) =>
      c.id === clipId
        ? { ...c, start: newStart, ...(newTrackId ? { trackId: newTrackId } : {}) }
        : c
    ));
  }, []);

  const handleClipResize = useCallback((clipId: string, newStart: number, newDuration: number) => {
    setTimelineClips((prev) => prev.map((c) =>
      c.id === clipId ? { ...c, start: newStart, duration: newDuration } : c
    ));
  }, []);

  const handleClipSelect = useCallback((clipId: string, _multi: boolean) => {
    setTimelineClips((prev) => {
      const clip = prev.find((c) => c.id === clipId);
      if (clip) {
        setSelection({
          type: 'clip',
          id: clip.id,
          name: clip.name,
          duration: clip.duration,
          startTime: clip.start,
          speed: 1,
          opacity: 1,
          position: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
        });
      }
      return prev;
    });
  }, []);

  /** Probe a video/audio File for its duration via a temporary media element. */
  const probeFileDuration = useCallback((file: File, objectUrl: string): Promise<number> => {
    return new Promise((resolve) => {
      const el = document.createElement(file.type.startsWith('audio') ? 'audio' : 'video');
      el.preload = 'metadata';
      const cleanup = () => {
        el.onloadedmetadata = null;
        el.onerror = null;
        el.src = ''; // stop any in-progress buffering and drop the src reference
      };
      el.onloadedmetadata = () => { const dur = el.duration || 30; cleanup(); resolve(dur); };
      el.onerror = () => { cleanup(); resolve(30); };
      el.src = objectUrl;
    });
  }, []);

  /** Import files into engine AND add them to the local media browser and timeline. */
  const handleImport = useCallback(async (files: File[]) => {
    await actions.importFiles(files);
    for (const file of files) {
      const type: MediaItem['type'] =
        file.type.startsWith('video') ? 'video' :
        file.type.startsWith('audio') ? 'audio' : 'image';
      const url = URL.createObjectURL(file);
      const duration = type === 'image' ? 5 : await probeFileDuration(file, url);
      const mediaId = `media_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const item: MediaItem = {
        id: mediaId, name: file.name, type, size: file.size, url,
        duration, proxyStatus: 'none',
      };
      setMediaItems((prev) => {
        if (prev.some((m) => m.name === file.name && m.size === file.size)) {
          // Duplicate: the item is discarded, so revoke its freshly-created
          // blob URL instead of leaking it.
          URL.revokeObjectURL(url);
          return prev;
        }
        return [...prev, item];
      });
      // Auto-add clip to the first matching track after existing clips
      const trackId = type === 'audio' ? 'a1' : 'v1';
      setTimelineClips((prev) => {
        const trackClips = prev.filter((c) => c.trackId === trackId);
        const startTime = trackClips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
        return [...prev, {
          id: `clip_${mediaId}`, trackId, name: file.name,
          start: startTime, duration,
          color: type === 'audio' ? color.interactive : type === 'video' ? color.positive : color.info,
        }];
      });
    }
  }, [actions, probeFileDuration]);

  // Stable MediaBrowser callbacks so the (memoized) browser does not re-render on
  // every engine tick (e.g. the playhead advancing during playback). Functional
  // setState keeps these dependency-free and referentially stable.
  const handleMediaImport = useCallback((files: File[]) => {
    handleImport(files).catch(() => undefined);
  }, [handleImport]);

  const handleMediaSelect = useCallback((item: MediaItem) => {
    setSelectedMediaId(item.id);
  }, []);

  const handleMediaDelete = useCallback((id: string) => {
    setMediaItems((prev) => {
      // Release the blob URL created at import time; otherwise it leaks until
      // document unload (revoke is a no-op if already released, so StrictMode
      // double-invoke is safe).
      const removed = prev.find((m) => m.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((m) => m.id !== id);
    });
    setSelectedMediaId((cur) => (cur === id ? undefined : cur));
  }, []);

  // First-Run で選択されたファイルをインポート
  useEffect(() => {
    if (engine.isReady && pendingFiles.length > 0) {
      handleImport(pendingFiles).catch(() => undefined);
    }
  }, [engine.isReady, pendingFiles, handleImport]);

  // グローバルショートカット
  useEffect(() => {
    const handler = buildKeydownHandler(actions, setCmdOpen);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [actions]);

  // keyboard shortcut events dispatched via app.emit → engine state lastCommand
  useEffect(() => {
    const cmd = engine.lastCommand;
    if (!cmd) return;
    dispatchAppCommand(cmd.cmd.name, cmd.cmd.payload, setActivePanel, actions.importFiles);
  }, [engine.lastCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  // コマンドパレット — エンジンの実アクションを渡す
  // useMemo prevents recreating the commands array (and all its closures) on every
  // render. actions is stable (engine-context useMemo), so this only rebuilds when
  // the engine reinitializes (rare).
  const commands = useMemo<PaletteItem[]>(() => createDefaultCommands({
    play: () => actions.togglePlayPause(),
    save: () => { actions.save(); },
    undo: () => actions.undo(),
    redo: () => actions.redo(),
    import: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'video/*,audio/*,image/*';
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        if (files.length > 0) actions.importFiles(files).catch(() => undefined);
      };
      input.click();
    },
    export: () => actions.exportProject(),
    colorGrade: () => setActivePanel('color'),
    audioMix: () => setActivePanel('audio'),
    captions: () => setActivePanel('captions'),
    textEdit: () => setActivePanel('text'),
    videoScopes: () => setActivePanel('scopes'),
    toggleTheme: () => {},
    showShortcuts: () => {},
    about: () => {},
  }), [actions]);

  const sidebarWidth = sidebarOpen ? 280 : 0;

  // 初期化エラー (フルスクリーン — エンジン未起動)
  if (engine.error && !engine.isReady) {
    return (
      <div style={{ ...fullScreen, ...center, flexDirection: 'column', gap: space[4] }}>
        <div style={{ fontSize: 32 }}>⚠</div>
        <div style={{ ...ds.text('title'), color: color.destructive }}>{t('error.init.title')}</div>
        <div style={{ ...ds.text('body'), color: color.textSecondary, maxWidth: 400, textAlign: 'center' }}>
          {engine.error}
        </div>
        <button style={ds.button('primary')} onClick={() => window.location.reload()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  // ローディング
  if (!engine.isReady) {
    return (
      <div style={{ ...fullScreen, ...center, flexDirection: 'column', gap: space[4] }}>
        <div style={{
          width: 48, height: 48, borderRadius: radius.full,
          border: `3px solid ${color.border}`, borderTopColor: color.brand,
          animation: 'artone-spin 1s linear infinite',
        }} />
        <div style={{ ...ds.text('body'), color: color.textSecondary }}>{t('loading.engine')}</div>
        <style>{`@keyframes artone-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ ...fullScreen, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{CSS_VARIABLES}</style>

      {/* ── Top Bar ── */}
      <header style={{
        height: space[12], minHeight: space[12], background: color.surface2,
        borderBottom: `1px solid ${color.border}`, display: 'flex',
        alignItems: 'center', padding: `0 ${space[4]}px`, gap: space[4], zIndex: z.toolbar,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: radius.md,
          background: `linear-gradient(135deg, ${color.brand}, #3B82F6)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 14, color: color.textOnBrand, flexShrink: 0,
        }}>A</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <span style={ds.text('title')}>{engine.projectName}</span>
          {engine.hasUnsavedChanges && <span style={{
            width: 8, height: 8, borderRadius: radius.full, background: color.caution,
          }} />}
        </div>

        <div style={{ flex: 1 }} />

        {/* 再生コントロール (中央) */}
        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: space[3],
        }}>
          <span style={{ ...ds.text('mono'), color: color.textTertiary }}>
            {formatTimecode(engine.currentTime, engine.fps)}
          </span>
          <button
            onClick={() => actions.togglePlayPause()}
            style={{
              ...ds.button('primary'), width: 36, height: 36,
              borderRadius: radius.full, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            }}
          >{engine.isPlaying ? '⏸' : '▶'}</button>
          <span style={{ ...ds.text('mono'), color: color.textTertiary }}>
            {formatTimecode(engine.duration, engine.fps)}
          </span>
        </div>

        <button onClick={() => setCmdOpen(true)}
          style={{ ...ds.button('ghost'), ...ds.text('caption') }}>⌘K</button>
      </header>

      {/* ── Main Area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左サイドバー */}
        <aside style={{
          width: sidebarWidth, minWidth: sidebarWidth, background: color.surface2,
          borderRight: sidebarWidth > 0 ? `1px solid ${color.border}` : 'none',
          transition: `width ${motion.slide}, min-width ${motion.slide}`,
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          {sidebarOpen && <>
            <div style={{
              padding: `${space[3]}px ${space[4]}px`,
              borderBottom: `1px solid ${color.borderSubtle}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexShrink: 0,
            }}>
              <span style={ds.text('title')}>{t('media.title')}</span>
              <button onClick={() => setSidebarOpen(false)} style={ds.button('ghost')}>◁</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <MediaBrowser
                items={mediaItems}
                selectedId={selectedMediaId}
                onImport={handleMediaImport}
                onSelect={handleMediaSelect}
                onDelete={handleMediaDelete}
              />
            </div>
          </>}
        </aside>

        {/* 中央 (プレビュー + タイムライン) — DropZone でファイルドロップ受付 */}
        <DropZone onFilesDropped={(files) => { actions.importFiles(files).catch(() => undefined); }}>
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* プレビュー */}
          <div style={{
            flex: '0 0 40%', maxHeight: '45%', background: color.surface0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
          }}>
            <div style={{
              width: '90%', maxWidth: 800, aspectRatio: '16/9', background: color.surface0,
              borderRadius: radius.md, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: color.textTertiary, ...ds.text('body'),
            }}>
              {engine.isReady ? t('preview.webgpu') : '...'}
            </div>
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)}
                style={{ ...ds.button('ghost'), position: 'absolute', left: space[2], top: space[2] }}>▷</button>
            )}
          </div>

          {/* タイムライン */}
          <div style={{
            flex: 1, background: color.surface2,
            borderTop: `1px solid ${color.border}`, position: 'relative', overflow: 'hidden',
          }}>
            <TimelineView
              tracks={timelineTracks}
              clips={timelineClips}
              duration={Math.max(engine.duration, 30)}
              playhead={engine.currentTime}
              pxPerSecond={pxPerSecond}
              onPlayheadChange={(t) => actions.seek(t)}
              onClipMove={handleClipMove}
              onClipSelect={handleClipSelect}
              onClipResize={handleClipResize}
              onZoomChange={setPxPerSecond}
            />
          </div>
        </main>
        </DropZone>

        {/* 右サイドバー */}
        {activePanel && activeTier !== 'essential' && (
          <aside style={{
            width: 300, background: color.surface2,
            borderLeft: `1px solid ${color.border}`, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            animation: `artone-slide-in ${motion.slide} ${motion.snappy} forwards`,
          }}>
            <div style={{
              padding: `${space[3]}px ${space[4]}px`,
              borderBottom: `1px solid ${color.borderSubtle}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexShrink: 0,
            }}>
              <span style={ds.text('title')}>{panelTitle(activePanel)}</span>
              <button onClick={() => setActivePanel(null)} style={ds.button('ghost')}>✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: space[3] }}>
              {activePanel === 'scopes' && (
                <ScopesPanel
                  enabled={enabledScopes}
                  onToggle={(s) =>
                    setEnabledScopes((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                    )
                  }
                  renderScope={renderScopePlaceholder}
                />
              )}
              {activePanel === 'inspector' && (
                <Inspector selection={selection} onChange={setSelection} />
              )}
              {activePanel === 'export' && (
                <ExportPanel onExport={actions.exportProject} />
              )}
              {(activePanel === 'color' || activePanel === 'audio' ||
                activePanel === 'captions' || activePanel === 'text') && (
                <PlaceholderPanel name={panelTitle(activePanel)} />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Command Palette */}
      {/* Runtime エラートースト (import/export 失敗時) */}
      {engine.error && engine.isReady && (
        <div style={{
          position: 'fixed', bottom: space[6], right: space[6],
          background: color.surface3, border: `1px solid ${color.destructive}`,
          borderRadius: radius.lg, padding: `${space[3]}px ${space[4]}px`,
          maxWidth: 400, zIndex: z.toast,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          animation: `artone-slide-in 250ms ${motion.easeOut} forwards`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: space[3] }}>
            <div>
              <div style={{ ...ds.text('title'), color: color.destructive, marginBottom: space[1] }}>{t('common.error')}</div>
              <div style={{ ...ds.text('caption'), color: color.textSecondary, whiteSpace: 'pre-wrap' }}>
                {engine.error}
              </div>
            </div>
            <button
              onClick={() => actions.clearError?.()}
              style={{ ...ds.button('ghost'), flexShrink: 0, fontSize: 16 }}
            >✕</button>
          </div>
        </div>
      )}

      <CommandPalette
        items={commands} currentTier={activeTier}
        isOpen={cmdOpen} onClose={() => setCmdOpen(false)}
      />

      <style>{`
        @keyframes artone-slide-in {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${color.border}; border-radius: ${radius.full}px; }
        ::selection { background: ${color.selection}; }
      `}</style>
    </div>
  );
};

// ============================================================
// Small Components
// ============================================================

function panelTitle(id: string): string {
  const keyMap: Record<string, string> = {
    color: 'color.title',
    audio: 'audio.title',
    captions: 'captions.title',
    text: 'text.title',
    scopes: 'scopes.title',
    inspector: 'inspector.title',
  };
  const key = keyMap[id];
  return key ? t(key) : id;
}


const fullScreen: React.CSSProperties = {
  position: 'fixed', inset: 0, background: color.surface1,
  fontFamily: typography.fontFamily.sans, color: color.textPrimary,
};
const center: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
