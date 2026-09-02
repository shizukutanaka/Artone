/**
 * Artone v3 — HTML エスケープ (XSS 対策)
 *
 * ## なぜ共有するのか
 * 同じ実装が **3箇所に写経**されていた (`undo/history-manager.ts` /
 * `plugins/plugin-bridge.ts` / `recovery/recovery-manager.ts`)。いずれも
 * `innerHTML` へ値を差し込む直前のエスケープで、**セキュリティ上の意味は同一**。
 *
 * 写経の問題は、**片方を直しても残りが直らない**ことにある。実際、置換表の
 * 取り出しに `!` を使う問題を plugin-bridge でだけ修正した結果、残り2箇所は
 * 古いままになっていた。1箇所にすれば、直すのも監査するのも1回で済む。
 *
 * # AI generated (reviewed)
 *
 * @version 3.0.0
 */

/** HTML の特殊文字 → 実体参照。 */
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * `innerHTML` へ差し込む文字列をエスケープする。
 *
 * 未一致の文字は**原文のまま**返す (`?? c`)。置換表と正規表現は同じ5文字を
 * 覆っているので到達しないが、`!` で潰すと**将来ずれた時に未エスケープの文字が
 * `undefined` へ化ける** — エスケープ漏れの方向に壊れる。安全側に倒す。
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}
