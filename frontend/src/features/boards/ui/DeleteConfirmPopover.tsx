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

export default function DeleteConfirmPopover({ anchorEl, onClose, onConfirm }: Props) {
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Box sx={{ p: 2, maxWidth: 200 }}>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Удалить доску?
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" onClick={onClose} sx={{ flex: 1 }}>
            Отмена
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => { onConfirm(); onClose(); }}
            sx={{ flex: 1 }}
          >
            Удалить
          </Button>
        </Box>
      </Box>
    </Popover>
  );
}
