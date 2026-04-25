'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import { BoardRole } from '@/shared/store/boardStore';
import { MouseEvent } from 'react';

interface Props {
  role: BoardRole;
  onEdit: (e: MouseEvent<HTMLElement>) => void;
  onDelete: (e: MouseEvent<HTMLElement>) => void;
}

export default function BoardCardOverlay({ role, onEdit, onDelete }: Props) {
  if (role === BoardRole.MEMBER) {
    return (
      <Chip
        icon={<PeopleOutlineIcon />}
        label="Shared"
        size="small"
        sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, fontSize: '0.65rem' }}
      />
    );
  }

  return (
    <Box
      className="card-actions"
      sx={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 1,
        display: 'flex',
        gap: 0.5,
        opacity: 0,
        transition: 'opacity 0.2s',
      }}
    >
      <IconButton
        size="small"
        onClick={onEdit}
        sx={{ bgcolor: 'background.paper', '&:hover': { bgcolor: 'primary.light', color: '#fff' } }}
      >
        <EditOutlinedIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={onDelete}
        sx={{ bgcolor: 'background.paper', '&:hover': { bgcolor: 'error.light', color: '#fff' } }}
      >
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
