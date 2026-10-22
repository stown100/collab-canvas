'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { LiveblocksYjsProvider } from '@liveblocks/yjs';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { Collaboration } from '@tiptap/extension-collaboration';
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useNotesStore, type BoardNote, type NoteColor } from '@/shared/store/notesStore';
import type { NoteFields } from '../api/notesApi';
import { noteFragmentName } from '../hooks/useNotesDoc';
import { NOTE_PALETTE } from '../lib/notePalette';
import { formatNoteTime } from '../lib/formatNoteTime';
import { noteContentSx } from './noteContentSx';
import NoteFormatMenu from './NoteFormatMenu';
import NoteColorPopover from './NoteColorPopover';
import DeleteNotePopover from './DeleteNotePopover';

// The plain-text copy of a note (for search) is saved this long after the
// last local edit; the rich text itself syncs live through Yjs.
const BODY_SYNC_DELAY_MS = 1000;
const MAX_BODY_LENGTH = 100000;

interface Props {
  noteId: string;
  /** undefined — the composer: the note is created once something is typed. */
  note: BoardNote | undefined;
  color: NoteColor;
  doc: Y.Doc;
  provider: LiveblocksYjsProvider;
  /** Name and color shown on this user's caret to other members. */
  caretUser: { name: string; color: string };
  scrollTarget: HTMLElement | null;
  /** Composer only: take focus when the drawer is opened after this open count. */
  focusAfterOpen?: number;
  createNote: (noteId: string, fields: NoteFields) => Promise<BoardNote>;
  updateNote: (noteId: string, patch: Partial<NoteFields>) => Promise<BoardNote>;
  onColorChange: (color: NoteColor) => void;
  onDelete: () => void;
  /** Focus left the card. */
  onLeave: (isEmpty: boolean) => void;
}

// A note, editable in place. Its rich text is a fragment of the board's notes
// Yjs doc, so members edit it together live (with each other's carets).
export default function NoteCard({
  noteId,
  note,
  color,
  doc,
  provider,
  caretUser,
  scrollTarget,
  focusAfterOpen,
  createNote,
  updateNote,
  onColorChange,
  onDelete,
  onLeave,
}: Props) {
  const open = useNotesStore((s) => s.open);
  const openCount = useNotesStore((s) => s.openCount);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [deleteAnchor, setDeleteAnchor] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Settles once the note exists on the server; null — not created yet.
  const created = useRef<Promise<unknown> | null>(note ? Promise.resolve() : null);
  const focusedForOpen = useRef(0);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        // Undo/redo comes from Collaboration (Yjs), per user.
        StarterKit.configure({ undoRedo: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder: 'Write a note…' }),
        Collaboration.configure({ document: doc, field: noteFragmentName(noteId) }),
        CollaborationCaret.configure({ provider, user: caretUser }),
      ],
      editorProps: { attributes: { 'aria-label': 'Note' } },
    },
    [noteId, doc, provider],
  );

  // Local edits: the first one creates the note; later ones refresh its
  // plain-text copy. Remote edits (other members, the DB copy) are skipped.
  useEffect(() => {
    if (!editor) return;
    const fragment = doc.getXmlFragment(noteFragmentName(noteId));
    let timer: ReturnType<typeof setTimeout> | undefined;

    const currentText = () => editor.getText({ blockSeparator: '\n' }).slice(0, MAX_BODY_LENGTH);

    const syncBody = () => {
      timer = undefined;
      const pendingCreate = created.current;
      if (!pendingCreate) return;
      const body = currentText();
      void pendingCreate.then(() => updateNote(noteId, { body })).catch(() => {});
    };

    const onChange = (_events: unknown, transaction: Y.Transaction) => {
      if (!transaction.local) return;
      if (!created.current) {
        const body = currentText();
        if (!body.trim()) return;
        const creating = createNote(noteId, { body, color }).catch((err) => {
          created.current = null; // retried on the next edit
          throw err;
        });
        creating.catch(() => {});
        created.current = creating;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(syncBody, BODY_SYNC_DELAY_MS);
    };

    fragment.observeDeep(onChange);
    return () => {
      fragment.unobserveDeep(onChange);
      if (timer !== undefined) {
        clearTimeout(timer);
        syncBody();
      }
    };
  }, [editor, doc, noteId, color, createNote, updateNote]);

  // The composer takes focus when the drawer opens, so typing starts at once.
  useEffect(() => {
    if (!editor || focusAfterOpen === undefined || !open) return;
    if (openCount <= focusAfterOpen || openCount === focusedForOpen.current) return;
    focusedForOpen.current = openCount;
    editor.commands.focus('end');
  }, [editor, open, openCount, focusAfterOpen]);

  const swatch = NOTE_PALETTE[color] ?? NOTE_PALETTE.yellow;
  const isComposer = !note;
  const author = note?.updatedBy ?? note?.createdBy;

  return (
    <Box
      ref={rootRef}
      onClick={(e) => {
        // Clicks on the card's padding or footer go to the end of the text.
        // (Clicks in the card's portaled popovers bubble here too — skip them.)
        const target = e.target as HTMLElement;
        if (!rootRef.current?.contains(target) || target.closest('.tiptap, button')) return;
        editor?.commands.focus('end');
      }}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && rootRef.current?.contains(next)) return;
        if (colorAnchor || deleteAnchor || !editor) return;
        onLeave(editor.isEmpty);
      }}
      sx={{
        position: 'relative',
        px: 1.75,
        pt: 1.25,
        pb: 1,
        borderRadius: 1.5,
        bgcolor: swatch.bg,
        border: '1px solid',
        borderColor: swatch.border,
        cursor: 'text',
        transition: 'border-color 0.15s, box-shadow 0.15s, background-color 0.15s',
        '&:focus-within': { borderColor: swatch.accent, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)' },
        '&:focus-within .note-actions': { opacity: 1, pointerEvents: 'auto' },
        ...(isComposer
          ? {
              // An untouched composer is a dashed "write here" slot.
              '&:not(:focus-within):has(.is-editor-empty)': {
                bgcolor: 'transparent',
                borderStyle: 'dashed',
                borderColor: 'divider',
              },
            }
          : {
              '&:hover .note-actions': { opacity: 1, pointerEvents: 'auto' },
              '@media (hover: none)': { '& .note-actions': { opacity: 1, pointerEvents: 'auto' } },
            }),
      }}
    >
      <Box sx={noteContentSx}>
        <EditorContent editor={editor} />
      </Box>
      {editor && <NoteFormatMenu editor={editor} scrollTarget={scrollTarget} />}

      {author && note && (
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1, minWidth: 0 }}>
          <Avatar src={author.image ?? undefined} sx={{ width: 18, height: 18, fontSize: 9 }}>
            {author.name?.[0]?.toUpperCase()}
          </Avatar>
          <Typography variant="caption" color="text.secondary" noWrap>
            {author.name ?? 'Former member'} · {formatNoteTime(note.updatedAt)}
          </Typography>
        </Stack>
      )}

      <Stack
        className="note-actions"
        direction="row"
        sx={{
          position: 'absolute',
          top: -14,
          right: 10,
          opacity: 0,
          pointerEvents: 'none',
          transition: 'opacity 0.15s',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.14)',
        }}
      >
        <Tooltip title="Color">
          <IconButton size="small" aria-label="Note color" onClick={(e) => setColorAnchor(e.currentTarget)}>
            <PaletteOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        {note && (
          <Tooltip title="Delete">
            <IconButton size="small" aria-label="Delete note" onClick={(e) => setDeleteAnchor(e.currentTarget)}>
              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <NoteColorPopover
        anchorEl={colorAnchor}
        value={color}
        onChange={onColorChange}
        onClose={() => {
          setColorAnchor(null);
          editor?.commands.focus();
        }}
      />
      <DeleteNotePopover anchorEl={deleteAnchor} onClose={() => setDeleteAnchor(null)} onConfirm={onDelete} />
    </Box>
  );
}
