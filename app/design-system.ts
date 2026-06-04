/**
 * Artone v3 — Design System
 *
 * Apple HIG 準拠。全UIの唯一の真実。
 * 他のファイルで THEME, T, 色の直書き禁止。
 * 必ずこのファイルから import する。
 *
 * 原則:
 * - 色は「役割」で命名 (red ではなく destructive)
 * - スペーシングは 4px グリッド
 * - タイポグラフィは 3段 (display / body / caption)
 * - モーションは spring ベース
 * - 1つの意味に 1つの色
 */

// ============================================================
// Color — 機能的色設計 (1色1意味)
// ============================================================

export const color = {
  // ブランド (Artone のアイデンティティ)
  brand: '#00C4CC',
  brandSubtle: 'rgba(0, 196, 204, 0.15)',
  brandHover: '#00A3AA',
  brandPressed: '#008C93',

  // 操作 (ユーザーが押せるもの)
  interactive: '#3B82F6',
  interactiveHover: '#2563EB',

  // 状態 (何が起きたか)
  positive: '#10B981',
  caution: '#F59E0B',
  destructive: '#EF4444',
  info: '#6366F1',

  // 表面 (背景の階層)
  surface0: '#000000',       // 最深背景
  surface1: '#0A0A0A',       // アプリ背景
  surface2: '#141414',       // パネル
  surface3: '#1C1C1C',       // カード / ポップオーバー
  surface4: '#252525',       // インプット / ウェル

  // テキスト (WCAG AAA 7:1 保証 on surface1)
  textPrimary: '#FFFFFF',     // 21:1 on surface1
  textSecondary: '#B8B8B8',   // 10.4:1 on surface1
  textTertiary: '#7A7A7A',    // 5.0:1 on surface1 (AA, not AAA — 装飾のみ)
  textOnBrand: '#000000',     // 9.5:1 on brand

  // 境界
  border: '#2A2A2A',
  borderSubtle: '#1E1E1E',
  borderFocus: '#00C4CC',
  borderDestructive: '#EF4444',

  // 特殊
  selection: 'rgba(0, 196, 204, 0.25)',
  playhead: '#FF3B30',       // タイムラインのプレイヘッド (Apple Red)
  scrub: '#FF9500',
} as const;

// ============================================================
// Spacing — 4px グリッド (Apple 的倍数体系)
// ============================================================

export const space = {
  0: 0,
  1: 4,    // 最小 — インラインのすき間
  2: 8,    // コンパクト — リスト行内
  3: 12,   // デフォルトパディング
  4: 16,   // パネルパディング
  5: 20,   // セクション区切り
  6: 24,   // パネル間マージン
  8: 32,   // グループ間
  10: 40,  // ヒーロー領域
  12: 48,  // ツールバー高さ
  16: 64,  // 大きな余白
} as const;

// ============================================================
// Typography — 3段階 (Display / Body / Caption)
// ============================================================

export const typography = {
  fontFamily: {
    // Apple SF Pro 的な清潔感。可変ウェイトの sans-serif。
    sans: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif',
    mono: '"SF Mono", "Fira Code", "JetBrains Mono", "Cascadia Code", ui-monospace, monospace',
  },

  // display: ヘッダー、タイトル
  display: {
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: -0.02,
  },
  // title: パネルヘッダー
  title: {
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: 0,
  },
  // body: 通常テキスト
  body: {
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
  },
  // caption: 補助、タイムコード
  caption: {
    fontSize: 11,
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacing: 0.01,
  },
  // mono: タイムコード、数値
  mono: {
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.0,
    letterSpacing: 0.02,
  },
} as const;

// ============================================================
// Radius — 角丸 (Apple の段階体系)
// ============================================================

export const radius = {
  none: 0,
  sm: 4,     // チップ、バッジ
  md: 8,     // ボタン、カード
  lg: 12,    // パネル、モーダル
  xl: 16,    // シート
  full: 9999, // ピル
} as const;

// ============================================================
// Shadow — 影 (Apple の 3段階)
// ============================================================

export const shadow = {
  sm: '0 1px 2px rgba(0,0,0,0.3)',
  md: '0 4px 12px rgba(0,0,0,0.4)',
  lg: '0 8px 32px rgba(0,0,0,0.5)',
  // ポップオーバー専用 — 背景から浮かせる
  popover: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
} as const;

// ============================================================
// Motion — Spring ベース (Apple 的物理シミュレーション)
// ============================================================

export const motion = {
  // イージング (CSS cubic-bezier)
  easeOut: 'cubic-bezier(0.25, 1, 0.5, 1)',       // 減速 — 要素の登場
  easeIn: 'cubic-bezier(0.5, 0, 0.75, 0)',         // 加速 — 要素の退出
  easeInOut: 'cubic-bezier(0.45, 0, 0.55, 1)',     // 対称 — 状態変化
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',     // スプリング — 気持ちいい弾み
  snappy: 'cubic-bezier(0.2, 0, 0, 1)',             // Apple 風のキビキビ感

  // デュレーション
  instant: '0ms',
  fast: '120ms',     // ホバー、トグル
  normal: '200ms',   // パネル開閉、フェード
  slow: '350ms',     // モーダル、シート
  emphasis: '500ms', // 初回表示、ヒーロー

  // プリセット (CSS transition 文字列)
  hover: '120ms cubic-bezier(0.25, 1, 0.5, 1)',
  appear: '350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  fade: '200ms cubic-bezier(0.45, 0, 0.55, 1)',
  slide: '250ms cubic-bezier(0.2, 0, 0, 1)',
} as const;

// ============================================================
// Z-Index — レイヤー管理 (Apple 的秩序)
// ============================================================

export const z = {
  base: 0,
  panel: 10,
  toolbar: 20,
  dropdown: 30,
  modal: 40,
  popover: 50,
  toast: 60,
  commandPalette: 70,
  splash: 100,
} as const;

// ============================================================
// Breakpoints — レスポンシブ
// ============================================================

export const breakpoint = {
  compact: 768,   // iPad portrait 以下
  regular: 1024,  // iPad landscape
  wide: 1440,     // デスクトップ
} as const;

// ============================================================
// Feature Tiers — 段階的開示 (Apple の "1000 No's")
// ============================================================

export type FeatureTier = 'essential' | 'standard' | 'pro';

/**
 * 機能の表示レベル。
 *
 * essential: 初回から見える (カット、トリム、エクスポート)
 * standard:  プロジェクト保存後に見える (カラー、オーディオ、エフェクト)
 * pro:       設定で有効化 (OTIO、SBOM、マルチカム、ライブ配信)
 */
export const featureTier = {
  // Essential — 誰でも使う
  cut: 'essential',
  trim: 'essential',
  import: 'essential',
  export: 'essential',
  playback: 'essential',
  undo: 'essential',
  save: 'essential',

  // Standard — 編集に慣れたら
  colorGrade: 'standard',
  audioMix: 'standard',
  effects: 'standard',
  captions: 'standard',
  markers: 'standard',
  keyframes: 'standard',
  textEdit: 'standard',
  proxy: 'standard',

  // Pro — 意識的に有効化
  multicam: 'pro',
  nestedSequences: 'pro',
  liveStream: 'pro',
  cloudRender: 'pro',
  pluginBridge: 'pro',
  otioExport: 'pro',
  edlExport: 'pro',
  surround: 'pro',
  hdr: 'pro',
  videoScopes: 'pro',
  perfMonitor: 'pro',
  batchProcess: 'pro',
  collaboration: 'pro',
} as const satisfies Record<string, FeatureTier>;

/** 型安全な機能キー */
export type FeatureKey = keyof typeof featureTier;

// ============================================================
// CSS Variables (HTML/JSX にインジェクション用)
// ============================================================

/** CSS Variables 文字列 (一度だけ生成、再利用) */
export const CSS_VARIABLES = `
:root {
  --nv-brand: ${color.brand};
  --nv-brand-subtle: ${color.brandSubtle};
  --nv-surface-0: ${color.surface0};
  --nv-surface-1: ${color.surface1};
  --nv-surface-2: ${color.surface2};
  --nv-surface-3: ${color.surface3};
  --nv-surface-4: ${color.surface4};
  --nv-text-1: ${color.textPrimary};
  --nv-text-2: ${color.textSecondary};
  --nv-text-3: ${color.textTertiary};
  --nv-border: ${color.border};
  --nv-border-focus: ${color.borderFocus};
  --nv-playhead: ${color.playhead};
  --nv-selection: ${color.selection};
  --nv-positive: ${color.positive};
  --nv-caution: ${color.caution};
  --nv-destructive: ${color.destructive};
  --nv-radius-sm: ${radius.sm}px;
  --nv-radius-md: ${radius.md}px;
  --nv-radius-lg: ${radius.lg}px;
  --nv-shadow-sm: ${shadow.sm};
  --nv-shadow-md: ${shadow.md};
  --nv-shadow-lg: ${shadow.lg};
  --nv-font-sans: ${typography.fontFamily.sans};
  --nv-font-mono: ${typography.fontFamily.mono};
  --nv-ease-out: ${motion.easeOut};
  --nv-spring: ${motion.spring};
  --nv-snappy: ${motion.snappy};
}
`;

/** @deprecated CSS_VARIABLES 定数を直接使うこと */
export function injectCSSVariables(): string {
  return CSS_VARIABLES;
}

// ============================================================
// Helper — style object 生成
// ============================================================

export const ds = {
  color,
  space,
  typography,
  radius,
  shadow,
  motion,
  z,
  breakpoint,
  featureTier,

  /** パネル共通スタイル */
  panel: () => ({
    background: color.surface2,
    borderRadius: radius.lg,
    border: `1px solid ${color.border}`,
  }),

  /** ボタン共通 */
  button: (variant: 'primary' | 'secondary' | 'ghost' = 'secondary') => ({
    primary: {
      background: color.brand,
      color: color.textOnBrand,
      border: 'none',
      borderRadius: radius.md,
      padding: `${space[2]}px ${space[4]}px`,
      fontWeight: 600,
      fontSize: typography.body.fontSize,
      cursor: 'pointer',
      transition: `all ${motion.hover}`,
    },
    secondary: {
      background: color.surface4,
      color: color.textPrimary,
      border: `1px solid ${color.border}`,
      borderRadius: radius.md,
      padding: `${space[2]}px ${space[4]}px`,
      cursor: 'pointer',
      transition: `all ${motion.hover}`,
    },
    ghost: {
      background: 'transparent',
      color: color.textSecondary,
      border: 'none',
      borderRadius: radius.md,
      padding: `${space[2]}px ${space[3]}px`,
      cursor: 'pointer',
      transition: `all ${motion.hover}`,
    },
  })[variant],

  /** テキストスタイル */
  text: (level: 'display' | 'title' | 'body' | 'caption' | 'mono') => {
    const t = typography[level];
    return {
      fontFamily: level === 'mono' ? typography.fontFamily.mono : typography.fontFamily.sans,
      fontSize: t.fontSize,
      fontWeight: t.fontWeight,
      lineHeight: t.lineHeight,
      letterSpacing: t.letterSpacing ? `${t.letterSpacing}em` : undefined,
    };
  },
};
