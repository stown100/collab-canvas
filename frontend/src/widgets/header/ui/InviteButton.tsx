'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

enum ResultType {
  SUCCESS = "success",
  ERROR = "error"
}

interface Props {
  boardId: string;
}

export default function InviteButton({ boardId }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: ResultType.SUCCESS | ResultType.ERROR; message: string } | null>(null);

  const handleClose = () => {
    setOpen(false);
    setEmail('');
    setResult(null);
  };

  const handleInvite = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/boards/${boardId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ type: ResultType.SUCCESS, message: `${email.trim()} has been invited.` });
        setEmail('');
      } else {
        setResult({ type: ResultType.ERROR, message: data.error ?? 'Something went wrong.' });
      }
    } catch {
      setResult({ type: ResultType.ERROR, message: 'Network error, please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<PersonAddIcon />}
        onClick={() => setOpen(true)}
        sx={{ color: 'text.secondary', borderColor: 'divider', whiteSpace: 'nowrap' }}
      >
        Invite
      </Button>

      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
        <DialogTitle>Invite to board</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Email address"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
            sx={{ mt: 1 }}
            disabled={loading}
          />
          {result && (
            <Alert severity={result.type} sx={{ mt: 2 }}>
              {result.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button
            onClick={handleInvite}
            variant="contained"
            disabled={loading || !email.trim()}
          >
            {loading ? <CircularProgress size={18} /> : 'Invite'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
