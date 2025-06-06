# Contributing to Artone Video Editor

まずは Artone Video Editor への貢献を検討していただき、ありがとうございます！🎉

## 🤝 貢献の方法

### バグレポート

バグを発見した場合は、以下の情報を含めて Issue を作成してください：

- **ブラウザ**: Chrome 120, Firefox 121, Safari 17 など
- **OS**: Windows 11, macOS 14, Ubuntu 22.04 など
- **再現手順**: 問題を再現するための詳細な手順
- **期待される動作**: 本来どのような動作をするべきか
- **実際の動作**: 実際に何が起こったか
- **スクリーンショット**: 可能であれば画像やGIFを添付

### 機能リクエスト

新機能の提案は大歓迎です！以下の項目を含めて Issue を作成してください：

- **機能の説明**: 提案する機能の詳細
- **ユースケース**: なぜその機能が必要か
- **代替案**: 他に考えられる解決方法
- **優先度**: 緊急度（高/中/低）

### プルリクエスト

#### 開発環境の設定

1. リポジトリをフォーク
2. ローカルにクローン:
```bash
git clone https://github.com/yourusername/artone-video-editor.git
cd artone-video-editor
```

3. 開発サーバーを起動:
```bash
npm start
# または
python -m http.server 8000
```

#### コーディング規約

- **言語**: JavaScript (ES6+), HTML5, CSS3
- **フォーマット**: 2スペースインデント
- **命名規則**: camelCase（変数、関数）、PascalCase（クラス、コンポーネント）
- **コメント**: 複雑なロジックには日本語または英語でコメント

#### コミットメッセージ

以下の形式に従ってください：

```
type(scope): subject

body

footer
```

**Type:**
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント更新
- `style`: コードスタイル変更
- `refactor`: リファクタリング
- `test`: テスト追加・修正
- `chore`: その他の変更

**例:**
```
feat(timeline): タイムラインズーム機能を追加

- マウスホイールでズーム操作
- 最小10px/s、最大100px/sの範囲
- ズーム状態の保存

Closes #123
```

#### プルリクエストの流れ

1. **ブランチ作成**:
```bash
git checkout -b feature/your-feature-name
```

2. **変更を実装**:
   - 小さな単位でコミット
   - テストが可能な場合は動作確認

3. **プッシュ**:
```bash
git push origin feature/your-feature-name
```

4. **プルリクエスト作成**:
   - 明確なタイトルと説明
   - 関連する Issue の参照
   - スクリーンショットやGIF（UI変更の場合）

## 📋 開発ガイドライン

### コード構造

```javascript
// コンポーネント例
const ComponentName = ({ prop1, prop2 }) => {
  // useState フック
  const [state, setState] = useState(initialValue);
  
  // useEffect フック
  useEffect(() => {
    // 副作用の処理
  }, [dependencies]);
  
  // イベントハンドラ
  const handleEvent = useCallback(() => {
    // 処理
  }, [dependencies]);
  
  return (
    <div className="tailwind-classes">
      {/* JSX */}
    </div>
  );
};
```

### パフォーマンス考慮事項

- **メモリ使用量**: 大きなメディアファイルの処理
- **Canvas描画**: 60fps を目標とした最適化
- **ファイル読み込み**: 非同期処理とプログレス表示
- **状態管理**: 不必要な再レンダリングの回避

### ブラウザ互換性

| ブラウザ | 最小バージョン | 備考 |
|----------|----------------|------|
| Chrome | 90+ | 推奨 |
| Firefox | 88+ | 対応 |
| Safari | 14+ | 一部制限あり |
| Edge | 90+ | 対応 |

### アクセシビリティ

- キーボードナビゲーション対応
- スクリーンリーダー対応
- 適切なARIAラベル
- 十分なコントラスト比

## 🧪 テスト

現在、テストフレームワークは導入されていませんが、以下の手動テストを推奨します：

### 基本機能テスト
- [ ] メディアファイルのアップロード
- [ ] タイムラインでのクリップ操作
- [ ] プレビュー再生
- [ ] エフェクトの適用
- [ ] エクスポート機能

### ブラウザテスト
- [ ] Chrome での動作確認
- [ ] Firefox での動作確認
- [ ] Safari での動作確認（可能であれば）

## 🏷️ ラベルの説明

| ラベル | 説明 |
|--------|------|
| `bug` | バグレポート |
| `enhancement` | 機能改善 |
| `feature` | 新機能 |
| `good first issue` | 初心者向け |
| `help wanted` | 協力募集 |
| `performance` | パフォーマンス関連 |
| `ui/ux` | UI/UX改善 |
| `documentation` | ドキュメント |

## 📞 質問・サポート

- **GitHub Discussions**: 一般的な質問や議論
- **GitHub Issues**: バグレポートや機能リクエスト
- **Discord**: リアルタイムチャット（準備中）

## 🎯 優先度の高い改善項目

1. **パフォーマンス最適化**
   - 大容量ファイルの処理改善
   - Canvas描画の最適化

2. **新機能**
   - 音声波形表示
   - キーフレームアニメーション
   - より多くのエフェクト

3. **ユーザビリティ**
   - undo/redo機能
   - ショートカットキー
   - モバイル対応

## 🙏 謝辞

貢献者の皆様に心から感謝いたします。あなたの貢献が Artone Video Editor をより良いツールにしています！

---

何か質問がありましたら、お気軽に Issue を作成するか、Discord でお声がけください。

Happy coding! 🚀