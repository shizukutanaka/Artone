#!/bin/bash

echo "🚀 Artone Video Editor - React Native セットアップ"
echo "=================================================="

# Node.js バージョンチェック
echo "📋 環境チェック..."
node --version
if [ $? -ne 0 ]; then
    echo "❌ Node.js がインストールされていません"
    echo "Node.js をインストールしてください: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js OK"

# React Native CLI チェック
echo "📦 React Native CLI のインストール..."
npm list -g @react-native-community/cli > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "React Native CLI をインストール中..."
    npm install -g @react-native-community/cli
    if [ $? -ne 0 ]; then
        echo "❌ React Native CLI のインストールに失敗しました"
        exit 1
    fi
fi

echo "✅ React Native CLI OK"

# プロジェクト作成
echo "📁 React Native プロジェクト作成中..."
if [ -d "ArtoneMobile" ]; then
    echo "ArtoneMobile ディレクトリが既に存在します"
    cd ArtoneMobile
else
    npx @react-native-community/cli init ArtoneMobile --template @react-native-community/template
    cd ArtoneMobile
fi

echo "🔧 依存関係のインストール..."
npm install

# 必要な依存関係の追加
echo "📚 動画編集関連ライブラリのインストール..."
npm install ffmpeg-kit-react-native react-native-video react-native-image-picker
npm install @tensorflow/tfjs-react-native react-native-fast-tflite
npm install @react-navigation/native @react-navigation/stack
npm install react-native-gesture-handler react-native-reanimated react-native-svg react-native-vector-icons
npm install @react-native-async-storage/async-storage react-native-fs react-native-share

echo "⚙️ iOS セットアップ (macOS の場合)..."
if [ "$(uname)" = "Darwin" ]; then
    cd ios
    pod install
    cd ..
    echo "✅ iOS セットアップ完了"
else
    echo "ℹ️ iOS セットアップは macOS でのみ実行可能です"
fi

echo "🤖 Android セットアップ..."
echo "Android Studio と Android SDK がインストールされていることを確認してください"
echo "Android SDK の場所: \$ANDROID_HOME または \$ANDROID_SDK_ROOT"

echo ""
echo "🎉 セットアップ完了!"
echo ""
echo "開発環境を起動するには:"
echo "  npm start              # Metro バンドラー起動"
echo "  npm run android        # Android アプリ起動"
echo "  npm run ios           # iOS アプリ起動 (macOS のみ)"
echo ""
echo "詳細は mobile/README.md を参照してください"
echo ""
echo "📱 モバイルアプリ版 Artone Video Editor"
echo "   プロフェッショナルな動画編集をモバイルで実現"
