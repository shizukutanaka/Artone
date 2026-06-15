# Changelog

Artone v3 の全変更を記録。

[Keep a Changelog](https://keepachangelog.com/) 形式。
[Semantic Versioning](https://semver.org/) 準拠。

## [Unreleased]

### Added
- **GIF89a エクスポーター実装** (`export/gif-encoder.ts`): 空 Blob を返すスタブを完全な自己完結型アニメーション GIF エンコーダで置き換え。メディアン・カット色量子化 (フレーム毎 256 色, 4× ピクセルサンプリング) + 32³ 最近傍 LUT (O(1) 色マッピング) + Floyd-Steinberg ディザリング + LZW 圧縮 (可変幅コード/LSB ファースト) + Netscape 2.0 アニメーションループ拡張を実装。25 テスト追加。
- **GIF 書き出しパス** (`export/export-engine.ts`): `export()` が GIF フォーマット時に WebCodecs をバイパスし `exportGif()` → `videoFrameToImageData()` → `encodeGif()` を呼ぶ専用ルートを追加。
- **`project/project-manager.ts` プロジェクトのスキーマバージョニング/マイグレーション層を追加** (10年読める設計、リスクゾーン project)。従来 `version` フィールドは保存ごとに `++` される**保存カウンタ**で、ファイル形式のスキーマ版を表しておらず、CLAUDE.md「スキーマバージョニングで後方互換」が未実装だった。さらに `loadProject`/`importProject`/`restoreVersion` は `JSON.parse(...) as Project` で**無検証キャスト**し、古い形のファイル(欠損フィールド)は現行形と誤認、新しいアプリが書いたファイルは黙って誤読していた。保存カウンタと独立した `schemaVersion` を導入し、`migrateProject()` を全ロード経路に配線: 旧形ファイルは安全なデフォルトで backfill して読めるようにし、`schemaVersion` が現行より新しいファイルは明確なエラーで拒否 (誤読防止)、forward-only migration の枠組みを用意。13 テスト追加。
- **`collab/collaboration-engine.ts` オフライン操作の蓄積を実装** (リスクゾーン collab)。`broadcast` は open な DataChannel が一つも無いとき（オフライン/瞬断）何も送らず、操作はローカル `docState` に適用されるのに**送信も蓄積もされず黙って消失**、再接続後も再送されないため協調者が**恒久的に乖離**していた。CLAUDE.md「オフライン時はローカル操作を蓄積」が未実装。open チャネルが無い場合は送信メッセージを有界キュー(上限1000)に蓄積し、`flushPendingOperations()` で再接続時に再送、`getPendingOperationCount()` で可観測化。6 テスト追加。

### Security
- **`plugins/plugin-manager.ts` サンドボックスの ambient capability を遮断** (セキュリティ境界ゾーン)。未信頼プラグインコードを `new Function` で Worker 内実行していたが、Worker は `fetch`/`XMLHttpRequest`/`WebSocket`/`importScripts`/`indexedDB` 等へ ambient アクセス可能で、CLAUDE.md の「ホスト API は明示的 import のみ (ambient access 禁止)」「ネットワークは manifest 宣言必須」「eval/Function 禁止」に反し、悪意あるプラグインがデータ送出やリモートコード読込を行えた。worker bootstrap に `lockdownSandboxGlobals(self)` を注入し、プラグイン関数のコンパイル後・実行前に network/remote-code/eval 系グローバルを deny-by-default で無効化 (defense-in-depth)。閉包フリー関数として export し直接単体テスト＋bootstrap への直列化順序を検証 (8 テスト)。

### Fixed
- **`recovery/recovery-manager.ts` クラッシュ/手動スナップショットが進行中の保存に潰されるバグを修正** (最重要リスクゾーン recovery、データ損失)。`saveSnapshot` が `status === 'saving'` のとき**全種別**で `null` を返していたため、30秒間隔の自動保存が動いている最中に未捕捉エラーが発生すると、クラッシュハンドラ (`window 'error'`/`'unhandledrejection'`) の `saveSnapshot('crash', …)` が**黙って破棄**され、リカバリが最も必要な瞬間に復旧データを失っていた。同様にユーザーの手動保存 (Cmd+S) も進行中保存中は無言でドロップされていた。in-flight ガードを `'auto'` のみに限定し、crash/manual は常に書き込むよう修正 (throttle は既に auto 限定)。進行中保存下で auto はドロップ・crash/manual は永続することを検証する 3 テスト追加。
- **`audio/loudness.ts` `createLoudnessMeter` の無制限メモリ増加を修正** (リスクゾーン audio、24時間連続メータリング要件)。「streaming」メーターが `process()` で**全ブロックのコピーを永久に保持** (`blocks.push(channels.map(ch => ch.slice()))`) し、`getMeasurement()` 毎に**全履歴を連結・再解析**していた (メモリ O(総サンプル数)、時間 O(N²))。24時間ステレオ48kで ~33GB 保持しクラッシュ。libebur128 同様、永続 K-weighting フィルタ状態＋100msブロックごとのチャンネル加重エネルギー(スカラー)のみを保持する**有界**実装に置換 (24時間で ~7MB)。永続フィルタにより K-weighting 済みサンプルが全体一括フィルタと一致するため integrated/momentary/LRA はオフラインと厳密一致。True Peak も有界 carry でストリーミング inter-sample 検出。`loudnessRange` を z 配列版に refactor して batch/streaming で共有。極小チャンク=オフライン一致・ストリーミング inter-sample true peak・粒度非依存を検証する 3 テスト追加。
- **`interchange/otio.ts` OTIO import が破損・部分的な外部ファイルで cryptic クラッシュするのを修正** (リスクゾーン interchange、信頼境界)。importer は root の `OTIO_SCHEMA` だけ検証し、以降は全ネスト構造の存在を仮定していたため、`tracks` 欠落 → `Cannot read properties of undefined (reading 'children')`、clip の `source_range` 欠落 → `...(reading 'duration')`、`markers` 欠落 → `...(reading 'map')` といった低レベル例外を投げ、また欠損 rational が `NaN`/`Infinity` のフレーム値を黙って生成しうた。CLAUDE.md「入力バリデーション全入口で実施」「10年読めること」に反する。入口で Stack 構造を検証して**明確なエラー**を出し、任意配列 (children/markers/effects) の欠落は空扱い、`source_range`/`media_reference`/`marked_range` の欠落は安全なデフォルト、`fromRationalTime` は欠損/非有限値を 0 に倒すよう堅牢化。破損・部分入力を検証する 6 テスト追加。
- **`interchange/legacy-formats.ts` FCPXML import が約分された有理数時間を誤変換するバグを修正** (リスクゾーン interchange、10年互換/他NLE往復編集の根幹)。`parseFrames` が `"N/Ds"` の**分子だけを返し分母を無視**していたため、分母 = fps の場合 (Artone 自身の出力) しか正しくならず、実機 Final Cut が約分して書き出す `"3s"` (30fps の 3秒 = 90フレーム) を **3 フレーム**と誤読し全タイミングが破壊されていた。`frames = round(N/D × fps)` で正しく秒→フレーム換算するよう修正 (Artone 出力では分母 = fps なので往復一致を維持、NTSC の `1001/30000s` フレーム時間も正しく解釈)。約分有理数・NTSC フレーム時間を検証するテスト追加。
- **`audio/stereo-tools.ts` `'balanced'` パンニング則がハードパンできないバグを修正** (リスクゾーン audio)。`g = 1/(1+|2p-1|)`, `L=(1-p)+p·g`, `R=p+(1-p)·g` という式は、全左 (p=0) でも `R=0.5` と反対チャンネルが 0.5 を下回らず「全左」でも右が半分鳴る、中央 (p=0.5) で `L=R=1.0` (和 2.0) と、関数自身の docstring 契約 (「L/R の和は常に 1.0、中央で各 0.5」) に反していた。等パワー (cos/sin) 則を和が 1 になるよう正規化 (`L=cos/(cos+sin)`, `R=sin/(cos+sin)`) する実装に置換し、全左→1/0・中央→0.5/0.5・全右→0/1 と契約通りに動作。契約 (和=1, 中央 0.5, ハードパン) を検証するテスト追加。
- **`audio/loudness.ts` True Peak がサンプルピークと常に一致し inter-sample peak を検出できないバグを修正** (リスクゾーン audio)。「4x オーバーサンプリング」が**線形補間** (`ch[i] + (next-ch[i])*s/OS`) を使っており、線形補間は 2 サンプル間で単調なため `|a+(b-a)t| ≤ max(|a|,|b|)` となり既存サンプル値を超える値を生成できず、true-peak が**常にサンプルピークと同値**だった (オーバーサンプリングループが実質 no-op、docstring の「サンプルピークより安全側」も誤り)。これは `computeNormalization().willClip` のクリップ判定が実際のインターサンプルオーバーシュートを過小評価することを意味した。Hann 窓付き sinc による**帯域制限 4x オーバーサンプリング** (位相別ポリフェーズ FIR を単位 DC ゲインに正規化して事前計算) に置換し、サンプル間のオーバーシュートを実際に検出。fs/4 正弦波 (サンプルピーク -3 dBFS / 真のピーク 0 dBFS) で検証する 4 テスト追加。
- **`core/webcodecs-pipeline.ts` `transcode()` がプロセッサチェーンを適用しない/プロセッサ設定時に例外を投げるバグを修正** (リスクゾーン core)。処理経路を `decoder.readable` への二重参照で組んでいたため、(1) `addProcessor()` で追加したプロセッサ (grayscale/watermark/resize 等) が transcode 中に**無視され**、(2) プロセッサが1つでもあると `decoder.readable` を二重ロックして transcode が**例外で停止**していた。デコード済みストリームにプロセッサチェーンを正しく連結 (`decode → processors → frames → encode`) するよう修正。
- **`core/webcodecs-pipeline.ts` `VideoDecoderStream`/`VideoEncoderStream` の構築時例外を修正** (リスクゾーン core)。`TransformStream` の `start()` は `super()` 内で同期実行されるため、その中で `this.decoder`/`this.encoder` に代入すると「`this` を `super()` 前に参照」して**コンストラクタが例外を投げ**ていた (呼び出し元・テストが無く露見せず)。代入を `super()` 完了後に移動。
- **`core/webcodecs-pipeline.ts` `extractFrameAtTime` の座標系混在によるシーク不正を修正** (リスクゾーン core、看板機能「フレーム精度シーク」)。フレーム選択が「チャンク配列インデックス」(`keyFrameIndex`/`frameCount`) と「時刻由来のフレーム序数」(`floor(targetTime*fps/1e6)`) という別座標系を比較しており、両者が一致するのは「ストリーム全体を frame 0 から・1チャンク1フレーム・固定 fps・B フレーム並び替えなし」の理想ケースのみ。サブレンジ (クリップ)・可変フレームレート・`fps` 引数の不一致・B フレームでは null または誤フレームを返していた。タイムスタンプ基準の選択 (target 以下で最大 ts のフレームを採用、それ以外は close) に変更し、チャンク・復号フレーム・target を単一軸に統一。復号/再生順の並び替え (B フレーム) にも頑健。不要になった `fps` 引数を削除し唯一の呼び出し元 (`generateThumbnails`) を更新。サブレンジ/中間時刻/並び替え/範囲外を検証する 5 テスト追加。
- **`core/webcodecs-pipeline.ts` バッチ復号/符号化のハング+コーデックリークを修正** (リスクゾーン core)。`decodeFrame(s)`/`encodeFrame(s)` が「出力数 == 入力数」で完了判定していたため、B フレーム並び替え・破損/ドロップ・エンコーダのチャンク統合などで出力数が入力数と異なると Promise が永久に解決されず (ハング)、`decoder/encoder.close()` も呼ばれずインスタンスがリーク。完了判定を WebCodecs の正規シグナルである `flush()` 完了に変更し、`closeQuietly()` で `finally` から必ずコーデックを解放 (エラー経路含む)。余剰 `VideoFrame` も close してリーク防止。WebCodecs 契約に忠実なフェイク (output/flush/close) で完了・解放を検証する 7 テストを追加 (旧実装ではタイムアウトで落ちる)。
- `core/webcodecs-pipeline.ts`: `generateThumbnails` が後方走査で `keyFrameIndex` を算出していたが未使用の dead code だった (`extractFrameAtTime` が内部で同等のキーフレーム探索を実施済み) を除去。
- `export/export-engine.ts`: GIF フォーマット判定が WebCodecs 音声エンコードパスに残存していた (到達不能な dead code) を除去。
- `perf/performance-monitor.ts`: `getMetrics()` の `gpuTime` が `0` にハードコードされ GPU バウンド検出が常に機能しない問題を修正。`recordGPUTime(queryId)` を追加し GPU タイムスタンプクエリ結果をキャッシュして `analyzeBottleneck()` に反映するようにした。

### Changed
- **リブランド: NovaEdit → Artone**。製品名・識別子・ストレージ/キャッシュキー・リポジトリ参照を全面改名 (`NovaEdit*`→`Artone*`、`novaedit`→`artone`、`NovaTimeline/NovaClip/...`→`Artone*`)。サードパーティ依存 `@xenova/transformers` は対象外として保護。
- 存在しない URL を実在の参照へ修正 (`novaedit.app` → `github.com/shizukutanaka/artone`)。
- `package.json` の不正な peer 依存を解消 (`eslint-plugin-react-hooks` 4 → 5、ESLint 9 flat config 対応)。
- `prepare` フックを husky v9 形式 + CI 安全ガード (`husky || true`) に変更。

### Fixed
- **追加モジュール監査で実バグ 3 件を発見・修正** (各モジュールに網羅的 Vitest を新規追加、計 +101 テスト)。誤検知は実コード照合で排除:
  - `captions/caption-manager.ts`: `CAPTION_PRESETS` の 'default' プリセットが `DEFAULT_STYLE`/`DEFAULT_POSITION` を直接参照しており (他プリセットは spread コピー)、「デフォルト字幕スタイル」編集が共有定数を破壊し以降の全 `addCaption` に波及する不具合を spread コピーで修正 (43 テスト)。
  - `audio/surround-audio.ts`: `createDownmix()` が全チャンネルに `centerGain` を適用し `surroundGain`/`lfeGain` が dead config だった不具合を、`downmixGainForLabel()` でチャンネルカテゴリ別ゲイン (L/R=1.0, C=centerGain, サラウンド/ハイト=surroundGain, LFE=lfeGain) を正しく適用するよう修正 (31 テスト, リスクゾーン)。
  - `plugins/plugin-manager.ts`: `executeSandboxed` の `worker.onerror` パスのみ `this.sandbox` を null クリアせず終了済み Worker への参照が残る不整合を修正 (27 テスト, セキュリティ境界ゾーン)。
- **純ロジックモジュール連続監査で実バグ 10 件を発見・修正** (各モジュールに網羅的 Vitest を新規追加、計 +384 テスト)。誤検知は実コード照合で排除:
  - `timeline/magnetic-timeline.ts`: `insertClip` が `shiftClipsAfter` を呼んだ上で `addClip` も呼ぶため後続クリップが尺の 2 倍ずれる二重リップル、および排他選択時に Set から外したクリップの `clip.selected=true` が残る不整合を修正 (40 テスト)。
  - `perf/performance-monitor.ts`: フレーム未記録時に `getMetrics()` の `1000/mean` が Infinity を返す、`getMemoryTrend()` が `olderAvg=0` で NaN になる問題をガード (35 テスト)。
  - `scopes/video-scopes.ts`: `ScopesManager.analyze()` がパレード解析後に波形モードを復元せず恒久的に parade に固定される不具合、ヒストグラムの `maxAll=0` 空フレームで NaN 座標を生む不具合を修正 (27 テスト)。
  - `timeline/marker-manager.ts`: `copyMarkers()` が `tags`/`metadata` を浅いコピーし複製と原本が参照を共有する不具合を修正 (57 テスト)。
  - `timeline/text-based-editing.ts`: `deleteWords()` が既削除語を履歴に記録し undo が誤って復元する不具合を変更分のみ記録へ修正 (44 テスト)。
  - `timeline/multicam-editor.ts`: `removeAngle()` が最後のアングル削除時に `activeAngle` を更新せず無効 ID が残る不具合を修正 (48 テスト)。
  - `export/export-engine.ts`: `encodeAudio()` が `f32-planar` 宣言下でインターリーブ配置を書き込み音声が乱れる不具合を planar 配置へ修正 (25 テスト)。
  - `project/project-manager.ts`: `saveProjectAs()` が `timeline`/`media`/`markers` 等を浅いコピーし「名前を付けて保存」後の編集が原本も破壊する不具合を JSON deep clone で修正 (35 テスト)。
  - `undo/history-manager.ts`: `CommandFactory.clipTrim` が任意 (optional) な `sourceIn`/`sourceOut` 未設定時に `undefined + n = NaN` でクリップを破壊する不具合を `?? 0` で修正 (7 テスト)。
  - `media/media-browser.ts`: `generateAudioWaveform` が 100 サンプル未満の短尺音声で `blockSize=0` → `NaN` を canvas へ流す不具合をクランプと境界ガードで修正。
  - `captions/readability.ts`: 実バグなし。回帰防止に 43 テストを追加 (折返し/CPS/プロファイル/監査)。
- **未テストモジュール監査 (`security/osv-client.ts`) で堅牢性バグを発見・修正**。テストゼロだったセキュリティモジュールに 28 テストを新規追加:
  - `OfflineCVEStore.load()`: 兄弟の `OSVClient.loadCache()` は破損データを握り潰して起動を阻害しない設計なのに対し、本メソッドは `JSON.parse` が例外送出し、`data.cves` 欠落時に `this.db` が `undefined` となり以降の `query`/`all`/`size` がクラッシュする不具合を修正。オフライン fallback の本旨に反するため try-catch + 配列検証で堅牢化 (破損時は既存 db を保持)。
- **未テストモジュール監査 (`timeline/nested-sequences.ts`) で実バグ 2 件を発見・修正**。573 行・テストゼロだった純ロジックモジュールに 29 テストを新規追加:
  - `unnestSequence()`: ネストクリップがトリム済み (`mediaIn > 0`) の場合、復元クリップ位置が `mediaIn` 分ずれる不具合を修正 (`renderNestedFrame` の `nestedTime = (t − startTime) + mediaIn` 写像の逆変換に整合)。
  - `duplicateSequence()`: スプレッドで `settings` が複製されず元シーケンスと共有参照になり、複製側の解像度/fps 編集が原本を破壊する不具合を `settings: { ...original.settings }` で修正。
- **全カテゴリ横断監査による実バグ・堅牢性修正** (並列カテゴリ監査 → 検証 → 修正)。誤検知を排除し確証あるもののみ修正:
  - `recovery/recovery-manager.ts`: クラッシュ検出リスナーが `init()` 毎に再登録され重複ハンドラ・多重 `saveSnapshot` を招く不具合を冪等ガードで修正 (データ損失リスクゾーン)。
  - `plugins/plugin-manager.ts`: サンドボックス Worker 生成時の Blob オブジェクト URL が revoke されずリークする不具合を修正 (セキュリティ境界ゾーン)。
  - `color/delta-e.ts`: `D65_WHITE`/`D50_WHITE` の `as const` により `xyzToLab`/`labToXYZ` の `ref` 引数型が D65 リテラルに過剰絞り込みされ、ドキュメント通り D50 を渡せなかった API バグを `WhitePoint` インターフェース導入で修正。
  - `color/hdr-engine.ts`: `Math.smoothstep` の edge0===edge1 でゼロ除算→NaN になるガードを追加。
  - `i18n/i18n-manager.ts`: `loadLocale()` が locale を検証せず fetch パスへ補間していた問題に BCP 47 形式バリデーションを追加 (パストラバーサル防止)。新規 6 テスト。
  - `collab/collaboration-engine.ts`: `restoreVersion()` の `JSON.parse` が破損スナップショットでクラッシュする問題を try-catch で安全に false 返却へ。`broadcastUpdate()` が `localUser` null 時に `requireLocalUser()` で予期しない例外を送出する不具合を null ガードで修正 (`deleteComment`/`deleteAnnotation` が connect 前に throw していた)。61 テスト新規追加。
  - `media/proxy-workflow.ts`: `cancel()` がアクティブジョブを `active` Map から削除した後も `runJob` の成功/失敗パスが status を `'completed'`/`'failed'` で上書きするレースコンディションを修正。`!this.active.has(job.id)` ガードで中断。`URL.createObjectURL` グローバルスタブを `tests/setup.ts` に追加。34 テスト新規追加。
  - `render/webgl-fallback.ts`: `createProgram()` でフラグメントシェーダのコンパイル失敗時に頂点シェーダが解放されない WebGL リソースリーク (REGRESSION)、およびリンク成功後もシェーダが削除されないリークを修正 (`detachShader` + `deleteShader` を追加)。29 テスト新規追加。
  - `ai/ai-effects-engine.ts`: 実バグ 3 件修正 (32 テスト新規追加):
    - `autoWhiteBalance()`: チャンネル平均が 0 の場合 (全黒フレームや単色フレーム) に `rScale/gScale/bScale = gray/0 = NaN` となり全ピクセルが NaN に汚染されるバグを `rAvg > 0 ? gray/rAvg : 1` ガードで修正。
    - `detectHighlights()`: 空バッファで `0/0 = NaN` のしきい値が生成されるバグを早期リターンで修正。
    - `detectHighlights()`: 高エネルギーバーストが音声末尾まで続く場合にステートマシンが `energy<=threshold` に到達せずハイライトが生成されないバグを、ループ後の trailing flush で修正。
  - `render/webgpu-engine.ts`: `renderFrame()` がフレームごとに `applyEffect`/`compositeLayer` 内で生成する `paramBuffer` (GPUBuffer) と中間 `output` テクスチャ (GPUTexture) を一切 `destroy()` せずリークする重大な GPU リソースリークを修正 (リスクゾーン: CLAUDE.md「すべての GPUBuffer/GPUTexture は destroy() 必須」)。フレームローカルリソースを配列で収集し `queue.submit()` 後に破棄。`GPUTextureUsage`/`GPUBufferUsage` グローバル定数スタブを `tests/setup.ts` に追加。17 テスト新規追加。
  - `render/frame-cache.ts`: `put()` が同一フレームインデックスの再投入時に既存の `VideoFrame` を `close()` せず置換するため GPU メモリがリークし、かつ `currentBytes` が古いサイズを減算せず二重計上されるバグを修正 (リスクゾーン)。`removeExisting()` で全 Tier から既存フレームを解放してから挿入。`releaseFrame` から `closeData` を抽出 (sink は byte 会計対象外のため close のみ)。26 テスト新規追加。
  - `audio/audio-engine.ts`: 実バグ修正 (リスクゾーン・95%カバレッジ要求、42 テスト新規追加):
    - `setMute(id, false)` がゲインを `1.0` 固定で復元するため、`setVolume(0.5)` 後の mute→unmute でトラック音量が失われるバグを `state.track.volume` 復元へ修正。
    - `setVolume()` が mute 中でもゲインノードを直接更新し可聴的に unmute してしまうバグを、mute 中はストア値のみ更新するよう修正。
    - `destroy()` が閉じた context のノード参照 (`masterGain`/`masterAnalyser`) を残しメータ getter が dead node を触る問題を null クリアで修正。
  - `media/media-browser.ts`: `importFile()` が冒頭で生成する `URL.createObjectURL` を、メタデータ抽出/サムネイル生成が失敗した場合に revoke せずリークするバグを try-catch + `revokeObjectURL` で修正。33 テスト新規追加 (フィルタ/ソート/アイテム操作/統計/インポート、URL リーク回帰含む)。
  - `core/webcodecs-pipeline.ts`: `generateThumbnails()` が空 `chunks` で `chunks[-1].timestamp` を参照しクラッシュするバグ、および短尺クリップで `interval = floor(length/count) = 0` となり全サムネイルが先頭フレームに collapse するバグを、空入力の早期 return と `Math.max(1, ...)` クランプで修正。34 テスト新規追加 (コーデック検出/設定/ガード/FrameProcessors/サムネイル回帰)。`tests/setup.ts` の 2D context モックに transform 系メソッド (translate/rotate/scale/measureText 等) を追加。
  - `plugins/plugin-bridge.ts`: テストゼロだったセキュリティ境界ゾーン (VST/AU WASM ブリッジ) の実バグ 2 件を修正 (35 テスト新規追加):
    - `initialize()` が `createWorkletProcessor()` の生成した Blob オブジェクト URL を revoke せずリークするバグを try-finally + `revokeObjectURL` で修正 (`plugin-manager.ts` と同種のリーク)。
    - `loadPreset()` のガードが `presetIndex < 0` を検査せず、`loadPreset(id, -1)` が `presets[-1].parameters` でクラッシュするバグを負数ガード追加で修正。

### Tested
- **データ損失リスクゾーン `recovery/recovery-manager.ts` を網羅テスト** (従来 init/saveSnapshot/startAutoSave の 3 メソッドのみ)。36 テスト新規追加: saveSnapshot (auto/manual のスロットル・フォールバック・checksum)、getSnapshots/getLatestSnapshot (プロジェクト絞り込み・降順ソート)、restoreSnapshot (checksum 不一致での復元拒否・改竄検出)、delete/clearProject/clearAll、enforceLimit (maxSnapshots 上限・最新保持)、getStats、status/subscribe、autoSave/dispose、RecoveryDialogUI。実バグなし (既監査済みモジュール、挙動不変)。テスト用 IndexedDB フェイクに `clear()` を追加。
- **`npm run typecheck` / `npm run build` を再 green 化** (`tsc --noEmit` エラー 27 → 0)。`strict`/`noUnusedLocals` 下の実型エラーを behavior-preserving に解消 (`any` 不使用):
  - `export/export-queue.ts`: await 中に `cancel()` が `job.status` を変更しうるがフロー解析が `'active'` リテラルに絞り込むためキャンセルガードが型エラーになる問題を、意図をコメント明記の上で型ワイドニングして解消。
  - `color/noise-reduction.ts` の `Float32Array` ジェネリック不整合、`timeline/trim-operations.ts` の未使用 `findNextAdjacent`、`animation/motion-path.ts` の未使用 `chordLen` を除去。
  - テスト 18 ファイルの未使用 import/変数を整理し、`createExportQueue<string>` の正しいジェネリック使用へ修正。
- **コンパイル不能だった全ソースをビルド可能化** (`tsc --noEmit` エラー 206 → 0)。
  - JSDoc コメント内に紛れ込んでいた `import`/`const` 文を 4 ファイルで修正 (recovery-manager / lut-manager / sw-manager / proxy-workflow)。
  - `undo/history-manager.ts`: 未 import の `color`、未定義 `dsColor` を design-system 由来 `color` に統一。
  - strict-null / 未使用宣言 / プロパティ不整合などを behavior-preserving に解消 (`any`・`@ts-ignore` 不使用)。
- **本番ビルドの修復** (`npm run build`): 欠落していた `babel-plugin-transform-remove-console` を追加、型のみパッケージ `@webgpu/types` を manualChunks から除外、空ベンダーチャンクと非推奨 `splitVendorChunkPlugin` を整理。
- **テストスイートを全 green 化** (455/480 → 480/480)。実バグ修正を含む:
  - `timeline/magnetic-timeline.ts`: `splitClip` の 2 番目クリップ尺が 0 になる不具合、`moveClip` が自クリップを再リップルする不具合を修正。
  - `audio/audio-engine.ts`: 公開 `AudioTrack` オブジェクトに volume/pan/mute/effects の変更が反映されない不具合を修正、同期初期化 `ensureContext()` を追加。
  - `render/frame-cache.ts`: バイト上限による退避が hot 層に効かず `maxBytes` が無効化されていた不具合を修正。

### Removed
- 重複/オーファンファイルを削除: `project/plugin-bridge.ts` (plugins/ と同一)、ルート `ci.yml` (bench/security/a11y ジョブを `.github/workflows/ci.yml` へ統合後)、ルート `design-system-check.sh` (scripts/ が正本)、存在しない `future/{cloud,streaming,mobile}` への dead な vite エイリアス。
- 旧 v1 プロトタイプ (単一 HTML エディタ + Electron ラッパー) を v3 コードベースへ全面置換。

### Added
- 欠落アセットを補完: Artone ブランドの `favicon.svg`、`accessibility/bundle-entry.ts` (`build:a11y` 用エントリ)。
- **`captions/readability.ts`** — EBU/Netflix/YouTube/BBC 準拠キャプション正規化。放送規格 CPS 制限・行長制限・最小時間を実装。`normalizeCues()` / `auditCues()` を `CaptionManager.importFromTranscription()` に統合。26 テスト。
- **`color/lut-apply.ts`** — 純関数 3D-LUT 三線形補間 (ICC.1:2022/.cube 仕様準拠)。Fritsch-Carlson 単調三次スプライン曲線。`parseCubeLUT()` で .cube ファイルをパース。`grading-engine.ts` の CPU パスに統合。33 テスト。
- **`audio/biquad-filter.ts`** — Audio EQ Cookbook (Bristow-Johnson 2005) 準拠バイクアッドフィルタ。LPF/HPF/Peak EQ/LowShelf/HighShelf/Notch/Bandpass を実装。転置直接形 II で数値安定性を確保。`applyParametricEQ()` で複数バンド処理。26 テスト。
- **`color/color-science.ts`** — ACES カラーサイエンス純関数ライブラリ。AP0/AP1/sRGB/Rec.2020 相互変換行列、sRGB OETF/EOTF、ACEScc/ACEScct 対数符号化、Hill 2017 多項式 RRT+ODT。40 テスト。
- **`audio/dynamics.ts`** — Giannoulis 2012 設計コンプレッサー/リミッター/ゲート。ソフトニー対応、マルチチャンネル対応、ゲインリダクション曲線出力。`gainComputeCompressor()` のみ純粋関数で単体テスト可能。27 テスト。
- **`animation/keyframe-animator.ts`** に `bezierHandles` オプション引数を追加 (`addKeyframe()` の第6引数)。
- **`tests/keyframe-animator.test.ts`** — 22 種イージングの境界値・単調性・ベジェ・CRUD・エッジケースを網羅する 59 テスト。
- **`color/false-color.ts`** — False color 露出モニタリング。ARRI Alexa / RED / Simple の 3 プリセット + カスタム停留点対応。線形輝度 → sRGB カラーへの補間マッピング。`applyToBuffer()` で sRGB RGBA バッファを in-place false color 化 (α チャンネル保持)。30 テスト。
- **`export/export-queue.ts`** — バックグラウンド書き出しキュー。優先度キュー (high/normal/low)、最大並列数制御 (concurrency)、指数バックオフリトライ、キャンセル (個別/全体)、pause/resume、drain() 待機、onStatusChange 購読を実装。JobExecutor&lt;T&gt; で型安全なジョブ管理。29 テスト。
- **`render/tone-mapping.ts`** — CPU 側トーンマッピング演算子コレクション。Reinhard 2002 (シンプル/拡張)、Hable 2010 "Uncharted 2" フィルミック、Narkowicz 2015 ACES 近似、Uchimura 2017 "Gran Turismo" の 5 演算子 + Linear。`createToneMapper(algo, opts)` ファクトリで露出・ホワイトポイント・出力エンコーディング (sRGB / Linear / ガンマ) を制御。`applyToFloatBuffer` / `applyToUint8Buffer` でバッファ一括変換。57 テスト。
- **`interchange/otio.ts`** — OTIO `LinearTimeWarp.1` 対応 (エクスポート/インポート)。`ArtoneClip.speedFactor` をクリップ速度として保持し、OTIO 往復で完全ラウンドトリップ。`OTIOImporter.importWithReport()` メソッドで損失箇所を明示 (`OTIOImportLoss` / `OTIOImportResult`)。外部 NLE エフェクト・`MissingReference.1` メディアを損失リストに記録。18 テスト追加 (合計 36 テスト)。
- **`color/aces-idt-odt.ts`** — ACES IDT/ODT 完全実装 (OCIO 準拠)。カメラ IDT: Rec.709/sRGB、Sony S-Log3/S-Gamut3 (MLUT-001 v2.5)、ARRI LogC3 EI800/Wide Gamut。ディスプレイ ODT: sRGB SDR (Hill 2017 RRT+ODT)、DCI-P3 D65、HDR10 (Rec.2020+PQ, ST 2084)、HLG (ARIB STD-B67)。`primaryToXYZMatrix()` / `mat3Inv()` / `colorTransform()` / `applyColorTransformToBuffer()` を含む。69 テスト。
- **`render/spatial-resampler.ts`** — 高品質フレームリサイズ。Nearest-Neighbour / Bilinear / Keys Bicubic (a=−0.5) / Lanczos-3 (sinc窓) の4カーネル。プロキシ生成・エクスポートスケーリング・サムネイル生成に対応。RGBA Uint8ClampedArray in/out、アルファチャンネル正確補間。34 テスト。
- **`media/waveform-generator.ts`** — タイムライン表示用オーディオ波形データ生成。単/多チャンネル対応 `computeWaveform()` / `computeWaveformMultichannel()`。ビン単位の min/max/RMS 統計。`normalizeWaveform()` でピーク正規化。`downsampleWaveform()` でズームアウト表示対応。28 テスト。
- **`audio/pitch-detection.ts`** — YIN アルゴリズムによる基本周波数推定 (de Cheveigné & Kawahara 2002)。差分関数・CMNDF・絶対閾値探索・放物線補間の4ステップを完全実装。440 Hz ±3 Hz 精度。`detectPitch()` 単発解析、`createPitchDetector()` ストリーミング対応。清明度 (clarity) スコアで信頼性を定量化。33 テスト。
- **`color/delta-e.ts`** — CIE 色差メトリクス完全実装。XYZ↔L*a*b*変換 (D65/D50参照光源)、sRGB(線形/バイト)→L*a*b*、L*a*b*↔L*C*h*。CIE76 (Euclidean)、CIE94 (クロマ/色相重み付き、グラフィックアーツ/テキスタイル両パラメタ)、CIEDE2000 (最高精度、Sharma 2005 全テストベクタ検証済み)。38 テスト。
- **`color/cie-chromaticity.ts`** — CIE 1931 xy 色度座標ライブラリ。XYZ→xy変換、sRGB(線形/バイト)→xy変換、標準光源 (D50/D55/D65/D75/A/DCI/D60/E)、色域プライマリ三角形 (sRGB/Rec.2020/DCI-P3/Display P3/ACES AP0/AP1)、Kim 2002 多項式近似 Planckian ローカス、McCamy 1992 CCT推定。スコープ表示用バッファサンプリング (`sampleBufferChromaticities`)。43 テスト。
- **`timeline/scene-detector.ts`** — ヒストグラム比較によるシーンチェンジ検出。BT.601 輝度ヒストグラム計算。Chi-square / Bhattacharyya / SAD の3距離指標。`createSceneDetector()` でストリーミング逐次検出、`detectSceneCuts()` でバッチ一括解析。`minSceneDuration` デバウンスでフェード時の多重検出を防止。39 テスト。
- **`animation/spring-physics.ts`** — 減衰調和振動子の解析的閉形式解。Underdamped (ζ<1) / Critically damped (ζ=1) / Overdamped (ζ>1) の3レジームを正確に処理。`createSpringAnimation()` で任意時刻の位置/速度を解析的にサンプリング。`settlingTime()` で高密度スキャンによる収束時間推定。半陰解法オイラー `springStep()` / `isAtRest()` でゲームループ対応。`SPRING_PRESETS` (bouncy/wobbly/gentle/stiff/slow/molasses) を同梱。43 テスト。
- **`core/timecode.ts`** — SMPTE タイムコード演算 (SMPTE ST 12-1:2014 / RP 188-2008)。対応フレームレート: 23.976 / 24 / 25 / 29.97 / 30 / 50 / 59.94 / 60 fps。ドロップフレーム (29.97 DF: 2フレーム, 59.94 DF: 4フレーム) と非ドロップフレームを両対応。`toFrames()` / `fromFrames()` 相互変換、`add()` / `subtract()` / `compare()` タイムコード演算、`toSeconds()` / `fromSeconds()` 実時間変換、`parse()` / `format()` 文字列変換 ("HH:MM:SS:FF" / "HH:MM:SS;FF")、`isValid()` バリデーション (ドロップされたフレーム番号を拒否)、`framesPerDay()` 24時間フレーム数算出。EDL/FCPXML/OTIO 連携基盤。59 テスト。
- **`timeline/time-remap.ts`** — 可変速度・タイムリマップ。区分線形 (outputTime, sourceTime) キーフレームモデル。定速・スピードランプ・フリーズフレーム・逆再生を統一的に表現。`outputToSource()` / `speedAt()` / `sourceToOutput()` コア変換関数、`validateKeyframes()` バリデーション、`uniformSpeed()` コンストラクタ、`insertFreeze()` 挿入ヘルパー、`reverseSegment()` 逆再生ヘルパー、`sourceTimeRange()` レンダリング範囲計算。OTIO LinearTimeWarp.1 / SMPTE ST 2067-3 との互換設計。54 テスト。
- **`audio/beat-detector.ts`** — エネルギーベースビート検出 (Brossier 2004 / Scheirer 1998 Sub-band Energy)。スライディング局所平均との比較でオンセット検出。BPM推定は中央値 IBIから。`detectBeats()` バッチ解析、`createBeatDetector()` ストリーミング（任意ブロックサイズ対応）。閾値・ヒストリサイズ・最小間隔・ウィンドウサイズを設定可能。29 テスト。
- **`audio/loudness.ts`** に EBU R128 / ITU-R BS.1770-4 ストリーミングメーター機能を統合。`createLoudnessMeter()` ストリーミング API（任意ブロックサイズ対応）、`kWeightChannel()` エイリアス、`LoudnessMeasurement` に `loudnessRange`（`range` の別名）・`samplePeak`（dBFS）フィールドを追加。重複実装 `audio/loudness-meter.ts` を削除し `audio/loudness.ts` に一本化（CLAUDE.md「重複ファイルは統合」準拠）。テスト合計 51（38 + 13）。
- **`color/white-balance.ts`** — 自動ホワイトバランス解析・ゲイン補正。Gray World (Buchsbaum 1980 平均輝度推定) / White Patch (Max RGB 最大輝度推定) / Percentile (ヒストグラム分位推定、デフォルト98th) の3アルゴリズム + 明示的光源指定 `illuminantGains()`。von Kries 対角ゲインモデル (緑チャンネル基準正規化)。`applyWhiteBalance()` で RGBA バッファ in-place 補正、`composeGains()` で連鎖補正、`invertGains()` で補正の取り消し。`estimateWhiteBalance()` 統一 API。45 テスト。
- **`audio/eq-response.ts`** — マルチバンドパラメトリック EQ 周波数応答計算 (Audio EQ Cookbook / Zölzer 2011)。`biquad-filter.ts` 上に構築。Lowpass/Highpass/Bandpass/Notch/Peak/LowShelf/HighShelf の全バンドタイプ対応。カスケード biquad チェーンの dB 合算で正確な複合応答。20 Hz〜Nyquist の対数等間隔周波数グリッド (`makeLogFrequencies`)。`computeEQResponse()` / `isFlat()` / `peakMagnitude()` / `minMagnitude()` / `nearestFrequencyIndex()`。50 テスト。
- **`audio/resampler.ts`** — 高品質サンプルレート変換 (Smith 2011 / Zölzer 2011)。任意有理比 (44100↔48000/96000 等) 対応。品質 3 段階: `'linear'` (一次補間・プロキシ用) / `'sinc4'` (4-tap Hann 窓 sinc・リアルタイム向き) / `'sinc16'` (16-tap・最終書き出し品質)。グローバル位置追跡によりストリーミング (`createResampler`) とバッチ (`resample`) の出力が完全一致。`resampleMultichannel()` でマルチチャンネル対応。`outputSampleCount()` 整数乗算先行で高精度。34 テスト。
- **`core/ring-buffer.ts`** — ロックフリー SPSC リングバッファ (Lamport 1977)。容量は pow2 に正規化。`write()` / `read()` / `writeSample()` / `readSample()` / `skip()` / `peek()` を提供。ラップアラウンド対応の高速 bitmask モジュロ。`StereoRingBuffer` で L/R インターリーブ書き込み/デインターリーブ読み出しを追加。`audio/CLAUDE.md` 必須要件の lock-free ring buffer を実装。32 テスト。
- **`audio/spectral-gate.ts`** — スペクトル減算ノイズリダクション (Boll 1979 / Martin 2001)。Hann 窓 50 % オーバーラップ OLA フレーム分析 (周期 Hann の∑hann = 1.0 性質を利用し合成窓・正規化不要)。純 TypeScript FFT/IFFT (Cooley-Tukey 基数-2) を内蔵。`estimateNoiseProfile()` でノイズ専用区間からパワースペクトル推定。`applySpectralGate()` が静的プロファイル + ハーフ波整流スペクトル減算 (α 係数 + スペクトルフロアで "musical noise" 抑制)。`denoiseAudio()` 高レベル API。`createSpectralGateProcessor()` 対応ストリーミング版 (適応型ノイズ追跡・フレーム分割処理)。31 テスト。
- **`timeline/trim-operations.ts`** — 純関数イミュータブルトリム操作 (Apple FCP / Adobe Premiere 準拠)。4 種の NLE トリム操作を完全実装: Ripple (編集点移動 + 下流クリップシフト、全体尺変化)、Roll (2 クリップ間の編集点同時移動、全体尺不変)、Slip (クリップのソースメディア参照を変更、タイムライン位置・尺不変)、Slide (クリップをシフト + 隣接クリップで吸収、全体尺不変)。`closeGap()` ギャップ自動クローズ、`detectGaps()` ギャップ検出、`sortByStartTime()` / `sequenceDuration()` ユーティリティ。全操作がイミュータブル (入力配列不変、新配列を返す) で Command Pattern undo/redo に直結。39 テスト。
- **`audio/voice-activity-detector.ts`** — 音声区間検出 (VAD) (ITU-T G.729B Annex B / Sohn et al. 1999 / Moattar 2009)。フレーム単位でログエネルギー・ZCR・スペクトル重心を計算し、適応ノイズフロア推定 + ヒステリシス (hangover) でスピーチ区間を判定。`detectVoiceActivity()` バッチ解析、`getVoiceSegments()` 便利ラッパー、`createVAD()` ストリーミング対応。自動ダッキングのサイドチェーン信号解析・字幕生成の音声区間境界検出に直結。33 テスト。
- **`audio/delay-line.ts`** — ディレイライン・エフェクト集 (Zölzer 2011 / Reiss & McPherson 2014)。Echo (固定フィードバックディレイ)・Ping-Pong ステレオエコー・Chorus (直交 LFO 変調による広域ステレオ)・Flanger (短いフィードバックディレイによるコムフィルタスウィープ)。内蔵円形バッファ (pow2 サイズ、線形補間) で全エフェクトを実装。`applyEcho()` / `applyPingPong()` / `applyChorus()` / `applyFlanger()` バッチ API。`createEchoProcessor()` / `createFlangerProcessor()` ストリーミング API (ブロック間状態保持)。34 テスト。
- **`audio/stereo-tools.ts`** — プロフェッショナル・ステレオ処理ユーティリティ (Zölzer 2011 / Blumlein 1931 / Williams 1991)。Mid/Side エンコード/デコード (M=(L+R)/2, S=(L-R)/2)。M/S スケーリングによるステレオ幅制御。パンニング則 5 種: `'linear'`・`'constant-power'`・`'3db'`・`'6db'`・`'balanced'` (panGains/panMono/panStereo)。等電力モノダウンミックス (√2 正規化)。位相反転。Pearson r 相関係数ベースのステレオ幅計測 (measureCorrelation/measureWidth)。チャンネル独立ゲイン (applyChannelGain)。51 テスト。
- **`audio/auto-duck.ts`** — サイドチェーン自動ダッキング (Zölzer 2011 / Giannoulis 2012)。ダイアログ/ナレーショントラックが活性化すると BGM/アンビエンスを自動減衰。ソフトニー付き RMS 閾値判定 + アタック/ホールド/リリースエンベロープ平滑化。`computeDuckGain()` でゲイン曲線のみ計算、`applyDuckGain()` で適用、`autoDuck()` 一括処理、`createAutoDucker()` ストリーミング対応。`rmsDb()` ユーティリティ。DaVinci/Premiere/Final Cut Pro の自動ダッキング機能相当。35 テスト。
- **`audio/transient-detector.ts`** — マルチバンドスペクトルフラックス型トランジェント/オンセット検出 (Bello et al. 2005 / Dixon 2006)。帯域分割 RMS エネルギーによるハーフ波整流フラックスを onset strength とし、局所中央値 + MAD (Median Absolute Deviation) スケールによる適応閾値でピーク検出。リフラクタリー期間制御で最小オンセット間隔を保証。`detectTransients()` バッチ解析、`createTransientDetector()` ストリーミング対応 (任意ブロックサイズ)。`onsetsToSampleIndices()` / `filterByConfidence()` ユーティリティ。42 テスト。
- **`render/motion-estimation.ts`** — フレーム間モーション推定 (Lucas & Kanade 1981 / Bouguet 2001 / Tomasi & Kanade 1991)。スタビライズ・オプティカルフロー・モーション補償フレーム補間・速度ワープの基盤。同種ソフト(Premiere Warp Stabilizer/DaVinci Stabilizer/CapCut)相当で Artone に欠落。3 つの推定器: Lucas-Kanade スパースサブピクセルフロー (`lucasKanade`、窓構造テンソルの正規方程式 + バイリニアワープ反復、固有値テクスチャ判定)、フルサーチ SAD ブロックマッチング (`blockMatch`、密な整数動きベクトル)、ロバストグローバル動き推定 (`estimateGlobalMotion`、ブロックベクトル中央値で局所外れ値除去)。Shi-Tomasi 特徴点選択 (`selectFeatures`)、`rgbaToGray` / `sampleBilinear`。グレースケール Float32Array、決定論的。23 テスト。
- **`render/stabilization.ts`** — 軌道ベース映像スタビライズ (Matsushita 2006 / Grundmann 2011)。Premiere/DaVinci/CapCut 標準の 2D スタビライズパイプライン: フレーム間動きを絶対カメラ軌道へ累積 (`accumulateTrajectory`)、移動平均/ガウシアンで軌道平滑化 (`smoothTrajectory`、意図したカメラ経路をモデル化)、補正算出 (`computeCorrections` = 平滑化 − 元軌道、`maxCorrection` クランプ)、黒縁が出ない最大中央クロップ算出 (`computeCropWindow`)。`stabilize()` フルパイプライン、`trajectoryShakiness()` 揺れ定量化 (2次差分)。モーションソース非依存 (ブロックマッチ/フロー/ジャイロ可)。28 テスト。
- **`color/chroma-key.ts`** — クロマキー（グリーン/ブルースクリーン合成）(Smith & Blinn 1996 / Rec.601)。同種ソフト(CapCut/Premiere/DaVinci/OpenReel)標準で Artone に欠落していた機能。YCbCr クロマ平面距離でキーイング（輝度変動に頑健、影もきれいに抜ける）。`similarity`/`smoothness` の2閾値 + smoothstep でソフトマット生成。スピル抑制（緑/青フリンジをキーチャンネルを他チャンネル平均へクランプして除去）。`chromaKey()` キーイング、`suppressSpillImage()` スピル除去単独パス、`compositeOver()` ストレートアルファ合成、`estimateKeyColor()` 境界サンプリングによるキー色自動推定。RGBA Uint8ClampedArray、アルファ算出。24 テスト。
- **`color/convolution.ts`** — 空間畳み込み＆シャープニング (Gonzalez & Woods 2008 / Sobel 1968)。同種ソフトの Sharpen/Unsharp Mask/Blur/Enhance に相当。汎用 NxN カーネル畳み込み (`convolve`)、分離可能畳み込み (`convolveSeparable`、ブラーで O(N))、アンシャープマスク (`unsharpMask`、しきい値付きでノイズ増幅回避)、3×3 シャープン (`sharpen`)、ガウシアン/ボックスブラー、Sobel エッジ検出 (`edgeDetect`)、エンボス (`emboss`)。複製境界、アルファ保持。31 テスト。
- **`render/transitions.ts`** — クリップトランジションジェネレータ。同種ソフト(Premiere/DaVinci/CapCut)標準のトランジションで Artone は内部ディゾルブのみだった。2フレーム合成: クロスディゾルブ (`crossDissolve`)、ディップ・トゥ・カラー (`dipToColor`、黒/白)、方向ワイプ (`wipe`、L/R/U/D + ソフトエッジ)、スライド (`slide`)、プッシュ (`push`)、放射状ワイプ (`radialWipe`)、アイリスワイプ (`irisWipe`)。`getTransition()` 名前付きレジストリ（13種）+ イージング (linear/in/out/inOut) 対応。ピクセル中心正規化で t=0/t=1 端点を正確処理。39 テスト。
- **`color/stylize.ts`** — スタイライズ＆修復エフェクト (de Haan & Bellers 1998)。同種ソフト標準で欠落していた3機能: ビネット (`vignette`、半径フォールオフで周辺減光/増光、roundness 対応)、デインターレース (`deinterlace`、bob ラインダブリング / blend フィールド平均、TFF/BFF; `detectCombing` コーミング検出)、方向性モーションブラー (`motionBlur`、角度・長さ指定の線形サンプリング)。RGBA Uint8ClampedArray、アルファ保持。24 テスト。
- **`audio/restoration.ts`** — オーディオ修復プリミティブ (Godsill & Rayner 1998 / Vaseghi 2008 / Zölzer 2011)。DC オフセット除去 (`removeDcOffset` 平均減算 / `highPassDcBlock` ワンポール高域通過でストリーミング対応・低域ランブル除去)。デクリック (`declick`、局所微分エンベロープ比でインパルス性クリック検出→線形補間修復、検出位置を返す)。デクリップ (`declip`、フラットトップ・クリップ領域を検出→Catmull-Rom 三次エルミート補間で滑らかなピーク再構成、クリップ天井までオーバーシュート)。サイレンストリミング (`trimSilence`、dB フロア以下の先頭/末尾無音除去)。`measureDcOffset()` / `ampToDbfs()` / `countClippedSamples()` / `peakAmplitude()` ユーティリティ。全関数イミュータブル・純 TypeScript。37 テスト。
- **`color/histogram-tools.ts`** — ヒストグラム解析＋トーン操作純関数 (Gonzalez & Woods 2008 / ITU-R BT.709)。`grading-engine.ts` (GPU ホイール/カーブ/3D-LUT) と `scopes/video-scopes.ts` (表示) を補完する単体テスト可能なトーン演算。`computeHistogram()` で RGB チャンネル別＋Rec.709 ルマの 256-bin ヒストグラム。`cumulativeHistogram()` CDF、`channelStats()` (min/max/mean/median)、`histogramPercentile()` パーセンタイル値。`buildLevelsLUT()` / `applyLevels()` レベル補正 (入力黒/白点・ガンマ・出力黒/白点)。`buildEqualizationLUT()` / `equalizeHistogram()` ヒストグラム平坦化 (ルマベース or チャンネル独立)。`autoContrast()` パーセンタイルクリップ自動コントラスト。`applyChannelLUT()` チャンネル別 8-bit LUT 適用、`meanLuminance()`、`identityLUT()`。RGBA Uint8ClampedArray in/out、アルファ保持。49 テスト。
- **`timeline/edit-snapping.ts`** — タイムライン編集スナッピング純関数。ドラッグ/トリム操作のスナップ計算を `MagneticTimeline` クラスから分離し UI 非依存で単体テスト可能化。スナップターゲット (クリップ端・プレイヘッド・マーカー・イン/アウト点・グリッド) を優先度付きで管理。`snapValue()` は閾値内の最近傍ターゲットへスナップ (距離→優先度→時刻の決定的タイブレーク)。`snapClipDrag()` はドラッグ中クリップの先頭/末尾両エッジを評価し最小距離のエッジでクリップ全体をシフト (自クリップ端は自動除外)。`gridTargets()` / `snapToGrid()` グリッドスナップ。`clipEdgeTargets()` クリップ端ターゲット生成。`mergeTargets()` 重複除去 (同時刻は高優先度を保持)。`targetsInRange()` 可視範囲フィルタ。全関数イミュータブル・副作用なし。40 テスト。
- **`audio/fade-curves.ts`** — オーディオフェード/クロスフェードカーブ (Zölzer 2011 / Reiss & McPherson 2014 / ITU-R BS.775)。6 種のフェード形状: `linear`・`equal-power` (cos/sin 則、非相関信号で定電力、中点 −3 dB)・`equal-gain` (相関信号で定振幅)・`logarithmic`・`exponential`・`s-curve` (レイズドコサイン)。`fadeInGain()` / `fadeOutGain()` 形状評価 (equal-power は fadeIn²+fadeOut²=1 の定電力保証)。`generateFadeCurve()` エンベロープ生成。`applyFadeIn()` / `applyFadeOut()` 片側フェード適用 (イミュータブル)。`crossfade()` 2 クリップクロスフェード合成 (出力長 = A+B−オーバーラップ)。`applyGainRamp()` 音量オートメーション。`gainToDb()` / `dbToGain()` dB 変換。`crossfadeMidpointPower()` / `crossfadeMidpointAmplitude()` で中点の電力/振幅特性を定量化。55 テスト。
- **`color/noise-reduction.ts`** — 空間ノイズリダクション (Tomasi & Manduchi 1998 / Buades 2005 / Immerkaer 1996)。プロキシフレーム・サムネイル・スコープ表示向け CPU 画像デノイズ。バイラテラルフィルタ (`bilateralFilter`、空間×レンジガウシアン重み、エッジ保存、Gaussian LUT 事前計算で高速化)。Non-Local Means (`nonLocalMeans`、パッチ類似度ベース、テクスチャ保存)。3パス box filter 近似ガウシアンブラー (`gaussianBlur`、O(N) 分離可能)。Laplacian 残差ノイズ推定 (`estimateNoise`、チャンネル別 σ)。決定論的合成ノイズ画像生成 (`makeSyntheticNoisyImage`、LCG + Box-Muller)。`imagePsnr()` 品質評価。RGBA Uint8ClampedArray in/out、ミラー境界、アルファチャンネル保持。36 テスト。
- **`animation/motion-path.ts`** — 3次ベジェ曲線モーションパス＋弧長パラメータ化 (Farin 2001 / Guenter & Parent 1990)。1本以上の Cubic Bézier セグメントで構成された 2D モーションパス。de Casteljau 再帰分割によるセグメント分割 (`bezierSplit`)。Gauss-Legendre 5点数値積分による弧長計算 (`bezierArcLength`)。弧長逆変換 (二分探索) で定速パストラバーサル (`evaluateAtLength`)。接線・法線・曲率の解析的計算。バウンディングボックス (導関数根から極値を解析的に計算)。適応細分化による折れ線フラッテン (`flattenPath`)。均一弧長サンプリング (`samplePathUniform`)。`makeLinearPath()` / `makeClosedPath()` / `makeMotionPath()` コンストラクタ。Vec2 ユーティリティ関数一式。71 テスト。
- **`audio/hpss.ts`** — Harmonic-Percussive Source Separation (Fitzgerald 2010 / Driedger 2014 / Ono 2008)。STFTマグニチュードスペクトログラム上の中央値フィルタリング: 時間軸水平方向中央値フィルタ → 調和成分 (持続音・メロディ・コード)、周波数軸垂直方向中央値フィルタ → 打楽器成分 (ドラム・トランジェント)。Wiener ソフトマスク (マスク乗数 p=2) で複素スペクトログラムをマスク処理後 ISTFT→OLA 合成。`separateHPSS()` バッチ分離、`createHPSSProcessor()` ストリーミング対応。`percussivenessRatio()` で打楽器性評価、`signalPsnr()` で再構成品質評価。純 TypeScript 内蔵 FFT/IFFT (Cooley-Tukey 基数-2)。33 テスト。
- **`core/frame-rate.ts`** — プロ映像フォーマット対応フレームレート有理数演算ライブラリ (SMPTE ST 428-21 / SMPTE RP 168-2002 / EBU R68 / ITU-R BT.470)。対応レート: 23.976 / 24 / 25 / 29.97 / 30 / 48 / 50 / 59.94 / 60 / 120 fps (NTSC 1001 分母を含む)。`framesToSeconds()` / `secondsToFrames()` / `snapToFrame()` で精密な有理数フレーム↔秒変換。`convertFrameCount()` / `remapFrame()` でクロスレート変換。3:2 プルダウン挿入 (`insert32Pulldown`) / 除去 (`remove32Pulldown`) と 2:2 倍速変換 (`insert22Pulldown`)。`findClosestFrameRate()` 近似フレームレート検索。`makeFrameRate()` GCD 正規化ファクトリ。`formatFrameDuration()` "H:MM:SS.FF" 形式フォーマット。`isWholeSeconds()` 整数秒チェック。96 テスト。

## [3.0.0] - 2026-05-23

### Added
- Apple HIG 準拠デザインシステム (design-system.ts — 色/スペース/タイポ/モーション/z-index 一元化)
- First-Run Experience (3ステップオンボーディング、レベル選択、テンプレート)
- Command Palette (Cmd+K、Spotlight 式ファジー検索、日本語エイリアス対応)
- ErrorBoundary (白画面防止、リカバリ UI)
- DropZone (全域ファイルドロップ、Apple の触感再現)
- Browser Capabilities 検出 (WebGPU/WebCodecs graceful degradation)
- OTIO 1.0 / EDL CMX 3600 / FCPXML 1.10 互換層
- SBOM 生成 (CycloneDX 1.5 + SPDX 2.3)
- OSV API 連携 CVE スキャン
- WCAG 2.1 AAA 自動監査
- CI 9項目チェック (色/テーマ/token/孤立/テスト/dead code/CLAUDE.md/localStorage/console.log)
- CVSS v3 ベクトル計算 (Log4shell=10.0 検証済み)
- SHA256 チェックサム検証付きインストーラ
- パフォーマンス退行検出 (bench/ CI gate)
- 11言語 i18n (ja/en/zh-Hans/zh-Hant/ko/es/fr/de/pt/ru/ar、各199キー完全一致)
- app/utils.ts 共通ユーティリティ (safeStorage/clamp/lerp/uuid/formatBytes/formatTimecode)
- HistoryManager ブランチ履歴、IndexedDB 永続化
- KeyframeAnimator、MotionGraphicsEngine
- CaptionManager (SRT/VTT/ASS インポート)

### Changed
- shell.tsx を唯一の React root に統一 (entry.tsx → shell.tsx → EngineProvider)
- main.ts から DOM 生成コード 257 行削除 (React 層に委譲)
- featureTier: essential/standard/pro の段階的開示
- any 型: production コード 50 → 0
- console.log: production コード 28 → 0
- localStorage 直書き → safeStorage() 経由に統一
- dead code 3,665 行を future/ に隔離

### Fixed
- init() に個別 try/catch — 部分初期化でも白画面にならない
- importMedia / exportProject の optional chaining → 明示的エラー
- stale closure (useEffect 空依存配列 + setState 関数型更新)
- CVSS パース: CVSS:3.X バージョン部除外
- DiagnosticPanels sed 置換バグ

### Security
- SBOM + OSV CVE スキャン CI gate
- SHA256 チェックサム付きダウンロード検証
- supply chain: MIT 互換ライセンスのみ


### Improved (Session 56b — 改善ラウンド)
- tsx を devDependencies に追加 — bench/sbom スクリプトを CI で実行可能に
- bench/baseline.json を実値で初期化 — 退行検出機能の即時起動
- security/cve-database.ts 追加 — 12個のキュレートCVE で security ゲート機能化
- A11y E2E テスト self-contained 化 — module path 解決問題を回避
- ESLint flat config (v9+) 追加 — 厳しめルール (max-depth/complexity/max-lines)
- Skill 4個追加: security-review / a11y-review / interchange-review / bench-review
- i18n Tier1 完全対応 (11言語): ja/en/zh-Hans/zh-Hant/ko/es/fr/de/pt/ru/ar
- 全11言語199キー完全一致 (RTL対応含む)
- otio.ts 未使用 import 削除

### Added (Session 56)
- `interchange/` モジュール — OTIO 1.0 / EDL CMX 3600 / FCPXML 1.10 互換層
- `bench/` モジュール — パフォーマンス退行検出システム (CI gate)
- `accessibility/` モジュール — WCAG 2.1 AAA 自動監査
- `security/` モジュール — SBOM (CycloneDX 1.5 / SPDX 2.3) + サプライチェーン監査
- ユニットテスト: interchange / quality (bench, a11y, supply chain)
- E2E A11y テスト (Playwright)
- CI ジョブ: bench / security / a11y
- 運用スカフォールド (CLAUDE.md / .claude/skills / hooks)
- リスクゾーン別 CLAUDE.md (recovery / audio / render / plugins / interchange / bench / accessibility / security)
- i18n 基盤 (1000+ 言語対応)
- GitHub repo 構成 (LICENSE / CONTRIBUTING / SECURITY / CoC)

### Improved (Self-review fixes)
- OTIO Transition 正式対応 (export/import 両対応, SMPTE_Dissolve / dissolve round-trip)
- EDL reel name 衝突回避 (連番 suffix 自動付与)
- FCPXML sequence duration 実計算 (旧: 0s → 全クリップ最終フレーム)
- SBOM hash 形式変換 (npm integrity base64 → SPDX hex)
- A11y JSDOM 対応 (DOMHost 抽象化, Node 環境で実行可能)
- bench しきい値カスタマイズ (per-bench 上書き)
- bench 実環境ホットパス追加 (canvas putImageData / typed array copy / audio mix / alpha composite / CRC32)
- bench 初回実行時 baseline 自動生成 (フリクション削減)
- 未使用 import 削除 (legacy-formats.ts)
- package.json: tsx + jsdom 依存宣言

### 10年運用基盤
- OTIO 互換 → 他NLE往復編集可能 (DaVinci/Premiere/FCP/Avid)
- パフォーマンス退行 CI で自動阻止 (critical >0 で fail)
- WCAG AAA 自動監査 (アクセシビリティ品質維持)
- SBOM 生成 + CVE スキャン (サプライチェーン保護)

## [3.0.0] - 2026-04-26

### Added
- WebCodecs パイプライン (H.264/H.265/VP9/AV1)
- WebGPU レンダリングエンジン (60fps)
- マグネティックタイムライン (FCP風)
- カラーグレーディング (DaVinci級 / HDR10 / HLG / Dolby Vision)
- オーディオエンジン (Fairlight級 / 5.1/7.1/Atmos)
- ローカル AI 処理 (Transformers.js / WebGPU 推論)
- Yjs 協調編集 (Figma風)
- VST/AU プラグイン WASM ブリッジ
- 分散レンダリング (Worker Pool / S3/R2/MinIO)
- ライブ配信 (WebRTC/HLS/RTMP / YouTube/Twitch)
- Capacitor iOS/Android ブリッジ
- Undo/Redo (Command Pattern / ブランチ履歴)
- Video Scopes (Waveform/Vectorscope/Histogram/RGB Parade)
- Performance Monitor (FPS/GPU/Memory / 自動品質調整)
- Crash Recovery / 自動バックアップ
- Proxy Workflow (高解像度自動プロキシ)
- PWA (Service Worker / オフライン対応)
- マルチカム / ネスト / マーカー
- Text-based Editing (Descript風)
- Motion Graphics / Keyframe Animator
- Caption Manager
- Batch Processor
- Project Manager / Media Browser

### Architecture
- 24+ モジュール / ~600KB / ~16,200 行 TypeScript
- React + TypeScript + WebCodecs + WebGPU + IndexedDB
- Vite ビルド / Vitest / Playwright
- Cloudflare Pages / Vercel デプロイ対応
- GitHub Actions CI/CD

### Documentation
- 100_POINTS_ARCHITECTURE.md
- README.md / CLAUDE.md
- Module-level CLAUDE.md
