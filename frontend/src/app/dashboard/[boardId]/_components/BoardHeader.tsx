'use client';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useRouter } from 'next/navigation';
import { UserBlock, InviteButton } from '@/widgets/header';

interface Props {
  boardId: string;
  title: string;
  isOwner: boolean;
}

export default function BoardHeader({ boardId, title, isOwner }: Props) {
  const router = useRouter();

  return (
    <AppBar position="fixed" elevation={1} sx={{ bgcolor: 'background.paper', color: 'text.primary', zIndex: 1300 }}>
      <Toolbar sx={{ px: { xs: 2, sm: 4 }, justifyContent: 'space-between' }}>
        <IconButton edge="start" onClick={() => router.push('/dashboard')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" fontWeight={600} noWrap sx={{ flex: 1 }}>
          {title}
        </Typography>
        {isOwner && <InviteButton boardId={boardId} />}
        <UserBlock />
      </Toolbar>
    </AppBar>
  );
}
