'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useSelf } from '@liveblocks/react/suspense';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Toolbar from '@mui/material/Toolbar';
import { useNotesStore } from '@/shared/store/notesStore';
import { useBoardNotes } from '../hooks/useBoardNotes';
import { useNotesDoc } from '../hooks/useNotesDoc';
import NotesList from './NotesList';

const DRAWER_WIDTH = 400;

interface Props {
  boardId: string;
}

// Side panel with the board's shared notes. Non-modal, like Miro's panels:
// the canvas stays interactive while it is open. Must be rendered inside the
// board's Liveblocks room (realtime list updates and collaborative editing).
export default function NotesDrawer({ boardId }: Props) {
  const open = useNotesStore((s) => s.open);
  const setOpen = useNotesStore((s) => s.setOpen);
  const { loadFailed, reload, createNote, updateNote, deleteNote } = useBoardNotes(boardId);
  const { doc, provider, ready } = useNotesDoc(boardId);
  // Same name and color as this user's cursor on the canvas.
  const info = useSelf((me) => me.info);
  const caretUser = useMemo(
    () => ({ name: info?.name ?? 'Anonymous', color: info?.color ?? '#4F46E5' }),
    [info?.name, info?.color],
  );
  const contentRef = useRef<HTMLDivElement>(null);

  // A closed (hidden) panel must not keep focus — typing would land in a
  // note instead of the canvas.
  useEffect(() => {
    const active = document.activeElement;
    if (!open && active instanceof HTMLElement && contentRef.current?.contains(active)) active.blur();
  }, [open]);

  return (
    <Drawer
      variant="persistent"
      anchor="right"
      open={open}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: DRAWER_WIDTH },
            boxShadow: '-12px 0 32px rgba(15, 23, 42, 0.08)',
          },
        },
      }}
    >
      {/* Spacer: the panel sits below the fixed board header. */}
      <Toolbar />
      <Box ref={contentRef} sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <NotesList
          doc={doc}
          provider={provider}
          docReady={ready}
          caretUser={caretUser}
          loadFailed={loadFailed}
          onRetryLoad={() => void reload()}
          onClose={() => setOpen(false)}
          createNote={createNote}
          updateNote={updateNote}
          deleteNote={deleteNote}
        />
      </Box>
    </Drawer>
  );
}
