'use client';

import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import ButtonBase from '@mui/material/ButtonBase';
import type { NoteColor } from '@/shared/store/notesStore';
import { NOTE_COLORS, NOTE_PALETTE } from '../lib/notePalette';

interface Props {
  anchorEl: HTMLElement | null;
  value: NoteColor;
  onChange: (color: NoteColor) => void;
  onClose: () => void;
}

export default function NoteColorPopover({ anchorEl, value, onChange, onClose }: Props) {
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}
    >
      <Stack direction="row" spacing={1} role="radiogroup" aria-label="Note color" sx={{ p: 1.25 }}>
        {NOTE_COLORS.map((color) => {
          const swatch = NOTE_PALETTE[color];
          const selected = color === value;
          return (
            <ButtonBase
              key={color}
              role="radio"
              aria-checked={selected}
              aria-label={swatch.label}
              title={swatch.label}
              onClick={() => {
                onChange(color);
                onClose();
              }}
              sx={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                bgcolor: swatch.bg,
                border: '2px solid',
                borderColor: swatch.accent,
                boxShadow: selected ? `0 0 0 2px #fff, 0 0 0 4px ${swatch.accent}` : 'none',
                transition: 'transform 0.15s',
                '&:hover': { transform: 'scale(1.12)' },
                '&.Mui-focusVisible': { boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${swatch.accent}` },
              }}
            />
          );
        })}
      </Stack>
    </Popover>
  );
}
