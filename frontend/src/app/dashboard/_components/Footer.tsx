import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        py: 3,
        px: { xs: 2, sm: 4 },
        borderTop: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        © {new Date().getFullYear()} Collab Canvas
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Совместная работа в реальном времени
      </Typography>
    </Box>
  );
}
