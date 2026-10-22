'use client';

import { useMemo, type ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import { alpha } from '@mui/material/styles';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatStrikethroughIcon from '@mui/icons-material/FormatStrikethrough';
import TitleIcon from '@mui/icons-material/Title';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import ChecklistIcon from '@mui/icons-material/Checklist';
import CodeIcon from '@mui/icons-material/Code';

interface Props {
  editor: Editor;
  /** The scrolling list the note sits in — the menu follows it. */
  scrollTarget: HTMLElement | null;
}

function FormatButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip title={label} placement="top">
      <IconButton
        size="small"
        aria-label={label}
        aria-pressed={active}
        // Keep the editor focused (and the selection intact) while clicking.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        sx={{
          borderRadius: 1,
          color: active ? 'primary.main' : 'text.secondary',
          bgcolor: (theme) => (active ? alpha(theme.palette.primary.main, 0.1) : 'transparent'),
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

// Formatting toolbar shown above a text selection.
export default function NoteFormatMenu({ editor, scrollTarget }: Props) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      heading: e.isActive('heading', { level: 2 }),
      bulletList: e.isActive('bulletList'),
      taskList: e.isActive('taskList'),
      code: e.isActive('code'),
    }),
  });

  // Rendered into <body> with fixed positioning so the scrolling list can't
  // clip it.
  const options = useMemo(
    () => ({ strategy: 'fixed' as const, placement: 'top' as const, scrollTarget: scrollTarget ?? window }),
    [scrollTarget],
  );

  const chain = () => editor.chain().focus();

  return (
    <BubbleMenu editor={editor} appendTo={() => document.body} options={options} style={{ zIndex: 1300 }}>
      <Paper
        elevation={6}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.25, p: 0.5, borderRadius: 2 }}
      >
        <FormatButton label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()}>
          <FormatBoldIcon fontSize="small" />
        </FormatButton>
        <FormatButton label="Italic" active={state.italic} onClick={() => chain().toggleItalic().run()}>
          <FormatItalicIcon fontSize="small" />
        </FormatButton>
        <FormatButton label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}>
          <FormatStrikethroughIcon fontSize="small" />
        </FormatButton>
        <FormatButton label="Code" active={state.code} onClick={() => chain().toggleCode().run()}>
          <CodeIcon fontSize="small" />
        </FormatButton>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <FormatButton
          label="Heading"
          active={state.heading}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        >
          <TitleIcon fontSize="small" />
        </FormatButton>
        <FormatButton label="Bulleted list" active={state.bulletList} onClick={() => chain().toggleBulletList().run()}>
          <FormatListBulletedIcon fontSize="small" />
        </FormatButton>
        <FormatButton label="Checklist" active={state.taskList} onClick={() => chain().toggleTaskList().run()}>
          <ChecklistIcon fontSize="small" />
        </FormatButton>
      </Paper>
    </BubbleMenu>
  );
}
