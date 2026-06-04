/**
 * Artone v3 — React Application Component
 *
 * @deprecated shell.tsx (ArtoneShell) に移行済み。
 * このファイルは後方互換のため残置。新規開発では shell.tsx を使用すること。
 *
 * @version 3.0.0
 */

import { color } from './design-system';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArtoneApp } from './main';

// ============================================================
// Theme (機能的色設計)
// ============================================================


// ============================================================
// Top Bar
// ============================================================

interface TopBarProps {
  projectName: string;
  isPlaying: boolean;
  hasUnsavedChanges: boolean;
  isOnline: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const TopBar: React.FC<TopBarProps> = ({
  projectName,
  isPlaying,
  hasUnsavedChanges,
  isOnline,
  onPlay,
  onPause,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}) => (
  <div
    style={{
      height: 48,
      borderBottom: `1px solid ${color.border}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      background: color.surface2,
      gap: 12
    }}
  >
    <div style={{ fontWeight: 600, color: color.brand, fontSize: 16 }}>
      Artone
    </div>
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        fontSize: 14,
        color: color.textSecondary
      }}
    >
      {projectName}
      {hasUnsavedChanges && (
        <span style={{ color: color.caution, marginLeft: 8 }}>●</span>
      )}
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      <IconButton title="Undo" disabled={!canUndo} onClick={onUndo}>
        ↶
      </IconButton>
      <IconButton title="Redo" disabled={!canRedo} onClick={onRedo}>
        ↷
      </IconButton>
      <IconButton title={isPlaying ? 'Pause' : 'Play'} onClick={isPlaying ? onPause : onPlay}>
        {isPlaying ? '⏸' : '▶'}
      </IconButton>
      <IconButton title="Save" onClick={onSave} variant="primary">
        💾
      </IconButton>
      <div
        title={isOnline ? 'オンライン' : 'オフライン'}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isOnline ? color.positive : color.destructive,
          alignSelf: 'center',
          marginLeft: 8
        }}
      />
    </div>
  </div>
);

// ============================================================
// Icon Button
// ============================================================

interface IconButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  variant?: 'default' | 'primary';
}

const IconButton: React.FC<IconButtonProps> = ({
  children,
  onClick,
  disabled,
  title,
  variant = 'default'
}) => (
  <button
    title={title}
    disabled={disabled}
    onClick={onClick}
    style={{
      width: 32,
      height: 32,
      border: 'none',
      borderRadius: 6,
      background: variant === 'primary' ? color.brand : 'transparent',
      color: variant === 'primary' ? color.surface1 : color.textPrimary,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      fontSize: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background 0.15s'
    }}
    onMouseOver={(e) => {
      if (!disabled && variant !== 'primary') {
        (e.currentTarget as HTMLButtonElement).style.background = color.surface4;
      }
    }}
    onMouseOut={(e) => {
      if (variant !== 'primary') {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }
    }}
  >
    {children}
  </button>
);

// ============================================================
// Panel
// ============================================================

interface PanelProps {
  title: string;
  children: React.ReactNode;
  width?: number | string;
  height?: number | string;
}

const Panel: React.FC<PanelProps> = ({ title, children, width, height }) => (
  <div
    style={{
      background: color.surface3,
      border: `1px solid ${color.border}`,
      borderRadius: 8,
      width,
      height,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}
  >
    <div
      style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${color.border}`,
        fontSize: 12,
        fontWeight: 600,
        color: color.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5
      }}
    >
      {title}
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>{children}</div>
  </div>
);

// ============================================================
// Status Bar
// ============================================================

interface StatusBarProps {
  fps: number;
  memory: number;
  resolution: { width: number; height: number };
  qualityLevel: number;
}

const StatusBar: React.FC<StatusBarProps> = ({ fps, memory, resolution, qualityLevel }) => {
  const fpsColor = fps >= 50 ? color.positive : fps >= 30 ? color.caution : color.destructive;
  return (
    <div
      style={{
        height: 24,
        borderTop: `1px solid ${color.border}`,
        background: color.surface2,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 16,
        fontSize: 11,
        color: color.textTertiary,
        fontFamily: 'ui-monospace, monospace'
      }}
    >
      <span style={{ color: fpsColor }}>{fps.toFixed(0)} FPS</span>
      <span>{memory.toFixed(0)} MB</span>
      <span>
        {resolution.width}×{resolution.height}
      </span>
      <span style={{ flex: 1 }} />
      <span>Quality: {(qualityLevel * 100).toFixed(0)}%</span>
    </div>
  );
};

// ============================================================
// Main App
// ============================================================

export const ArtoneUI: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<ArtoneApp | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [projectName] = useState('Untitled');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [stats, setStats] = useState({
    fps: 0,
    memory: 0,
    resolution: { width: 1920, height: 1080 },
    qualityLevel: 1.0
  });

  useEffect(() => {
    if (!containerRef.current || appRef.current) return;
    const app = new ArtoneApp();
    appRef.current = app;
    app.init(containerRef.current).then(() => setInitialized(true));

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Stats更新ループ
  useEffect(() => {
    if (!initialized || !appRef.current) return;
    const id = setInterval(() => {
      const app = appRef.current!;
      const perfStats = (app.perf as { getStats?: () => { fps: number; memoryMB: number } }).getStats?.();
      const quality = (app.autoQuality as { getCurrentLevel?: () => number }).getCurrentLevel?.() ?? 1.0;
      setStats({
        fps: perfStats?.fps ?? 60,
        memory: perfStats?.memoryMB ?? 0,
        resolution: { width: 1920, height: 1080 },
        qualityLevel: quality
      });
      setCanUndo((app.history as { canUndo?: () => boolean }).canUndo?.() ?? false);
      setCanRedo((app.history as { canRedo?: () => boolean }).canRedo?.() ?? false);
    }, 500);
    return () => clearInterval(id);
  }, [initialized]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    (appRef.current as { play?: () => void } | null)?.play?.();
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    (appRef.current as { pause?: () => void } | null)?.pause?.();
  }, []);

  const handleSave = useCallback(async () => {
    await (appRef.current as { saveProject?: () => Promise<void> } | null)?.saveProject?.();
    setHasUnsavedChanges(false);
  }, []);

  const handleUndo = useCallback(() => {
    appRef.current?.history.undo();
  }, []);

  const handleRedo = useCallback(() => {
    appRef.current?.history.redo();
  }, []);

  return (
    <div
      style={{
        background: color.surface1,
        color: color.textPrimary,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif',
        overflow: 'hidden'
      }}
    >
      <TopBar
        projectName={projectName}
        isPlaying={isPlaying}
        hasUnsavedChanges={hasUnsavedChanges}
        isOnline={isOnline}
        onPlay={handlePlay}
        onPause={handlePause}
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <div style={{ flex: 1, display: 'flex', gap: 8, padding: 8, minHeight: 0 }}>
        <Panel title="Media" width={240}>
          <div style={{ color: color.textTertiary, fontSize: 13 }}>
            メディアブラウザ
          </div>
        </Panel>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <Panel title="Preview" height="60%">
            <div
              ref={containerRef}
              style={{
                width: '100%',
                height: '100%',
                background: color.surface0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: color.textTertiary
              }}
            >
              {!initialized && <div>Initializing...</div>}
            </div>
          </Panel>

          <Panel title="Timeline" height="40%">
            <div style={{ color: color.textTertiary, fontSize: 13 }}>
              タイムライン
            </div>
          </Panel>
        </div>

        <Panel title="Inspector" width={300}>
          <div style={{ color: color.textTertiary, fontSize: 13 }}>
            プロパティ
          </div>
        </Panel>
      </div>

      <StatusBar {...stats} />
    </div>
  );
};

export default ArtoneUI;
