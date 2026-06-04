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
    this.sorted = true;
  }

  /**
   * 指定時刻を含む区間を返す。
   * start でソート済みなので、start <= time の範囲を二分探索で絞り込む。
   */
  queryPoint(time: number): T[] {
    this.ensureSorted();
    const result: T[] = [];
    // start <= time の上限位置を二分探索
    const upper = this.upperBound(time);
    for (let i = 0; i < upper; i++) {
      const item = this.items[i];
      if (time >= item.start && time < item.end) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * 指定範囲 [rangeStart, rangeEnd) と重なる区間を返す。
   */
  queryRange(rangeStart: number, rangeEnd: number): T[] {
    this.ensureSorted();
    const result: T[] = [];
    const upper = this.upperBound(rangeEnd);
    for (let i = 0; i < upper; i++) {
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
