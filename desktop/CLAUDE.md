# desktop/ — Electron 殻 (正規の配布形態)

## Why
公開形態は「ソフトウェア (デスクトップアプリ)」。殻は最小に保ち、アプリ本体
(index.html / app/ ほか) には一切手を入れない。Web 版と同じ `dist/` をそのまま読む。

## ルール
- webPreferences: contextIsolation=true / nodeIntegration=false / sandbox=true / preload なし (変更禁止)
- 新規ウィンドウは常に deny。http/https のみ `shell.openExternal` で既定ブラウザへ
- `app://artone/` 以外へのナビゲーション/リダイレクトは遮断
- single-instance lock。2つ目の起動は既存ウィンドウを前面に出して終了
- `electron` / `electron-builder` は版数固定 (`^` 禁止) + `package-lock.json`
- 配信時に COOP/COEP を付ける (vercel.json / wrangler.toml と同じ。SharedArrayBuffer 用)
- ルートの package.json に electron を入れない (Web ビルド/デプロイに影響させない)

## ファイル
- `main.js` — 殻本体 (`app://` プロトコルハンドラ + ウィンドウ/ナビゲーション制御)
- `package.json` / `package-lock.json` — electron / electron-builder とビルド設定

## ビルド
ルートで `npm ci && npm run build` → `desktop/` で `npm ci` → `npm run dist:win|dist:mac|dist:linux`
(出力は `desktop/release/`、.gitignore 済み)。Win=portable / mac=zip (未署名) / Linux=AppImage。

## Gotchas
- npm 11 は electron の postinstall を実行しないことがある → `node node_modules/electron/install.js`
- `app://` では Service Worker 登録が失敗する (`SWManager` がエラーを記録するだけで動作に影響なし)
