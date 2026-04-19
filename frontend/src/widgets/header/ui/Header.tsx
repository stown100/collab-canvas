'use client';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import DashboardIcon from '@mui/icons-material/Dashboard';
import UserBlock from './UserBlock';

export default function Header() {
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

        <UserBlock />
      </Toolbar>
    </AppBar>
  );
}
