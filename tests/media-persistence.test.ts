/**
 * Tests for 取り込んだ素材の永続化
 * (project/project-manager.ts の saveMediaBlob / listMediaBlobs / getMediaBlob /
 *  deleteMediaBlob と、media/media-browser.ts の restoreItems)
 *
 * ## 背景 (このテストが固定する回帰)
 * メディアライブラリには**永続化が一切無かった**。取り込んだ File はメモリ上の
 * blob URL にしか存在せず、リロードすると URL は無効になる。一方でクラッシュ
 * 復旧はタイムラインを復元するため、
 *
 *   「クリップは戻ってくるが、指している素材はどこにも存在しない」
 *
 * という状態になり、再生もプレビューも書き出しもできなかった。`project/` は
 * IndexedDB に `media` オブジェクトストアを**作るだけ作って一度も読み書きして
 * いなかった** — その死んでいた領域を使う。
 *
 * IndexedDB は tests/setup.ts の fake-indexeddb で動くため jsdom で検証できる。
 *
 * # AI generated (reviewed)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectManager } from '../project/project-manager';
import { MediaBrowser } from '../media/media-browser';
import type { RestorableMedia } from '../media/media-browser';

/** 保存対象の素材レコードを作る。 */
function record(id: string, name = 'clip.mp4'): Omit<RestorableMedia, 'savedAt'> & { blob: Blob } {
  return {
    id,
    name,
    type: 'video',
    blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' }),
    meta: { duration: 12.5, width: 1920, height: 1080, fps: 30, rotation: 90, codec: 'avc1.640028', thumbnail: 'data:image/png;base64,AAA' },
  };
}

describe('ProjectManager media blobs', () => {
  let pm: ProjectManager;

  beforeEach(async () => {
    pm = new ProjectManager();
    await pm.init();
    // 前のテストが残したレコードを消す (同一 DB を共有するため)。
    for (const m of await pm.listMediaBlobs()) await pm.deleteMediaBlob(m.id);
  });

  it('REGRESSION: an imported blob survives a round-trip through IndexedDB', async () => {
    await pm.saveMediaBlob(record('m1'));

    const stored = await pm.getMediaBlob('m1');
    expect(stored).not.toBeNull();
    expect(stored!.name).toBe('clip.mp4');
    expect(stored!.blob.size).toBe(4);        // 実体が残っている
    expect(stored!.meta.duration).toBe(12.5); // 再抽出せず済むメタデータも
    expect(stored!.meta.rotation).toBe(90);
  });

  it('returns null for media that was never stored', async () => {
    expect(await pm.getMediaBlob('ghost')).toBeNull();
  });

  it('lists stored media oldest first (import order)', async () => {
    await pm.saveMediaBlob(record('m1', 'a.mp4'));
    await pm.saveMediaBlob(record('m2', 'b.mp4'));
    const list = await pm.listMediaBlobs();
    expect(list.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(list.every((m) => typeof m.savedAt === 'number')).toBe(true);
  });

  it('overwrites the same id rather than duplicating it', async () => {
    await pm.saveMediaBlob(record('m1', 'first.mp4'));
    await pm.saveMediaBlob(record('m1', 'second.mp4'));
    const list = await pm.listMediaBlobs();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('second.mp4');
  });

  it('deletes a stored blob', async () => {
    await pm.saveMediaBlob(record('m1'));
    await pm.deleteMediaBlob('m1');
    expect(await pm.getMediaBlob('m1')).toBeNull();
  });
});

describe('MediaBrowser.restoreItems', () => {
  it('REGRESSION: restores with the ORIGINAL id so recovered clips still resolve', async () => {
    // ID が変わると、復旧したタイムラインのクリップが指す mediaId と一致せず
    // 「素材はあるのに見つからない」状態になる。
    const browser = new MediaBrowser();
    const restored = browser.restoreItems([{ ...record('media-42'), savedAt: 1000 }]);

    expect(restored).toBe(1);
    const items = browser.getItems();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('media-42');
  });

  it('reuses the stored metadata instead of re-extracting it', async () => {
    const browser = new MediaBrowser();
    browser.restoreItems([{ ...record('m1'), savedAt: 1000 }]);
    const item = browser.getItems()[0];
    expect(item).toMatchObject({
      name: 'clip.mp4', duration: 12.5, width: 1920, height: 1080,
      fps: 30, rotation: 90, codec: 'avc1.640028',
    });
    expect(item.thumbnail).toBe('data:image/png;base64,AAA');
    expect(item.url).toBeTruthy(); // 再生できるよう blob URL を張り直す
  });

  it('does not overwrite media that is already in the library', async () => {
    const browser = new MediaBrowser();
    browser.restoreItems([{ ...record('m1', 'live.mp4'), savedAt: 1000 }]);
    browser.restoreItems([{ ...record('m1', 'stale.mp4'), savedAt: 2000 }]);
    expect(browser.getItems()).toHaveLength(1);
    expect(browser.getItems()[0].name).toBe('live.mp4');
  });

  it('skips malformed records rather than throwing during startup', async () => {
    const browser = new MediaBrowser();
    const bad = [
      { ...record(''), savedAt: 1 },                                   // id 無し
      { id: 'x', name: 'x', type: 'video', savedAt: 1 } as unknown as RestorableMedia, // blob 無し
    ];
    expect(browser.restoreItems(bad)).toBe(0);
    expect(browser.getItems()).toHaveLength(0);
  });

  it('notifies subscribers once when anything was restored', async () => {
    const browser = new MediaBrowser();
    let notifications = 0;
    browser.subscribe(() => { notifications++; });
    browser.restoreItems([{ ...record('m1'), savedAt: 1 }, { ...record('m2'), savedAt: 2 }]);
    expect(notifications).toBe(1);
    browser.restoreItems([]); // 何も戻さないなら通知しない
    expect(notifications).toBe(1);
  });
});

describe('end-to-end: import → reload → recovered clip resolves', () => {
  it('REGRESSION: a clip\'s mediaId still resolves after a simulated reload', async () => {
    // 取り込み (実体を保存)
    const pm = new ProjectManager();
    await pm.init();
    for (const m of await pm.listMediaBlobs()) await pm.deleteMediaBlob(m.id);
    await pm.saveMediaBlob(record('media-A'));

    // リロード: ライブラリは空の新しいインスタンスから始まる
    const afterReload = new MediaBrowser();
    expect(afterReload.getItems()).toHaveLength(0); // 従来はここで終わりだった

    afterReload.restoreItems(await pm.listMediaBlobs());

    // 復旧したタイムラインのクリップが指す mediaId が解決できる。
    const clipMediaId = 'media-A';
    const found = afterReload.getItems().find((m) => m.id === clipMediaId);
    expect(found).toBeDefined();
    expect(found!.file).toBeTruthy(); // 書き出しに必要な実体が戻っている
  });
});
