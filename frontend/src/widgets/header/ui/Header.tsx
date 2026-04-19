'use client';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import DashboardIcon from '@mui/icons-material/Dashboard';
import { useUserStore } from '@/shared/store/userStore';
import { useSignOut } from '@/features/auth/hooks/useSignOut';

export default function Header() {
  const user = useUserStore((state) => state.user);
  const { handleSignOut } = useSignOut();

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        backgroundColor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Toolbar sx={{ px: { xs: 2, sm: 4 }, justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DashboardIcon sx={{ color: 'primary.main', fontSize: 28 }} />
          <Typography
            variant="h6"
            component="span"
            sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: '-0.5px' }}
          >
            Collab
          </Typography>
          <Typography
            variant="h6"
            component="span"
            sx={{ fontWeight: 700, color: 'text.primary', letterSpacing: '-0.5px' }}
          >
            Canvas
          </Typography>
        </Box>

        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
              src={user.image ?? undefined}
              alt={user.name ?? 'User'}
              sx={{ width: 36, height: 36 }}
            >
              {user.name?.[0]}
            </Avatar>
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}
            >
              {user.name}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={handleSignOut}
              sx={{ color: 'text.secondary', borderColor: 'divider' }}
            >
              Выйти
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
}
