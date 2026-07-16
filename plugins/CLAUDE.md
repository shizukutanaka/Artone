# plugins/ — セキュリティ境界ゾーン

## 厳守事項
- WASM プラグインは **必ず** サンドボックス内で実行
- ホスト API は明示的 import のみ提供 (ambient access 禁止)
- `eval` / `Function` コンストラクタ禁止
  - 例外 (reviewed): `plugin-manager.ts` の `executeSandboxed()` は JS ソース
    プラグイン (`installPlugin(manifest, code: string)`) を実行するため、
    専用 Worker 内で一度だけ `Function` を使いコンパイルする。直後に
    `lockdownSandboxGlobals()` が同一 Worker 内で `eval`/`Function`/`fetch`/
    `importScripts` 等を封鎖してからプラグイン本体を実行するため、
    プラグインコード自身がこのパターンを再利用したり ambient なネット
    ワーク/コードロード能力へ到達することはできない。メインスレッドでは
    使用しない。詳細はコード内コメント参照。
- ネットワークアクセスはプラグイン manifest で宣言必須

## 権限モデル
- プラグインインストール時に権限同意取得
- 権限スコープ: `audio` / `video` / `network` / `filesystem` / `mic` / `camera`
- 権限剥奪は即時反映
- audit log を全プラグイン操作で記録

## ABI 安定性
- v1 ABI は永続サポート (10年)
- 破壊的変更は v2 ABI として並行運用
- deprecated API は 2 年間の移行期間

## VST/AU ブリッジ
- VST3 SDK ライセンス確認 (GPL/Proprietary 二重ライセンス)
- AU は Apple SDK 利用規約準拠
- WASM ブリッジ経由のみ (ネイティブ DLL 直接ロード禁止)

## テスト要求
- カバレッジ 95%+
- 悪意あるプラグインのサンドボックス脱出試験
- メモリ枯渇攻撃テスト
- 無限ループ検出テスト (timeout 5秒)

## レビュー (現状: 未実装 — 2026-07 検証)
以下はマーケットプレース運用時に必要となるプロセスの設計メモであり、
現時点でコード上の実装は存在しない(`marketplace`検索でゼロヒット、
`security/`にWASM静的解析コードなし)。マーケットプレース自体はプラグイン
配布用のホスティング基盤を要するため、root CLAUDE.md の「サーバーレス」
原則とどう両立するか未解決。
- 公式マーケットプレース掲載前に手動レビュー
- 自動スキャン: `npm audit` / WASM static analysis
- コードサイニング必須
