'use client';

import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string) => Promise<void>;
}

export default function CreateBoardDialog({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) return;
    setLoading(true);
    try {
      await onCreate(title.trim());
      setTitle('');
      onClose();
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setTitle('');
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>Новая доска</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={loading}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>Отмена</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!title.trim() || loading}
        >
          Создать
        </Button>
      </DialogActions>
    </Dialog>
  );
}
