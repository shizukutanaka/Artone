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
import { t } from '../i18n/i18n-manager';
import type { ExperienceLevel } from './first-run';

// === Engine State (UI が参照する状態のサブセット) ===

const log = createLogger('EngineContext');

/** App-level command dispatched by keyboard shortcuts or internal events. */
export interface AppCommand {
  name: string;
  payload?: unknown;
}

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
  /**
   * Last command dispatched via app.emit (e.g. from keyboard shortcuts).
   * Shell components watch this via useEffect to handle UI-level commands
   * such as panel toggles, save-as dialogs, and zoom operations.
   * The `seq` counter increments on each dispatch so the same command name
   * can be dispatched twice in a row and still trigger the effect.
   */
  lastCommand: { cmd: AppCommand; seq: number } | null;
}

// Built lazily (as a useState initializer) rather than as a module-level
// constant: t('file.untitled') requires i18n to already be set up, and this
// module can be imported before entry.tsx finishes awaiting setupI18n().init().
function createDefaultState(): EngineState {
  return {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    fps: 30,
    projectName: t('file.untitled'),
    hasUnsavedChanges: false,
    isReady: false,
    error: null,
    warnings: [],
    capabilityTier: 'unknown',
    lastCommand: null,
  };
}

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
  const [state, setState] = useState<EngineState>(createDefaultState);
  const rafRef = useRef<number>(0);

  // エンジン初期化 (1 回のみ)
  useEffect(() => {
    // REGRESSION fix: this used to be a ref shared across every effect
    // invocation. Under React 18 StrictMode's dev-mode double-invoke
    // (mount -> cleanup -> mount), the cleanup set the shared ref to
    // cancelled, but the immediately-following second mount reset it back
    // to false -- so when the FIRST invocation's in-flight initEngine()
    // finally resolved, its cancelled() check read the *shared* ref (now
    // false again) and proceeded anyway: it called onReady, overwrote
    // appRef.current, and started an untracked requestAnimationFrame loop
    // racing with the second invocation's own app/RAF loop. Scoping the
    // flag to a local variable per effect invocation means each
    // invocation's cancellation state is independent, so a genuinely
    // cancelled (unmounted) invocation stays cancelled regardless of
    // what any later invocation does.
    let cancelled = false;

    initEngine(
      config ?? {},
      (app, caps) => {
        appRef.current = app;
        // Wire up app.emit so keyboard-shortcut events reach the React layer
        let cmdSeq = 0;
        app.emit = (name: string, payload?: unknown) => {
          setState((s) => ({ ...s, lastCommand: { cmd: { name, payload }, seq: ++cmdSeq } }));
        };
        setState((s) => ({
          ...s,
          isReady: true,
          fps: app.config?.defaultFps ?? 30,
          projectName: t('file.untitled'),
          warnings: caps.warnings,
          capabilityTier: caps.tier as EngineState['capabilityTier'],
        }));
        const tick = createPlaybackTick(appRef, rafRef, setState, () => cancelled);
        rafRef.current = requestAnimationFrame(tick);
      },
      (msg) => setState((s) => ({ ...s, error: msg })),
      () => cancelled
    ).catch((err: Error) => {
      if (!cancelled) setState((s) => ({ ...s, error: err.message }));
    });

    return () => {
      cancelled = true;
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
    // autoSaveInterval is in milliseconds (AppConfig contract). 120s for pro, 60s otherwise.
    // Bug before fix: was 120/60 (seconds), causing setInterval to fire every ~60-120 ms
    // (8-16 times per second), thrashing localStorage with full JSON serialization.
    autoSaveInterval: level === 'pro' ? 120_000 : 60_000,
  };
}
