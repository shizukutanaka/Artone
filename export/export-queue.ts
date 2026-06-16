/**
 * バックグラウンド書き出しキュー
 *
 * 優先度付き並列制御ジョブキュー。WebCodecs エンコーダに依存しない
 * 純粋TS実装のため、単体テスト可能。
 *
 * 特徴:
 * - 優先度キュー (high / normal / low)
 * - 最大並列数制御 (concurrency)
 * - 進捗コールバック (onProgress 0..1)
 * - キャンセル (個別 / 全体)
 * - 指数バックオフリトライ
 * - pause / resume
 * - drain() で全完了を待機
 *
 * # AI generated (reviewed)
 */

// ─── 型定義 ─────────────────────────────────────────────────────────────────

export type QueueJobStatus = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';

export type JobPriority = 'high' | 'normal' | 'low';

/** ジョブの公開状態スナップショット。 */
export interface QueueJob<T = void> {
  readonly id: string;
  readonly priority: JobPriority;
  status: QueueJobStatus;
  /** 0.0 〜 1.0 の進捗。 */
  progress: number;
  readonly createdAt: number;
  startedAt?: number;
  completedAt?: number;
  /** リトライ回数 (0 = まだリトライしていない)。 */
  retries: number;
  readonly maxRetries: number;
  error?: string;
  result?: T;
  /** ユーザー定義メタデータ。 */
  meta?: Record<string, unknown>;
}

/** enqueue() オプション。 */
export interface QueueJobOptions {
  priority?: JobPriority;
  maxRetries?: number;
  meta?: Record<string, unknown>;
}

/** createExportQueue() オプション。 */
export interface ExportQueueOptions {
  /** 同時実行ジョブ数上限。デフォルト 1。 */
  concurrency?: number;
  /** リトライ初回待機 ms (指数バックオフの底)。デフォルト 1000。 */
  retryDelay?: number;
}

/**
 * ジョブ実行関数の型。
 * @param jobId     - ジョブ固有 ID
 * @param onProgress - 進捗を 0..1 で報告するコールバック
 * @param signal    - キャンセル検知用 AbortSignal
 */
export type JobExecutor<T> = (
  jobId: string,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
) => Promise<T>;

/** createExportQueue が返すキューオブジェクト。 */
export interface ExportQueue<T = void> {
  /**
   * ジョブをキューに追加する。
   * @returns 追加されたジョブの状態オブジェクト (参照で更新される)。
   */
  enqueue(executor: JobExecutor<T>, opts?: QueueJobOptions): QueueJob<T>;

  /**
   * 指定 ID のジョブをキャンセルする。
   * @returns キャンセルに成功した場合 true。
   */
  cancel(jobId: string): boolean;

  /** 全 pending ジョブをキャンセルする (active 中のジョブは継続)。 */
  cancelAll(): void;

  /** ジョブ状態スナップショットを返す。存在しない場合 undefined。 */
  getJob(jobId: string): QueueJob<T> | undefined;

  /** 全ジョブのリストを返す (挿入順)。 */
  getAllJobs(): QueueJob<T>[];

  /** completed / failed / cancelled 状態のジョブをリストから除去する。 */
  clearCompleted(): void;

  /**
   * ジョブ状態変更を購読する。
   * @returns 購読解除関数。
   */
  onStatusChange(cb: (job: QueueJob<T>) => void): () => void;

  /** キュー全体の統計。 */
  stats(): {
    pending: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
  };

  /** 新しいジョブの開始を一時停止する (実行中は継続)。 */
  pause(): void;

  /** pause() 後に再開する。 */
  resume(): void;

  /**
   * 現在 pending / active のジョブが全て完了するまで待機する。
   * キューが空の場合は即座に resolve する。
   */
  drain(): Promise<void>;
}

// ─── 優先度マップ ────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<JobPriority, number> = { high: 0, normal: 1, low: 2 };

function comparePriority(a: QueueJob<unknown>, b: QueueJob<unknown>): number {
  const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (pd !== 0) return pd;
  return a.createdAt - b.createdAt; // FIFO within same priority
}

// ─── ファクトリ ──────────────────────────────────────────────────────────────

/**
 * バックグラウンド書き出しキューを生成する。
 *
 * @example
 * const queue = createExportQueue<Blob>({ concurrency: 1 });
 * const job = queue.enqueue(async (id, onProgress, signal) => {
 *   onProgress(0.5);
 *   return new Blob(['...']);
 * }, { priority: 'high' });
 * await queue.drain();
 * console.log(job.result); // Blob
 */
export function createExportQueue<T = void>(opts?: ExportQueueOptions): ExportQueue<T> {
  const concurrency = opts?.concurrency ?? 1;
  const retryDelay = opts?.retryDelay ?? 1000;

  const jobs = new Map<string, QueueJob<T>>();
  const executors = new Map<string, JobExecutor<T>>();
  const controllers = new Map<string, AbortController>();
  const listeners = new Set<(job: QueueJob<T>) => void>();

  let pending: QueueJob<T>[] = [];
  const active = new Set<string>();
  let paused = false;

  // ─── internal helpers ────────────────────────────────────────────────────

  function notify(job: QueueJob<T>): void {
    listeners.forEach((cb) => cb(job));
  }

  function sortPending(): void {
    pending.sort(comparePriority);
  }

  function tick(): void {
    if (paused) return;
    while (active.size < concurrency && pending.length > 0) {
      const job = pending.shift()!;
      runJob(job);
    }
  }

  function scheduleRetry(job: QueueJob<T>, attemptNumber: number): void {
    const delay = retryDelay * Math.pow(2, attemptNumber - 1);
    setTimeout(() => {
      // Guard: cancel() may have been called during the retry delay. Without
      // this check the job would be resurrected in the pending queue even though
      // the caller already received cancel()→true.
      if (job.status === 'cancelled') return;
      // status is already 'pending' (set in runJob finally before notify)
      pending.push(job);
      sortPending();
      tick();
    }, delay);
  }

  async function runJob(job: QueueJob<T>): Promise<void> {
    const controller = new AbortController();
    controllers.set(job.id, controller);
    active.add(job.id);
    job.status = 'active';
    job.startedAt = Date.now();
    notify(job);

    const executor = executors.get(job.id);
    if (!executor) {
      job.status = 'failed';
      job.error = 'Executor not found';
      job.completedAt = Date.now();
      active.delete(job.id);
      controllers.delete(job.id);
      notify(job);
      tick();
      return;
    }

    let needsRetry = false;

    try {
      const result = await executor(
        job.id,
        (p) => {
          job.progress = Math.min(1, Math.max(0, p));
          notify(job);
        },
        controller.signal,
      );

      // Guard: job may have been cancelled mid-flight. cancel() can mutate
      // job.status during the await above, which TS's flow analysis cannot see
      // (it still narrows from `job.status = 'active'`), so widen via the cast.
      const postStatus = job.status as QueueJobStatus;
      if (postStatus !== 'cancelled') {
        job.result = result;
        job.status = 'completed';
        job.progress = 1;
        job.completedAt = Date.now();
      }
    } catch (err) {
      // Same concurrent-mutation caveat as above: widen the flow-narrowed type.
      if ((job.status as QueueJobStatus) === 'cancelled') {
        // cancel() already set status; do nothing extra
      } else if (job.retries < job.maxRetries) {
        job.retries += 1;
        job.error = err instanceof Error ? err.message : String(err);
        needsRetry = true;
      } else {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
        job.completedAt = Date.now();
      }
    } finally {
      active.delete(job.id);
      controllers.delete(job.id);
      // Set status to 'pending' before notifying so the UI sees an accurate
      // state during the retry delay (not a stale 'active'). scheduleRetry
      // checks for 'cancelled' before re-queuing, so setting 'pending' here
      // does not prevent cancel() from working.
      if (needsRetry) {
        job.status = 'pending';
        job.progress = 0;
      }
      // active.delete MUST precede notify so drain() can observe an empty active set
      notify(job);
      tick(); // open slot for next pending job (also fires before retry delay)
      if (needsRetry) {
        scheduleRetry(job, job.retries);
      }
    }
  }

  // ─── public API ──────────────────────────────────────────────────────────

  function enqueue(executor: JobExecutor<T>, jobOpts?: QueueJobOptions): QueueJob<T> {
    const job: QueueJob<T> = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      priority: jobOpts?.priority ?? 'normal',
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
      retries: 0,
      maxRetries: jobOpts?.maxRetries ?? 0,
      meta: jobOpts?.meta,
    };

    jobs.set(job.id, job);
    executors.set(job.id, executor);
    pending.push(job);
    sortPending();
    notify(job);
    tick();
    return job;
  }

  function cancel(jobId: string): boolean {
    const job = jobs.get(jobId);
    if (!job) return false;
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return false;
    }

    job.status = 'cancelled';
    job.completedAt = Date.now();

    if (active.has(jobId)) {
      controllers.get(jobId)?.abort();
    } else {
      // Remove from pending queue
      pending = pending.filter((j) => j.id !== jobId);
    }

    notify(job);
    return true;
  }

  function cancelAll(): void {
    const pendingCopy = [...pending];
    pending = [];
    for (const job of pendingCopy) {
      job.status = 'cancelled';
      job.completedAt = Date.now();
      notify(job);
    }
  }

  function getJob(jobId: string): QueueJob<T> | undefined {
    return jobs.get(jobId);
  }

  function getAllJobs(): QueueJob<T>[] {
    return [...jobs.values()];
  }

  function clearCompleted(): void {
    for (const [id, job] of jobs) {
      if (
        job.status === 'completed' ||
        job.status === 'failed' ||
        job.status === 'cancelled'
      ) {
        jobs.delete(id);
        executors.delete(id);
      }
    }
  }

  function onStatusChange(cb: (job: QueueJob<T>) => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function stats(): ReturnType<ExportQueue<T>['stats']> {
    let pendingCount = 0, activeCount = 0, completed = 0, failed = 0, cancelled = 0;
    for (const job of jobs.values()) {
      switch (job.status) {
        case 'pending': pendingCount++; break;
        case 'active': activeCount++; break;
        case 'completed': completed++; break;
        case 'failed': failed++; break;
        case 'cancelled': cancelled++; break;
      }
    }
    return { pending: pendingCount, active: activeCount, completed, failed, cancelled };
  }

  function pause(): void { paused = true; }

  function resume(): void {
    paused = false;
    tick();
  }

  function drain(): Promise<void> {
    if (pending.length === 0 && active.size === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const unsub = onStatusChange(() => {
        if (pending.length === 0 && active.size === 0) {
          unsub();
          resolve();
        }
      });
    });
  }

  return {
    enqueue,
    cancel,
    cancelAll,
    getJob,
    getAllJobs,
    clearCompleted,
    onStatusChange,
    stats,
    pause,
    resume,
    drain,
  };
}
