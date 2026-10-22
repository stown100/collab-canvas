'use client';

import Popover from '@mui/material/Popover';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

interface Props {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteNotePopover({ anchorEl, onClose, onConfirm }: Props) {
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
    >
      <Box sx={{ p: 2, width: 230 }}>
        <Typography variant="body2" fontWeight={600}>
          Delete this note?
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, mb: 1.5 }}>
          It will be removed for everyone on the board.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" onClick={onClose} sx={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            disableElevation
            onClick={() => { onConfirm(); onClose(); }}
            sx={{ flex: 1 }}
          >
            Delete
          </Button>
        </Box>
      </Box>
    </Popover>
  );
}
