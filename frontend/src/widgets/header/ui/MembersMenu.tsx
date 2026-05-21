'use client';

import { useState, useEffect, useCallback, MouseEvent } from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import GroupIcon from '@mui/icons-material/Group';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

enum ResultType {
  SUCCESS = 'success',
  ERROR = 'error',
}

interface Member {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  isOwner: boolean;
}

interface Props {
  boardId: string;
}

export default function MembersMenu({ boardId }: Props) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(menuAnchor);

  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [confirmAnchor, setConfirmAnchor] = useState<HTMLElement | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ type: ResultType; message: string } | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/members`);
      if (res.ok) {
        const data = (await res.json()) as Member[];
        setMembers(data);
      }
    } finally {
      setLoadingMembers(false);
    }
  }, [boardId]);

  useEffect(() => {
    if (menuOpen) fetchMembers();
  }, [menuOpen, fetchMembers]);

  const closeConfirm = () => {
    setConfirmAnchor(null);
    setConfirmTarget(null);
    setRemoveError(null);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    closeConfirm();
  };

  const handleDeleteClick = (e: MouseEvent<HTMLElement>, member: Member) => {
    e.stopPropagation();
    setConfirmAnchor(e.currentTarget);
    setConfirmTarget(member);
    setRemoveError(null);
  };

  const handleConfirmRemove = async () => {
    if (!confirmTarget) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const res = await fetch(`/api/boards/${boardId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: confirmTarget.id }),
      });
      if (res.ok) {
        setMembers(prev => prev.filter(m => m.id !== confirmTarget.id));
        closeConfirm();
      } else {
        const data = await res.json().catch(() => null);
        setRemoveError(data?.error ?? 'Failed to remove user.');
      }
    } catch {
      setRemoveError('Network error, please try again.');
    } finally {
      setRemoving(false);
    }
  };

  const handleInviteOpen = () => {
    setInviteOpen(true);
    setMenuAnchor(null);
  };

  const handleInviteClose = () => {
    setInviteOpen(false);
    setEmail('');
    setInviteResult(null);
  };

  const handleInvite = async () => {
    if (!email.trim()) return;
    setInviteLoading(true);
    setInviteResult(null);
    try {
      const res = await fetch(`/api/boards/${boardId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteResult({ type: ResultType.SUCCESS, message: `${email.trim()} has been invited.` });
        setEmail('');
        fetchMembers();
      } else {
        setInviteResult({ type: ResultType.ERROR, message: data.error ?? 'Something went wrong.' });
      }
    } catch {
      setInviteResult({ type: ResultType.ERROR, message: 'Network error, please try again.' });
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<GroupIcon />}
        onClick={(e) => setMenuAnchor(e.currentTarget)}
        sx={{ color: 'text.secondary', borderColor: 'divider', whiteSpace: 'nowrap' }}
      >
        Members
      </Button>

      <Menu
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={handleMenuClose}
        slotProps={{ paper: { sx: { width: 320, maxWidth: '90vw' } } }}
      >
        {loadingMembers && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        )}

        {!loadingMembers && members.length === 0 && (
          <Typography sx={{ px: 2, py: 1.5, color: 'text.secondary' }} variant="body2">
            No members yet.
          </Typography>
        )}

        {!loadingMembers &&
          members.map((m) => (
            <MenuItem key={m.id} disableRipple sx={{ gap: 1, cursor: 'default' }}>
              <ListItemAvatar sx={{ minWidth: 'auto' }}>
                <Avatar src={m.image ?? undefined} sx={{ width: 32, height: 32 }}>
                  {(m.name ?? m.email)[0]?.toUpperCase()}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={m.name ?? m.email}
                secondary={m.name ? m.email : null}
                slotProps={{
                  primary: { noWrap: true, fontSize: 14 },
                  secondary: { noWrap: true, fontSize: 12 },
                }}
              />
              {m.isOwner ? (
                <Chip label="Owner" size="small" variant="outlined" />
              ) : (
                <IconButton
                  size="small"
                  edge="end"
                  aria-label={`Remove ${m.name ?? m.email}`}
                  onClick={(e) => handleDeleteClick(e, m)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              )}
            </MenuItem>
          ))}

        <Divider />

        <MenuItem onClick={handleInviteOpen}>
          <PersonAddIcon fontSize="small" sx={{ mr: 1 }} />
          Invite new user
        </MenuItem>
      </Menu>

      <Popover
        open={Boolean(confirmAnchor)}
        anchorEl={confirmAnchor}
        onClose={closeConfirm}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Stack sx={{ p: 2, width: 240 }} spacing={1.5}>
          <Typography variant="body2">
            Remove <strong>{confirmTarget?.name ?? confirmTarget?.email}</strong> from the board?
          </Typography>
          {removeError && (
            <Alert severity="error" sx={{ py: 0 }}>
              {removeError}
            </Alert>
          )}
          <Stack direction="row" justifyContent="flex-end" spacing={1}>
            <Button size="small" onClick={closeConfirm} disabled={removing}>
              Cancel
            </Button>
            <Button
              size="small"
              color="error"
              variant="contained"
              onClick={handleConfirmRemove}
              disabled={removing}
            >
              {removing ? <CircularProgress size={14} color="inherit" /> : 'Remove'}
            </Button>
          </Stack>
        </Stack>
      </Popover>

      <Dialog open={inviteOpen} onClose={handleInviteClose} fullWidth maxWidth="xs">
        <DialogTitle>Invite to board</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            sx={{ mt: 1 }}
            disabled={inviteLoading}
          />
          {inviteResult && (
            <Alert severity={inviteResult.type} sx={{ mt: 2 }}>
              {inviteResult.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleInviteClose} disabled={inviteLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleInvite}
            variant="contained"
            disabled={inviteLoading || !email.trim()}
          >
            {inviteLoading ? <CircularProgress size={18} /> : 'Invite'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
