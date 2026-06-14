import type { TLRecord, TLStore, TLStoreEventInfo } from '@tldraw/tldraw';

// Mirrors local tldraw document changes into the app's own database via the
// Next.js proxy (which forwards to the Express backend). Liveblocks stays the
// realtime layer; this is the durable copy. A burst of edits is batched and
// flushed on an interval so it collapses into a single request. Failed flushes
// retry with exponential backoff, so a down backend isn't hammered while the
// board keeps working through Liveblocks.
const FLUSH_INTERVAL_MS = 1500;
const MAX_BACKOFF_MS = 30000;

type StoreChanges = TLStoreEventInfo['changes'];

export interface BoardRecordsSync {
  enqueue: (changes: StoreChanges) => void;
  flush: () => Promise<void>;
  stop: () => void;
}

export function createBoardRecordsSync(boardId: string, store: TLStore): BoardRecordsSync {
  const pendingUpsert = new Map<string, TLRecord>();
  const pendingRemove = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failureCount = 0;

  function scheduleFlush(delayMs: number = FLUSH_INTERVAL_MS): void {
    if (timer === null) timer = setTimeout(() => void flush(), delayMs);
  }

  async function flush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingUpsert.size === 0 && pendingRemove.size === 0) return;

    const upsert = [...pendingUpsert.values()];
    const remove = [...pendingRemove];
    pendingUpsert.clear();
    pendingRemove.clear();

    try {
      const res = await fetch(`/api/boards/${boardId}/records`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: store.schema.serialize(), upsert, remove }),
        keepalive: true,
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
      failureCount += 1;
      scheduleFlush(Math.min(FLUSH_INTERVAL_MS * 2 ** (failureCount - 1), MAX_BACKOFF_MS));
    }
  }

  function enqueue(changes: StoreChanges): void {
    for (const r of Object.values(changes.added)) {
      pendingRemove.delete(r.id);
      pendingUpsert.set(r.id, r);
    }
    for (const [, r] of Object.values(changes.updated)) {
      pendingRemove.delete(r.id);
      pendingUpsert.set(r.id, r);
    }
    for (const r of Object.values(changes.removed)) {
      pendingUpsert.delete(r.id);
      pendingRemove.add(r.id);
    }
    scheduleFlush();
  }

  function stop(): void {
    void flush();
  }

  return { enqueue, flush, stop };
}
