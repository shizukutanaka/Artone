/**
 * Artone v3 — Engine Context
 *
 * ArtoneApp (エンジン層) を React コンポーネントツリーに注入する。
 * shell.tsx で Provider を配置し、子コンポーネントが useEngine() で取得。
 *
 * 設計:
 * - Martin: 依存性逆転。UI はエンジンの実装を知らない。
 * - Carmack: エンジン初期化は 1 回。Context で全コンポーネントが共有。
 * - Pike: useEngine() 1 行で取得。複雑な DI コンテナは不要。
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createLogger } from './logger';
import { ArtoneApp, type AppConfig } from './main';
import type { ExperienceLevel } from './first-run';

// === Engine State (UI が参照する状態のサブセット) ===

const log = createLogger('EngineContext');

export interface EngineState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  fps: number;
  projectName: string;
  hasUnsavedChanges: boolean;
  isReady: boolean;
  error: string | null;
  /** ブラウザ capability 警告 (非対応機能の説明) */
  warnings: string[];
  /** full / degraded / minimal */
  capabilityTier: 'full' | 'degraded' | 'minimal' | 'unknown';
}

const DEFAULT_STATE: EngineState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  fps: 30,
  projectName: '無題のプロジェクト',
  hasUnsavedChanges: false,
  isReady: false,
  error: null,
  warnings: [],
  capabilityTier: 'unknown',
};

// === Engine Actions (UI → エンジンのコマンド) ===

export interface EngineActions {
  play(): void;
  pause(): void;
  togglePlayPause(): void;
  seek(time: number): void;
  save(): Promise<void>;
  undo(): void;
  redo(): void;
  importFiles(files: File[]): Promise<void>;
  exportProject(preset?: string): Promise<void>;
  setProjectName(name: string): void;
  clearError(): void;
  /** エンジンインスタンス直接アクセス (Pro 機能用) */
  getApp(): ArtoneApp | null;
}

// === Context ===

interface EngineContextValue {
  state: EngineState;
  actions: EngineActions;
}

const EngineContext = createContext<EngineContextValue | null>(null);

/**
 * エンジンへのアクセスフック。
 * 
 * 使用例:
 * ```
 * const { state, actions } = useEngine();
 * actions.play();
 * ```
 */
export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used within EngineProvider');
  return ctx;
}

// === Provider ===

interface EngineProviderProps {
  config?: Partial<AppConfig>;
  children: React.ReactNode;
}

/** エンジン初期化ロジック。副作用を分離してテスト容易性を高める。 */
async function initEngine(
  config: Partial<AppConfig>,
  onReady: (app: ArtoneApp, caps: { warnings: string[]; tier: string }) => void,
  _onError: (msg: string) => void,
  cancelled: () => boolean
) {
  const { detectCapabilities } = await import('./capabilities');
  const caps = await detectCapabilities();

  if (caps.warnings.length > 0) {
    log.warn('Browser capabilities', { tier: caps.tier, warnings: caps.warnings });
  }

  const app = new ArtoneApp({
    ...config,
    hardwareAcceleration: config.hardwareAcceleration !== false && caps.webgpu,
  });
  await app.initialize();

  if (cancelled()) {
    app.dispose?.();
    return;
  }
  onReady(app, caps);
}

/** RAF 再生ループ。UI への currentTime/isPlaying 同期。 */
function createPlaybackTick(
  appRef: React.MutableRefObject<ArtoneApp | null>,
  rafRef: React.MutableRefObject<number>,
  setState: React.Dispatch<React.SetStateAction<EngineState>>,
  cancelled: () => boolean
) {
  function tick() {
    if (cancelled()) return;
    const a = appRef.current;
    if (a) {
      setState((prev) => {
        const ct = a.getCurrentTime?.() ?? prev.currentTime;
        const ip = a.getIsPlaying?.() ?? prev.isPlaying;
        const dur = a.getDuration?.() ?? prev.duration;
        if (ct === prev.currentTime && ip === prev.isPlaying && dur === prev.duration) return prev;
        return { ...prev, currentTime: ct, isPlaying: ip, duration: dur };
      });
    }
    rafRef.current = requestAnimationFrame(tick);
  }
  return tick;
}

export const EngineProvider: React.FC<EngineProviderProps> = ({ config, children }) => {
  const appRef = useRef<ArtoneApp | null>(null);
  const [state, setState] = useState<EngineState>(DEFAULT_STATE);
  const rafRef = useRef<number>(0);
  const cancelledRef = useRef(false);

  // エンジン初期化 (1 回のみ)
  useEffect(() => {
    cancelledRef.current = false;

    initEngine(
      config ?? {},
      (app, caps) => {
        appRef.current = app;
        setState((s) => ({
          ...s,
          isReady: true,
          fps: app.config?.defaultFps ?? 30,
          projectName: '無題のプロジェクト',
          warnings: caps.warnings,
          capabilityTier: caps.tier as EngineState['capabilityTier'],
        }));
        const tick = createPlaybackTick(appRef, rafRef, setState, () => cancelledRef.current);
        rafRef.current = requestAnimationFrame(tick);
      },
      (msg) => setState((s) => ({ ...s, error: msg })),
      () => cancelledRef.current
    ).catch((err: Error) => {
      if (!cancelledRef.current) setState((s) => ({ ...s, error: err.message }));
    });

    return () => {
      cancelledRef.current = true;
      cancelAnimationFrame(rafRef.current);
      appRef.current?.dispose?.();
      appRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Actions (安定参照 — re-render で再生成しない)
  const actions: EngineActions = React.useMemo(
    () => ({
      play() {
        appRef.current?.play?.();
        setState((s) => ({ ...s, isPlaying: true }));
      },
      pause() {
        appRef.current?.pause?.();
        setState((s) => ({ ...s, isPlaying: false }));
      },
      togglePlayPause() {
        const app = appRef.current;
        if (!app) return;
        if (app.getIsPlaying()) {
          app.pause();
          setState((s) => ({ ...s, isPlaying: false }));
        } else {
          app.play();
          setState((s) => ({ ...s, isPlaying: true }));
        }
      },
      seek(time: number) {
        appRef.current?.seek?.(time);
        setState((s) => ({ ...s, currentTime: time }));
      },
      async save() {
        await appRef.current?.save?.();
        setState((s) => ({ ...s, hasUnsavedChanges: false }));
      },
      undo() {
        appRef.current?.undo?.();
        setState((s) => ({ ...s, hasUnsavedChanges: true }));
      },
      redo() {
        appRef.current?.redo?.();
        setState((s) => ({ ...s, hasUnsavedChanges: true }));
      },
      async importFiles(files: File[]) {
        const app = appRef.current;
        if (!app) return;
        const errors: string[] = [];
        for (const f of files) {
          try {
            await app.importMedia(f);
          } catch (e) {
            errors.push(`${f.name}: ${(e as Error).message}`);
          }
        }
        if (errors.length > 0) {
          setState((s) => ({ ...s, error: `Import failed:\n${errors.join('\n')}` }));
        } else {
          setState((s) => ({ ...s, hasUnsavedChanges: true }));
        }
      },
      async exportProject(preset?: string) {
        try {
          await appRef.current?.exportProject(preset);
        } catch (e) {
          setState((s) => ({ ...s, error: `Export failed: ${(e as Error).message}` }));
        }
      },
      setProjectName(name: string) {
        setState((s) => ({ ...s, projectName: name, hasUnsavedChanges: true }));
      },
      clearError() {
        setState((s) => ({ ...s, error: null }));
      },
      getApp() {
        return appRef.current;
      },
    }),
    []
  );

  return (
    <EngineContext.Provider value={{ state, actions }}>
      {children}
    </EngineContext.Provider>
  );
};

// === Config ヘルパー ===

export function configFromFirstRun(
  level: ExperienceLevel,
  template?: { fps: number; resolution: { width: number; height: number } } | null
): Partial<AppConfig> {
  return {
    defaultFps: template?.fps ?? 30,
    defaultResolution: template?.resolution ?? { width: 1920, height: 1080 },
    hardwareAcceleration: level !== 'beginner',
    proxyEditing: level === 'beginner',
    autoSave: true,
    autoSaveInterval: level === 'pro' ? 120 : 60,
  };
}
