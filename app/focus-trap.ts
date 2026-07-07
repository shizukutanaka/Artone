/**
 * Artone v3 — Focus Trap Utility
 *
 * WCAG 2.1 AAA はモーダル表示中、フォーカスがモーダル外へ逃げないこと
 * (focus trap)、Esc で閉じられること、閉じたら元の要素へフォーカスを戻すこと
 * を要求する。本ユーティリティはその基本部品を提供する純粋寄り関数群。
 *
 * ライブラリ非依存 (Web 標準のみ — CLAUDE.md)。command-palette / export dialog /
 * first-run など全モーダルで共有する。
 *
 * 参考 (Zenn): https://zenn.dev/dqn/articles/36045bb89d5d69
 *
 * # AI generated (reviewed)
 */

/** Tab 順に並ぶフォーカス可能要素のセレクタ (disabled / hidden は除外)。 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * `container` 内のフォーカス可能要素を Tab 順 (DOM 順) で返す。
 * 非表示要素 (`disabled` / `aria-hidden="true"` / `display:none`) は除外。
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter((el) => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    // Computed `display` reflects inline style and CSS-class rules alike, and
    // (unlike offsetParent/getClientRects) doesn't depend on layout having run
    // — so it works the same in jsdom as in a real browser. A fixed-position
    // modal keeps a normal `display` value, so it is never excluded here.
    if (getComputedStyle(el).display === 'none') return false;
    return true;
  });
}

/**
 * Tab / Shift+Tab がコンテナ端を越えようとしたら反対端へ巻き戻す (focus trap)。
 *
 * フォーカスがコンテナ外にある場合は最初の要素へ。フォーカス可能要素が無ければ
 * 何もしない。`event.preventDefault()` は巻き戻したときのみ呼ぶ。
 *
 * @returns 実際にフォーカスを移したか (テスト用)。
 */
export function trapTabKey(
  container: HTMLElement,
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>,
  activeElement: Element | null,
): boolean {
  if (event.key !== 'Tab') return false;
  const focusables = getFocusableElements(container);
  if (focusables.length === 0) {
    // Nothing focusable inside — keep focus pinned to the container itself.
    event.preventDefault();
    return false;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const activeInside = activeElement instanceof HTMLElement && container.contains(activeElement);

  if (!activeInside) {
    event.preventDefault();
    first.focus();
    return true;
  }
  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/**
 * モーダルを開く直前のフォーカス要素を覚え、閉じたときに戻すための関数を返す。
 *
 * ```ts
 * const restore = captureFocus();
 * // … モーダル表示 …
 * restore(); // 元の要素へフォーカスを戻す
 * ```
 */
export function captureFocus(): () => void {
  const previous = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
  return () => {
    // Only restore if the element is still in the document and focusable.
    if (previous && typeof previous.focus === 'function' && previous.isConnected !== false) {
      previous.focus();
    }
  };
}
