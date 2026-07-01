# install/ — 1インストーラ全OS自動判定

## 矛盾の記録 (2026-07 検証)
root `CLAUDE.md` の WHY は「ブラウザ完結・100%ローカル・サーバーレス・
**インストール不要**」だが、本モジュールは NSIS(.exe)/.dmg/.AppImage/.deb/
.rpm/.apk/.ipa というネイティブインストーラ配布を前提にしている。PWA
(`format: 'pwa'`) のみが現在の WHY と整合する。

さらに `install.ts`(ルート)はどの `package.json` script/bin からも
呼ばれておらず、他のどのファイルからも import されていない — 完全な
孤立コード。旧 Electron ベースのプロトタイプ(統合前の旧リポジトリに
`electron_*.js`/`package-electron.json` が存在していた)の残骸である
可能性が高い。

**要判断**: (a) 将来デスクトップ版を出す前提で意図的に残すか、
(b) PWA 判定だけ残して他フォーマットを削除するか、(c) モジュール全体を
削除するか。判断保留のため現状維持するが、「1インストーラ全OS対応」が
現行製品の説明として誤解を招くことは明記しておく。

## Why (元の設計意図)
ユーザーは1コマンドでOS自動検出してインストールしたい。
NSIS/DMG/AppImage/.deb/.rpm/PWA を分岐する純粋関数で実現。

## ルール
- `detectInstallTarget` は純粋関数。Node の os.platform() を直呼びしない
- URL は必ず HTTPS のみ (`validateInstallUrl` で検証)
- 未知 OS は PWA フォールバック
- ファイル名は URL から抽出、不正な場合は固定値

## ファイル
- `detect.ts` - プラットフォーム判定 (純粋関数)
- 親 `install.ts` - Node 環境での実行 (副作用あり)

## テスト
- 全プラットフォーム × x64/arm64 の組み合わせ
- 不正 URL の拒否
- PWA フォールバックの保証
