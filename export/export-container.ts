/**
 * Artone v3 — Export Container Mapping
 *
 * エクスポートプリセットの出力形式と、実際に書き出せるコンテナの対応。
 *
 * **依存ゼロで保つこと。** ここは `app/main.ts` から**静的に** import される。
 * デマルチプレクサ (Mediabunny) を含む `export/media-export.ts` に置くと、
 * 静的 import と動的 import が同一モジュールを指してコード分割が効かなくなり、
 * 起動バンドルへ Mediabunny 一式が載ってしまう (実測 328kB → 754kB)。
 *
 * # AI generated (reviewed)
 *
 * @version 3.1.0
 */

/** `export/media-export.ts` が書き出せるコンテナ。GIF は別経路。 */
export type ExportContainer = 'mp4' | 'webm';

/**
 * エクスポートプリセットの出力形式を、書き出せるコンテナへ写す。
 *
 * GIF は別経路 (`export/gif-encoder.ts`) が担当するため `null` を返す。
 * 呼び出し側は `null` を「未対応」として**明示的に失敗**させること — 黙って
 * 別形式で書き出すと、ユーザーが頼んだものと違うファイルが出る。
 */
export function containerForPreset(format: string): ExportContainer | null {
  if (format === 'mp4') return 'mp4';
  if (format === 'webm') return 'webm';
  return null;
}
