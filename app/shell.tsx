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

import React, { useState, useEffect, useCallback } from 'react';
import { ds, color, space, radius, motion, z, type FeatureTier, CSS_VARIABLES, typography } from './design-system';
import { FirstRunExperience, type FirstRunResult, type ExperienceLevel } from './first-run';
import { CommandPalette, createDefaultCommands, type PaletteItem } from './command-palette';
import { safeStorageGet, safeStorageSet, formatTimecode } from './utils';
import { DropZone } from './drop-zone';
import { EngineProvider, useEngine, configFromFirstRun } from './engine-context';
import { t } from '../i18n/i18n-manager';
import type { AppConfig } from './main';

// ============================================================
// Helpers
// ============================================================

function tierFromLevel(level: ExperienceLevel): FeatureTier {
  return level === 'beginner' ? 'essential' : level === 'intermediate' ? 'standard' : 'pro';
}



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

  // First-Run で選択されたファイルをインポート
  useEffect(() => {
    if (engine.isReady && pendingFiles.length > 0) {
      actions.importFiles(pendingFiles);
    }
  }, [engine.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // グローバルショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as Element).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      } else if (e.key === ' ') {
        e.preventDefault();
        actions.togglePlayPause();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        actions.undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        actions.redo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        actions.save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [actions]);

  // keyboard shortcut events dispatched via app.emit → engine state lastCommand
  useEffect(() => {
    const cmd = engine.lastCommand;
    if (!cmd) return;
    const { name, payload } = cmd.cmd;
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
          if (files.length > 0) actions.importFiles(files);
        };
        input.click();
        break;
      }
      case 'addMarker':
      case 'nextMarker':
      case 'prevMarker':
      case 'toggleSnap':
      case 'zoomTimeline':
      case 'zoomTimelineFit':
      case 'switchCamera':
      case 'newProject':
      case 'openProject':
      case 'saveAs':
        // Emit to any future subscriber (no-op for now; events are typed for extensibility)
        break;
      case 'toggleFullscreen':
        if (document.fullscreenEnabled) {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => undefined);
          } else {
            document.documentElement.requestFullscreen().catch(() => undefined);
          }
        }
        break;
    }
  }, [engine.lastCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  // コマンドパレット — エンジンの実アクションを渡す
  const commands: PaletteItem[] = createDefaultCommands({
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
        if (files.length > 0) actions.importFiles(files);
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
  });

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
            }}>
              <span style={ds.text('title')}>{t('media.title')}</span>
              <button onClick={() => setSidebarOpen(false)} style={ds.button('ghost')}>◁</button>
            </div>
            {/* ドロップゾーン — 実際に importFiles を呼ぶ */}
            <div
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', padding: space[4],
                color: color.textTertiary, ...ds.text('caption'), cursor: 'pointer',
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) actions.importFiles(files);
              }}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file'; input.multiple = true;
                input.accept = 'video/*,audio/*,image/*';
                input.onchange = () => {
                  const files = Array.from(input.files ?? []);
                  if (files.length > 0) actions.importFiles(files);
                };
                input.click();
              }}
            >{t('media.dropHint')}</div>
          </>}
        </aside>

        {/* 中央 (プレビュー + タイムライン) — DropZone でファイルドロップ受付 */}
        <DropZone onFilesDropped={(files) => actions.importFiles(files)}>
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
            <div style={{
              height: 32, borderBottom: `1px solid ${color.borderSubtle}`,
              display: 'flex', alignItems: 'center', padding: `0 ${space[4]}px`, gap: space[3],
            }}>
              <span style={{ ...ds.text('caption'), color: color.textTertiary }}>{t('timeline.title')}</span>
              <div style={{ flex: 1 }} />
              {activeTier !== 'essential' && <>
                <ToolButton label="マーカー" />
                <ToolButton label="スナップ" active />
              </>}
              {activeTier === 'pro' && <>
                <ToolButton label="マルチカム" />
                <ToolButton label="ネスト" />
              </>}
            </div>

            <div
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: color.textTertiary, ...ds.text('body'), height: 'calc(100% - 32px)',
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) actions.importFiles(files);
              }}
            >
              {t('timeline.dragHint')}
            </div>

            {/* プレイヘッド */}
            {engine.duration > 0 && (
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${(engine.currentTime / engine.duration) * 100}%`,
                width: 2, background: color.playhead, zIndex: z.panel, pointerEvents: 'none',
              }} />
            )}
          </div>
        </main>
        </DropZone>

        {/* 右サイドバー */}
        {activePanel && activeTier !== 'essential' && (
          <aside style={{
            width: 300, background: color.surface2,
            borderLeft: `1px solid ${color.border}`, overflow: 'hidden',
            animation: `artone-slide-in ${motion.slide} ${motion.snappy} forwards`,
          }}>
            <div style={{
              padding: `${space[3]}px ${space[4]}px`,
              borderBottom: `1px solid ${color.borderSubtle}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={ds.text('title')}>{panelTitle(activePanel)}</span>
              <button onClick={() => setActivePanel(null)} style={ds.button('ghost')}>✕</button>
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

const ToolButton: React.FC<{ label: string; active?: boolean }> = ({ label, active }) => (
  <button style={{
    ...ds.button('ghost'), ...ds.text('caption'),
    color: active ? color.brand : color.textTertiary,
    borderBottom: active ? `2px solid ${color.brand}` : '2px solid transparent',
    borderRadius: 0, padding: `${space[1]}px ${space[2]}px`,
  }}>{label}</button>
);

const fullScreen: React.CSSProperties = {
  position: 'fixed', inset: 0, background: color.surface1,
  fontFamily: typography.fontFamily.sans, color: color.textPrimary,
};
const center: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
