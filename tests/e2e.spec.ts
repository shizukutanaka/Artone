/**
 * Artone v3 — E2E (実ブラウザで**組み上がった製品**を動かす)
 *
 * ## このファイルが以前どうなっていたか
 * 旧版は存在しない UI を検証していた — `data-testid` はアプリ側に**1つも無く**、
 * 共同編集パネル・共有リンク・モバイルナビ・書き出しダイアログといった
 * **実装されていない画面**を対象にしていた。加えて「Verify playback state changed」
 * のようにアサーションが1つも無いテストが並び、**素通しで緑になっていた**。
 * 実際に走らせると 23 件中 16 件が落ちる状態で、CI の品質ゲートが謳う
 * 「E2E pass」は成立していなかった。
 *
 * ここでは**実在する画面**だけを、実在する導線で検証する。中心はコアループ:
 * 取り込む → タイムラインに載る → 選ぶ → プレビューに実映像が出る。
 *
 * 素材はテスト実行時にブラウザ内で生成する (MediaRecorder)。バイナリを
 * リポジトリに置かずに済み、環境に無い素材へ依存もしない。
 *
 * # AI generated (reviewed)
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * 初回起動のオンボーディング (ティア選択 → テンプレート選択) を抜けてエディタへ。
 *
 * 画面が出る前に判断すると「Skip も timeline も無い」状態を**もう終わった**と
 * 誤読して即座に諦めてしまう。毎回どちらかが現れるまで待ってから進める。
 */
async function openEditor(page: Page): Promise<void> {
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

/**
 * ブラウザ内で短い WebM を作り、取り込み用の file input へ流し込む。
 *
 * `setInputFiles` ではなく `DataTransfer` を使うのは、素材をページ内で生成して
 * そのまま渡せるため (Node 側に一時ファイルを作らない)。change イベントは
 * 実際のユーザー操作と同じ経路でハンドラへ届く。
 */
async function importGeneratedVideo(page: Page, name = 'sample.webm'): Promise<void> {
  await page.evaluate(async (fileName) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp9' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.start();
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgb(${(i * 8) % 256}, 60, 120)`;
      ctx.fillRect(0, 0, 320, 240);
      await new Promise((r) => setTimeout(r, 33));
    }
    await new Promise<void>((r) => { recorder.onstop = () => r(); recorder.stop(); });

    const input = document.querySelector<HTMLInputElement>('[data-testid="file-input"]');
    if (!input) throw new Error('file input not found');
    const transfer = new DataTransfer();
    transfer.items.add(new File(chunks, fileName, { type: 'video/webm' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, name);
}

test.describe('起動', () => {
  test('loads without console errors and shows the editor panels', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await openEditor(page);

    await expect(page).toHaveTitle(/Artone/);
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.getByTestId('media-browser')).toBeVisible();
    await expect(page.getByTestId('preview')).toBeVisible();
    await expect(page.getByTestId('timeline')).toBeVisible();
    // 起動時に例外が出ていれば、見た目が正しくても製品は壊れている。
    expect(errors).toEqual([]);
  });

  test('offers an import control and accepts video files', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByTestId('import-button')).toBeVisible();
    await expect(page.getByTestId('file-input')).toHaveAttribute('accept', /video/);
  });
});

test.describe('コアループ: 取り込む → 載る → 見る', () => {
  test('imports a file, places it on the timeline, and previews it', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openEditor(page);

    await importGeneratedVideo(page);

    // 1. ライブラリに実メタデータ付きで並ぶ (寸法が読めていなければ失敗する)。
    const item = page.getByTestId('media-item').first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    await expect(item).toContainText('sample.webm');
    await expect(item).toContainText('320×240');

    // 2. タイムラインにクリップとして載る (エンジンが唯一の真実である証拠)。
    const clip = page.getByTestId('timeline-clip').first();
    await expect(clip).toBeVisible({ timeout: 20_000 });
    await expect(clip).toContainText('sample.webm');

    // 3. 選ぶとプレビューに**実映像**が出る (プレースホルダ文字ではない)。
    await item.click();
    const video = page.getByTestId('preview-video');
    await expect(video).toBeVisible({ timeout: 20_000 });
    await expect(video).toHaveJSProperty('readyState', 4); // HAVE_ENOUGH_DATA
    const src = await video.getAttribute('src');
    expect(src).toMatch(/^blob:/);

    expect(errors).toEqual([]);
  });
});

test.describe('タイムライン操作', () => {
  test('scrubs the playhead when the ruler is clicked', async ({ page }) => {
    await openEditor(page);
    const playhead = page.getByTestId('playhead');
    await expect(playhead).toBeVisible();
    const before = await playhead.evaluate((el) => el.getBoundingClientRect().x);

    await page.getByTestId('timeline-ruler').click({ position: { x: 240, y: 8 } });

    // 再生位置が実際に動く (旧版は「見えていること」しか見ていなかった)。
    await expect
      .poll(() => playhead.evaluate((el) => el.getBoundingClientRect().x))
      .toBeGreaterThan(before + 50);
  });

  test('zooming with Ctrl+wheel widens the ruler', async ({ page }) => {
    await openEditor(page);
    const ruler = page.getByTestId('timeline-ruler');
    const before = await ruler.evaluate((el) => el.getBoundingClientRect().width);

    // 修飾キー無しのホイールは**スクロール**であって拡大ではない (編集ソフトの慣例)。
    // 修飾キーを押さずに拡大すると、水平スクロールのたびに尺が変わってしまう。
    await ruler.hover();
    await page.mouse.wheel(0, -400);
    expect(await ruler.evaluate((el) => el.getBoundingClientRect().width)).toBe(before);

    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -400);
    await page.keyboard.up('Control');

    await expect
      .poll(() => ruler.evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(before);
  });
});

test.describe('性能', () => {
  test('reaches an interactive editor quickly', async ({ page }) => {
    const start = Date.now();
    await openEditor(page);
    // 「読み込めた」ではなく「操作できる画面が出た」までを測る。
    expect(Date.now() - start).toBeLessThan(10_000);
  });
});
