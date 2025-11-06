/**
 * React Native 版 Artone Video Editor - 技術仕様
 *
 * 現在のWeb版の機能をReact Nativeで実現するための設計書
 */

export const ReactNativeTechStack = {
  // コア技術
  core: {
    reactNative: '^0.74.0',
    react: '^18.2.0',
    typescript: '^5.0.0',
    zustand: '^4.5.0', // 状態管理 (Web版と共通)
  },

  // 動画処理
  videoProcessing: {
    'ffmpeg-kit-react-native': '^6.0.0', // FFmpeg統合
    'react-native-video': '^6.0.0',     // 動画再生
    'react-native-image-picker': '^7.0.0', // メディア選択
  },

  // 機械学習・AI
  aiProcessing: {
    '@tensorflow/tfjs-react-native': '^0.8.0', // TensorFlow.js
    'react-native-fast-tflite': '^1.0.0',     // 軽量ML推論
  },

  // UI/UX
  ui: {
    '@react-navigation/native': '^6.1.0',        // ナビゲーション
    '@react-navigation/stack': '^6.3.0',
    'react-native-gesture-handler': '^2.12.0',   // ジェスチャー
    'react-native-reanimated': '^3.8.0',         // アニメーション
    'react-native-svg': '^14.0.0',               // SVGサポート
    'react-native-vector-icons': '^10.0.0',      // アイコン
  },

  // ストレージ・永続化
  storage: {
    '@react-native-async-storage/async-storage': '^1.23.0', // ローカルストレージ
    'react-native-fs': '^2.20.0',                           // ファイルシステム
    'react-native-share': '^10.0.0',                        // ファイル共有
  },

  // 開発ツール
  development: {
    '@react-native-community/cli': '^13.0.0',
    '@react-native-community/eslint-config': '^3.2.0',
    'react-native-flipper': '^0.212.0', // デバッグツール
  }
};

export const ReactNativeProjectStructure = {
  src: {
    components: {
      VideoEditor: 'メインエディターコンポーネント',
      Timeline: 'タイムラインコンポーネント',
      MediaLibrary: 'メディアライブラリ',
      VideoPlayer: '動画プレーヤー',
      ControlPanel: 'コントロールパネル',
      PropertyPanel: 'プロパティパネル',
      ExportModal: 'エクスポートモーダル',
    },
    screens: {
      Home: 'ホーム画面',
      Editor: 'エディター画面',
      Settings: '設定画面',
      Projects: 'プロジェクト一覧',
    },
    hooks: {
      useVideoEditor: 'ビデオエディターフック',
      useTimeline: 'タイムラインフック',
      useMediaLibrary: 'メディアライブラリフック',
      useExport: 'エクスポートフック',
    },
    store: {
      videoStore: 'ビデオ状態管理 (Web版と共通)',
      preferencesStore: '設定状態管理',
      projectStore: 'プロジェクト状態管理',
    },
    utils: {
      videoProcessor: '動画処理ユーティリティ',
      aiProcessor: 'AI処理ユーティリティ',
      fileManager: 'ファイル管理ユーティリティ',
      exportManager: 'エクスポート管理',
    },
    types: {
      video: '動画関連の型定義',
      timeline: 'タイムライン関連の型定義',
      project: 'プロジェクト関連の型定義',
    }
  }
};

export const MigrationStrategy = {
  phase1: {
    name: '基本機能の実装',
    components: [
      'プロジェクト管理',
      'メディアインポート',
      '基本的なタイムライン',
      '動画再生',
      'エクスポート機能'
    ],
    estimatedTime: '2-3週間'
  },

  phase2: {
    name: '高度な編集機能',
    components: [
      'マルチトラック編集',
      'エフェクトシステム',
      'オーディオ編集',
      'リアルタイムプレビュー'
    ],
    estimatedTime: '3-4週間'
  },

  phase3: {
    name: 'AI機能統合',
    components: [
      '自動編集提案',
      'シーン検出',
      'スマートカット',
      'AIエフェクト'
    ],
    estimatedTime: '4-5週間'
  },

  phase4: {
    name: '最適化と洗練',
    components: [
      'パフォーマンス最適化',
      'UI/UX改善',
      'クロスプラットフォーム対応',
      'テストと品質保証'
    ],
    estimatedTime: '2-3週間'
  }
};
