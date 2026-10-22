import '@/shared/lib/liveblocks.config';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBroadcastEvent, useRoom } from '@liveblocks/react/suspense';
import { useNotesStore, type BoardNote } from '@/shared/store/notesStore';
import { useUserStore } from '@/shared/store/userStore';
import * as notesApi from '../api/notesApi';

// Another member's change arrives as a bare `notes-changed` event; a burst of
// them (someone typing) collapses into a single re-fetch.
const REFETCH_DELAY_MS = 300;
const MAX_FETCH_ATTEMPTS = 3;

// Loads the board's note list (metadata + plain-text copies) into the notes
// store and keeps it in sync. Local changes are applied optimistically, sent
// to the API and announced to the room via Liveblocks; events from other
// members trigger a re-fetch. The notes' rich text is synced separately
// (useNotesDoc).
export function useBoardNotes(boardId: string) {
  const room = useRoom();
  const broadcast = useBroadcastEvent();
  const user = useUserStore((s) => s.user);
  const open = useNotesStore((s) => s.open);
  const init = useNotesStore((s) => s.init);
  const reset = useNotesStore((s) => s.reset);
  const setNotes = useNotesStore((s) => s.setNotes);
  const upsertNote = useNotesStore((s) => s.upsertNote);
  const removeNote = useNotesStore((s) => s.removeNote);

  // Bumped before and after every local mutation: a list fetched while one was
  // in flight may predate it and would briefly revert or drop that note.
  const mutationVersion = useRef(0);
  const fetchSeq = useRef(0);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    const seq = ++fetchSeq.current;
    try {
      for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
        const version = mutationVersion.current;
        const notes = await notesApi.fetchNotes(boardId);
        if (seq !== fetchSeq.current) return; // superseded by a newer load
        if (version === mutationVersion.current) {
          setNotes(boardId, notes);
          setLoadFailed(false);
          return;
        }
      }
    } catch {
      // Keep the current list; the next event or reopening the drawer retries.
      if (seq === fetchSeq.current) setLoadFailed(true);
    }
  }, [boardId, setNotes]);

  useEffect(() => {
    init(boardId);
    void load();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = room.subscribe('event', ({ event }) => {
      if (event.type !== 'notes-changed') return;
      clearTimeout(timer);
      timer = setTimeout(() => void load(), REFETCH_DELAY_MS);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
      reset();
    };
  }, [boardId, room, load, init, reset]);

  // Re-sync whenever the drawer is opened, in case an event was missed.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const notifyOthers = useCallback(() => broadcast({ type: 'notes-changed' }), [broadcast]);

  // Runs a mutation with the store updated optimistically; the server's
  // version replaces the optimistic one when it arrives. On failure the store
  // goes back to `previous` (none — the note is dropped).
  const mutate = useCallback(
    async (
      optimistic: BoardNote,
      previous: BoardNote | undefined,
      request: () => Promise<BoardNote>,
    ) => {
      mutationVersion.current++;
      upsertNote(boardId, optimistic);
      try {
        const note = await request();
        upsertNote(boardId, note);
        notifyOthers();
        return note;
      } catch (err) {
        // A 404 means another member deleted the note in the meantime.
        const gone = err instanceof notesApi.NotesApiError && err.status === 404;
        if (previous && !gone) upsertNote(boardId, previous);
        else removeNote(boardId, optimistic.id);
        throw err;
      } finally {
        mutationVersion.current++;
      }
    },
    [boardId, upsertNote, removeNote, notifyOthers],
  );

  const createNote = useCallback(
    (noteId: string, fields: notesApi.NoteFields) => {
      const now = new Date().toISOString();
      const me = user?.id ? { id: user.id, name: user.name ?? user.email ?? null, image: user.image ?? null } : null;
      const optimistic: BoardNote = {
        id: noteId,
        ...fields,
        createdAt: now,
        updatedAt: now,
        createdBy: me,
        updatedBy: me,
      };
      return mutate(optimistic, undefined, () => notesApi.createNote(boardId, noteId, fields));
    },
    [boardId, user, mutate],
  );

  const updateNote = useCallback(
    (noteId: string, patch: Partial<notesApi.NoteFields>) => {
      const current = useNotesStore.getState().notes.find((n) => n.id === noteId);
      if (!current) return Promise.reject(new notesApi.NotesApiError(404));
      return mutate({ ...current, ...patch }, current, () => notesApi.updateNote(boardId, noteId, patch));
    },
    [boardId, mutate],
  );

  // Optimistic: the note disappears at once and is restored from the server
  // if the request fails.
  const deleteNote = useCallback(
    async (noteId: string) => {
      mutationVersion.current++;
      removeNote(boardId, noteId);
      let ok = true;
      try {
        await notesApi.deleteNote(boardId, noteId);
      } catch {
        ok = false;
      }
      mutationVersion.current++;
      if (ok) notifyOthers();
      else void load();
    },
    [boardId, removeNote, notifyOthers, load],
  );

  return { loadFailed, reload: load, createNote, updateNote, deleteNote };
}
