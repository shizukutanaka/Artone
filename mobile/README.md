# Artone Video Editor - React Native 版

## 📱 モバイルアプリ版 Artone Video Editor

現在のWebベースのビデオエディタをReact Nativeでモバイルアプリ化し、クロスプラットフォーム対応を実現します。

## 🚀 技術スタック

### コア技術
- **React Native 0.74+** - クロスプラットフォームモバイル開発
- **TypeScript** - 型安全性
- **Zustand** - 状態管理 (Web版と共通)

### 動画処理
- **ffmpeg-kit-react-native** - FFmpegによる動画処理
- **react-native-video** - 動画再生・コントロール
- **react-native-image-picker** - メディアファイル選択

### 機械学習・AI
- **@tensorflow/tfjs-react-native** - TensorFlow.js for React Native
- **react-native-fast-tflite** - 軽量ML推論

### UI/UX
- **@react-navigation/native** - ナビゲーション
- **react-native-gesture-handler** - 高度なジェスチャー処理
- **react-native-reanimated** - パフォーマンスの高いアニメーション
- **react-native-svg** - SVGサポート

### ストレージ・永続化
- **@react-native-async-storage/async-storage** - ローカルストレージ
- **react-native-fs** - ファイルシステムアクセス
- **react-native-share** - ファイル共有

## 📁 プロジェクト構造

```
mobile/
├── src/
│   ├── components/          # React Native コンポーネント
│   │   ├── VideoEditor/     # メインエディター
│   │   ├── Timeline/        # タイムラインコンポーネント
│   │   ├── MediaLibrary/    # メディアライブラリ
│   │   └── ui/              # 共通UIコンポーネント
│   ├── screens/             # 画面コンポーネント
│   │   ├── HomeScreen.tsx   # ホーム画面
│   │   ├── EditorScreen.tsx # エディター画面
│   │   └── SettingsScreen.tsx # 設定画面
│   ├── store/               # 状態管理
│   │   └── videoStore.ts    # ビデオ編集状態 (Web版と共通ロジック)
│   ├── hooks/               # カスタムフック
│   │   └── useElectronAPI.ts # Electron API統合
│   ├── types/               # 型定義
│   │   └── video.ts         # ビデオ関連型
│   └── utils/               # ユーティリティ関数
├── android/                 # Android ネイティブコード
├── ios/                     # iOS ネイティブコード
├── package.json             # 依存関係定義
├── tsconfig.json            # TypeScript 設定
└── metro.config.js          # Metro バンドラー設定
```

## 🛠️ セットアップ方法

### 前提条件
```bash
# Node.js 18+
node --version

# React Native CLI
npm install -g @react-native-community/cli

# iOS 開発 (macOS の場合)
xcode-select --install

# Android 開発 (Windows の場合)
# Android Studio と SDK をインストール
```

### プロジェクトセットアップ
```bash
# 1. React Native プロジェクト作成
npx @react-native-community/cli init ArtoneMobile --template @react-native-community/template

# 2. プロジェクトディレクトリに移動
cd ArtoneMobile

# 3. 必要な依存関係をインストール
npm install

# 依存関係の追加 (動画処理)
npm install ffmpeg-kit-react-native react-native-video react-native-image-picker

# 依存関係の追加 (機械学習)
npm install @tensorflow/tfjs-react-native react-native-fast-tflite

# 依存関係の追加 (UI/UX)
npm install @react-navigation/native @react-navigation/stack
npm install react-native-gesture-handler react-native-reanimated react-native-svg
npm install react-native-vector-icons

# 依存関係の追加 (ストレージ)
npm install @react-native-async-storage/async-storage react-native-fs react-native-share

# 4. iOS セットアップ (macOS の場合)
cd ios && pod install && cd ..

# 5. Android セットアップ
# Android SDK の設定を確認
```

### 開発環境の起動
```bash
# Metro バンドラーを起動
npm start

# 新しいターミナルで Android 実行
npm run android

# または iOS 実行 (macOS の場合)
npm run ios
```

## 🎯 実装フェーズ

### Phase 1: 基本機能 (2-3週間)
- ✅ プロジェクト構造のセットアップ
- ✅ ナビゲーションシステム
- ✅ 基本的なビデオ再生
- ✅ シンプルなタイムライン表示
- ✅ ファイルインポート/エクスポート

### Phase 2: 高度な編集機能 (3-4週間)
- ⏳ マルチトラックタイムライン
- ⏳ クリップのドラッグ&ドロップ
- ⏳ 基本的なエフェクト
- ⏳ オーディオコントロール
- ⏳ リアルタイムプレビュー

### Phase 3: AI機能統合 (4-5週間)
- ⏳ 自動編集提案
- ⏳ シーン検出
- ⏳ スマートカット
- ⏳ AIエフェクト
- ⏳ 音声テキスト変換

### Phase 4: 最適化と洗練 (2-3週間)
- ⏳ パフォーマンス最適化
- ⏳ UI/UX改善
- ⏳ ネイティブ機能統合
- ⏳ テストと品質保証

## 🔧 主要な実装ポイント

### 1. 動画処理のパイプライン
```typescript
// 動画処理は ffmpeg-kit-react-native を使用
import {FFmpegKit} from 'ffmpeg-kit-react-native';

const processVideo = async (inputPath: string, outputPath: string) => {
  const command = `-i ${inputPath} -c:v libx264 -preset fast ${outputPath}`;
  await FFmpegKit.execute(command);
};
```

### 2. 機械学習の統合
```typescript
// TensorFlow.js によるAI機能
import * as tf from '@tensorflow/tfjs-react-native';

const analyzeScene = async (frame: ImageData) => {
  const model = await loadSceneDetectionModel();
  const prediction = await model.predict(tf.browser.fromPixels(frame));
  return prediction;
};
```

### 3. ネイティブファイルシステム
```typescript
// ファイルシステムアクセス
import RNFS from 'react-native-fs';

const saveProject = async (projectData: any) => {
  const filePath = `${RNFS.DocumentDirectoryPath}/projects/${projectId}.json`;
  await RNFS.writeFile(filePath, JSON.stringify(projectData), 'utf8');
};
```

### 4. プラットフォーム別処理
```typescript
// Platform による条件分岐
import {Platform} from 'react-native';

const handleFileOperation = async () => {
  if (Platform.OS === 'ios') {
    // iOS 特有の処理
  } else if (Platform.OS === 'android') {
    // Android 特有の処理
  }
};
```

## 📋 現在の実装状況

### ✅ 完了済み
- [x] プロジェクト構造のセットアップ
- [x] TypeScript 設定
- [x] 基本的な画面レイアウト
- [x] 状態管理システム
- [x] Electron API 統合フック
- [x] ナビゲーションシステム

### 🚧 進行中
- [ ] 動画処理パイプライン
- [ ] タイムラインコンポーネント
- [ ] AI機能統合
- [ ] ネイティブモジュール実装

### 📝 今後のタスク
- [ ] メディアファイルのインポート機能
- [ ] 動画のリアルタイム処理
- [ ] エクスポート機能
- [ ] オフライン対応
- [ ] パフォーマンス最適化

## 🔄 Web版からの移行

現在のWebベースの機能をReact Nativeで実現するために：

1. **状態管理**: Web版のZustandストアをReact Native用に適応
2. **コンポーネント**: WebコンポーネントをReact Nativeコンポーネントに変換
3. **API統合**: Electron APIをReact Nativeのネイティブモジュールに置き換え
4. **動画処理**: WebAssembly/FFmpeg.wasm を ffmpeg-kit-react-native に移行
5. **機械学習**: TensorFlow.js Web → TensorFlow.js React Native

## 📱 モバイル特有の考慮点

### タッチ操作
- ジェスチャーによる直感的な操作
- ピンチtoズーム
- スワイプによるナビゲーション

### パフォーマンス
- メモリ使用量の最適化
- バッテリー消費の考慮
- バックグラウンド処理の制限

### プラットフォーム差異
- iOS vs Android のAPI差異
- 画面サイズの多様性
- ネイティブ機能の活用

## 🐛 デバッグとテスト

```bash
# 開発モードで起動
npm run start

# テスト実行
npm test

# 型チェック
npm run typecheck

# iOS シミュレーター
npm run ios

# Android エミュレーター
npm run android
```

## 📚 参考資料

- [React Native 公式ドキュメント](https://reactnative.dev/)
- [ffmpeg-kit-react-native](https://github.com/arthenica/ffmpeg-kit)
- [TensorFlow.js React Native](https://www.tensorflow.org/js/guide/platform_setup)
- [React Navigation](https://reactnavigation.org/)

## 🤝 貢献方法

React Native版への貢献を歓迎します。以下の手順で開発に参加できます：

1. フォークしてクローン
2. 依存関係をインストール (`npm install`)
3. 新機能を実装
4. テストを追加
5. プルリクエストを作成

## 📄 ライセンス

MIT License - 詳細はLICENSEファイルを参照してください。
