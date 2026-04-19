import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import { Header } from '@/widgets/header';
import { LoginForm } from '@/features/auth';
import { auth } from '@/shared/lib/auth';

export const metadata = {
  title: 'Войти — Collab Canvas',
};

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect('/dashboard');
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Header />
      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
          py: 6,
        }}
      >
        <LoginForm />
      </Box>
    </Box>
  );
}
