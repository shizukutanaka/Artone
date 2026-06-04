# install/ — 1インストーラ全OS自動判定

## Why
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
