'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { alpha } from '@mui/material/styles';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import { useNotesStore } from '@/shared/store/notesStore';

// Header toggle for the notes drawer; shows how many notes the board has.
export default function NotesButton() {
  const open = useNotesStore((s) => s.open);
  const count = useNotesStore((s) => s.notes.length);
  const toggleOpen = useNotesStore((s) => s.toggleOpen);

  return (
    <Button
      variant="outlined"
      size="small"
      startIcon={<StickyNote2OutlinedIcon />}
      onClick={toggleOpen}
      aria-pressed={open}
      sx={{
        whiteSpace: 'nowrap',
        color: open ? 'primary.main' : 'text.secondary',
        borderColor: open ? 'primary.main' : 'divider',
        bgcolor: (theme) => (open ? alpha(theme.palette.primary.main, 0.08) : 'transparent'),
      }}
    >
      Notes
      {count > 0 && (
        <Box
          component="span"
          sx={{
            ml: 0.75,
            px: 0.75,
            minWidth: 20,
            borderRadius: 10,
            fontSize: 11,
            lineHeight: '18px',
            fontWeight: 700,
            textAlign: 'center',
            bgcolor: open ? 'primary.main' : 'action.selected',
            color: open ? 'primary.contrastText' : 'text.secondary',
          }}
        >
          {count}
        </Box>
      )}
    </Button>
  );
}
