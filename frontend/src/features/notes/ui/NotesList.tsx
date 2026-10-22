'use client';

import { useState } from 'react';
import type * as Y from 'yjs';
import type { LiveblocksYjsProvider } from '@liveblocks/yjs';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Skeleton from '@mui/material/Skeleton';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { NoteColor, useNotesStore, type BoardNote } from '@/shared/store/notesStore';
import type { NoteFields } from '../api/notesApi';
import { clearNoteContent } from '../hooks/useNotesDoc';
import NoteCard from './NoteCard';

const SHORTCUTS = [
  ['#', 'Heading'],
  ['-', 'List'],
  ['[ ]', 'Checklist'],
  ['**text**', 'Bold'],
] as const;

interface Props {
  doc: Y.Doc;
  provider: LiveblocksYjsProvider;
  docReady: boolean;
  caretUser: { name: string; color: string };
  loadFailed: boolean;
  onRetryLoad: () => void;
  onClose: () => void;
  createNote: (noteId: string, fields: NoteFields) => Promise<BoardNote>;
  updateNote: (noteId: string, patch: Partial<NoteFields>) => Promise<BoardNote>;
  deleteNote: (noteId: string) => Promise<void>;
}

function matches(note: BoardNote, query: string): boolean {
  return note.body.toLowerCase().includes(query.trim().toLowerCase());
}

// A fresh composer: an empty note slot at the top of the list, created on
// the server once something is typed into it.
function newDraft(focusAfterOpen: number) {
  return { id: crypto.randomUUID(), focusAfterOpen };
}

export default function NotesList({
  doc,
  provider,
  docReady,
  caretUser,
  loadFailed,
  onRetryLoad,
  onClose,
  createNote,
  updateNote,
  deleteNote,
}: Props) {
  const notes = useNotesStore((s) => s.notes);
  const loaded = useNotesStore((s) => s.loaded);
  const [query, setQuery] = useState('');
  // The first composer takes focus on every drawer open (0); later ones only
  // after the drawer is reopened.
  const [draft, setDraft] = useState(() => newDraft(0));
  const [draftColor, setDraftColor] = useState(NoteColor.YELLOW);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  const searching = query.trim() !== '';
  const draftNote = notes.find((n) => n.id === draft.id);
  // One keyed list, composer first, so the composer keeps its editor when it
  // turns into a regular note.
  const items: Array<{ id: string; note: BoardNote | undefined }> = searching
    ? notes.filter((n) => matches(n, query)).map((n) => ({ id: n.id, note: n }))
    : [{ id: draft.id, note: draftNote }, ...notes.filter((n) => n.id !== draft.id).map((n) => ({ id: n.id, note: n }))];

  function rotateDraft() {
    setDraft(newDraft(useNotesStore.getState().openCount));
  }

  function handleDelete(noteId: string) {
    void deleteNote(noteId);
    clearNoteContent(doc, noteId);
    if (noteId === draft.id) rotateDraft();
  }

  function handleLeave(noteId: string, isEmpty: boolean) {
    const exists = useNotesStore.getState().notes.some((n) => n.id === noteId);
    if (!exists) return;
    // A note left empty is removed; a composer that became a note makes room
    // for a new composer.
    if (isEmpty) handleDelete(noteId);
    else if (noteId === draft.id) rotateDraft();
  }

  function handleColorChange(noteId: string, color: NoteColor) {
    if (noteId === draft.id) setDraftColor(color);
    if (notes.some((n) => n.id === noteId)) void updateNote(noteId, { color }).catch(() => {});
  }

  return (
    <>
      <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1, letterSpacing: '-0.3px' }}>
            Notes
          </Typography>
          <IconButton size="small" edge="end" aria-label="Close notes" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Shared with everyone on this board
        </Typography>

        {notes.length > 0 && (
          <TextField
            size="small"
            fullWidth
            placeholder="Search notes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            sx={{ mt: 2 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: query && (
                  <InputAdornment position="end">
                    <IconButton size="small" edge="end" aria-label="Clear search" onClick={() => setQuery('')}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
                sx: { bgcolor: 'background.default', borderRadius: 2.5 },
              },
            }}
          />
        )}
      </Box>

      <Box ref={setScrollEl} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2.5, pt: 2, pb: 2.5 }}>
        {!loaded && loadFailed && (
          <Stack alignItems="center" textAlign="center" spacing={1} sx={{ pt: 6 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              Couldn’t load notes
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Check your connection and try again.
            </Typography>
            <Button size="small" onClick={onRetryLoad}>
              Retry
            </Button>
          </Stack>
        )}

        {(!loaded || !docReady) && !loadFailed && (
          <Stack spacing={1.5}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={88} sx={{ borderRadius: 1.5 }} />
            ))}
          </Stack>
        )}

        {loaded && docReady && (
          <Stack spacing={2}>
            {items.map(({ id, note }) => (
              <NoteCard
                key={id}
                noteId={id}
                note={note}
                color={note?.color ?? draftColor}
                doc={doc}
                provider={provider}
                caretUser={caretUser}
                scrollTarget={scrollEl}
                focusAfterOpen={id === draft.id ? draft.focusAfterOpen : undefined}
                createNote={createNote}
                updateNote={updateNote}
                onColorChange={(color) => handleColorChange(id, color)}
                onDelete={() => handleDelete(id)}
                onLeave={(isEmpty) => handleLeave(id, isEmpty)}
              />
            ))}

            {searching && items.length === 0 && (
              <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ pt: 4 }}>
                No notes match “{query.trim()}”
              </Typography>
            )}

            {!searching && notes.length === 0 && (
              <Stack spacing={1} sx={{ px: 0.5, pt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Just start typing. Shortcuts:
                </Typography>
                <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
                  {SHORTCUTS.map(([keys, label]) => (
                    <Box
                      key={label}
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        bgcolor: 'background.default',
                        border: '1px solid',
                        borderColor: 'divider',
                        fontSize: 12,
                        color: 'text.secondary',
                      }}
                    >
                      <Box component="code" sx={{ fontFamily: 'ui-monospace, Menlo, monospace', color: 'text.primary' }}>
                        {keys}
                      </Box>{' '}
                      {label}
                    </Box>
                  ))}
                </Stack>
              </Stack>
            )}
          </Stack>
        )}
      </Box>
    </>
  );
}
