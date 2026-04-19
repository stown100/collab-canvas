'use client';

import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';

interface Props {
  open: boolean;
  initialTitle: string;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
}

export default function EditBoardDialog({ open, initialTitle, onClose, onSave }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setTitle(initialTitle);
  }, [open, initialTitle]);

  async function handleSubmit() {
    if (!title.trim() || title.trim() === initialTitle) { onClose(); return; }
    setLoading(true);
    try {
      await onSave(title.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Переименовать доску</DialogTitle>
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
        <Button onClick={onClose} disabled={loading}>Отмена</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!title.trim() || loading}
        >
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
}
