import '@/shared/lib/liveblocks.config';
import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { useRoom } from '@liveblocks/react/suspense';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
import { fetchNotesDoc } from '../api/notesApi';
import { createNotesDocSync } from '../lib/notesDocSync';

// Origin the Liveblocks provider gives updates received from the room — they
// were saved by the member who made them.
const ROOM_ORIGIN = 'backend';
// Origin of the DB copy merged in on load; not saved back.
const DB_ORIGIN = 'notes-db';

export function noteFragmentName(noteId: string): string {
  return `note-${noteId}`;
}

// The board's notes document: one Yjs doc shared through the board's
// Liveblocks room, a fragment per note. Local edits are saved to our DB; once
// the live doc has loaded, the DB copy is merged in (fills a cold room) and
// whatever the live doc has that the copy lacks is saved (edits that never
// reached the DB). `ready` turns true after that first merge.
export function useNotesDoc(boardId: string) {
  const room = useRoom();
  const provider = useMemo(() => getYjsProviderForRoom(room), [room]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const doc = provider.getYDoc();
    const sync = createNotesDocSync(boardId);
    let cancelled = false;
    let hydrated = false;

    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin !== ROOM_ORIGIN && origin !== DB_ORIGIN) sync.enqueue(update);
    };
    doc.on('update', onUpdate);

    async function hydrate() {
      if (hydrated) return;
      hydrated = true;
      try {
        const stored = await fetchNotesDoc(boardId);
        if (cancelled) return;
        Y.applyUpdate(doc, stored, DB_ORIGIN);
        sync.enqueue(Y.encodeStateAsUpdate(doc, Y.encodeStateVectorFromUpdate(stored)));
      } catch (err) {
        // Notes still work live through Liveblocks; local edits keep saving.
        console.error('Notes DB load failed:', err);
      }
      if (!cancelled) setReady(true);
    }

    const onSynced = (synced: boolean) => {
      if (synced) void hydrate();
    };
    provider.on('synced', onSynced);
    if (provider.synced) void hydrate();

    // Flush pending edits when the tab is hidden so nothing is lost on close.
    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') void sync.flush();
    };
    document.addEventListener('visibilitychange', flushOnHide);

    return () => {
      cancelled = true;
      provider.off('synced', onSynced);
      doc.off('update', onUpdate);
      document.removeEventListener('visibilitychange', flushOnHide);
      sync.stop();
    };
  }, [boardId, provider]);

  return { provider, doc: provider.getYDoc(), ready };
}

// Empties a deleted note's fragment so its text doesn't linger in the doc.
export function clearNoteContent(doc: Y.Doc, noteId: string): void {
  const fragment = doc.getXmlFragment(noteFragmentName(noteId));
  if (fragment.length > 0) fragment.delete(0, fragment.length);
}
