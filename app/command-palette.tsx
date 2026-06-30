/**
 * Artone v3 — Command Palette
 *
 * Apple Spotlight 哲学: 1つの検索窓が全てを支配する。
 *
 * 検索対象:
 * - コマンド (カット、エクスポート、カラー補正...)
 * - エフェクト (ブラー、シャープ、LUT...)
 * - プロジェクトファイル (タイムライン、マーカー...)
 * - ヘルプ (ショートカット一覧、マニュアル...)
 * - 設定 (テーマ、パフォーマンス...)
 *
 * 呼び出し: Cmd+K (Mac) / Ctrl+K (Win/Linux)
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import { ds, color, space, radius, motion, shadow, z, type FeatureTier } from './design-system';
import { t } from '../i18n/i18n-manager';
import { trapTabKey, captureFocus } from './focus-trap';

// === 型定義 ===

export interface PaletteItem {
  id: string;
  label: string;
  /** 日本語検索用 (ローマ字 / かな) */
  aliases?: string[];
  category: 'command' | 'effect' | 'file' | 'help' | 'setting';
  icon?: string;
  shortcut?: string;
  tier: FeatureTier;
  action: () => void;
}

interface CommandPaletteProps {
  items: PaletteItem[];
  currentTier: FeatureTier;
  isOpen: boolean;
  onClose: () => void;
}

// === ファジー検索 ===

export function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  if (!query) return { match: true, score: 0 };
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // 完全前方一致 → 最高スコア
  if (t.startsWith(q)) return { match: true, score: 100 };
  // 部分一致
  if (t.includes(q)) return { match: true, score: 80 };

  // ファジー: クエリの各文字が順序通りに含まれるか
  let qi = 0;
  let consecutive = 0;
  let maxConsecutive = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++;
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
    } else {
      consecutive = 0;
    }
  }
  if (qi === q.length) {
    return { match: true, score: 40 + maxConsecutive * 10 };
  }
  return { match: false, score: 0 };
}

export function searchItems(
  items: PaletteItem[],
  query: string,
  currentTier: FeatureTier
): PaletteItem[] {
  const tierOrder: FeatureTier[] = ['essential', 'standard', 'pro'];
  const maxTierIndex = tierOrder.indexOf(currentTier);

  const scored = items
    .filter((item) => tierOrder.indexOf(item.tier) <= maxTierIndex)
    .map((item) => {
      const labelResult = fuzzyMatch(query, item.label);
      const aliasResults = (item.aliases ?? []).map((a) => fuzzyMatch(query, a));
      const bestAlias = aliasResults.reduce(
        (best, r) => (r.score > best.score ? r : best),
        { match: false, score: 0 }
      );
      const best = labelResult.score >= bestAlias.score ? labelResult : bestAlias;
      return { item, ...best };
    })
    .filter((r) => r.match)
    .sort((a, b) => b.score - a.score);

  return scored.map((r) => r.item).slice(0, 12);
}

// === カテゴリアイコン ===

const CATEGORY_ICONS: Record<string, string> = {
  command: '⌘',
  effect: '✦',
  file: '◇',
  help: '?',
  setting: '⚙',
};

// === コンポーネント ===

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  items,
  currentTier,
  isOpen,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  // Defer search computation so keyboard input stays responsive under heavy item lists.
  // Input updates synchronously; results update at lower priority (no input lag).
  const deferredQuery = useDeferredValue(query);
  const isPending = query !== deferredQuery;

  const results = useMemo(
    () => searchItems(items, deferredQuery, currentTier),
    [items, deferredQuery, currentTier]
  );

  // Reset the highlight to the top result whenever the result set changes (e.g.
  // typing narrows it). Without this, a stale selectedIndex can exceed
  // results.length, leaving no visible selection and making Enter a no-op.
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // フォーカス: 開いたら入力にフォーカスし、閉じたら元の要素へ戻す (WCAG AAA)
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);
    const restoreFocus = captureFocus();
    requestAnimationFrame(() => inputRef.current?.focus());
    return restoreFocus;
  }, [isOpen]);

  // 選択追従スクロール
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  // キーボード操作
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        results[selectedIndex].action();
        onClose();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Tab' && paletteRef.current) {
        // Trap focus inside the modal so Tab cannot reach background UI (WCAG AAA).
        trapTabKey(paletteRef.current, e.nativeEvent, document.activeElement);
      }
    },
    [results, selectedIndex, onClose]
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: z.commandPalette - 1,
          animation: `fadeIn ${motion.fast} ${motion.easeOut} forwards`,
        }}
        onClick={onClose}
      />

      {/* Palette */}
      <div
        ref={paletteRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.placeholder')}
        style={{
          position: 'fixed',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: 560,
          background: color.surface3,
          borderRadius: radius.xl,
          boxShadow: shadow.popover,
          zIndex: z.commandPalette,
          overflow: 'hidden',
          animation: `slideDown ${motion.appear} forwards`,
        }}
      >
        {/* 検索フィールド */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: `${space[3]}px ${space[4]}px`,
            borderBottom: `1px solid ${color.border}`,
            gap: space[3],
          }}
        >
          <span style={{ ...ds.text('title'), color: color.textTertiary, flexShrink: 0 }}>⌘K</span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-autocomplete="list"
            aria-label={t('palette.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('palette.placeholder')}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: color.textPrimary,
              ...ds.text('body'),
              fontSize: 16,
            }}
          />
          {/* Subtle spinner while deferred search catches up to typed query */}
          {isPending && (
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                border: `2px solid ${color.textTertiary}`,
                borderTopColor: 'transparent',
                flexShrink: 0,
                animation: 'spin 0.6s linear infinite',
              }}
            />
          )}
        </div>

        {/* 結果リスト — dim while deferred query lags behind typed query */}
        <div
          ref={listRef}
          style={{
            maxHeight: 400,
            overflowY: 'auto',
            padding: `${space[1]}px 0`,
            opacity: isPending ? 0.6 : 1,
            transition: `opacity ${motion.fast} ${motion.easeOut}`,
          }}
        >
          {results.length === 0 && deferredQuery && !isPending && (
            <div
              style={{
                padding: `${space[6]}px ${space[4]}px`,
                textAlign: 'center',
                color: color.textTertiary,
                ...ds.text('body'),
              }}
            >
              見つかりません
            </div>
          )}
          {results.map((item, i) => (
            <button
              key={item.id}
              onClick={() => {
                item.action();
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: `${space[2]}px ${space[4]}px`,
                background: i === selectedIndex ? color.brandSubtle : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                gap: space[3],
                transition: `background ${motion.fast} ${motion.easeOut}`,
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.sm,
                  background: color.surface4,
                  ...ds.text('caption'),
                  color: color.textTertiary,
                  flexShrink: 0,
                }}
              >
                {item.icon ?? CATEGORY_ICONS[item.category] ?? '·'}
              </span>
              <span style={{ flex: 1, ...ds.text('body'), color: color.textPrimary }}>
                {item.label}
              </span>
              {item.shortcut && (
                <span
                  style={{
                    ...ds.text('caption'),
                    ...ds.text('mono'),
                    color: color.textTertiary,
                    background: color.surface4,
                    padding: `2px ${space[2]}px`,
                    borderRadius: radius.sm,
                  }}
                >
                  {item.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* フッター */}
        <div
          style={{
            padding: `${space[2]}px ${space[4]}px`,
            borderTop: `1px solid ${color.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            ...ds.text('caption'),
            color: color.textTertiary,
          }}
        >
          <span>{t('palette.hint')}</span>
          <span>{t('palette.count', { count: results.length })}</span>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

// === デフォルトコマンド群 ===

export function createDefaultCommands(
  actions: Record<string, () => void>
): PaletteItem[] {
  return [
    // Essential
    { id: 'cmd-cut', label: t('palette.cmd.cut'), aliases: ['cut', 'katto'], category: 'command', shortcut: '⌘X', tier: 'essential', action: actions.cut ?? (() => {}) },
    { id: 'cmd-copy', label: t('palette.cmd.copy'), aliases: ['copy', 'kopi'], category: 'command', shortcut: '⌘C', tier: 'essential', action: actions.copy ?? (() => {}) },
    { id: 'cmd-paste', label: t('palette.cmd.paste'), aliases: ['paste', 'pe-suto'], category: 'command', shortcut: '⌘V', tier: 'essential', action: actions.paste ?? (() => {}) },
    { id: 'cmd-undo', label: t('palette.cmd.undo'), aliases: ['undo', 'torikeshi'], category: 'command', shortcut: '⌘Z', tier: 'essential', action: actions.undo ?? (() => {}) },
    { id: 'cmd-redo', label: t('palette.cmd.redo'), aliases: ['redo', 'yarinaoshi'], category: 'command', shortcut: '⌘⇧Z', tier: 'essential', action: actions.redo ?? (() => {}) },
    { id: 'cmd-save', label: t('palette.cmd.save'), aliases: ['save', 'hozon'], category: 'command', shortcut: '⌘S', tier: 'essential', action: actions.save ?? (() => {}) },
    { id: 'cmd-export', label: t('palette.cmd.export'), aliases: ['export', 'ekusupo-to'], category: 'command', shortcut: '⌘⇧E', tier: 'essential', action: actions.export ?? (() => {}) },
    { id: 'cmd-import', label: t('palette.cmd.import'), aliases: ['import', 'inpo-to'], category: 'command', shortcut: '⌘I', tier: 'essential', action: actions.import ?? (() => {}) },
    { id: 'cmd-play', label: t('palette.cmd.play'), aliases: ['play', 'stop', 'saisei', 'teishi'], category: 'command', shortcut: 'Space', tier: 'essential', action: actions.play ?? (() => {}) },

    // Standard
    { id: 'cmd-color', label: t('palette.cmd.colorGrade'), aliases: ['color', 'kara-hosei', 'grade'], category: 'command', tier: 'standard', action: actions.colorGrade ?? (() => {}) },
    { id: 'cmd-audio', label: t('palette.cmd.audioMix'), aliases: ['audio', 'mixer', 'o-dhio'], category: 'command', tier: 'standard', action: actions.audioMix ?? (() => {}) },
    { id: 'cmd-caption', label: t('palette.cmd.captions'), aliases: ['subtitle', 'caption', 'jimaku'], category: 'command', tier: 'standard', action: actions.captions ?? (() => {}) },
    { id: 'cmd-text', label: t('palette.cmd.textEdit'), aliases: ['text', 'tekisuto', 'transcript'], category: 'command', tier: 'standard', action: actions.textEdit ?? (() => {}) },

    // Pro
    { id: 'cmd-multicam', label: t('palette.cmd.multicam'), aliases: ['multicam', 'maruchikamu'], category: 'command', tier: 'pro', action: actions.multicam ?? (() => {}) },
    { id: 'cmd-scope', label: t('palette.cmd.videoScopes'), aliases: ['scope', 'waveform', 'vectorscope', 'suko-pu'], category: 'command', tier: 'pro', action: actions.videoScopes ?? (() => {}) },
    { id: 'cmd-otio', label: t('palette.cmd.otioExport'), aliases: ['opentimelineio', 'interchange'], category: 'command', tier: 'pro', action: actions.otioExport ?? (() => {}) },

    // Settings
    { id: 'set-theme', label: t('palette.cmd.toggleTheme'), aliases: ['theme', 'dark', 'light', 'te-ma'], category: 'setting', tier: 'essential', action: actions.toggleTheme ?? (() => {}) },
    { id: 'set-shortcuts', label: t('palette.cmd.shortcuts'), aliases: ['shortcuts', 'keyboard', 'sho-tokatto'], category: 'help', tier: 'essential', action: actions.showShortcuts ?? (() => {}) },

    // Help
    { id: 'help-about', label: t('palette.cmd.about'), aliases: ['about', 'version'], category: 'help', tier: 'essential', action: actions.about ?? (() => {}) },
  ];
}
