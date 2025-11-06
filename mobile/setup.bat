@echo off
echo 🚀 Artone Video Editor - React Native セットアップ (Windows)
echo ==================================================
echo.

:: Node.js バージョンチェック
echo 📋 環境チェック...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js がインストールされていません
    echo Node.js をインストールしてください: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js OK
echo.

:: React Native CLI チェック
echo 📦 React Native CLI のインストール...
npm list -g @react-native-community/cli >nul 2>&1
if %errorlevel% neq 0 (
    echo React Native CLI をインストール中...
    npm install -g @react-native-community/cli
    if %errorlevel% neq 0 (
        echo ❌ React Native CLI のインストールに失敗しました
        pause
        exit /b 1
    )
)

echo ✅ React Native CLI OK
echo.

:: プロジェクト作成
echo 📁 React Native プロジェクト作成中...
if exist "ArtoneMobile" (
    echo ArtoneMobile ディレクトリが既に存在します
    cd ArtoneMobile
) else (
    npx @react-native-community/cli init ArtoneMobile --template @react-native-community/template
    cd ArtoneMobile
)

echo.
echo 🔧 依存関係のインストール...
call npm install

:: 必要な依存関係の追加
echo.
echo 📚 動画編集関連ライブラリのインストール...
call npm install ffmpeg-kit-react-native react-native-video react-native-image-picker
call npm install @tensorflow/tfjs-react-native react-native-fast-tflite
call npm install @react-navigation/native @react-navigation/stack
call npm install react-native-gesture-handler react-native-reanimated react-native-svg react-native-vector-icons
call npm install @react-native-async-storage/async-storage react-native-fs react-native-share

echo.
echo 🤖 Android セットアップ...
echo Android Studio と Android SDK がインストールされていることを確認してください
echo Android SDK の場所: %ANDROID_HOME% または %ANDROID_SDK_ROOT%
echo.

if exist "%ANDROID_HOME%" (
    echo ✅ Android SDK が見つかりました: %ANDROID_HOME%
) else (
    echo ⚠️ Android SDK が設定されていません
    echo Android Studio をインストールして、環境変数を設定してください
)

echo.
echo 🎉 セットアップ完了!
echo.
echo 開発環境を起動するには:
echo   npm start              # Metro バンドラー起動
echo   npm run android        # Android アプリ起動
echo.
echo 注意: iOS 開発は macOS でのみ可能です
echo.
echo 📱 モバイルアプリ版 Artone Video Editor
echo    プロフェッショナルな動画編集をモバイルで実現
echo.
echo 詳細は mobile/README.md を参照してください
echo.
pause
