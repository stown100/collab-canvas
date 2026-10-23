import type { TLRecord, TLStore, TLStoreEventInfo } from '@tldraw/tldraw';

// Mirrors local tldraw document changes into the app's own database via the
// Next.js proxy (which forwards to the Express backend). Liveblocks stays the
// realtime layer; this is the durable copy. A burst of edits is batched and
// flushed on an interval so it collapses into a single request, one request at
// a time. Failed or stalled flushes retry with exponential backoff, so a down
// backend isn't hammered while the board keeps working through Liveblocks.
const FLUSH_INTERVAL_MS = 1500;
const MAX_BACKOFF_MS = 30000;
// A save with no answer by then counts as failed and is retried, so a stalled
// connection can't hold edits back indefinitely.
const REQUEST_TIMEOUT_MS = 20000;
// Browsers cap `keepalive` request bodies at 64 KB in flight; it's only used for
// the last-chance flush of a hidden tab, and only for batches under the cap.
const KEEPALIVE_MAX_BYTES = 60 * 1024;

type StoreChanges = TLStoreEventInfo['changes'];

export interface BoardRecordsSync {
  enqueue: (changes: StoreChanges) => void;
  enqueueDiff: (upsert: TLRecord[], remove: string[]) => void;
  flush: () => Promise<void>;
  stop: () => void;
}

export function createBoardRecordsSync(boardId: string, store: TLStore): BoardRecordsSync {
  const pendingUpsert = new Map<string, TLRecord>();
  const pendingRemove = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let failureCount = 0;

  function scheduleFlush(delayMs: number = FLUSH_INTERVAL_MS): void {
    if (timer === null) timer = setTimeout(() => void flush(), delayMs);
  }

  async function flush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const hasPending = pendingUpsert.size > 0 || pendingRemove.size > 0;
    // One save at a time; edits made meanwhile go out with the next one.
    if (inFlight) {
      if (hasPending) scheduleFlush();
      return inFlight;
    }
    if (!hasPending) return;

    inFlight = send().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  async function send(): Promise<void> {
    const upsert = [...pendingUpsert.values()];
    const remove = [...pendingRemove];
    pendingUpsert.clear();
    pendingRemove.clear();

    const body = JSON.stringify({ schema: store.schema.serialize(), upsert, remove });
    const keepalive =
      document.visibilityState === 'hidden' &&
      new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BYTES;

    try {
      const res = await fetch(`/api/boards/${boardId}/records`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Records save failed: ${res.status}`);
      failureCount = 0;
    } catch {
      // Re-queue so nothing is lost, without clobbering newer pending edits.
      for (const r of upsert) {
        if (!pendingUpsert.has(r.id) && !pendingRemove.has(r.id)) pendingUpsert.set(r.id, r);
      }
      for (const id of remove) {
        if (!pendingUpsert.has(id)) pendingRemove.add(id);
      }
      // Exponential backoff (1.5s, 3s, 6s … capped); reset on the next success.
      // Replaces a regular flush queued while this request was in flight.
      failureCount += 1;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      scheduleFlush(Math.min(FLUSH_INTERVAL_MS * 2 ** (failureCount - 1), MAX_BACKOFF_MS));
    }
  }

  // Queues an explicit set of records to write and ids to delete — e.g. the
  // result of reconciling the DB copy with the live board.
  function enqueueDiff(upsert: TLRecord[], remove: string[]): void {
    if (upsert.length === 0 && remove.length === 0) return;
    for (const r of upsert) {
      pendingRemove.delete(r.id);
      pendingUpsert.set(r.id, r);
    }
    for (const id of remove) {
      pendingUpsert.delete(id);
      pendingRemove.add(id);
    }
    scheduleFlush();
  }

  function enqueue(changes: StoreChanges): void {
    enqueueDiff(
      [...Object.values(changes.added), ...Object.values(changes.updated).map(([, r]) => r)],
      Object.values(changes.removed).map(r => r.id),
    );
  }

  function stop(): void {
    void flush();
  }

  return { enqueue, enqueueDiff, flush, stop };
}
