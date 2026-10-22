import { create } from 'zustand';

export enum NoteColor {
  YELLOW = 'yellow',
  GREEN = 'green',
  BLUE = 'blue',
  PURPLE = 'purple',
  PINK = 'pink',
  ORANGE = 'orange',
}

export interface NoteUser {
  id: string;
  name: string | null;
  image: string | null;
}

export interface BoardNote {
  id: string;
  /** Plain-text copy of the note's rich text (which lives in the notes Yjs doc). */
  body: string;
  color: NoteColor;
  createdAt: string;
  updatedAt: string;
  createdBy: NoteUser | null;
  updatedBy: NoteUser | null;
}

interface NotesState {
  /** Board whose notes are loaded; writes for any other board are ignored. */
  boardId: string | null;
  /** Whether the notes drawer is open (toggled from the board header). */
  open: boolean;
  /** How many times the drawer has been opened — lets the composer take focus on open. */
  openCount: number;
  /** Newest first; creation order keeps cards in place while they are edited. */
  notes: BoardNote[];
  loaded: boolean;
  init: (boardId: string) => void;
  reset: () => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setNotes: (boardId: string, notes: BoardNote[]) => void;
  upsertNote: (boardId: string, note: BoardNote) => void;
  removeNote: (boardId: string, id: string) => void;
}

const byCreatedDesc = (a: BoardNote, b: BoardNote) => b.createdAt.localeCompare(a.createdAt);

export const useNotesStore = create<NotesState>((set) => ({
  boardId: null,
  open: false,
  openCount: 0,
  notes: [],
  loaded: false,
  init: (boardId) => set({ boardId, notes: [], loaded: false }),
  reset: () => set({ boardId: null, open: false, notes: [], loaded: false }),
  setOpen: (open) => set((s) => (open && !s.open ? { open, openCount: s.openCount + 1 } : { open })),
  toggleOpen: () => set((s) => (s.open ? { open: false } : { open: true, openCount: s.openCount + 1 })),
  setNotes: (boardId, notes) =>
    set((s) => (s.boardId === boardId ? { notes: [...notes].sort(byCreatedDesc), loaded: true } : s)),
  upsertNote: (boardId, note) =>
    set((s) =>
      s.boardId === boardId
        ? { notes: [note, ...s.notes.filter((n) => n.id !== note.id)].sort(byCreatedDesc) }
        : s,
    ),
  removeNote: (boardId, id) =>
    set((s) => (s.boardId === boardId ? { notes: s.notes.filter((n) => n.id !== id) } : s)),
}));
