/**
 * Artone v3 — Interval Index
 *
 * クリップの時間範囲検索を O(n) 線形走査から O(log n + k) に高速化する。
 * (k = ヒット数)
 *
 * 設計根拠 (GitHub interval-tree 実装パターン):
 * - 大量クリップ (1000+) のタイムラインで getClipsAtTime / getClipsInRange が
 *   毎フレーム呼ばれるとボトルネックになる。
 * - 完全な区間木 (red-black interval tree) は実装が重い。
 *   開始時刻でソートした配列 + 二分探索 + maxEnd 累積で実用十分。
 *
 * トレードオフ: 挿入は O(n) (再ソート)。読み取りが圧倒的に多いタイムラインに最適。
 */

export interface Interval {
  id: string;
  start: number;
  end: number;
}

export class IntervalIndex<T extends Interval> {
  private items: T[] = [];
  private sorted = false;
  /**
   * Largest `end - start` over all items, refreshed on sort. Used to bound the
   * *lower* end of the scan window: an interval containing a query time `t`
   * must satisfy `end > t`, and since `end <= start + maxLength`, it must also
   * satisfy `start > t - maxLength`. So only items whose start lies in
   * `(t - maxLength, t]` can match. It is always an upper bound on the true
   * max length at query time (insert sets `sorted = false`, forcing a refresh
   * before the next query; remove keeps the order and may leave it stale-high,
   * which only widens the window — never drops a real hit).
   */
  private maxLength = 0;

  /** 区間を追加 (次回クエリ時に再ソート) */
  insert(item: T): void {
    this.items.push(item);
    this.sorted = false;
  }

  /** 区間を削除 */
  remove(id: string): boolean {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    return true;
  }

  /** 全削除 */
  clear(): void {
    this.items = [];
    this.sorted = false;
  }

  get size(): number {
    return this.items.length;
  }

  private ensureSorted(): void {
    if (this.sorted) return;
    this.items.sort((a, b) => a.start - b.start);
    let maxLen = 0;
    for (const item of this.items) {
      const len = item.end - item.start;
      if (len > maxLen) maxLen = len;
    }
    this.maxLength = maxLen;
    this.sorted = true;
  }

  /**
   * 指定時刻を含む区間を返す。
   *
   * start でソート済みなので、マッチ候補は start が `(time - maxLength, time]`
   * に入る区間に限られる (上下端とも二分探索で確定)。これにより playhead が
   * タイムライン終端付近 (start <= time がほぼ全件) でも走査が
   * O(log n + window) に収まる。
   */
  queryPoint(time: number): T[] {
    this.ensureSorted();
    const result: T[] = [];
    // 候補: time - maxLength < start <= time
    const lower = this.upperBound(time - this.maxLength);
    const upper = this.upperBound(time);
    for (let i = lower; i < upper; i++) {
      const item = this.items[i];
      if (time >= item.start && time < item.end) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * 指定範囲 [rangeStart, rangeEnd) と重なる区間を返す。
   *
   * 重なり条件 `start < rangeEnd && end > rangeStart` のうち、
   * `end > rangeStart` は `start > rangeStart - maxLength` を含意するため、
   * 候補は start が `(rangeStart - maxLength, rangeEnd]` の区間に限られる。
   */
  queryRange(rangeStart: number, rangeEnd: number): T[] {
    this.ensureSorted();
    const result: T[] = [];
    const lower = this.upperBound(rangeStart - this.maxLength);
    const upper = this.upperBound(rangeEnd);
    for (let i = lower; i < upper; i++) {
      const item = this.items[i];
      // 重なり判定: item.start < rangeEnd && item.end > rangeStart
      if (item.start < rangeEnd && item.end > rangeStart) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * start <= value を満たす要素数 (二分探索)。
   * これにより queryPoint/queryRange のループ上限を絞る。
   */
  private upperBound(value: number): number {
    let lo = 0, hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.items[mid].start <= value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** ソート済みの全区間 (デバッグ/シリアライズ用) */
  toArray(): T[] {
    this.ensureSorted();
    return [...this.items];
  }
}
