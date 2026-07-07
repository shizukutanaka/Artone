/**
 * Artone v3 — Diagnostic Panels
 *
 * Scopes (Waveform/Vectorscope/Histogram) + Performance Monitor + History Tree
 * 設計: Carmack (リアルタイム描画), Pike (シンプル合成)
 *
 * @version 3.0.0
 */

import React, { useEffect, useRef } from 'react';
import { color } from './design-system';
import { t } from '../i18n/i18n-manager';

// Design System 移行済み — ローカル T 定数削除

// ============================================================
// Scopes Panel
// ============================================================

export type ScopeType = 'waveform' | 'vectorscope' | 'histogram' | 'parade';

export interface ScopesPanelProps {
  enabled: ScopeType[];
  onToggle: (scope: ScopeType) => void;
  renderScope: (canvas: HTMLCanvasElement, scope: ScopeType) => void;
}

export const ScopesPanel: React.FC<ScopesPanelProps> = ({ enabled, onToggle, renderScope }) => {
  const canvasRefs = useRef<Map<ScopeType, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      for (const scope of enabled) {
        const canvas = canvasRefs.current.get(scope);
        if (canvas) renderScope(canvas, scope);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled, renderScope]);

  const allScopes: ScopeType[] = ['waveform', 'vectorscope', 'histogram', 'parade'];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {allScopes.map((s) => (
          <button
            key={s}
            onClick={() => onToggle(s)}
            style={{
              flex: 1,
              padding: '4px',
              background: enabled.includes(s) ? color.brand : 'transparent',
              color: enabled.includes(s) ? color.surface1 : color.textSecondary,
              border: `1px solid ${enabled.includes(s) ? color.brand : color.border}`,
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 500
            }}
          >
            {s === 'waveform'
              ? t('color.scope.waveform')
              : s === 'vectorscope'
              ? t('color.scope.vectorscope')
              : s === 'histogram'
              ? t('color.scope.histogram')
              : t('color.scope.parade')}
          </button>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: enabled.length > 1 ? '1fr 1fr' : '1fr',
          gap: 4,
          minHeight: 0
        }}
      >
        {enabled.map((scope) => (
          <div
            key={scope}
            style={{
              background: color.surface0,
              border: `1px solid ${color.border}`,
              borderRadius: 4,
              padding: 4,
              position: 'relative',
              minHeight: 0
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                fontSize: 9,
                color: color.textTertiary,
                fontFamily: 'ui-monospace, monospace',
                zIndex: 1
              }}
            >
              {scope.toUpperCase()}
            </div>
            <canvas
              ref={(el) => {
                if (el) canvasRefs.current.set(scope, el);
                else canvasRefs.current.delete(scope);
              }}
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// Performance Overlay
// ============================================================

export interface PerformanceData {
  fps: number;
  frameTime: number; // ms
  gpuTime?: number; // ms
  memoryMB: number;
  droppedFrames: number;
  qualityLevel: number;
  history: number[]; // last N frame times
}

export interface PerformanceOverlayProps {
  data: PerformanceData;
  visible: boolean;
  onClose: () => void;
}

export const PerformanceOverlay: React.FC<PerformanceOverlayProps> = ({ data, visible, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Frame time graph
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    ctx.fillStyle = color.surface1;
    ctx.fillRect(0, 0, W, H);

    // Target lines (16.6ms = 60fps, 33.3ms = 30fps)
    ctx.strokeStyle = color.positive;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const y60 = H - (16.6 / 50) * H;
    ctx.moveTo(0, y60);
    ctx.lineTo(W, y60);
    ctx.stroke();

    ctx.strokeStyle = color.caution;
    ctx.beginPath();
    const y30 = H - (33.3 / 50) * H;
    ctx.moveTo(0, y30);
    ctx.lineTo(W, y30);
    ctx.stroke();

    // Frame time graph
    const history = data.history;
    if (history.length > 0) {
      const stepX = W / Math.max(history.length, 1);
      ctx.strokeStyle = color.brand;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      history.forEach((ft, i) => {
        const x = i * stepX;
        const y = H - Math.min(ft / 50, 1) * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }, [data, visible]);

  if (!visible) return null;

  const fpsColor = data.fps >= 55 ? color.positive : data.fps >= 28 ? color.caution : color.destructive;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 280,
        background: color.surface3 + 'E6',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${color.border}`,
        borderRadius: 8,
        padding: 12,
        zIndex: 1000,
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        color: color.textPrimary
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8
        }}
      >
        <span style={{ fontWeight: 600, color: color.textSecondary }}>PERFORMANCE</span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: color.textTertiary,
            cursor: 'pointer',
            fontSize: 14
          }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        <Stat label="FPS" value={data.fps.toFixed(0)} color={fpsColor} />
        <Stat label="Frame" value={`${data.frameTime.toFixed(1)}ms`} />
        {data.gpuTime !== undefined && <Stat label="GPU" value={`${data.gpuTime.toFixed(1)}ms`} />}
        <Stat label="Memory" value={`${data.memoryMB.toFixed(0)}MB`} />
        <Stat label="Dropped" value={String(data.droppedFrames)} color={data.droppedFrames > 0 ? color.caution : undefined} />
        <Stat label="Quality" value={`${(data.qualityLevel * 100).toFixed(0)}%`} />
      </div>

      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 60, background: color.surface1, borderRadius: 4 }}
      />
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color: statColor }) => (
  <div style={{ background: color.surface1, padding: '4px 6px', borderRadius: 4 }}>
    <div style={{ fontSize: 9, color: color.textTertiary, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 600, color: statColor || color.textPrimary }}>{value}</div>
  </div>
);

// ============================================================
// History Panel
// ============================================================

export interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  current: boolean;
  branch?: number;
}

export interface HistoryPanelProps {
  entries: HistoryEntry[];
  onJumpTo: (id: string) => void;
  onClear: () => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ entries, onJumpTo, onClear }) => {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8
        }}
      >
        <span style={{ fontSize: 11, color: color.textTertiary }}>{t('history.opsCount', { count: entries.length })}</span>
        <button
          onClick={onClear}
          style={{
            padding: '2px 8px',
            background: 'transparent',
            border: `1px solid ${color.border}`,
            borderRadius: 3,
            color: color.textSecondary,
            cursor: 'pointer',
            fontSize: 10
          }}
        >
          {t('history.clear')}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {entries.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: color.textTertiary,
              fontSize: 12,
              padding: 24
            }}
          >
            {t('history.empty')}
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              onClick={() => onJumpTo(entry.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                background: entry.current ? color.brand + '20' : 'transparent',
                borderLeft: entry.current ? `2px solid ${color.brand}` : '2px solid transparent',
                cursor: 'pointer',
                fontSize: 11,
                color: entry.current ? color.textPrimary : color.textSecondary,
                transition: 'background 0.15s'
              }}
              onMouseOver={(e) => {
                if (!entry.current) {
                  (e.currentTarget as HTMLDivElement).style.background = color.surface4;
                }
              }}
              onMouseOut={(e) => {
                if (!entry.current) {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: entry.current ? color.brand : color.border,
                  flexShrink: 0
                }}
              />
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.label}
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: color.textTertiary,
                  fontFamily: 'ui-monospace, monospace'
                }}
              >
                {formatRelativeTime(entry.timestamp)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1000) return 'now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

// ============================================================
// Toast / Notification System
// ============================================================

export interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
}

export const ToastContainer: React.FC<{ toasts: Toast[]; onDismiss: (id: string) => void }> = ({
  toasts,
  onDismiss
}) => {
  useEffect(() => {
    const timers = toasts
      .filter((t) => t.duration !== 0)
      .map((t) => setTimeout(() => onDismiss(t.id), t.duration ?? 4000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, onDismiss]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 32,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 2000,
        maxWidth: 360
      }}
    >
      {toasts.map((t) => {
        const accent =
          t.type === 'success'
            ? color.positive
            : t.type === 'warning'
            ? color.caution
            : t.type === 'error'
            ? color.destructive
            : color.brand;
        return (
          <div
            key={t.id}
            style={{
              background: color.surface3,
              border: `1px solid ${accent}`,
              borderLeft: `4px solid ${accent}`,
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12,
              color: color.textPrimary,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              animation: 'slideIn 0.2s ease-out'
            }}
          >
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => onDismiss(t.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: color.textTertiary,
                cursor: 'pointer',
                fontSize: 14,
                padding: 0
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};
