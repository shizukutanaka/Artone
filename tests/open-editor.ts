/**
 * 初回起動のオンボーディングを抜けてエディタ本体を開く共通ヘルパ。
 *
 * ## なぜ共有するのか
 * `/` を開いただけでは**ティア選択画面**が出るだけで、エディタ (メディアブラウザ /
 * プレビュー / タイムライン) には到達しない。これを知らずに `/` を検証すると、
 * 「アプリを検証したつもりで初回画面しか見ていない」ことになる — 実際 a11y 監査は
 * 長らくオンボーディング画面だけを WCAG 監査して PASS を報告していた。
 *
 * spec ごとに書き写すと片方だけ直る事故が起きるため、1箇所に置いて共有する。
 *
 * # AI generated (reviewed)
 */
import { expect, type Page } from '@playwright/test';

/**
 * オンボーディングを抜け、タイムラインが見えるところまで進める。
 *
 * 画面が出る前に判断すると「Skip も timeline も無い」状態を**もう終わった**と
 * 誤読して即座に諦めてしまう。毎回どちらかが現れるまで待ってから進める。
 */
export async function openEditor(page: Page): Promise<void> {
  await page.goto('/');
  const timeline = page.getByTestId('timeline');
  for (let step = 0; step < 5; step++) {
    if (await timeline.count()) break;
    const skip = page.getByRole('button', { name: /^Skip$/ });
    await Promise.race([
      skip.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined),
      timeline.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined),
    ]);
    if (await timeline.count()) break;
    if (!(await skip.count())) break;
    await skip.first().click();
  }
  await expect(timeline).toBeVisible({ timeout: 15_000 });
}
