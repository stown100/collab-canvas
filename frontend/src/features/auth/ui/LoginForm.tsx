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
import { OAuthProviders, useSignIn } from '@/features/auth/hooks/useSignIn';

export default function LoginForm() {
  const { handleSignIn } = useSignIn();

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

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Button
            fullWidth
            variant="outlined"
            size="large"
            startIcon={<GoogleIcon />}
            onClick={() => handleSignIn(OAuthProviders.GOOGLE)}
            sx={{
              borderColor: 'divider',
              color: 'text.primary',
              py: 1.5,
              '&:hover': { borderColor: 'primary.main', backgroundColor: 'action.hover' },
            }}
          >
            Войти через Google
          </Button>

          <Button
            fullWidth
            variant="outlined"
            size="large"
            startIcon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="24" height="24" rx="12" fill="#FC3F1D" />
                <path d="M15.5464 18.0546H13.431V7.58375H12.4863C10.7567 7.58375 9.85201 8.44855 9.85201 9.73911C9.85201 11.2026 10.4773 11.8812 11.7679 12.746L12.8323 13.4644L9.77218 18.0546H7.49707L10.2511 13.9567C8.66789 12.8258 7.77647 11.7215 7.77647 9.85885C7.77647 7.53053 9.39964 5.94727 12.473 5.94727H15.5331V18.0546H15.5464Z" fill="white" />
              </svg>
            }
            onClick={() => handleSignIn(OAuthProviders.YANDEX)}
            sx={{
              borderColor: 'divider',
              color: 'text.primary',
              py: 1.5,
              '&:hover': { borderColor: 'primary.main', backgroundColor: 'action.hover' },
            }}
          >
            Войти с Яндекс ID
          </Button>
        </Box>

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
