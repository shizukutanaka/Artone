# Artone Video Editor - Desktop (Electron) Edition

Artoneは、Electronベースのクロスプラットフォーム・デスクトップビデオエディタです。

## 主な特徴
- Windows/Mac/Linux対応
- .artone形式でプロジェクト保存・読込
- ネイティブメニュー、ファイルシステム統合
- マルチトラック編集、リアルタイムプレビュー
- 高品質WebMエクスポート

## インストール・実行方法
### バイナリ実行（推奨）
1. Releasesからインストーラまたはポータブル版をダウンロード
2. 実行ファイルを起動

### ソースからビルド
1. Node.js 16以上、npm/yarn、Gitをインストール
2. リポジトリをクローン
```bash
git clone https://github.com/yourusername/artone-video-editor.git
cd artone-video-editor
```
3. 依存関係インストール
```bash
npm install
```
4. 開発モードで起動
```bash
npm run dev
```
5. Windows用EXEファイルをビルド
```bash
npm run build:win
```

---

## Web版について
Webブラウザで利用する場合は `README.md` を参照してください。

---

## ライセンス
MIT

## コントリビュート
貢献方法は `artone_contributing.md` を参照してください。
