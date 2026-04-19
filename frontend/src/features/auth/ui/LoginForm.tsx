'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import GoogleIcon from '@mui/icons-material/Google';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Avatar from '@mui/material/Avatar';
import { useSignIn } from '@/features/auth/hooks/useSignIn';

export default function LoginForm() {
  const { handleGoogleSignIn } = useSignIn();

  return (
    <Card
      elevation={0}
      sx={{ width: '100%', maxWidth: 420, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}
    >
      <CardContent sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
          <Avatar sx={{ bgcolor: 'primary.main', mb: 2, width: 48, height: 48 }}>
            <LockOutlinedIcon />
          </Avatar>
          <Typography variant="h5" component="h1" align="center" gutterBottom>
            Добро пожаловать
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center">
            Войдите, чтобы начать работу с досками
          </Typography>
        </Box>

        <Divider sx={{ mb: 3 }} />

        <Button
          fullWidth
          variant="outlined"
          size="large"
          startIcon={<GoogleIcon />}
          onClick={handleGoogleSignIn}
          sx={{
            borderColor: 'divider',
            color: 'text.primary',
            py: 1.5,
            '&:hover': { borderColor: 'primary.main', backgroundColor: 'action.hover' },
          }}
        >
          Войти через Google
        </Button>

        <Typography
          variant="caption"
          color="text.secondary"
          align="center"
          display="block"
          sx={{ mt: 3 }}
        >
          Продолжая, вы соглашаетесь с условиями использования
        </Typography>
      </CardContent>
    </Card>
  );
}
