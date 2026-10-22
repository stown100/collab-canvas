import * as Y from 'yjs';
import { pushNotesDocUpdate } from '../api/notesApi';

// Mirrors local edits of the notes Yjs document into our DB. Liveblocks stays
// the realtime layer; this is the durable copy. Updates are batched into one
// request per interval (Yjs merges them), failed flushes retry with
// exponential backoff. The server merges every update into the stored state,
// so flushes from different members never overwrite each other.
const FLUSH_INTERVAL_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export interface NotesDocSync {
  enqueue: (update: Uint8Array) => void;
  flush: () => Promise<void>;
  stop: () => void;
}

// An update with no structs and an empty delete set encodes as [0, 0].
const isEmptyUpdate = (update: Uint8Array) => update.byteLength <= 2;

export function createNotesDocSync(boardId: string): NotesDocSync {
  let pending: Uint8Array[] = [];
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
    if (pending.length === 0) return;

    const update = Y.mergeUpdates(pending);
    pending = [];

    try {
      await pushNotesDocUpdate(boardId, update);
      failureCount = 0;
    } catch {
      // Re-queue so nothing is lost; order doesn't matter for Yjs updates.
      pending.unshift(update);
      failureCount += 1;
      scheduleFlush(Math.min(FLUSH_INTERVAL_MS * 2 ** (failureCount - 1), MAX_BACKOFF_MS));
    }
  }

  function enqueue(update: Uint8Array): void {
    if (isEmptyUpdate(update)) return;
    pending.push(update);
    scheduleFlush();
  }

  function stop(): void {
    void flush();
  }

  return { enqueue, flush, stop };
}
