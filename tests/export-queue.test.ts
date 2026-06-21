/**
 * バックグラウンド書き出しキューのテスト
 */

import { describe, it, expect } from 'vitest';
import { createExportQueue } from '../export/export-queue';

// ─── ヘルパー ────────────────────────────────────────────────────────────────

/** 即時完了するエグゼキューター */
function immediateOk<T>(result: T) {
  return async (_id: string, onProgress: (p: number) => void) => {
    onProgress(0.5);
    return result;
  };
}

/** N ms 後に完了するエグゼキューター */
function delayedOk<T>(result: T, ms: number) {
  return async (_id: string, onProgress: (p: number) => void) => {
    await new Promise((r) => setTimeout(r, ms));
    onProgress(1);
    return result;
  };
}

/** 即時失敗するエグゼキューター */
function failingExecutor(msg = 'err') {
  return async () => { throw new Error(msg); };
}

// ─── 基本動作 ─────────────────────────────────────────────────────────────────

describe('basic enqueue / drain', () => {
  it('enqueue returns a job with pending status initially', () => {
    const q = createExportQueue<string>();
    const job = q.enqueue(immediateOk('hi'));
    expect(job.id).toBeTruthy();
    expect(job.priority).toBe('normal');
    expect(job.maxRetries).toBe(0);
    // After microtask it may be active; just check existence
    expect(q.getJob(job.id)).toBe(job);
  });

  it('drain resolves after executor completes', async () => {
    const q = createExportQueue<string>();
    const job = q.enqueue(immediateOk('done'));
    await q.drain();
    expect(job.status).toBe('completed');
    expect(job.result).toBe('done');
    expect(job.progress).toBe(1);
  });

  it('drain is immediate when queue is empty', async () => {
    const q = createExportQueue<string>();
    await expect(q.drain()).resolves.toBeUndefined();
  });

  it('job.progress updates via onProgress callback', async () => {
    const q = createExportQueue<number>();
    const progressValues: number[] = [];
    // Subscribe BEFORE enqueue so we capture progress notifications from the executor
    const unsub = q.onStatusChange((j) => progressValues.push(j.progress));
    const job = q.enqueue(async (_id, onProgress) => {
      onProgress(0.3);
      onProgress(0.7);
      return 42;
    });
    await q.drain();
    unsub();
    expect(progressValues).toContain(0.3);
    expect(progressValues).toContain(0.7);
    expect(job.progress).toBe(1);
  });

  it('multiple sequential jobs all complete', async () => {
    const q = createExportQueue<number>();
    const results: number[] = [];
    const jobs = [1, 2, 3].map((n) =>
      q.enqueue(async (_id, onProgress) => { onProgress(1); return n; })
    );
    await q.drain();
    jobs.forEach((j) => results.push(j.result!));
    expect(results).toEqual([1, 2, 3]);
  });
});

// ─── 並列制御 ─────────────────────────────────────────────────────────────────

describe('concurrency control', () => {
  it('default concurrency=1: only one job active at a time', async () => {
    const q = createExportQueue<number>({ concurrency: 1 });
    let maxActive = 0;
    const track = async (n: number) => {
      const s = q.stats();
      if (s.active > maxActive) maxActive = s.active;
      await new Promise((r) => setTimeout(r, 5));
      return n;
    };
    q.enqueue(() => track(1));
    q.enqueue(() => track(2));
    q.enqueue(() => track(3));
    await q.drain();
    expect(maxActive).toBe(1);
  });

  it('concurrency=2: up to 2 jobs run simultaneously', async () => {
    const q = createExportQueue<number>({ concurrency: 2 });
    let maxActive = 0;
    const track = async (n: number) => {
      const s = q.stats();
      if (s.active > maxActive) maxActive = s.active;
      await new Promise((r) => setTimeout(r, 10));
      return n;
    };
    [1, 2, 3, 4].forEach((n) => q.enqueue(() => track(n)));
    await q.drain();
    expect(maxActive).toBe(2);
  });
});

// ─── 優先度 ──────────────────────────────────────────────────────────────────

describe('priority ordering', () => {
  it('high priority job starts before normal', async () => {
    // Pause queue, enqueue normal then high, resume — high should go first
    const q = createExportQueue<string>({ concurrency: 1 });
    q.pause();
    const order: string[] = [];
    q.enqueue(async () => { order.push('normal'); return 'normal'; }, { priority: 'normal' });
    q.enqueue(async () => { order.push('high'); return 'high'; }, { priority: 'high' });
    q.resume();
    await q.drain();
    expect(order[0]).toBe('high');
    expect(order[1]).toBe('normal');
  });

  it('normal priority before low', async () => {
    const q = createExportQueue<string>({ concurrency: 1 });
    q.pause();
    const order: string[] = [];
    q.enqueue(async () => { order.push('low'); return 'low'; }, { priority: 'low' });
    q.enqueue(async () => { order.push('normal'); return 'normal'; }, { priority: 'normal' });
    q.resume();
    await q.drain();
    expect(order[0]).toBe('normal');
    expect(order[1]).toBe('low');
  });

  it('same priority: FIFO within priority level', async () => {
    const q = createExportQueue<number>({ concurrency: 1 });
    q.pause();
    const order: number[] = [];
    for (let i = 0; i < 3; i++) {
      const n = i;
      q.enqueue(async () => { order.push(n); return n; }, { priority: 'normal' });
      // Add small delay to ensure different createdAt values
      await new Promise((r) => setTimeout(r, 1));
    }
    q.resume();
    await q.drain();
    expect(order).toEqual([0, 1, 2]);
  });
});

// ─── キャンセル ──────────────────────────────────────────────────────────────

describe('cancel', () => {
  it('cancel(id) of pending job sets status to cancelled', async () => {
    const q = createExportQueue<string>({ concurrency: 1 });
    // Keep the queue busy with a slow job
    q.enqueue(delayedOk('first', 50));
    const job2 = q.enqueue(immediateOk('second'));
    q.cancel(job2.id);
    await q.drain();
    expect(job2.status).toBe('cancelled');
    expect(job2.result).toBeUndefined();
  });

  it('cancel of completed job returns false', async () => {
    const q = createExportQueue<string>();
    const job = q.enqueue(immediateOk('done'));
    await q.drain();
    expect(q.cancel(job.id)).toBe(false);
  });

  it('cancel of non-existent id returns false', () => {
    const q = createExportQueue();
    expect(q.cancel('no-such-id')).toBe(false);
  });

  it('cancelAll cancels all pending jobs', async () => {
    const q = createExportQueue<number>({ concurrency: 1 });
    q.enqueue(delayedOk(1, 50)); // occupies the slot
    const j2 = q.enqueue(immediateOk(2));
    const j3 = q.enqueue(immediateOk(3));
    q.cancelAll();
    await q.drain();
    expect(j2.status).toBe('cancelled');
    expect(j3.status).toBe('cancelled');
  });

  it('active job receives AbortSignal on cancel', async () => {
    const q = createExportQueue<string>();
    let received = false;
    const job = q.enqueue(async (_id, _prog, signal) => {
      await new Promise((r) => setTimeout(r, 100));
      received = signal.aborted;
      return '';
    });
    await new Promise((r) => setTimeout(r, 10)); // let it start
    q.cancel(job.id);
    await new Promise((r) => setTimeout(r, 120)); // let it finish
    expect(received).toBe(true);
  });
});

// ─── 失敗 & リトライ ──────────────────────────────────────────────────────────

describe('failure and retry', () => {
  it('failing job with maxRetries=0 ends up as failed', async () => {
    const q = createExportQueue({ retryDelay: 0 });
    const job = q.enqueue(failingExecutor('boom'));
    await q.drain();
    expect(job.status).toBe('failed');
    expect(job.error).toBe('boom');
    expect(job.retries).toBe(0);
  });

  it('failing job retries up to maxRetries times', async () => {
    const q = createExportQueue({ retryDelay: 5 });
    let calls = 0;
    const job = q.enqueue(async () => {
      calls++;
      throw new Error('fail');
    }, { maxRetries: 2 });

    // Wait longer to allow retries: initial + 2 retries with delays
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toBe(3); // initial + 2 retries
    expect(job.status).toBe('failed');
    expect(job.retries).toBe(2);
  });

  it('job succeeds on retry after initial failures', async () => {
    const q = createExportQueue<string>({ retryDelay: 5 });
    let attempt = 0;
    const job = q.enqueue(async () => {
      attempt++;
      if (attempt < 2) throw new Error('transient');
      return 'ok';
    }, { maxRetries: 2 });

    await new Promise((r) => setTimeout(r, 200));
    expect(job.status).toBe('completed');
    expect(job.result).toBe('ok');
    expect(job.retries).toBe(1);
  });
});

// ─── pause / resume ──────────────────────────────────────────────────────────

describe('pause / resume', () => {
  it('paused queue does not start new jobs', async () => {
    const q = createExportQueue<string>();
    q.pause();
    const job = q.enqueue(immediateOk('hi'));
    await new Promise((r) => setTimeout(r, 20));
    expect(job.status).toBe('pending');
    q.resume();
    await q.drain();
    expect(job.status).toBe('completed');
  });

  it('resume picks up multiple pending jobs', async () => {
    const q = createExportQueue<number>({ concurrency: 2 });
    q.pause();
    const jobs = [1, 2, 3].map((n) => q.enqueue(immediateOk(n)));
    q.resume();
    await q.drain();
    jobs.forEach((j) => expect(j.status).toBe('completed'));
  });
});

// ─── stats ───────────────────────────────────────────────────────────────────

describe('stats', () => {
  it('returns correct counts before and after drain', async () => {
    const q = createExportQueue<number>({ concurrency: 1 });
    q.pause();
    q.enqueue(immediateOk(1));
    q.enqueue(immediateOk(2));
    const before = q.stats();
    expect(before.pending).toBe(2);
    expect(before.active).toBe(0);
    q.resume();
    await q.drain();
    const after = q.stats();
    expect(after.pending).toBe(0);
    expect(after.active).toBe(0);
    expect(after.completed).toBe(2);
  });

  it('cancelled jobs appear in stats', async () => {
    const q = createExportQueue<string>({ concurrency: 1 });
    q.enqueue(delayedOk('first', 50));
    const j2 = q.enqueue(immediateOk('second'));
    q.cancel(j2.id);
    await q.drain();
    const s = q.stats();
    expect(s.cancelled).toBe(1);
  });
});

// ─── clearCompleted / getAllJobs ──────────────────────────────────────────────

describe('clearCompleted / getAllJobs', () => {
  it('clearCompleted removes completed/failed/cancelled jobs', async () => {
    const q = createExportQueue<number>();
    q.enqueue(immediateOk(1));
    q.enqueue(failingExecutor());
    await q.drain();
    expect(q.getAllJobs().length).toBe(2);
    q.clearCompleted();
    expect(q.getAllJobs().length).toBe(0);
  });

  it('getAllJobs returns all jobs', async () => {
    const q = createExportQueue<number>({ concurrency: 1 });
    q.enqueue(immediateOk(1));
    q.enqueue(immediateOk(2));
    await q.drain();
    expect(q.getAllJobs().length).toBe(2);
  });
});

// ─── onStatusChange ──────────────────────────────────────────────────────────

describe('onStatusChange', () => {
  it('fires on status transitions', async () => {
    const q = createExportQueue<string>();
    const statuses: string[] = [];
    const unsub = q.onStatusChange((j) => statuses.push(j.status));
    q.enqueue(immediateOk('x'));
    await q.drain();
    unsub();
    expect(statuses).toContain('pending');
    expect(statuses).toContain('active');
    expect(statuses).toContain('completed');
  });

  it('unsubscribe stops receiving events', async () => {
    const q = createExportQueue<string>();
    let count = 0;
    const unsub = q.onStatusChange(() => count++);
    unsub(); // unsubscribe before any event
    q.enqueue(immediateOk('x'));
    await q.drain();
    expect(count).toBe(0);
  });
});

// ─── meta / options ──────────────────────────────────────────────────────────

describe('meta and options', () => {
  it('meta is stored on job', () => {
    const q = createExportQueue();
    const job = q.enqueue(immediateOk(undefined), { meta: { title: 'My Video', fps: 30 } });
    expect(job.meta?.title).toBe('My Video');
    expect(job.meta?.fps).toBe(30);
  });

  it('job.completedAt is set after completion', async () => {
    const q = createExportQueue();
    const before = Date.now();
    const job = q.enqueue(immediateOk(undefined));
    await q.drain();
    expect(job.completedAt).toBeDefined();
    expect(job.completedAt!).toBeGreaterThanOrEqual(before);
  });

  it('job.startedAt is set when job becomes active', async () => {
    const q = createExportQueue();
    const job = q.enqueue(immediateOk(undefined));
    await q.drain();
    expect(job.startedAt).toBeDefined();
  });
});

// ─── retry + cancel interaction ──────────────────────────────────────────────

describe('REGRESSION: cancel during retry delay does not resurrect the job', () => {
  it('job cancelled while waiting for retry delay stays cancelled', async () => {
    // Bug: scheduleRetry's setTimeout callback called pending.push(job) even if
    // cancel() had set job.status='cancelled' during the delay.  The job was
    // then re-started ("resurrected") by tick(), making cancel() useless for
    // retrying jobs.
    const q = createExportQueue({ retryDelay: 50 });
    let attempts = 0;
    const job = q.enqueue(async () => {
      attempts++;
      throw new Error('always fail');
    }, { maxRetries: 3 });

    // Wait for the first failure and the status to flip to 'pending' (retry limbo).
    await new Promise((r) => setTimeout(r, 10));
    expect(attempts).toBe(1);
    expect(job.status).toBe('pending'); // pending while awaiting retry delay

    // Cancel during the retry delay — this must stick.
    const cancelled = q.cancel(job.id);
    expect(cancelled).toBe(true);
    expect(job.status).toBe('cancelled');

    // Wait well past the retry delay to ensure the setTimeout fires.
    await new Promise((r) => setTimeout(r, 200));

    // After the fix: status stays cancelled and no further attempts run.
    expect(job.status).toBe('cancelled');
    expect(attempts).toBe(1); // no resurrection
  });
});
