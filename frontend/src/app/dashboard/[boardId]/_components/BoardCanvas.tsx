'use client';

import { Tldraw, type Editor, type TLStoreSnapshot } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { useParams } from 'next/navigation';

const DEBOUNCE_MS = 500;
const MAX_WAIT_MS = 5_000;

interface Props {
  initialSnapshot: TLStoreSnapshot | null;
}

export default function BoardCanvas({ initialSnapshot }: Props) {
  const { boardId } = useParams();

  function handleMount(editor: Editor) {
    if (initialSnapshot) {
      editor.loadSnapshot(initialSnapshot);
    }

    const upsertMap = new Map<string, unknown>();
    const removeSet = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: AbortController | null = null;

    const flush = (onUnload = false) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (maxWaitTimer) clearTimeout(maxWaitTimer);
      debounceTimer = null;
      maxWaitTimer = null;

      if (upsertMap.size === 0 && removeSet.size === 0) return;

      const upsert = [...upsertMap.values()];
      const remove = [...removeSet];
      upsertMap.clear();
      removeSet.clear();

      inFlight?.abort();
      const controller = onUnload ? null : new AbortController();
      inFlight = controller;

      fetch(`/api/boards/${boardId}/records`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: editor.store.schema.serialize(), upsert, remove }),
        keepalive: onUnload,
        signal: controller?.signal,
      }).catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
      });
    };

    const schedule = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => flush(), DEBOUNCE_MS);
      if (!maxWaitTimer) maxWaitTimer = setTimeout(() => flush(), MAX_WAIT_MS);
    };

    const unsubscribe = editor.store.listen(
      ({ changes }) => {
        for (const record of Object.values(changes.added)) {
          upsertMap.set(record.id, record);
        }
        for (const [, next] of Object.values(changes.updated)) {
          upsertMap.set(next.id, next);
        }
        for (const id of Object.keys(changes.removed)) {
          upsertMap.delete(id);
          removeSet.add(id);
        }
        schedule();
      },
      { source: 'user', scope: 'document' },
    );

    const flushOnUnload = () => flush(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushOnUnload();
    };

    window.addEventListener('pagehide', flushOnUnload);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', flushOnUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      flushOnUnload();
    };
  }

  return (
    <div style={{ position: 'fixed', inset: 0, top: 56 }}>
      <Tldraw onMount={handleMount} />
    </div>
  );
}
