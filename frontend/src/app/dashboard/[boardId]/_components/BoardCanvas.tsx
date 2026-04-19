'use client';

import { useRef } from 'react';
import { Tldraw, type Editor, type TLEditorSnapshot } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { useParams } from 'next/navigation';

const DB_SYNC_INTERVAL = 30_000;

interface Props {
  initialSnapshot: TLEditorSnapshot | null;
}

export default function BoardCanvas({ initialSnapshot }: Props) {
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { boardId } = useParams();

  function syncToDb(editor: Editor) {
    const snapshot = editor.getSnapshot();
    fetch(`/api/boards/${boardId}/snapshot`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
  }

  function handleMount(editor: Editor) {
    const unsubscribe = editor.store.listen(
      () => {
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(() => syncToDb(editor), DB_SYNC_INTERVAL);
      },
      { source: 'user', scope: 'document' },
    );

    function handleBeforeUnload() {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncToDb(editor);
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }

  return (
    <div style={{ position: 'fixed', inset: 0, top: 56 }}>
      <Tldraw
        persistenceKey={String(boardId)}
        snapshot={initialSnapshot ?? undefined}
        onMount={handleMount}
      />
    </div>
  );
}
